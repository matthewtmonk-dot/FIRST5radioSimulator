// Unit assignment grading using the communication order model:
// who, what, where, why — plus strategy consistency, coverage of critical
// tasks, closing the loop, and giving every arriving unit direction.

import type { Match } from '../language/lexicon';
import type { ParsedAssignment } from '../language/parse';
import { TASK_INFO } from '../language/tasks';
import type { RubricConfig } from '../rubric/config';
import type { ConditionState, Strategy, Task } from '../scenario/schema';
import type { ScenarioInstance } from '../scenario/instance';
import type { AssignmentRecord, RadioEntry, UnitState } from '../engine/types';
import { finalize, result } from './common';
import { exampleAssignment } from './examples';
import type { ItemResult, TransmissionGrade } from './types';

export interface AssignmentContext {
  instance: ScenarioInstance;
  condition: ConditionState;
  rubric: RubricConfig;
  declaredStrategy?: Strategy;
  knownUnits: string[];
}

function strategyNow(ctx: { condition: ConditionState; declaredStrategy?: Strategy }): Strategy {
  return ctx.declaredStrategy ?? ctx.condition.acceptableStrategies[0];
}

export function gradeAssignmentTransmission(parsed: ParsedAssignment[], normalized: string, ctx: AssignmentContext): TransmissionGrade {
  const { rubric } = ctx;
  const real = parsed.filter((p) => p.tasks.length || (!p.isAck && !p.isCanRequest && !p.isCancel));
  const items: ItemResult[] = [];
  const spans: Match[] = [];
  const n = Math.max(1, real.length);
  const known = (u: string) => ctx.knownUnits.some((k) => k.toLowerCase() === u.toLowerCase());

  const who = real.filter((p) => known(p.unit)).length;
  items.push(
    who === real.length
      ? result(rubric, 'as.who', 'correct', 'Receiving unit named.', { heard: real.map((p) => p.unit).join(', ') })
      : result(rubric, 'as.who', 'incorrect', `Not on this incident: ${real.filter((p) => !known(p.unit)).map((p) => p.unit).join(', ')}.`, { credit: who / n, severity: 'minor' }),
  );
  const what = real.filter((p) => p.tasks.length).length;
  items.push(
    what === real.length
      ? result(rubric, 'as.what', 'correct', 'Task stated.', { heard: real.flatMap((p) => p.tasks.map((x) => TASK_INFO[x].label)).join(', ') })
      : result(rubric, 'as.what', what ? 'partial' : 'missing', 'A unit was called without a clear task.', { credit: what / n }),
  );
  const needLoc = real.filter((p) => p.tasks.some((x) => TASK_INFO[x].needsLocation));
  const whereOk = needLoc.filter((p) => p.locationText || p.location.target).length;
  items.push(
    !needLoc.length
      ? result(rubric, 'as.where', 'na', 'No location needed for these tasks.')
      : whereOk === needLoc.length
        ? result(rubric, 'as.where', 'correct', 'Work location given.', { heard: needLoc.map((p) => p.locationText).join('; ') })
        : result(rubric, 'as.where', whereOk ? 'partial' : 'missing', `Say where: ${needLoc.filter((p) => !p.locationText).map((p) => `${p.unit} (${p.tasks.map((x) => TASK_INFO[x].label).join(', ')})`).join('; ')}.`, {
            credit: whereOk / needLoc.length,
          }),
  );
  const withTask = real.filter((p) => p.tasks.length);
  const whyOk = withTask.filter((p) => p.explicitObjective || p.tasks.some((x) => TASK_INFO[x].code)).length;
  items.push(
    !withTask.length
      ? result(rubric, 'as.why', 'na', 'No task given.')
      : whyOk === withTask.length
        ? result(rubric, 'as.why', withTask.every((p) => p.explicitObjective) ? 'correct' : 'alternate', withTask.every((p) => p.explicitObjective) ? 'Objective clear.' : 'Objective implied by the task name.')
        : result(rubric, 'as.why', 'partial', 'State the tactical objective the unit is working toward.', { credit: whyOk / withTask.length }),
  );
  // Strategy consistency
  const strategy = strategyNow(ctx);
  const interior = withTask.filter((p) => p.tasks.some((x) => TASK_INFO[x].interior));
  if (strategy === 'defensive' && interior.length)
    items.push(
      result(rubric, 'as.consistent', 'incorrect', `Interior work assigned during a defensive strategy: ${interior.map((p) => p.unit).join(', ')}.`, { severity: 'dangerous' }),
    );
  else items.push(result(rubric, 'as.consistent', withTask.length ? 'correct' : 'na', 'Assignment fits the strategy.'));

  for (const p of real) spans.push(...p.taskMatches);
  const first = real[0];
  const example = first ? (exampleAssignment(ctx.instance, first.unit) ?? '') : '';
  return finalize(rubric, 'assignments', items, { spans, normalized, example, explanation: ctx.instance.explanations.assignments });
}

