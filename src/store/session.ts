import { create } from 'zustand';
import { BUILT_IN_SCENARIOS } from '../content';
import type { SessionRecord } from '../domain/analytics/history';
import { drillCompatible, prepareDrill, type DrillKind } from '../domain/engine/autopilot';
import { abandon, advanceToNext, arrive, createSim, instructorFireEvent, instructorSetCondition, startInvestigation, startRecon, tick, transmit, type TransmitMeta } from '../domain/engine/engine';
import type { Mode, SimState } from '../domain/engine/types';
import { scoreSession } from '../domain/grading/session';
import type { TransmissionGrade } from '../domain/grading/types';
import { createRng, randomSeed } from '../domain/rng';
import { createInstance } from '../domain/scenario/instance';
import type { ScenarioTemplateInput } from '../domain/scenario/schema';
import { validateScenario } from '../domain/scenario/validate';
import { storage } from '../storage/db';
import { useSettings } from './settings';

export type Screen = 'home' | 'exercise' | 'review' | 'history' | 'builder' | 'settings' | 'help';

export interface StartOptions {
  mode: Mode;
  templateId?: string;
  seed?: number;
  branchId?: string | null;
  drill?: DrillKind;
  /** Restrict random selection, e.g. residential. */
  filter?: (t: ScenarioTemplateInput) => boolean;
}

interface Feedback {
  grades: TransmissionGrade[];
  entryId: string;
  snapshot: SimState;
}

interface SessionStore {
  screen: Screen;
  sim: SimState | null;
  startedAt: number;
  paused: boolean;
  feedback: Feedback | null;
  library: ScenarioTemplateInput[];
  customIds: string[];
  record: SessionRecord | null;
  lastStart: StartOptions | null;
  nav: (s: Screen) => void;
  loadLibrary: () => Promise<void>;
  start: (o: StartOptions) => string | null;
  arrive: () => void;
  tick: (dt: number) => void;
  send: (text: string, meta?: TransmitMeta) => TransmissionGrade[];
  retryLast: () => void;
  dismissFeedback: () => void;
  recon: () => void;
  investigate: () => void;
  next: () => void;
  setPaused: (p: boolean) => void;
  instructorEvent: (id: string) => void;
  instructorCondition: (id: string) => void;
  /** Practice mode: did the instructor alter the run (excluded from history averages)? */
  instructorUsed: boolean;
  finish: () => Promise<void>;
  viewRecord: (r: SessionRecord) => void;
}

function cfg() {
  const { rubric, vocab } = useSettings.getState();
  return { rubric, vocab };
}

