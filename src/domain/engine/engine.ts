// Fireground simulation state machine. Pure functions over a serializable
// state object: (state, input) → new state. No React, no timers, no DOM.

import { gradeAssignmentTransmission } from '../grading/assignments';
import { scoreItems } from '../grading/common';
import { gradeFollowUp } from '../grading/followUp';
import { gradeInitialReport } from '../grading/initialReport';
import { gradeTransfer } from '../grading/transfer';
import { dynamicFollowUpExample, dynamicTransferExample } from '../grading/dynamicExamples';
import type { TransmissionGrade } from '../grading/types';
import { findConcept } from '../language/lexicon';
import { normalize } from '../language/normalize';
import {
  cap,
  extractReportFacts,
  findCallsigns,
  parseAddressing,
  parseAssignment,
  splitUnitSegments,
  unitKey,
  type ParsedAssignment,
} from '../language/parse';
import { TASK_INFO } from '../language/tasks';
import type { RubricConfig, VocabularyConfig } from '../rubric/config';
import { fillPlaceholders, type ScenarioInstance } from '../scenario/instance';
import type { ConditionState, Effect, Finding, InitialAction, Side, Task, TriggerT } from '../scenario/schema';
import type { AssignmentRecord, Checkpoint, Mode, RadioEntry, SimState, TranscriptInfo, UnitState } from './types';

export interface EngineConfig {
  rubric: RubricConfig;
  vocab: VocabularyConfig;
}

const DEFAULT_TIME_LIMIT = 420;

// ---------------------------------------------------------------------------
// Creation

export function createSim(instance: ScenarioInstance, mode: Mode, opts: { timeLimit?: number } = {}): SimState {
  const bc = instance.units.find((u) => u.type === 'battalion');
  const units: UnitState[] = instance.units.map((u) => ({ id: u.id, role: u.role, type: u.type, arrival: u.arrival, status: 'enroute' }));
  const state: SimState = {
    instance,
    mode,
    phase: 'dispatch',
    t: 0,
    conditionId: instance.initialCondition,
    conditionChangedAt: 0,
    log: [],
    units,
    assignments: [],
    recon: { status: 'none' },
    investigation: { status: 'none' },
    revealedFindings: [],
    revealedViews: ['alpha'],
    firedEvents: [],
    checkpoints: {},
    grades: [],
    transfer: { bcUnit: bc?.id, status: bc ? 'enroute' : 'none' },
    seq: 0,
    timeLimit: opts.timeLimit ?? DEFAULT_TIME_LIMIT,
    notes: [],
  };
  const all = [instance.ownUnit, ...instance.units.map((u) => u.id)];
  const dispatchText = [
    `${all.join(', ')}, respond to a ${instance.dispatch.nature.toLowerCase()}, ${instance.address.full}${instance.address.placeName ? `, ${instance.address.placeName}` : ''}, cross street ${instance.address.cross}.`,
    instance.dispatch.callerReport,
    ...instance.dispatch.notes,
    `Time out ${instance.environment.clock}.`,
  ].join(' ');
  return pushEntry(state, { from: instance.dispatchName, text: dispatchText, kind: 'dispatch', tone: 'alert' });
}

export function arrive(state: SimState): SimState {
  if (state.phase !== 'dispatch') return state;
  let s: SimState = { ...state, phase: 'onScene', t: 0 };
  for (const f of s.instance.findings.filter((x) => x.revealedBy === 'arrival')) s = reveal(s, f.id);
  return pushEntry(s, { from: 'System', kind: 'system', text: `${s.instance.ownUnit} arriving on scene at ${s.instance.address.full}.` });
}

// ---------------------------------------------------------------------------
// Helpers

function pushEntry(state: SimState, e: Omit<RadioEntry, 'id' | 't'> & { t?: number }): SimState {
  const id = `r${state.seq + 1}`;
  return { ...state, seq: state.seq + 1, log: [...state.log, { id, t: e.t ?? state.t, ...e }] };
}

export function getCondition(state: SimState): ConditionState {
  return state.instance.conditionStates.find((c) => c.id === state.conditionId) ?? state.instance.conditionStates[0];
}

function roleName(state: SimState, from: string): string {
  if (from === 'OWN') return `${state.instance.ownUnit} engineer`;
  if (from === 'Dispatch') return state.instance.dispatchName;
  return state.instance.roleMap[from] ?? from;
}

function vars(state: SimState, extra: Record<string, string> = {}) {
  return {
    OWN: state.instance.ownUnit,
    COMMAND: state.commandEstablished ?? 'Command',
    DISPATCH: state.instance.dispatchName,
    ...state.instance.roleMap,
    ...extra,
  };
}

function fmtClock(state: SimState): string {
  const base = state.instance.environment.clock;
  const mins = Number(base.slice(0, 2)) * 60 + Number(base.slice(2)) + 4 + Math.floor(state.t / 60);
  return `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}${String(mins % 60).padStart(2, '0')}`;
}

export function benchmarks(state: SimState) {
  const done = (task: Task) => state.assignments.some((a) => a.task === task && a.status === 'complete');
  const waterOnFire = state.assignments.some((a) => a.task === 'fireControl' && (a.status === 'working' || a.status === 'complete') && state.t >= a.startAt);
  return { waterOnFire, primaryClear: done('primarySearch'), waterSupply: done('waterSupply'), knockdown: done('fireControl') };
}

function revealedFindingObjs(state: SimState): Finding[] {
  return state.instance.findings.filter((f) => state.revealedFindings.includes(f.id));
}

