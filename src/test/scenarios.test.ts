// Every built-in scenario must validate, run to completion with its own
// preferred transmissions, and score well — otherwise the content is wrong.
import { describe, expect, it } from 'vitest';
import { BUILT_IN_SCENARIOS } from '../content';
import { runScripted } from '../domain/engine/autopilot';
import { scoreSession } from '../domain/grading/session';
import { DEFAULT_RUBRIC, DEFAULT_VOCABULARY } from '../domain/rubric/config';
import { createInstance } from '../domain/scenario/instance';
import { validateScenario } from '../domain/scenario/validate';

const cfg = { rubric: DEFAULT_RUBRIC, vocab: DEFAULT_VOCABULARY };

describe('built-in scenarios', () => {
  it('has at least 12 templates with unique ids', () => {
    expect(BUILT_IN_SCENARIOS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(BUILT_IN_SCENARIOS.map((s) => s.id)).size).toBe(BUILT_IN_SCENARIOS.length);
  });

  for (const t of BUILT_IN_SCENARIOS) {
    describe(t.id, () => {
      it('validates without errors', () => {
        const v = validateScenario(t);
        expect(v.errors).toEqual([]);
      });
      const branches = [null, ...(t.branches ?? []).map((b) => b.id)];
      for (const branchId of branches) {
        for (const seed of [1, 2, 3]) {
          it(`completes with preferred wording (branch ${branchId ?? 'base'}, seed ${seed})`, () => {
            const inst = createInstance(t, { seed, branchId });
            const s = runScripted(inst, cfg);
            const score = scoreSession(s, DEFAULT_RUBRIC);
            const detail = score.sections
              .filter((x) => x.applicable)
              .map((x) => `${x.section}=${x.score} [${x.items.filter((i) => i.status !== 'correct' && i.status !== 'alternate' && i.status !== 'na').map((i) => `${i.id}:${i.status}`).join(',')}]`)
              .join(' ');
            expect(s.ended?.reason, detail).toMatch(/transfer|resolved/);
            expect(score.overall ?? 0, detail).toBeGreaterThanOrEqual(85);
            for (const sec of score.sections.filter((x) => x.applicable)) expect(sec.score ?? 0, `${sec.section}: ${detail}`).toBeGreaterThanOrEqual(75);
            expect(score.incorrect, detail).toEqual([]);
          });
        }
      }
    });
  }
});
