import { describe, it, expect } from 'vitest';
import { BUILT_IN_SCENARIOS } from '../content';
import { validateScenario } from '../domain/scenario/validate';
import { createInstance } from '../domain/scenario/instance';
import { createSim, arrive, transmit, tick, startRecon, advanceToNext } from '../domain/engine/engine';
import { DEFAULT_RUBRIC, DEFAULT_VOCABULARY } from '../domain/rubric/config';
import { scoreSession } from '../domain/grading/session';

const cfg = { rubric: DEFAULT_RUBRIC, vocab: DEFAULT_VOCABULARY };

describe('smoke', () => {
  it('validates', () => {
    for (const s of BUILT_IN_SCENARIOS) {
      const r = validateScenario(s);
      console.log(s.id, r.errors, r.warnings);
      expect(r.ok).toBe(true);
    }
  });
  it('runs garage', () => {
    const inst = createInstance(BUILT_IN_SCENARIOS[0], { seed: 42 });
    let s = arrive(createSim(inst, 'practice'));
    const say = (txt: string) => { const r = transmit(s, txt, cfg); s = r.state; for (const g of r.grades) console.log(g.section, g.score, g.items.map(i => `${i.id}:${i.status}`).join(' ')); };
    say(`Dispatch, Engine 14 on scene, small one-story residential, working fire in the attached garage on the Alpha side. Engine 14 is stretching an attack line through the front door for fire control and primary search. Offensive. All other units Level One staging. Engine 14 establishing ${inst.address.streetName.split(' ')[0]} Command.`);
    s = startRecon(s);
    for (let i = 0; i < 6; i++) s = advanceToNext(s);
    const e2 = inst.roleMap.E2, r1 = inst.roleMap.R1, l1 = inst.roleMap.L1, e3 = inst.roleMap.E3;
    say(`${e2}, from Command, establish water supply to Engine 14.`);
    say(`${r1}, primary search, enter through the front door on the Alpha side.`);
    say(`Command to Dispatch, 360 complete. No basement. Smoke from the Charlie side attic vents, rear garage door open. Low power lines on the Delta side. Remaining offensive. Accountability is at Engine 14.`);
    for (let i = 0; i < 25 && !s.ended && s.transfer.status !== 'awaitingReport'; i++) {
      s = advanceToNext(s);
      const last = s.log[s.log.length-1];
      if (last.requiresAck && !last.acked) say(`${last.from}, copy.`);
      if (/awaiting assignment/.test(last.text)) say(`${last.from}, check for extension in the attic over the garage, Alpha side.`);
    }
    say(`Battalion 1, garage fire knocked down, checking the attic for extension. Offensive. ${e2} has water supply established. ${r1} completed primary search, all clear. Watch the low power lines on Delta. Priorities are attic extension and secondary. Need a crew for overhaul. You have command.`);
    for (const e of s.log) console.log(String(Math.round(e.t)).padStart(4), e.from.padEnd(18), e.text);
    const score = scoreSession(s, DEFAULT_RUBRIC);
    console.log(JSON.stringify({ overall: score.overall, sections: score.sections.map(x => [x.section, x.score]), crit: score.criticalOmissions, imp: score.improvements }, null, 1));
  });
});