function reveal(state: SimState, findingId: string): SimState {
  if (state.revealedFindings.includes(findingId)) return state;
  const f = state.instance.findings.find((x) => x.id === findingId);
  if (!f) return state;
  let s: SimState = { ...state, revealedFindings: [...state.revealedFindings, findingId] };
  if ((['alpha', 'bravo', 'charlie', 'delta'] as string[]).includes(f.side) && !s.revealedViews.includes(f.side as Side)) {
    s = { ...s, revealedViews: [...s.revealedViews, f.side as Side] };
  }
  return pushEntry(s, { from: 'Observation', kind: 'observation', text: `${f.side === 'general' || f.side === 'interior' ? '' : `${cap(f.side)}: `}${f.text}` });
}

function applyEffects(state: SimState, effects: Effect[]): SimState {
  let s = state;
  for (const e of effects) {
    if ('radio' in e) {
      s = pushEntry(s, {
        from: roleName(s, e.radio.from),
        to: s.commandEstablished ?? 'Command',
        text: fillPlaceholders(e.radio.text, vars(s)),
        kind: e.radio.from === 'Dispatch' ? 'dispatch' : 'unit',
        requiresAck: e.radio.requiresAck,
      });
    } else if ('setCondition' in e) {
      if (s.instance.conditionStates.some((c) => c.id === e.setCondition)) s = { ...s, conditionId: e.setCondition, conditionChangedAt: s.t };
    } else if ('reveal' in e) {
      s = reveal(s, e.reveal);
    } else if ('note' in e) {
      s = { ...s, notes: [...s.notes, e.note] };
    }
  }
  return s;
}

// ---------------------------------------------------------------------------
// Time

export function tick(state: SimState, dt: number): SimState {
  if (state.phase !== 'onScene' || state.ended) return state;
  let s: SimState = state;
  const target = state.t + dt;
  // Step in one-second increments so ordering of radio traffic is stable.
  while (s.t < target && !s.ended) {
    s = { ...s, t: Math.min(target, Math.floor(s.t) + 1) };
    s = stepOnce(s);
  }
  return s;
}

function stepOnce(state: SimState): SimState {
  let s = state;
  s = progressRecon(s);
  s = progressInvestigation(s);
  s = progressUnits(s);
  s = progressAssignments(s);
  s = progressEvents(s);
  s = progressAcks(s);
  s = progressTransfer(s);
  s = checkEnd(s);
  return s;
}

const RECON_ORDER: Side[] = ['bravo', 'charlie', 'delta'];

function progressRecon(state: SimState): SimState {
  if (state.recon.status !== 'inProgress' || state.recon.startedAt === undefined) return state;
  let s = state;
  const d = s.instance.recon.duration;
  const elapsed = s.t - state.recon.startedAt;
  if (s.instance.recon.kind === '360' && s.instance.recon.full360Possible) {
    RECON_ORDER.forEach((side, i) => {
      if (elapsed >= ((i + 1) * d) / 4) {
        if (!s.revealedViews.includes(side)) s = { ...s, revealedViews: [...s.revealedViews, side] };
        for (const f of s.instance.findings.filter((x) => x.revealedBy === 'recon' && x.side === side)) s = reveal(s, f.id);
      }
    });
  }
  if (elapsed >= d) {
    for (const f of s.instance.findings.filter((x) => x.revealedBy === 'recon')) s = reveal(s, f.id);
    s = { ...s, recon: { ...s.recon, status: 'complete', completedAt: s.t }, checkpoints: { ...s.checkpoints, reconComplete: s.t } };
    s = pushEntry(s, {
      from: 'System',
      kind: 'system',
      text: s.instance.recon.kind === '360' && s.instance.recon.full360Possible ? '360 complete. Give your follow-up report.' : `${s.instance.recon.label} complete. Give your follow-up report.`,
    });
  }
  return s;
}

function progressInvestigation(state: SimState): SimState {
  const inv = state.instance.investigation;
  if (!inv || state.investigation.status !== 'inProgress' || state.investigation.startedAt === undefined) return state;
  let s = state;
  if (s.t - state.investigation.startedAt >= inv.duration) {
    for (const f of s.instance.findings.filter((x) => x.revealedBy === 'investigate')) s = reveal(s, f.id);
    s = { ...s, investigation: { ...s.investigation, status: 'complete', completedAt: s.t }, checkpoints: { ...s.checkpoints, investigateComplete: s.t } };
  }
  return s;
}

function progressUnits(state: SimState): SimState {
  let s = state;
  for (const u of s.units) {
    if (u.status !== 'enroute' || u.type === 'battalion' || s.t < u.arrival) continue;
    const staging = (s.resourceDecision ?? []).includes('level1') && u.directedAt === undefined;
    const assigned = s.assignments.filter((a) => a.unit === u.id && a.status !== 'reassigned');
    const status: UnitState['status'] = staging ? 'staged' : 'onScene';
    s = updateUnit(s, u.id, { status, arrivedAt: s.t, awaitingSince: assigned.length ? undefined : s.t });
    const text = assigned.length
      ? `${u.id} on scene, ${assigned.map((a) => TASK_INFO[a.task].label.toLowerCase()).join(' and ')}${assigned[0].location ? `, ${assigned[0].location}` : ''}.`
      : staging
        ? `${u.id} Level One staged, ${s.instance.address.cross} at ${s.instance.address.street}.`
        : `${u.id} on scene.`;
    s = pushEntry(s, { from: u.id, to: s.commandEstablished ?? 'Command', text, kind: 'unit' });
    s = {
      ...s,
      assignments: s.assignments.map((a) => (a.unit === u.id && a.status === 'assigned' ? { ...a, startAt: s.t } : a)),
    };
  }
  // Units waiting for direction ask for it
  for (const u of s.units) {
    if ((u.status === 'onScene' || u.status === 'staged') && u.awaitingSince !== undefined && !u.promptedForAssignment && s.t - u.awaitingSince >= 40) {
      s = updateUnit(s, u.id, { promptedForAssignment: true });
      s = pushEntry(s, { from: u.id, to: s.commandEstablished ?? 'Command', text: `${u.id} to ${s.commandEstablished ?? 'Command'}, ${u.status === 'staged' ? 'Level One staged' : 'on scene'}, awaiting assignment.`, kind: 'unit' });
    }
  }
  return s;
}

