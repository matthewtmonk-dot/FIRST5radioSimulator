// Grading behavior the training depends on: complete vs incomplete vs
// incorrect reports, nothing-showing incidents, Test Mode secrecy, and the
// scenario validator.
import { describe, expect, it } from 'vitest';
import { BUILT_IN_SCENARIOS } from '../content';
import { runScripted } from '../domain/engine/autopilot';
import { arrive, createSim, getCondition, tick, transmit } from '../domain/engine/engine';
import { exampleInitialReport } from '../domain/grading/examples';
import { scoreSession } from '../domain/grading/session';
import { DEFAULT_RUBRIC, DEFAULT_VOCABULARY } from '../domain/rubric/config';
import { createInstance } from '../domain/scenario/instance';
import { validateScenario } from '../domain/scenario/validate';

const cfg = { rubric: DEFAULT_RUBRIC, vocab: DEFAULT_VOCABULARY };
const template = (id: string) => BUILT_IN_SCENARIOS.find((t) => t.id === id)!;

function initialGrade(id: string, text: (example: string) => string) {
  const inst = createInstance(template(id), { seed: 1, branchId: null });
  const s = arrive(createSim(inst, 'practice'));
  const r = transmit(s, text(exampleInitialReport(inst)), cfg);
  const g = r.grades.find((x) => x.section === 'initialReport')!;
  const status = (itemId: string) => g.items.find((i) => i.id === itemId)?.status;
  return { g, status, state: r.state };
}

describe('initial report grading', () => {
  it('scores the example report as correct', () => {
    const { g } = initialGrade('ranch-garage-attic', (ex) => ex);
    expect(g.score).toBeGreaterThanOrEqual(95);
    expect(g.items.filter((i) => i.status === 'incorrect' || i.status === 'missing')).toEqual([]);
  });

  it('marks an incomplete report as missing, not incorrect', () => {
    const { g } = initialGrade('ranch-garage-attic', () => 'Dispatch, Engine 14 on scene, small one-story house.');
    expect(g.items.some((i) => i.status === 'missing')).toBe(true);
    expect(g.items.filter((i) => i.status === 'incorrect')).toEqual([]);
    expect(g.score).toBeLessThan(50);
  });

  it('scores a wrong strategy lower than an omitted strategy', () => {
    const omitted = initialGrade('ranch-garage-attic', (ex) => ex.replace(/Offensive\./, ''));
    const wrong = initialGrade('ranch-garage-attic', (ex) => ex.replace(/Offensive\./, 'Defensive.'));
    expect(omitted.status('ir.strategy')).toBe('missing');
    expect(wrong.status('ir.strategy')).toBe('incorrect');
    expect(wrong.g.score!).toBeLessThan(omitted.g.score!);
  });

  it('flags under-reporting a working fire as dangerous', () => {
    const { g, status } = initialGrade(
      'ranch-garage-attic',
      () => 'Dispatch, Engine 14 on scene, large three-story commercial building, nothing showing. Engine 14 investigating. All other units continue in. Engine 14 establishing Ibis Command.',
    );
    expect(status('ir.problem')).toBe('incorrect');
    expect(status('ir.size')).toBe('incorrect');
    expect(status('ir.occupancy')).toBe('incorrect');
    expect(g.dangerous.length).toBeGreaterThan(0);
    expect(g.score!).toBeLessThanOrEqual(DEFAULT_RUBRIC.dangerousCap ?? 100);
  });

  it('does not let a negation in an earlier clause hide the strategy', () => {
    const { status } = initialGrade('ranch-garage-attic', () => 'Dispatch, Engine 14 on scene, small one-story house, nothing showing, defensive.');
    expect(status('ir.strategy')).toBe('incorrect');
  });

  it('flags low-confidence speech as uncertain rather than wrong', () => {
    const inst = createInstance(template('ranch-garage-attic'), { seed: 1, branchId: null });
    const s = arrive(createSim(inst, 'practice'));
    const r = transmit(s, 'Dispatch, Engine 14 on scene, small one-story house, nothing showing.', cfg, {
      transcript: { original: 'x', corrected: 'x', source: 'whisper', lowConfidence: true },
    });
    const g = r.grades[0];
    expect(g.items.some((i) => i.status === 'uncertain') || g.reviewFlags.length > 0).toBe(true);
  });
});

