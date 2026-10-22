// Scripted lead-in for Quick Drills: plays the preferred transmissions so the
// trainee starts at the moment of the drilled transmission with a realistic
// incident history. Also used by automated tests.

import type { ScenarioInstance } from '../scenario/instance';
import { exampleInitialReport } from '../grading/examples';
import { dynamicFollowUpExample, dynamicTransferExample } from '../grading/dynamicExamples';
import { advanceToNext, arrive, createSim, getCondition, startInvestigation, startRecon, transmit, type EngineConfig } from './engine';
import type { Checkpoint, SimState } from './types';

export type DrillKind = Checkpoint | 'assignment';

export function drillCompatible(inst: ScenarioInstance, kind: DrillKind): boolean {
  if (kind === 'transfer') return inst.expectations.transferExpected && inst.units.some((u) => u.type === 'battalion');
  if (kind === 'followUp') return inst.expectations.followUpExpected;
  if (kind === 'assignment') return inst.units.some((u) => u.type !== 'battalion') && inst.expectations.criticalTasks.length + inst.expectations.expectedTasks.length > 0;
  return true;
}

function say(s: SimState, text: string, cfg: EngineConfig): SimState {
  const r = transmit(s, text, cfg, { transcript: { original: text, corrected: text, source: 'typed' } });
  const ids = new Set(r.state.log.slice(s.log.length).filter((e) => e.kind === 'trainee').map((e) => e.id));
  return { ...r.state, log: r.state.log.map((e) => (ids.has(e.id) ? { ...e, from: `${e.from} (scripted)` } : e)) };
}

function ackPending(s: SimState, cfg: EngineConfig): SimState {
  let out = s;
  for (const e of s.log.filter((x) => x.requiresAck && !x.acked && x.kind === 'unit')) {
    if (out.units.some((u) => u.id === e.from)) out = say(out, `${e.from}, copy.`, cfg);
  }
  return out;
}

function assignArrived(s: SimState, cfg: EngineConfig): SimState {
  let out = s;
  const inst = s.instance;
  for (const u of out.units) {
    if (u.type === 'battalion' || u.directedAt !== undefined || u.arrivedAt === undefined) continue;
    const ex = inst.examples.assignments.find((a) => inst.roleMap[a.role] === u.id);
    out = say(out, ex ? ex.text : `${u.id}, from ${out.commandEstablished ?? 'Command'}, Level One stage and stand by.`, cfg);
  }
  return out;
}

/** Plays a scripted run up to (but not including) the drilled transmission. */
export function prepareDrill(inst: ScenarioInstance, kind: DrillKind, cfg: EngineConfig): SimState {
  let s = arrive(createSim(inst, 'drill'));
  s = { ...s, drill: { checkpoint: kind } };
  if (kind === 'initialReport') return s;
  s = say(s, exampleInitialReport(inst), cfg);
  if (kind === 'assignment') {
    for (let i = 0; i < 40 && !s.units.some((u) => u.arrivedAt !== undefined && u.type !== 'battalion' && u.status !== 'cancelled'); i++) s = advanceToNext(s);
    const unit = s.units.find((u) => u.arrivedAt !== undefined && u.type !== 'battalion' && u.status !== 'cancelled');
    return finalizeLeadIn({ ...s, drill: { checkpoint: 'assignment', unit: unit?.id } });
  }
  s = startRecon(s);
  if (inst.investigation) s = startInvestigation(s);
  for (let i = 0; i < 60; i++) {
    const reconDone = s.recon.status === 'complete' && (!inst.investigation || s.investigation.status !== 'inProgress');
    if (kind === 'followUp' && reconDone) break;
    if (kind === 'transfer' && s.transfer.status === 'awaitingReport') break;
    s = advanceToNext(s);
    s = assignArrived(s, cfg);
    s = ackPending(s, cfg);
    if (kind === 'transfer' && reconDone && s.checkpoints.followUp === undefined) s = say(s, dynamicFollowUpExample(s), cfg);
    if (s.ended) break;
  }
  return finalizeLeadIn(s);
}

function finalizeLeadIn(s: SimState): SimState {
  // Lead-in grades are not the trainee's work.
  return { ...s, grades: s.grades.map((g) => ({ ...g, superseded: true })) };
}

/**
 * Plays a whole incident with the scenario's own preferred transmissions.
 * Used by automated tests to prove each authored scenario is completable and
 * that its examples score well against the rubric.
 */
export function runScripted(inst: ScenarioInstance, cfg: EngineConfig, mode: 'practice' | 'test' = 'practice'): SimState {
  let s = arrive(createSim(inst, mode));
  s = say(s, exampleInitialReport(inst), cfg);
  s = startRecon(s);
  if (inst.investigation) s = startInvestigation(s);
  for (let i = 0; i < 150 && !s.ended; i++) {
    s = advanceToNext(s);
    s = assignArrived(s, cfg);
    s = ackPending(s, cfg);
    const reconDone = s.recon.status === 'complete' && (!inst.investigation || s.investigation.status === 'complete');
    if (reconDone && s.checkpoints.followUp === undefined && inst.expectations.followUpExpected) s = say(s, dynamicFollowUpExample(s), cfg);
    // Conditions changed so the declared strategy no longer fits: announce the change.
    const cond = getCondition(s);
    if (s.checkpoints.initialReport !== undefined && s.declaredStrategy && !cond.acceptableStrategies.includes(s.declaredStrategy) && (s.checkpoints.followUp !== undefined || !reconDone)) {
      const to = cond.acceptableStrategies[0];
      s = say(s, `${s.commandEstablished ?? 'Command'} to all units, emergency traffic, we are switching to ${to}${to === 'defensive' ? ', all crews out of the building, PAR' : ''}.`, cfg);
    }
    if (s.transfer.status === 'awaitingReport') {
      const r = transmit(s, dynamicTransferExample(s), cfg, { faceToFace: true });
      s = r.state;
    }
    if (s.transfer.status === 'awaitingDispatch') s = say(s, `${inst.dispatchName}, ${s.transfer.bcUnit} has ${s.commandEstablished ?? 'command'}.`, cfg);
  }
  return s;
}