function updateUnit(s: SimState, id: string, patch: Partial<UnitState>): SimState {
  return { ...s, units: s.units.map((u) => (u.id === id ? { ...u, ...patch } : u)) };
}

function taskDuration(s: SimState, task: Task) {
  return s.instance.taskOutcomes[task]?.duration ?? TASK_INFO[task].duration;
}

function progressAssignments(state: SimState): SimState {
  let s = state;
  for (const a of s.assignments) {
    if (a.status === 'complete' || a.status === 'blocked' || a.status === 'reassigned') continue;
    const unit = s.units.find((u) => u.id === a.unit);
    const onScene = a.unit === s.instance.ownUnit || (unit && (unit.status === 'onScene' || unit.status === 'staged') && unit.arrivedAt !== undefined);
    if (!onScene) continue;
    if (a.status === 'assigned') {
      s = setAssignment(s, a.id, { status: 'working', startAt: Math.max(a.startAt, unit?.arrivedAt ?? 0, a.at) });
      continue;
    }
    const outcome = s.instance.taskOutcomes[a.task];
    if (outcome?.blocked) {
      if (s.t - a.startAt >= 20) {
        s = setAssignment(s, a.id, { status: 'blocked' });
        s = pushEntry(s, { from: a.unit === s.instance.ownUnit ? `${a.unit} crew` : a.unit, to: s.commandEstablished ?? 'Command', text: fillPlaceholders(outcome.blocked, vars(s, { UNIT: a.unit })), kind: 'unit', requiresAck: true });
      }
      continue;
    }
    const reqs = outcome?.requires ?? [];
    const reqsMet = reqs.every((r) => s.assignments.some((x) => x.task === r && x.status === 'complete'));
    if (!reqsMet) continue;
    if (s.t - a.startAt < taskDuration(s, a.task)) continue;
    const info = TASK_INFO[a.task];
    s = setAssignment(s, a.id, { status: 'complete', completedAt: s.t });
    const template = outcome?.report ?? info.report;
    if (template) {
      const own = a.unit === s.instance.ownUnit;
      const text = fillPlaceholders(
        template
          .replace(/\{unit\}/g, a.unit)
          .replace(/\{command\}/g, s.commandEstablished ?? 'Command')
          .replace(/\{loc\}/g, a.location ? `, ${a.location}` : '')
          .replace(/ ,/g, ','),
        vars(s, { UNIT: a.unit }),
      );
      s = own
        ? pushEntry(s, { from: 'Observation', kind: 'observation', text: `Your crew: ${text.replace(new RegExp(`^${a.unit} to [^,]+, `), '')}` })
        : pushEntry(s, { from: a.unit, to: s.commandEstablished ?? 'Command', text, kind: 'unit', requiresAck: !!info.benchmark });
    }
    if (outcome?.effects?.length) s = applyEffects(s, outcome.effects);
  }
  return s;
}

function setAssignment(s: SimState, id: string, patch: Partial<AssignmentRecord>): SimState {
  return { ...s, assignments: s.assignments.map((a) => (a.id === id ? { ...a, ...patch } : a)) };
}

/** Returns the time a trigger became true, or undefined. */
function triggerTime(s: SimState, tr: TriggerT): number | undefined {
  if ('at' in tr) return s.t >= tr.at ? tr.at : undefined;
  if ('after' in tr) {
    const map: Record<string, number | undefined> = {
      initialReport: s.checkpoints.initialReport,
      followUp: s.checkpoints.followUp,
      reconStarted: s.checkpoints.reconStarted,
      reconComplete: s.checkpoints.reconComplete,
      investigateComplete: s.checkpoints.investigateComplete,
      transfer: s.checkpoints.transferConfirmed,
    };
    const base = map[tr.after];
    if (base === undefined) return undefined;
    const at = base + (tr.delay ?? 0);
    return s.t >= at ? at : undefined;
  }
  if ('task' in tr) {
    const recs = s.assignments.filter((a) => a.task === tr.task && a.status !== 'reassigned');
    const times = recs
      .map((a) => ((tr.status ?? 'assigned') === 'complete' ? a.completedAt : Math.max(a.at, a.startAt)))
      .filter((x): x is number => x !== undefined);
    if (!times.length) return undefined;
    const at = Math.min(...times) + (tr.delay ?? 0);
    return s.t >= at ? at : undefined;
  }
  if ('notTask' in tr) {
    if (s.t < tr.by) return undefined;
    const assigned = s.assignments.some((a) => a.task === tr.notTask && a.status !== 'reassigned' && a.at <= tr.by);
    return assigned ? undefined : tr.by;
  }
  if ('notComplete' in tr) {
    if (s.t < tr.by) return undefined;
    const done = s.assignments.some((a) => a.task === tr.notComplete && a.status === 'complete' && (a.completedAt ?? 0) <= tr.by);
    return done ? undefined : tr.by;
  }
  if ('event' in tr) {
    const ev = s.firedEvents.find((e) => e.id === tr.event);
    if (!ev) return undefined;
    const at = ev.t + (tr.delay ?? 0);
    return s.t >= at ? at : undefined;
  }
  if ('allOf' in tr) {
    const ts = tr.allOf.map((x) => triggerTime(s, x));
    if (ts.some((x) => x === undefined)) return undefined;
    return Math.max(...(ts as number[]));
  }
  return undefined;
}

