// Examples built from what actually happened in this session, so the
// side-by-side comparison reflects the trainee's own incident.

import type { SimState } from '../engine/types';
import { TASK_INFO } from '../language/tasks';
import { cap } from '../language/parse';

function conditionPhrase(s: SimState): string {
  const c = s.instance.conditionStates.find((x) => x.id === s.conditionId) ?? s.instance.conditionStates[0];
  if (c.conditionTerms.length) return c.conditionTerms[0];
  return { 'nothing-showing': 'nothing showing', 'light-smoke': 'light smoke', 'working-fire': 'working fire', defensive: 'defensive fire conditions' }[c.problem];
}

function strategyNow(s: SimState) {
  const c = s.instance.conditionStates.find((x) => x.id === s.conditionId) ?? s.instance.conditionStates[0];
  return s.declaredStrategy && c.acceptableStrategies.includes(s.declaredStrategy) ? s.declaredStrategy : c.acceptableStrategies[0];
}

export function dynamicFollowUpExample(s: SimState): string {
  const inst = s.instance;
  if (inst.examples.followUp.length && s.recon.status === 'complete') return inst.examples.followUp[0];
  const cmd = s.commandEstablished ?? inst.commandName;
  const revealed = inst.findings.filter((f) => s.revealedFindings.includes(f.id) && f.reportable !== 'optional' && f.kind !== 'basement');
  const recon =
    s.recon.status === 'complete' ? (inst.recon.full360Possible ? '360 complete' : `${inst.recon.label.toLowerCase()} complete, full 360 not possible`) : '360 not completed';
  const basement = inst.building.basementRelevant ? (inst.building.basement ? 'Basement present.' : 'No basement.') : '';
  const finds = revealed.map((f) => f.text.replace(/\.$/, '')).join('. ');
  const interior = s.assignments.some((a) => TASK_INFO[a.task].interior && a.status !== 'reassigned');
  return [
    `${cmd} to ${inst.dispatchName}, ${recon}.`,
    basement,
    finds ? `${finds}.` : '',
    s.declaredStrategy && s.declaredStrategy !== strategyNow(s) ? `Switching to ${strategyNow(s)}.` : `Remaining ${strategyNow(s)}.`,
    interior ? `Accountability is on Alpha at ${inst.ownUnit}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function dynamicTransferExample(s: SimState): string {
  const inst = s.instance;
  const bc = s.transfer.bcUnit ?? 'Battalion';
  const cmd = s.commandEstablished ?? inst.commandName;
  const active = s.assignments.filter((a) => a.status !== 'reassigned');
  const byUnit = new Map<string, string[]>();
  for (const a of active) {
    const label = `${TASK_INFO[a.task].label.toLowerCase()}${a.status === 'complete' ? ' (complete)' : ''}${a.location ? ` ${a.location}` : ''}`;
    byUnit.set(a.unit, [...(byUnit.get(a.unit) ?? []), label]);
  }
  const units = [...byUnit.entries()].map(([u, tasks]) => `${u} has ${tasks.join(' and ')}`).join('. ');
  const done: string[] = [];
  if (active.some((a) => a.task === 'waterSupply' && a.status === 'complete')) done.push('water supply established');
  if (active.some((a) => a.task === 'primarySearch' && a.status === 'complete')) done.push('primary search all clear');
  if (active.some((a) => a.task === 'fireControl' && a.status === 'complete')) done.push('knockdown');
  const hazards = inst.findings.filter((f) => f.safety && s.revealedFindings.includes(f.id)).map((f) => f.text.replace(/\.$/, ''));
  const priorities = inst.expectations.transferPriorities.slice(0, 2);
  return [
    `${bc}, ${cmd}: ${cap(conditionPhrase(s))}.`,
    `${cap(strategyNow(s))} strategy.`,
    done.length ? `Completed: ${done.join(', ')}.` : '',
    units ? `${units}.` : '',
    hazards.length ? `Safety: ${hazards.join('; ')}.` : '',
    priorities.length ? `Priorities: ${priorities.join(' and ')}.` : '',
    'Needs: one more company for overhaul.',
    'You have command.',
  ]
    .filter(Boolean)
    .join(' ');
}
