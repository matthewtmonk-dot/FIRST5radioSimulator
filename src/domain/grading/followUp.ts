// Follow-up report grading. Only facts the officer has actually observed or
// received are expected; hidden findings are never required.

import { findConcept, findTerms, matchesGroups, type Match } from '../language/lexicon';
import { detectTasks, extractReportFacts } from '../language/parse';
import { normalize } from '../language/normalize';
import { TASK_INFO } from '../language/tasks';
import type { RubricConfig, VocabularyConfig } from '../rubric/config';
import type { ConditionState, Finding } from '../scenario/schema';
import type { ScenarioInstance } from '../scenario/instance';
import type { AssignmentRecord } from '../engine/types';
import { analyzeVerbosity, conciseItem, finalize, result, unsupportedClaims, wordCount } from './common';
import { exampleFollowUp } from './examples';
import { gradeStrategy } from './initialReport';
import type { ItemResult, TransmissionGrade } from './types';

export interface FollowUpContext {
  instance: ScenarioInstance;
  condition: ConditionState;
  rubric: RubricConfig;
  vocab?: VocabularyConfig;
  reconStatus: 'none' | 'inProgress' | 'complete';
  revealed: Finding[];
  assignments: AssignmentRecord[];
  benchmarks: { primaryClear: boolean; waterSupply: boolean; knockdown: boolean };
  transcriptUncertain?: boolean;
  /** Session-specific preferred example. */
  example?: string;
}