function progressEvents(state: SimState): SimState {
  let s = state;
  for (const ev of s.instance.events) {
    if (s.firedEvents.some((f) => f.id === ev.id)) continue;
    if (triggerTime(s, ev.when) === undefined) continue;
    s = { ...s, firedEvents: [...s.firedEvents, { id: ev.id, t: s.t }] };
    s = applyEffects(s, ev.effects);
  }
  return s;
}

/** Instructor control (Practice Mode): fire a scenario event now. */
export function instructorFireEvent(state: SimState, eventId: string): SimState {
  const ev = state.instance.events.find((e) => e.id === eventId);
  if (!ev || state.phase !== 'onScene' || state.ended || state.firedEvents.some((f) => f.id === eventId)) return state;
  const s: SimState = { ...state, firedEvents: [...state.firedEvents, { id: ev.id, t: state.t }], notes: [...state.notes, `Instructor triggered: ${ev.id}`] };
  return applyEffects(s, ev.effects);
}

/** Instructor control (Practice Mode): switch the visible condition state. */
export function instructorSetCondition(state: SimState, conditionId: string): SimState {
  if (state.phase !== 'onScene' || state.ended) return state;
  return applyEffects({ ...state, notes: [...state.notes, `Instructor set conditions: ${conditionId}`] }, [{ setCondition: conditionId }]);
}

function progressAcks(state: SimState): SimState {
  let s = state;
  for (const e of s.log) {
    if (!e.requiresAck || e.acked || e.repeated) continue;
    if (s.log.some((x) => x.repeated && x.text.startsWith(e.text.slice(0, 20)) && x.from === e.from)) continue;
    if (s.t - e.t >= 25) {
      s = pushEntry(s, { from: e.from, to: e.to, text: `${e.text.replace(/\.$/, '')}. How copy?`, kind: e.kind, requiresAck: true, repeated: true });
    }
  }
  return s;
}

function progressTransfer(state: SimState): SimState {
  let s = state;
  const bc = s.units.find((u) => u.id === s.transfer.bcUnit);
  if (!bc || bc.status !== 'enroute' || s.t < bc.arrival) return s;
  if (!s.instance.expectations.transferExpected) return s;
  s = updateUnit(s, bc.id, { status: 'onScene', arrivedAt: s.t, directedAt: s.t });
  s = pushEntry(s, { from: bc.id, text: `${bc.id} on scene.`, kind: 'unit' });
  const where = s.instance.ownUnit;
  s = pushEntry(s, {
    t: s.t,
    from: bc.id,
    to: s.commandEstablished ?? 'Command',
    text: `${bc.id} to ${s.commandEstablished ?? 'Command'}, I'm at ${where} on the Alpha side. Ready for your face-to-face report.`,
    kind: 'unit',
  });
  return { ...s, transfer: { ...s.transfer, status: 'awaitingReport' } };
}

function checkEnd(state: SimState): SimState {
  const s = state;
  if (s.ended) return s;
  if (s.instance.endWhen === 'followUp' && s.checkpoints.followUp !== undefined && s.t - s.checkpoints.followUp >= 20) {
    return end(s, 'resolved');
  }
  if (s.t >= s.timeLimit) return end(s, 'timeLimit');
  return s;
}

function end(s: SimState, reason: NonNullable<SimState['ended']>['reason']): SimState {
  const text =
    reason === 'transfer'
      ? 'Command transferred. Exercise complete.'
      : reason === 'resolved'
        ? 'Incident resolved. Exercise complete.'
        : reason === 'timeLimit'
          ? 'Time limit reached. Exercise complete.'
          : reason === 'drill'
            ? 'Drill complete.'
            : 'Exercise ended.';
  const withNote = pushEntry(s, { from: 'System', kind: 'system', text });
  return { ...withNote, phase: 'complete', ended: { reason, t: s.t } };
}

export function abandon(s: SimState): SimState {
  return s.ended ? s : end(s, 'abandoned');
}

// ---------------------------------------------------------------------------
// Officer actions

export function startRecon(state: SimState): SimState {
  if (state.phase !== 'onScene' || state.recon.status !== 'none') return state;
  const s: SimState = { ...state, recon: { status: 'inProgress', startedAt: state.t }, checkpoints: { ...state.checkpoints, reconStarted: state.t } };
  return pushEntry(s, { from: 'System', kind: 'system', text: `${s.instance.recon.label} started (about ${s.instance.recon.duration} seconds).` });
}

export function startInvestigation(state: SimState): SimState {
  if (state.phase !== 'onScene' || !state.instance.investigation || state.investigation.status !== 'none') return state;
  const s: SimState = { ...state, investigation: { status: 'inProgress', startedAt: state.t } };
  return pushEntry(s, { from: 'System', kind: 'system', text: `${s.instance.investigation!.label} (about ${s.instance.investigation!.duration} seconds).` });
}

/** Advance until new radio traffic or an observation arrives (max 150 s). */
export function advanceToNext(state: SimState): SimState {
  if (state.phase !== 'onScene' || state.ended) return state;
  const before = state.log.length;
  let s = state;
  for (let i = 0; i < 150 && s.log.length === before && !s.ended; i++) s = tick(s, 1);
  return s;
}

// ---------------------------------------------------------------------------
// Transmissions

