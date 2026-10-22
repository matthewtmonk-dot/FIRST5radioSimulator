// Preferred example transmissions. Authored examples come first; otherwise an
// example is composed from the scenario facts. Examples illustrate one good
// way to say it — the grader accepts other wording.

import type { ConditionState, InitialAction, ResourceDecision, Strategy } from '../scenario/schema';
import type { ScenarioInstance } from '../scenario/instance';
import { TASK_INFO } from '../language/tasks';
import { cap } from '../language/parse';

const PROBLEM_PHRASE: Record<string, string> = {
  'nothing-showing': 'nothing showing',
  'light-smoke': 'light smoke showing',
  'working-fire': 'working fire',
  defensive: 'defensive fire conditions',
};
const ACTION_PHRASE: Record<InitialAction, string> = {
  investigate: 'will be investigating',
  'attack-line': 'is stretching an attack line',
  'quick-attack': 'is making a quick attack',
  'supply-line': 'laid a supply line',
  'defensive-ops': 'is setting up defensive operations',
  rescue: 'is making a rescue',
  'standpipe-attack': 'is taking standpipe packs to the fire floor',
};
const RES_PHRASE: Record<ResourceDecision, string> = {
  cancel: 'cancel all other units',
  reduce: 'reduce the response, first-due units continue',
  level1: 'all other units Level One staging',
  continue: 'all units continue in',
  upgrade: 'upgrade to a working fire assignment',
  hold: 'hold all other units',
};

export function exampleInitialReport(inst: ScenarioInstance): string {
  if (inst.examples.initialReport.length) return inst.examples.initialReport[0];
  const b = inst.building;
  const c = currentCondition(inst, inst.initialCondition);
  const loc = c.location ? ` ${c.location.side ? `on the ${cap(c.location.side)} side` : ''}${c.location.area ? ` from the ${c.location.area}` : ''}` : '';
  const action = inst.expectations.initialActions[0];
  const where = c.location?.side ? ` to the ${cap(c.location.side)} side` : '';
  const objectives = inst.expectations.objectives
    .filter((o) => o === 'fireControl' || o === 'primarySearch')
    .map((o) => (o === 'fireControl' ? 'fire control' : 'primary search'))
    .join(' and ');
  const strategy: Strategy = c.acceptableStrategies[0];
  return [
    `${inst.dispatchName}, ${inst.ownUnit} on scene, ${b.size} ${b.stories}-story ${b.occupancyLabel}`,
    `${PROBLEM_PHRASE[c.problem]}${loc}.`,
    `${inst.ownUnit} ${ACTION_PHRASE[action]}${action === 'attack-line' ? where : ''}${objectives ? ` for ${objectives}` : ''}.`,
    `${cap(strategy)}.`,
    `${cap(RES_PHRASE[inst.expectations.resourceDecisions[0]])}.`,
    `${inst.ownUnit} establishing ${inst.commandName}.`,
  ].join(', ').replace(/\., /g, '. ');
}

export function exampleFollowUp(inst: ScenarioInstance, conditionId: string): string {
  if (inst.examples.followUp.length) return inst.examples.followUp[0];
  const c = currentCondition(inst, conditionId);
  const recon = inst.recon.full360Possible ? '360 complete' : '360 not possible';
  const findings = inst.findings
    .filter((f) => f.revealedBy === 'recon' && f.reportable !== 'optional')
    .map((f) => f.text.replace(/\.$/, ''))
    .join('; ');
  const basement = inst.building.basementRelevant ? (inst.building.basement ? 'Basement present.' : 'No basement.') : '';
  return `${inst.commandName} to ${inst.dispatchName}, ${recon}. ${findings ? `${findings}.` : ''} ${basement} Remaining ${c.acceptableStrategies[0]}. Accountability is at ${inst.ownUnit}.`
    .replace(/\s+/g, ' ')
    .trim();
}

export function exampleAssignment(inst: ScenarioInstance, unitId: string): string | undefined {
  const role = Object.entries(inst.roleMap).find(([, u]) => u === unitId)?.[0];
  const authored = inst.examples.assignments.find((a) => a.role === role || a.role === unitId);
  if (authored) return authored.text;
  const needed = [...inst.expectations.criticalTasks, ...inst.expectations.expectedTasks][0];
  if (!needed) return undefined;
  const info = TASK_INFO[needed];
  return `${unitId}, from ${inst.commandName}, ${info.label.toLowerCase()}${info.code ? ` (${info.code})` : ''}.`;
}

export function exampleTransfer(inst: ScenarioInstance): string {
  if (inst.examples.transfer.length) return inst.examples.transfer[0];
  const bc = inst.units.find((u) => u.type === 'battalion')?.id ?? 'Battalion';
  return `${bc}, here is the situation: conditions, strategy, completed and ongoing actions, unit assignments, safety concerns and needs. You have command.`;
}

export function currentCondition(inst: ScenarioInstance, id: string): ConditionState {
  return inst.conditionStates.find((c) => c.id === id) ?? inst.conditionStates[0];
}