export const useSession = create<SessionStore>((set, get) => ({
  screen: 'home',
  sim: null,
  startedAt: 0,
  paused: false,
  feedback: null,
  library: BUILT_IN_SCENARIOS,
  customIds: [],
  record: null,
  lastStart: null,

  nav: (screen) => set({ screen }),

  loadLibrary: async () => {
    const custom = await storage.listScenarios();
    const valid = custom.filter((c) => validateScenario(c).ok);
    const builtInIds = new Set(BUILT_IN_SCENARIOS.map((s) => s.id));
    set({ library: [...BUILT_IN_SCENARIOS, ...valid.filter((c) => !builtInIds.has(c.id))], customIds: valid.map((c) => c.id) });
  },

  start: (o) => {
    const { library } = get();
    const { plan, prefs } = useSettings.getState();
    const seed = o.seed ?? randomSeed();
    const rng = createRng(seed);
    let pool = library.filter((t) => validateScenario(t).ok);
    if (o.filter) pool = pool.filter(o.filter);
    let template = o.templateId ? library.find((t) => t.id === o.templateId) : undefined;
    let inst;
    for (let attempt = 0; attempt < 20; attempt++) {
      const t = template ?? rng.pick(pool);
      if (!t) return 'No scenarios match that selection.';
      inst = createInstance(t, { seed: seed + attempt, branchId: o.branchId, plan });
      if (!o.drill || drillCompatible(inst, o.drill)) break;
      if (template) return 'This scenario does not include that transmission.';
      inst = undefined;
      template = undefined;
    }
    if (!inst) return 'No compatible scenario found.';
    const sim = o.drill ? prepareDrill(inst, o.drill, cfg()) : { ...createSim(inst, o.mode, { timeLimit: prefs.timeLimit }) };
    set({ sim, screen: 'exercise', startedAt: Date.now(), paused: false, feedback: null, record: null, instructorUsed: false, lastStart: { ...o, seed: inst.seed, templateId: inst.templateId, branchId: inst.branchId } });
    return null;
  },

  arrive: () => {
    const { sim } = get();
    if (sim) set({ sim: arrive(sim) });
  },

  tick: (dt) => {
    const { sim, paused, feedback } = get();
    if (!sim || paused || sim.phase !== 'onScene' || sim.ended) return;
    if (feedback && useSettings.getState().prefs.practicePauseOnFeedback) return;
    const next = tick(sim, dt);
    if (next !== sim) set({ sim: next });
  },

  send: (text, meta) => {
    const { sim } = get();
    if (!sim) return [];
    const snapshot = sim;
    const r = transmit(sim, text, cfg(), meta);
    const entry = r.state.log.find((e, i) => i >= snapshot.log.length && e.kind === 'trainee');
    const showFeedback = sim.mode !== 'test' && r.grades.length > 0;
    set({ sim: r.state, feedback: showFeedback && entry ? { grades: r.grades, entryId: entry.id, snapshot } : get().feedback });
    return r.grades;
  },

  retryLast: () => {
    const { feedback } = get();
    if (!feedback) return;
    set({ sim: feedback.snapshot, feedback: null });
  },

  dismissFeedback: () => set({ feedback: null }),

  recon: () => {
    const { sim } = get();
    if (sim) set({ sim: startRecon(sim) });
  },
  investigate: () => {
    const { sim } = get();
    if (sim) set({ sim: startInvestigation(sim) });
  },
  next: () => {
    const { sim } = get();
    if (sim) set({ sim: advanceToNext(sim) });
  },
  setPaused: (paused) => set({ paused }),
  instructorUsed: false,
  instructorEvent: (id) => {
    const { sim } = get();
    if (sim && sim.mode !== 'test') set({ sim: instructorFireEvent(sim, id), instructorUsed: true });
  },
  instructorCondition: (id) => {
    const { sim } = get();
    if (sim && sim.mode !== 'test') set({ sim: instructorSetCondition(sim, id), instructorUsed: true });
  },

  finish: async () => {
    const { sim, startedAt } = get();
    if (!sim) return;
    const ended = sim.ended ? sim : abandon(sim);
    const { rubric } = useSettings.getState();
    const score = scoreSession(ended, rubric);
    const missed = score.sections.flatMap((s) => s.items.filter((i) => i.status === 'missing' || i.status === 'incorrect').map((i) => i.id));
    const record: SessionRecord = {
      id: `s${Date.now()}`,
      startedAt,
      endedAt: Date.now(),
      mode: ended.mode,
      drill: ended.drill?.checkpoint,
      templateId: ended.instance.templateId,
      title: ended.instance.title,
      address: ended.instance.address.full,
      seed: ended.instance.seed,
      branchId: ended.instance.branchId,
      overall: score.overall,
      sections: Object.fromEntries(score.sections.filter((s) => s.applicable).map((s) => [s.section, s.score])),
      missed,
      timeToInitialReport: ended.checkpoints.initialReport,
      transcript: ended.log.map((e) => ({
        id: e.id,
        t: e.t,
        from: e.from,
        text: e.text,
        kind: e.kind,
        original: e.transcript && e.transcript.original !== e.text ? e.transcript.original : undefined,
        source: e.transcript?.source,
        audioId: e.audioId,
      })),
      score,
      endReason: ended.ended?.reason ?? 'abandoned',
      instructorAltered: get().instructorUsed || undefined,
    };
    set({ sim: ended, record, screen: 'review', feedback: null });
    await storage.saveSession(record);
  },

  viewRecord: (record) => set({ record, sim: null, screen: 'review' }),
}));