export interface TransmitMeta {
  transcript?: TranscriptInfo;
  audioId?: string;
  faceToFace?: boolean;
}

export interface TransmitResult {
  state: SimState;
  grades: TransmissionGrade[];
}

export function transmit(state: SimState, rawText: string, cfg: EngineConfig, meta: TransmitMeta = {}): TransmitResult {
  const text = rawText.trim();
  if (!text || state.phase !== 'onScene' || state.ended) return { state, grades: [] };
  const inst = state.instance;
  let s = pushEntry(state, {
    from: inst.ownUnit,
    text,
    kind: 'trainee',
    audioId: meta.audioId,
    transcript: meta.transcript,
    faceToFace: meta.faceToFace,
  });
  const entryId = s.log[s.log.length - 1].id;
  const grades: TransmissionGrade[] = [];
  const recordGrade = (g: TransmissionGrade) => {
    const id = `g${s.grades.length + 1}`;
    s = { ...s, grades: [...s.grades, { id, entryId, t: s.t, grade: g }] };
    s = { ...s, log: s.log.map((e) => (e.id === entryId ? { ...e, gradeIds: [...(e.gradeIds ?? []), id] } : e)) };
    grades.push(g);
  };
  const uncertain = meta.transcript?.lowConfidence;
  const norm = normalize(text, cfg.vocab);
  const t = norm.text;
  const addressing = parseAddressing(t, inst.ownUnit, inst.dispatchName);
  const bcId = s.transfer.bcUnit;
  const toBc = !!bcId && ((addressing.to === 'unit' && unitKey(addressing.unit ?? '') === unitKey(bcId)) || meta.faceToFace);

  // --- Command transfer flow
  if (s.transfer.status === 'awaitingReport' && (toBc || findConcept(t, 'transferConfirm').length)) {
    const g = gradeTransfer(text, {
      instance: inst,
      condition: getCondition(s),
      rubric: cfg.rubric,
      vocab: cfg.vocab,
      assignments: s.assignments,
      revealed: revealedFindingObjs(s),
      benchmarks: benchmarks(s),
      transcriptUncertain: uncertain,
      example: dynamicTransferExample(s),
    });
    recordGrade(g);
    s = { ...s, checkpoints: { ...s.checkpoints, transfer: s.t }, transfer: { ...s.transfer, reportAt: s.t } };
    const confirmed = findConcept(t, 'transferConfirm').length > 0;
    s = confirmed ? confirmTransfer(s, cfg) : askConfirm(s);
    return { state: s, grades };
  }
  if (s.transfer.status === 'awaitingConfirm' && (findConcept(t, 'transferConfirm').length || findConcept(t, 'ack').length || /\b(yes|affirm|correct)\b/.test(t))) {
    // Confirmation obtained only after the chief asked: partial credit
    s = patchLastGrade(s, cfg.rubric, 'transfer', 'tr.confirm', 'partial', 'Transfer confirmed only after the chief asked. State it as part of the briefing.');
    s = confirmTransfer(s, cfg);
    return { state: s, grades };
  }
  if (s.transfer.status === 'awaitingDispatch' && (addressing.to === 'dispatch' || /\bcommand\b/.test(t))) {
    s = patchLastGrade(s, cfg.rubric, 'transfer', 'tr.dispatch', 'correct', 'Dispatch notified of the transfer.');
    s = pushEntry(s, { from: inst.dispatchName, text: `${inst.dispatchName} copies, ${bcId} has ${s.commandEstablished ?? 'command'}, ${fmtClock(s)}.`, kind: 'dispatch' });
    s = { ...s, transfer: { ...s.transfer, status: 'confirmed', dispatchNotified: true } };
    return { state: end(s, 'transfer'), grades };
  }

  // --- Unit-addressed segments (assignments, acks, CAN requests)
  const { segments, rest } = splitUnitSegments(t, inst.ownUnit);
  const knownUnits = [inst.ownUnit, ...s.units.map((u) => u.id)];
  const parsed: ParsedAssignment[] = segments.map((seg) => parseAssignment(seg, inst.ownUnit, getCondition(s).location?.areaTerms ?? []));
  const assignmentSegs: ParsedAssignment[] = [];
  for (const p of parsed) {
    const unit = s.units.find((u) => unitKey(u.id) === unitKey(p.unit));
    if (!unit) {
      if (p.tasks.length) assignmentSegs.push(p);
      s = pushEntry(s, { from: inst.dispatchName, text: `${s.commandEstablished ?? 'Command'}, ${p.unit} is not assigned to this incident.`, kind: 'dispatch' });
      continue;
    }
    // Acknowledgment of a pending benchmark report
    const pendingAck = [...s.log].reverse().find((e) => e.requiresAck && !e.acked && unitKey(e.from) === unitKey(unit.id));
    if (pendingAck && (p.isAck || findConcept(p.text, 'ack').length)) {
      s = { ...s, log: s.log.map((e) => (e.requiresAck && !e.acked && unitKey(e.from) === unitKey(unit.id) ? { ...e, acked: true } : e)) };
      if (!p.tasks.length) continue;
    }
    if (p.isCanRequest) {
      s = pushEntry(s, { from: unit.id, to: s.commandEstablished ?? 'Command', text: canReport(s, unit.id), kind: 'unit' });
      continue;
    }
    if (p.isCancel) {
      s = updateUnit(s, unit.id, { status: 'cancelled', directedAt: s.t });
      s = { ...s, assignments: s.assignments.map((a) => (a.unit === unit.id && a.status !== 'complete' ? { ...a, status: 'reassigned' } : a)) };
      s = pushEntry(s, { from: unit.id, text: `${unit.id} copies, returning to service.`, kind: 'unit' });
      continue;
    }
    if (p.tasks.length === 0 && unit.pendingClarify && (p.locationText || p.location.target)) {
      // Clarification answer: location for the previously copied task
      s = assignTasks(s, unit, unit.pendingClarify.tasks, p.locationText || p.location.target || '', p.explicitObjective);
      s = updateUnit(s, unit.id, { pendingClarify: undefined });
      assignmentSegs.push({ ...p, tasks: unit.pendingClarify.tasks });
      continue;
    }
    if (!p.tasks.length) {
      if (p.isAck) continue;
      s = pushEntry(s, { from: unit.id, to: s.commandEstablished ?? 'Command', text: `${unit.id} to ${s.commandEstablished ?? 'Command'}, say again your assignment for ${unit.id}?`, kind: 'unit' });
      assignmentSegs.push(p);
      continue;
    }
    assignmentSegs.push(p);
    const needLoc = p.tasks.filter((x) => TASK_INFO[x].needsLocation);
    if (needLoc.length && !p.locationText && !p.location.target) {
      s = updateUnit(s, unit.id, { pendingClarify: { tasks: p.tasks, asked: 'location', at: s.t }, directedAt: s.t, awaitingSince: undefined });
      s = pushEntry(s, {
        from: unit.id,
        to: s.commandEstablished ?? 'Command',
        text: `${unit.id} copies ${p.tasks.map((x) => TASK_INFO[x].label.toLowerCase()).join(' and ')}. Which side or location?`,
        kind: 'unit',
      });
      continue;
    }
    s = assignTasks(s, unit, p.tasks, p.locationText || p.location.target || (needLoc.length ? defaultLocation(s) : ''), p.explicitObjective);
  }
  if (assignmentSegs.length) {
    const g = gradeAssignmentTransmission(assignmentSegs, t, {
      instance: inst,
      condition: getCondition(s),
      rubric: cfg.rubric,
      declaredStrategy: s.declaredStrategy,
      knownUnits,
    });
    recordGrade(g);
  }

  // --- Dispatch / general traffic
  const restText = rest.replace(/^[\s,.]+|[\s,.]+$/g, '');
  const restMeaningful = restText.split(/\s+/).length >= 3 || (!segments.length && restText.length > 0);
  if (!restMeaningful) return { state: drillEnd(s), grades };

  if (s.checkpoints.initialReport === undefined && (addressing.to === 'dispatch' || addressing.to === 'unknown' || addressing.to === 'all')) {
    const g = gradeInitialReport(text, { instance: inst, condition: getCondition(s), rubric: cfg.rubric, vocab: cfg.vocab, transcriptUncertain: uncertain });
    recordGrade(g);
    s = applyInitialReport(s, t, cfg);
    return { state: drillEnd(s), grades };
  }

  const followUpLike =
    findConcept(t, 'recon360Complete').length > 0 ||
    findConcept(t, 'recon360Incomplete', { allowNegated: true }).length > 0 ||
    s.recon.status !== 'none' ||
    s.investigation.status === 'complete';
  if (s.checkpoints.initialReport !== undefined && s.checkpoints.followUp === undefined && inst.expectations.followUpExpected && followUpLike && addressing.to !== 'unit') {
    const g = gradeFollowUp(text, {
      instance: inst,
      condition: getCondition(s),
      rubric: cfg.rubric,
      vocab: cfg.vocab,
      reconStatus: s.recon.status,
      revealed: revealedFindingObjs(s),
      assignments: s.assignments,
      benchmarks: benchmarks(s),
      transcriptUncertain: uncertain,
      example: dynamicFollowUpExample(s),
    });
    recordGrade(g);
    s = { ...s, checkpoints: { ...s.checkpoints, followUp: s.t } };
    s = applyGeneralTraffic(s, t, cfg, true);
    return { state: drillEnd(s), grades };
  }

  s = applyGeneralTraffic(s, t, cfg, false);
  return { state: drillEnd(s), grades };
}