export function gradeFollowUp(text: string, ctx: FollowUpContext): TransmissionGrade {
  const { instance: inst, condition: cond, rubric } = ctx;
  const norm = normalize(text, ctx.vocab);
  const t = norm.text;
  const f = extractReportFacts(t, ctx.vocab?.synonyms, cond.location?.areaTerms ?? [], inst.ownUnit);
  const items: ItemResult[] = [];
  const spans: Match[] = [];
  const add = (...ms: (Match | undefined)[]) => ms.forEach((m) => m && spans.push(m));

  // 360 status
  {
    const done = findConcept(t, 'recon360Complete');
    const notDone = findConcept(t, 'recon360Incomplete', { allowNegated: true });
    add(...done, ...notDone);
    const actuallyDone = ctx.reconStatus === 'complete';
    const label = inst.recon.kind === '360' ? '360' : inst.recon.label.toLowerCase();
    if (notDone.length) {
      items.push(
        actuallyDone && inst.recon.full360Possible
          ? result(rubric, 'fu.360', 'incorrect', 'You did complete the 360 — report it as complete.', { heard: notDone[0].text, severity: 'minor' })
          : result(rubric, 'fu.360', 'correct', `360 status reported accurately (${actuallyDone ? 'partial/limited' : 'not completed'}).`, { heard: notDone[0].text }),
      );
    } else if (done.length) {
      if (!actuallyDone)
        items.push(result(rubric, 'fu.360', 'incorrect', `Reported the 360 complete, but the ${label} was not performed. Others will rely on that report.`, { heard: done[0].text, severity: 'major' }));
      else if (!inst.recon.full360Possible)
        items.push(result(rubric, 'fu.360', 'incorrect', 'A full 360 is not possible at this building; report what was and was not seen.', { heard: done[0].text, severity: 'major' }));
      else items.push(result(rubric, 'fu.360', 'correct', '360 completion reported.', { heard: done[0].text }));
    } else items.push(result(rubric, 'fu.360', 'missing', 'State whether the 360 was completed.', { expected: actuallyDone ? '360 complete' : '360 not completed' }));
  }

  // Basement
  if (!inst.building.basementRelevant) items.push(result(rubric, 'fu.basement', 'na', 'Basement statement not expected for this building.'));
  else {
    const no = findConcept(t, 'noBasement', { allowNegated: true });
    const yes = findConcept(t, 'hasBasement');
    add(...no, ...yes);
    if (no.length) items.push(inst.building.basement ? result(rubric, 'fu.basement', 'incorrect', 'There is a basement.', { severity: 'major', heard: no[0].text }) : result(rubric, 'fu.basement', 'correct', 'Basement status reported.', { heard: no[0].text }));
    else if (yes.length) items.push(inst.building.basement ? result(rubric, 'fu.basement', 'correct', 'Basement reported.', { heard: yes[0].text }) : result(rubric, 'fu.basement', 'incorrect', 'There is no basement.', { severity: 'minor', heard: yes[0].text }));
    else items.push(result(rubric, 'fu.basement', 'missing', 'Report basement presence (or "no basement").', { expected: inst.building.basement ? 'basement + access' : 'no basement' }));
  }

  // Conditions on other sides (only revealed findings count)
  const sideFindings = ctx.revealed.filter((x) => x.reportable !== 'optional' && !x.safety && x.kind !== 'basement');
  items.push(findingsItem(rubric, 'fu.sides', sideFindings, t, add, 'No additional findings were available to report.'));

  // Safety
  const safety = ctx.revealed.filter((x) => x.safety);
  items.push(findingsItem(rubric, 'fu.safety', safety, t, add, 'No safety hazards were observed.'));

  // Strategy
  {
    const cont = findConcept(t, 'strategyContinue');
    const change = findConcept(t, 'strategyChange');
    add(...cont, ...change);
    items.push(gradeStrategy(rubric, 'fu.strategy', f, cond, add));
  }

  // Updated IAP
  {
    const { matches } = detectTasks(t);
    const acts = f.actions.map((a) => a.m);
    add(...matches, ...acts);
    if (matches.length || acts.length) items.push(result(rubric, 'fu.iap', 'correct', 'Plan updated.', { heard: (matches[0] ?? acts[0]).text }));
    else items.push(result(rubric, 'fu.iap', 'missing', 'Say what the plan is now (lines, search, water supply).', { severity: 'minor' }));
  }

  // Accountability
  {
    const committed = ctx.assignments.some((a) => TASK_INFO[a.task].interior && a.status !== 'reassigned');
    const acc = findConcept(t, 'accountability');
    add(...acc);
    if (!inst.expectations.accountabilityExpected || !committed) {
      items.push(acc.length ? result(rubric, 'fu.accountability', 'correct', 'Accountability location given.') : result(rubric, 'fu.accountability', 'na', 'No crews committed inside yet.'));
    } else if (acc.length) {
      const after = t.slice(acc[0].end, acc[0].end + 40);
      const hasLoc = /\b(at|on|is|will be|in)\b/.test(after) && /(engine|ladder|tower|rescue|command|alpha|bravo|charlie|delta|side|post|front|rear|apparatus|tailboard|lobby|stair|entrance|corner)/.test(after);
      items.push(hasLoc ? result(rubric, 'fu.accountability', 'correct', 'Accountability location given.', { heard: acc[0].text }) : result(rubric, 'fu.accountability', 'partial', 'Accountability mentioned without a location.', { heard: acc[0].text }));
    } else items.push(result(rubric, 'fu.accountability', 'missing', 'Crews are committed — give the accountability location.', { expected: `Accountability location by side (Alpha, Bravo, Charlie or Delta)` }));
  }

  const statements = unsupportedClaims(t, { ...ctx.benchmarks, occupantsConfirmedOut: inst.occupants.status === 'all-out' });
  const example = ctx.example ?? exampleFollowUp(inst, cond.id);
  const verbosity = analyzeVerbosity(t, [...spans, ...findTerms(t, ['dispatch', 'command'])], wordCount(example));
  items.push(conciseItem(rubric, 'fu.concise', verbosity));
  const reviewFlags = ctx.transcriptUncertain ? ['Speech recognition confidence was low — review the transcript.'] : [];
  return finalize(rubric, 'followUp', items, { statements, spans, normalized: t, example, explanation: inst.explanations.followUp, verbosity, reviewFlags });
}

function findingsItem(rubric: RubricConfig, id: string, list: Finding[], t: string, add: (...m: Match[]) => void, naNote: string): ItemResult {
  if (!list.length) return result(rubric, id, 'na', naNote);
  let possible = 0;
  let got = 0;
  const missed: string[] = [];
  for (const fnd of list) {
    const w = fnd.reportable === 'required' ? 1 : 0.5;
    possible += w;
    const m = matchesGroups(t, fnd.match);
    if (m) {
      got += w;
      add(...m);
    } else missed.push(fnd.text);
  }
  const credit = got / possible;
  const status = credit >= 0.999 ? 'correct' : credit > 0 ? 'partial' : 'missing';
  return result(rubric, id, status, missed.length ? `Not reported: ${missed.join(' ')}` : 'All observed items reported.', {
    credit,
    severity: id === 'fu.safety' && credit < 0.5 ? 'major' : undefined,
  });
}