describe('nothing-showing incident', () => {
  const inst = createInstance(template('ranch-odor-investigation'), { seed: 1, branchId: null });

  it('shows no fire on arrival and does not escalate on its own', () => {
    let s = arrive(createSim(inst, 'practice'));
    const cond = getCondition(s);
    expect(cond.problem).toBe('nothing-showing');
    expect(cond.emitters.filter((e) => e.kind === 'fire' || e.kind === 'glow')).toEqual([]);
    for (let i = 0; i < 120; i++) s = tick(s, 2.5);
    expect(getCondition(s).problem).toBe('nothing-showing');
    expect(s.assignments.filter((a) => a.task === 'fireControl')).toEqual([]);
  });

  it('accepts an investigating report and rejects a working-fire report', () => {
    const good = initialGrade('ranch-odor-investigation', (ex) => ex);
    expect(good.g.score).toBeGreaterThanOrEqual(95);
    const bad = initialGrade(
      'ranch-odor-investigation',
      () => 'Dispatch, Engine 14 on scene, small one-story house, working fire. Engine 14 stretching an attack line through the front door for fire control. Offensive. All other units continue in. Engine 14 establishing Ibis Command.',
    );
    expect(bad.status('ir.problem')).toBe('incorrect');
    expect(bad.status('ir.strategy')).toBe('incorrect');
    expect(bad.g.score!).toBeLessThan(50);
  });

  it('ends without a working-fire assignment phase', () => {
    const s = runScripted(inst, cfg);
    expect(s.ended?.reason).toBe('resolved');
    const score = scoreSession(s, DEFAULT_RUBRIC);
    expect(score.sections.find((x) => x.section === 'assignments')?.applicable).toBe(false);
  });
});

describe('Test Mode does not leak hidden information', () => {
  for (const t of BUILT_IN_SCENARIOS) {
    it(`${t.id}: radio log before the 360 contains no title, summary or 360 findings`, () => {
      const inst = createInstance(t, { seed: 2 });
      let s = arrive(createSim(inst, 'test'));
      s = transmit(s, exampleInitialReport(inst), cfg).state;
      for (let i = 0; i < 8; i++) s = tick(s, 2.5);
      const heard = s.log.filter((e) => e.kind !== 'trainee').map((e) => e.text.toLowerCase()).join('\n');
      expect(heard).not.toContain(inst.title.toLowerCase());
      expect(heard).not.toContain(inst.summary.toLowerCase().slice(0, 40));
      const hidden = inst.findings.filter((f) => f.revealedBy !== 'arrival' && !s.revealedFindings.includes(f.id));
      for (const f of hidden) expect(heard).not.toContain(f.text.toLowerCase());
      // No coaching or score text is put on the radio in Test Mode.
      expect(heard).not.toMatch(/\b(score|hint|example|checklist|you should|missing)\b/);
    });
  }
});

describe('scenario validator', () => {
  const base = template('ranch-garage-attic');
  const clone = () => JSON.parse(JSON.stringify(base));

  it('rejects an unknown initial condition', () => {
    const t = clone();
    t.initialCondition = 'does-not-exist';
    expect(validateScenario(t).ok).toBe(false);
  });

  it('rejects an event that sets an unknown condition', () => {
    const t = clone();
    t.events = [...(t.events ?? []), { id: 'bad', when: { at: 10 }, effects: [{ setCondition: 'nope' }] }];
    expect(validateScenario(t).ok).toBe(false);
  });

  it('rejects a condition whose problem is not acceptable for itself', () => {
    const t = clone();
    t.conditionStates[0].acceptableProblems = ['nothing-showing'];
    expect(validateScenario(t).ok).toBe(false);
  });

  it('rejects a branch that changes building facts', () => {
    const t = clone();
    t.branches = [{ id: 'b', weight: 1, label: 'x', patch: { building: { ...t.building, stories: 3 } } }];
    expect(validateScenario(t).ok).toBe(false);
  });

  it('rejects malformed JSON shapes', () => {
    expect(validateScenario({ id: 'x' }).ok).toBe(false);
  });
});