function drillEnd(s: SimState): SimState {
  if (s.mode !== 'drill' || !s.drill || s.ended) return s;
  const cp = s.drill.checkpoint;
  if (cp === 'assignment') return s.grades.some((g) => g.grade.section === 'assignments') ? end(s, 'drill') : s;
  return s.checkpoints[cp] !== undefined ? end(s, 'drill') : s;
}

function defaultLocation(s: SimState) {
  return getCondition(s).location?.side ? `${cap(getCondition(s).location!.side!)} side` : '';
}

function assignTasks(s: SimState, unit: UnitState, tasks: Task[], location: string, explicitObjective: boolean): SimState {
  let out = s;
  // A new assignment replaces the unit's previous unfinished work
  out = { ...out, assignments: out.assignments.map((a) => (a.unit === unit.id && a.status !== 'complete' && !tasks.includes(a.task) ? { ...a, status: 'reassigned' } : a)) };
  for (const task of tasks) {
    if (task === 'stage') continue;
    const id = `a${out.assignments.length + 1}`;
    const onScene = unit.arrivedAt !== undefined && unit.status !== 'cancelled';
    out = {
      ...out,
      assignments: [
        ...out.assignments,
        { id, unit: unit.id, task, location, explicitObjective, at: out.t, startAt: onScene ? out.t : unit.arrival, status: 'assigned', via: 'radio' },
      ],
    };
  }
  const wasCancelled = unit.status === 'cancelled';
  out = updateUnit(out, unit.id, {
    directedAt: unit.directedAt ?? out.t,
    awaitingSince: undefined,
    pendingClarify: undefined,
    status: wasCancelled ? 'enroute' : unit.status,
    arrival: wasCancelled ? out.t + 90 : unit.arrival,
  });
  const label = tasks.map((x) => TASK_INFO[x].label.toLowerCase()).join(' and ');
  const loc = location ? `, ${location}` : '';
  const enroute = unit.arrivedAt === undefined;
  const ack = tasks.includes('stage') && tasks.length === 1 ? `${unit.id} copies, staging${loc}.` : `${unit.id} copies, ${label}${loc}${enroute ? ' on arrival' : ''}.`;
  return pushEntry(out, { from: unit.id, text: ack, kind: 'unit' });
}