export interface SessionAssignmentInput {
  instance: ScenarioInstance;
  rubric: RubricConfig;
  transmissions: TransmissionGrade[];
  assignments: AssignmentRecord[];
  units: UnitState[];
  log: RadioEntry[];
  endT: number;
}

/** Combines per-transmission assignment grades with session-level checks. */
export function gradeAssignmentsSession(input: SessionAssignmentInput): ItemResult[] {
  const { rubric, instance: inst } = input;
  const items: ItemResult[] = [];
  // Average communication-order items across transmissions
  for (const id of ['as.who', 'as.what', 'as.where', 'as.why', 'as.consistent']) {
    const its = input.transmissions.flatMap((g) => g.items.filter((i) => i.id === id && i.status !== 'na'));
    if (!its.length) {
      items.push(result(rubric, id, 'na', 'No assignments were transmitted.'));
      continue;
    }
    const incorrect = its.find((i) => i.status === 'incorrect');
    const credit = its.reduce((s, i) => s + i.credit, 0) / its.length;
    items.push(
      incorrect
        ? result(rubric, id, 'incorrect', incorrect.note, { severity: incorrect.severity, credit })
        : result(rubric, id, credit >= 0.999 ? 'correct' : credit > 0 ? 'partial' : 'missing', `${its.filter((i) => i.credit >= 1).length} of ${its.length} assignments complete on this element.`, { credit }),
    );
  }
  // Coverage of critical tasks
  const active = input.assignments.filter((a) => a.status !== 'reassigned');
  const covered = (task: Task) => active.some((a) => a.task === task);
  const crit = inst.expectations.criticalTasks;
  const exp = inst.expectations.expectedTasks;
  if (!crit.length && !exp.length) items.push(result(rubric, 'as.coverage', 'na', 'No specific tasks required.'));
  else {
    const possible = crit.length + exp.length * 0.5;
    const got = crit.filter(covered).length + exp.filter(covered).length * 0.5;
    const missingCrit = crit.filter((x) => !covered(x));
    const missingExp = exp.filter((x) => !covered(x));
    const note = [
      missingCrit.length ? `Critical tasks not assigned: ${missingCrit.map((x) => TASK_INFO[x].label).join(', ')}.` : '',
      missingExp.length ? `Also expected: ${missingExp.map((x) => TASK_INFO[x].label).join(', ')}.` : '',
    ]
      .filter(Boolean)
      .join(' ');
    items.push(
      result(rubric, 'as.coverage', got >= possible - 1e-6 ? 'correct' : got > 0 ? 'partial' : 'missing', note || 'All needed tasks were covered.', {
        credit: got / possible,
        severity: missingCrit.length ? 'major' : undefined,
      }),
    );
  }
  // Closing the loop on benchmark reports
  const needAck = input.log.filter((e) => e.requiresAck && !e.repeated);
  if (!needAck.length) items.push(result(rubric, 'as.loop', 'na', 'No benchmark reports needed acknowledgment.'));
  else {
    const acked = needAck.filter((e) => e.acked).length;
    items.push(
      result(rubric, 'as.loop', acked === needAck.length ? 'correct' : acked ? 'partial' : 'missing', `${acked} of ${needAck.length} progress reports acknowledged.`, {
        credit: acked / needAck.length,
      }),
    );
  }
  // Every arriving unit directed
  const arrived = input.units.filter((u) => u.type !== 'battalion' && u.arrivedAt !== undefined && u.status !== 'cancelled');
  if (!arrived.length) items.push(result(rubric, 'as.idle', 'na', 'No other units arrived.'));
  else {
    const late = arrived.filter((u) => u.directedAt === undefined || u.directedAt - (u.arrivedAt ?? 0) > 60);
    items.push(
      result(rubric, 'as.idle', late.length ? (late.length === arrived.length ? 'missing' : 'partial') : 'correct', late.length ? `Waited more than a minute for direction: ${late.map((u) => u.id).join(', ')}.` : 'Every arriving unit received direction promptly.', {
        credit: 1 - late.length / arrived.length,
      }),
    );
  }
  return items;
}