const ACTION_TASK: Partial<Record<InitialAction, Task>> = {
  'attack-line': 'fireControl',
  'quick-attack': 'fireControl',
  'standpipe-attack': 'fireControl',
  'supply-line': 'waterSupply',
  'defensive-ops': 'defensive',
  rescue: 'primarySearch',
};

function applyInitialReport(state: SimState, t: string, cfg: EngineConfig): SimState {
  const inst = state.instance;
  const cond = getCondition(state);
  const f = extractReportFacts(t, cfg.vocab.synonyms, cond.location?.areaTerms ?? [], inst.ownUnit);
  let s: SimState = { ...state, checkpoints: { ...state.checkpoints, initialReport: state.t } };
  const strategy = f.strategies[f.strategies.length - 1]?.value;
  const command = f.command.established ? `${cap(f.command.name ?? inst.commandName.replace(/ Command$/, ''))} Command`.replace(/\b\w/g, (c) => c.toUpperCase()) : undefined;
  s = { ...s, declaredStrategy: strategy, commandEstablished: command, resourceDecision: [...new Set(f.resources.map((r) => r.value))] };
  // Own crew's initial work
  const location = cond.location?.side ? `${cap(cond.location.side)} side` : '';
  const ownTasks = new Set<Task>();
  for (const a of f.actions) {
    const task = ACTION_TASK[a.value];
    if (task) ownTasks.add(task);
    if (a.value === 'investigate' && inst.investigation && s.investigation.status === 'none') s = startInvestigation(s);
  }
  if (f.objectives.some((o) => o.value === 'primarySearch') && (ownTasks.has('fireControl') || f.actions.some((a) => a.value === 'investigate'))) ownTasks.add('primarySearch');
  for (const task of ownTasks) {
    const id = `a${s.assignments.length + 1}`;
    s = {
      ...s,
      assignments: [...s.assignments, { id, unit: inst.ownUnit, task, location: task === 'waterSupply' ? '' : location, explicitObjective: true, at: s.t, startAt: s.t, status: 'assigned', via: 'initialReport' }],
    };
  }
  // Resource decision effects
  const decisions = s.resourceDecision ?? [];
  if (decisions.includes('cancel')) {
    for (const u of s.units) if (u.status === 'enroute') s = updateUnit(s, u.id, { status: 'cancelled', directedAt: s.t });
  } else if (decisions.includes('reduce')) {
    const named = findCallsigns(t)
      .filter((c) => /cancel|release/.test(t.slice(Math.max(0, c.start - 12), c.start)))
      .map((c) => unitKey(c.unit));
    for (const u of s.units) if (u.status === 'enroute' && named.includes(unitKey(u.id))) s = updateUnit(s, u.id, { status: 'cancelled', directedAt: s.t });
  }
  // Dispatch acknowledgment echoes what it understood
  const echo: string[] = [`${inst.dispatchName} copies, ${inst.ownUnit} on scene`];
  if (f.problems.length) echo.push(f.problems[f.problems.length - 1].m.text);
  if (strategy) echo.push(strategy);
  if (decisions.includes('cancel')) echo.push('cancelling all other units');
  else if (decisions.includes('level1')) echo.push('all other units Level One staging');
  else if (decisions.includes('upgrade')) echo.push('upgrading the assignment');
  if (command) echo.push(command);
  s = pushEntry(s, { from: inst.dispatchName, text: `${echo.join(', ')}, ${fmtClock(s)}.`, kind: 'dispatch' });
  for (const u of s.units.filter((x) => x.status === 'cancelled' && x.directedAt === s.t)) {
    s = pushEntry(s, { from: u.id, text: `${u.id} copies, returning.`, kind: 'unit' });
  }
  return s;
}

function applyGeneralTraffic(state: SimState, t: string, cfg: EngineConfig, isFollowUp: boolean): SimState {
  let s = state;
  const inst = s.instance;
  const f = extractReportFacts(t, cfg.vocab.synonyms, [], inst.ownUnit);
  const strategy = f.strategies[f.strategies.length - 1]?.value;
  const parts: string[] = [];
  if (strategy && strategy !== s.declaredStrategy) {
    s = { ...s, declaredStrategy: strategy };
    parts.push(`${strategy} strategy`);
    if (strategy === 'defensive') {
      // Everyone out: interior work stops
      s = { ...s, assignments: s.assignments.map((a) => (TASK_INFO[a.task].interior && a.status !== 'complete' ? { ...a, status: 'reassigned' } : a)) };
      parts.push('all units out of the structure');
    }
  } else if (isFollowUp && strategy) parts.push(`remaining ${strategy}`);
  const decisions = [...new Set(f.resources.map((r) => r.value))];
  if (decisions.includes('upgrade')) {
    parts.push('upgrading the assignment');
    // Cancelled units are re-dispatched on an upgrade
    for (const u of s.units) if (u.status === 'cancelled') s = updateUnit(s, u.id, { status: 'enroute', arrival: s.t + 120, directedAt: undefined });
  }
  if (decisions.includes('cancel')) {
    for (const u of s.units) if (u.status === 'enroute') s = updateUnit(s, u.id, { status: 'cancelled', directedAt: s.t });
    parts.push('cancelling responding units');
  }
  if (decisions.includes('level1')) s = { ...s, resourceDecision: [...new Set([...(s.resourceDecision ?? []), 'level1'])] };
  if (!s.commandEstablished && f.command.established) s = { ...s, commandEstablished: `${cap(f.command.name ?? inst.commandName.replace(/ Command$/, ''))} Command` };
  const text = isFollowUp
    ? `${inst.dispatchName} copies${s.recon.status === 'complete' ? ', 360 complete' : ''}${parts.length ? `, ${parts.join(', ')}` : ''}, ${fmtClock(s)}.`
    : `${inst.dispatchName} copies${parts.length ? `, ${parts.join(', ')}` : ''}.`;
  return pushEntry(s, { from: inst.dispatchName, text, kind: 'dispatch' });
}

function canReport(s: SimState, unitId: string): string {
  const cond = getCondition(s);
  const mine = s.assignments.filter((a) => a.unit === unitId && a.status !== 'reassigned');
  const conditions = cond.conditionTerms[0] ?? (cond.problem === 'nothing-showing' ? 'nothing showing' : 'smoke conditions');
  const actions = mine.length ? mine.map((a) => `${TASK_INFO[a.task].label.toLowerCase()} ${a.status === 'complete' ? 'complete' : 'in progress'}`).join(', ') : 'awaiting assignment';
  return `${unitId} to ${s.commandEstablished ?? 'Command'}: conditions, ${conditions}; actions, ${actions}; needs, none at this time.`;
}

function askConfirm(s: SimState): SimState {
  const bc = s.transfer.bcUnit!;
  const out = pushEntry(s, { from: bc, text: `${s.instance.ownUnit}, copy your report. Confirm you are transferring command to ${bc}?`, kind: 'unit', faceToFace: true });
  return { ...out, transfer: { ...out.transfer, status: 'awaitingConfirm', confirmPrompted: true } };
}

function confirmTransfer(s: SimState, cfg: EngineConfig): SimState {
  const bc = s.transfer.bcUnit!;
  const cmd = s.commandEstablished ?? 'Command';
  let out = pushEntry(s, { from: bc, text: `Copy. ${bc} has ${cmd}.`, kind: 'unit', faceToFace: true });
  out = { ...out, checkpoints: { ...out.checkpoints, transferConfirmed: out.t } };
  if (cfg.rubric.transfer.dispatchNotificationBy === 'receiving') {
    out = pushEntry(out, { from: bc, to: s.instance.dispatchName, text: `${bc} to ${s.instance.dispatchName}, ${bc} is assuming ${cmd}.`, kind: 'unit' });
    out = pushEntry(out, { from: s.instance.dispatchName, text: `${s.instance.dispatchName} copies, ${bc} assuming ${cmd}, ${fmtClock(out)}.`, kind: 'dispatch' });
    out = { ...out, transfer: { ...out.transfer, status: 'confirmed', dispatchNotified: true } };
    return end(out, 'transfer');
  }
  out = pushEntry(out, { from: 'System', kind: 'system', text: 'Notify dispatch of the command transfer.' });
  return { ...out, transfer: { ...out.transfer, status: 'awaitingDispatch' } };
}

function patchLastGrade(s: SimState, rubric: RubricConfig, section: string, itemId: string, status: 'partial' | 'correct', note: string): SimState {
  const idx = [...s.grades].reverse().findIndex((g) => g.grade.section === section);
  if (idx < 0) return s;
  const realIdx = s.grades.length - 1 - idx;
  const rec = s.grades[realIdx];
  const items = rec.grade.items.map((i) => (i.id === itemId ? { ...i, status, credit: status === 'partial' ? 0.5 : 1, note, severity: undefined } : i));
  const grades = [...s.grades];
  grades[realIdx] = { ...rec, grade: { ...rec.grade, items, score: scoreItems(items, rubric, rec.grade.statements) } };
  return { ...s, grades };
}


// ---------------------------------------------------------------------------
// Observable state for the UI — never includes hidden scenario facts.

export type CurrentTask =
  | 'Dispatch'
  | 'Initial Radio Report'
  | 'Unit Assignment'
  | 'Walk the 360 / Assign Units'
  | '360 Follow-Up Report'
  | 'Command Transfer'
  | 'Notify Dispatch'
  | 'Manage the Incident'
  | 'Complete';

export function currentTask(s: SimState): CurrentTask {
  if (s.ended) return 'Complete';
  if (s.phase === 'dispatch') return 'Dispatch';
  if (s.checkpoints.initialReport === undefined) return 'Initial Radio Report';
  if (s.transfer.status === 'awaitingReport' || s.transfer.status === 'awaitingConfirm') return 'Command Transfer';
  if (s.transfer.status === 'awaitingDispatch') return 'Notify Dispatch';
  if (s.checkpoints.followUp === undefined && s.instance.expectations.followUpExpected && (s.recon.status === 'complete' || s.investigation.status === 'complete'))
    return '360 Follow-Up Report';
  if (s.units.some((u) => (u.status === 'onScene' || u.status === 'staged') && u.awaitingSince !== undefined && u.type !== 'battalion')) return 'Unit Assignment';
  if (s.recon.status === 'none') return 'Walk the 360 / Assign Units';
  return 'Manage the Incident';
}

export function checkpointDone(s: SimState, cp: Checkpoint) {
  return s.checkpoints[cp] !== undefined;
}
