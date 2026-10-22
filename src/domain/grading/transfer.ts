// Command transfer grading: accuracy and completeness of the face-to-face
// briefing against what is actually true in the simulation at that moment.

import { findConcept, findTerms, matchesGroups, type Match } from '../language/lexicon';
import { detectTasks, extractReportFacts, findCallsigns } from '../language/parse';
import { normalize } from '../language/normalize';
import { TASK_INFO } from '../language/tasks';
import type { RubricConfig, VocabularyConfig } from '../rubric/config';
import type { ConditionState, Finding } from '../scenario/schema';
import type { ScenarioInstance } from '../scenario/instance';
import type { AssignmentRecord } from '../engine/types';
import { analyzeVerbosity, conciseItem, finalize, result, unsupportedClaims, wordCount } from './common';
import { exampleTransfer } from './examples';
import { gradeStrategy } from './initialReport';
import type { ItemResult, TransmissionGrade } from './types';

export interface TransferContext {
  instance: ScenarioInstance;
  condition: ConditionState;
  rubric: RubricConfig;
  vocab?: VocabularyConfig;
  assignments: AssignmentRecord[];
  revealed: Finding[];
  benchmarks: { primaryClear: boolean; waterSupply: boolean; knockdown: boolean };
  transcriptUncertain?: boolean;
  /** Session-specific preferred example. */
  example?: string;
}

const PROBLEM_WORDS: Record<string, string[]> = {
  'nothing-showing': ['nothing showing', 'no fire', 'no smoke'],
  'light-smoke': ['light smoke', 'smoke'],
  'working-fire': ['working fire', 'fire', 'smoke'],
  defensive: ['defensive', 'fully involved', 'heavy fire', 'collapse'],
};

export function gradeTransfer(text: string, ctx: TransferContext): TransmissionGrade {
  const { instance: inst, condition: cond, rubric } = ctx;
  const norm = normalize(text, ctx.vocab);
  const t = norm.text;
  const f = extractReportFacts(t, ctx.vocab?.synonyms, cond.location?.areaTerms ?? [], inst.ownUnit);
  const items: ItemResult[] = [];
  const spans: Match[] = [];
  const add = (...ms: (Match | undefined)[]) => ms.forEach((m) => m && spans.push(m));
  const statements = unsupportedClaims(t, { ...ctx.benchmarks, occupantsConfirmedOut: inst.occupants.status === 'all-out' });

  // Current conditions
  {
    const terms = [...cond.conditionTerms, ...(PROBLEM_WORDS[cond.problem] ?? []), ...(cond.location?.areaTerms ?? [])];
    const hits = findTerms(t, terms);
    const knock = findConcept(t, 'bmKnockdown');
    add(...hits, ...knock, ...f.problems.map((p) => p.m));
    const problemOk = f.problems.some((p) => p.value === 'moderate' || cond.acceptableProblems.includes(p.value as never));
    if (hits.length || problemOk || (knock.length && ctx.benchmarks.knockdown))
      items.push(result(rubric, 'tr.conditions', 'correct', 'Current conditions described.', { heard: (hits[0] ?? knock[0] ?? f.problems[0]?.m)?.text }));
    else items.push(result(rubric, 'tr.conditions', 'missing', 'Describe current building and fire conditions.', { expected: cond.conditionTerms[0] ?? cond.description }));
  }

  // Strategy
  items.push(gradeStrategy(rubric, 'tr.strategy', f, cond, add));

  // Actions completed and underway
  const active = ctx.assignments.filter((a) => a.status !== 'reassigned');
  {
    const expectedBits: { label: string; hit: boolean }[] = [];
    const bm = (concept: string, achieved: boolean, label: string) => {
      if (!achieved) return;
      const m = findConcept(t, concept);
      add(...m);
      expectedBits.push({ label, hit: m.length > 0 });
    };
    bm('bmWaterSupply', ctx.benchmarks.waterSupply, 'water supply established');
    bm('bmPrimary', ctx.benchmarks.primaryClear, 'primary search complete');
    bm('bmKnockdown', ctx.benchmarks.knockdown, 'knockdown');
    const { tasks, matches } = detectTasks(t);
    add(...matches);
    const underway = [...new Set(active.filter((a) => a.status === 'working' || a.status === 'assigned').map((a) => a.task))];
    for (const task of underway) expectedBits.push({ label: `${TASK_INFO[task].label} underway`, hit: tasks.includes(task) });
    if (!expectedBits.length) items.push(result(rubric, 'tr.actions', tasks.length ? 'correct' : 'missing', tasks.length ? 'Actions described.' : 'Describe what has been done.'));
    else {
      const got = expectedBits.filter((b) => b.hit).length;
      const missed = expectedBits.filter((b) => !b.hit).map((b) => b.label);
      items.push(
        result(rubric, 'tr.actions', got === expectedBits.length ? 'correct' : got ? 'partial' : 'missing', missed.length ? `Not mentioned: ${missed.join(', ')}.` : 'Completed and ongoing work covered.', {
          credit: got / expectedBits.length,
        }),
      );
    }
  }

  // Unit locations and assignments
  {
    const byUnit = new Map<string, AssignmentRecord[]>();
    for (const a of active) byUnit.set(a.unit, [...(byUnit.get(a.unit) ?? []), a]);
    if (!byUnit.size) items.push(result(rubric, 'tr.units', 'na', 'No units had assignments.'));
    else {
      const calls = findCallsigns(t);
      let got = 0;
      const missed: string[] = [];
      const wrong: string[] = [];
      for (const [unit, recs] of byUnit) {
        const mentions = calls.filter((c) => c.unit.toLowerCase() === unit.toLowerCase());
        // Own crew may be referred to as "my crew" / "we"
        const ownCrew = unit === inst.ownUnit && /\b(my crew|our crew|we have|we re|we are|i have)\b/.test(t);
        if (!mentions.length && !ownCrew) {
          missed.push(unit);
          continue;
        }
        add(...mentions.map((m) => ({ concept: 'unit', start: m.start, end: m.end, text: unit })));
        const windows = mentions.map((m) => t.slice(m.end, Math.min(t.length, m.end + 70)).split(/\b(engine|ladder|tower|rescue|squad|battalion)\b/)[0]);
        if (ownCrew) windows.push(t);
        const recTasks = recs.map((r) => r.task);
        const said = windows.flatMap((w) => detectTasks(w).tasks);
        if (said.some((x) => recTasks.includes(x))) got += 1;
        else if (said.length) {
          wrong.push(`${unit} is assigned ${recTasks.map((x) => TASK_INFO[x].label).join('/')}, not ${said.map((x) => TASK_INFO[x].label).join('/')}`);
        } else {
          got += 0.5;
          missed.push(`${unit} (task)`);
        }
      }
      const credit = got / byUnit.size;
      if (wrong.length) items.push(result(rubric, 'tr.units', 'incorrect', `${wrong.join('; ')}.`, { credit, severity: 'major' }));
      else
        items.push(
          result(rubric, 'tr.units', credit >= 0.999 ? 'correct' : credit > 0 ? 'partial' : 'missing', missed.length ? `Not covered: ${missed.join(', ')}.` : 'All units and their assignments covered.', { credit }),
        );
    }
  }

  // Priorities and remaining benchmarks
  {
    const generic = ['secondary', 'overhaul', 'extension', 'loss control', 'utilities', 'rehab', 'under control', 'ventilat', 'check the attic', 'exposure', 'still need', 'priority', 'priorities', 'benchmark', 'next'];
    const hits = findTerms(t, [...inst.expectations.transferPriorities, ...generic]);
    add(...hits);
    items.push(hits.length ? result(rubric, 'tr.priorities', 'correct', 'Remaining priorities stated.', { heard: hits[0].text }) : result(rubric, 'tr.priorities', 'missing', 'What still needs to happen?', { expected: inst.expectations.transferPriorities.join(', ') || 'e.g. secondary search, check for extension' }));
  }

  // Safety
  {
    const safety = ctx.revealed.filter((x) => x.safety);
    if (!safety.length) items.push(result(rubric, 'tr.safety', 'na', 'No observed hazards to pass on.'));
    else {
      const got = safety.filter((s) => {
        const m = matchesGroups(t, s.match);
        if (m) add(...m);
        return !!m;
      });
      items.push(
        result(rubric, 'tr.safety', got.length === safety.length ? 'correct' : got.length ? 'partial' : 'missing', got.length === safety.length ? 'Hazards passed on.' : `Not passed on: ${safety.filter((s) => !got.includes(s)).map((s) => s.text).join(' ')}`, {
          credit: got.length / safety.length,
          severity: got.length === 0 ? 'major' : undefined,
        }),
      );
    }
  }

  // Needs
  {
    const m = findConcept(t, 'needs', { allowNegated: true });
    add(...m);
    items.push(m.length ? result(rubric, 'tr.needs', 'correct', 'Needs stated.', { heard: m[0].text }) : result(rubric, 'tr.needs', 'missing', 'State outstanding needs, or that none exist.'));
  }

  // Confirmation (engine may upgrade this after a prompted confirmation)
  {
    const m = findConcept(t, 'transferConfirm');
    add(...m);
    items.push(m.length ? result(rubric, 'tr.confirm', 'correct', 'Transfer explicitly stated.', { heard: m[0].text }) : result(rubric, 'tr.confirm', 'missing', 'Explicitly transfer command ("you have command") and get acknowledgment.', { severity: 'minor' }));
  }

  // Dispatch notification
  if (rubric.transfer.dispatchNotificationBy === 'receiving') items.push(result(rubric, 'tr.dispatch', 'na', 'The receiving officer notifies dispatch under the configured procedure.'));
  else items.push(result(rubric, 'tr.dispatch', 'missing', 'Notify dispatch of the command transfer.'));

  const example = ctx.example ?? exampleTransfer(inst);
  const verbosity = analyzeVerbosity(t, [...spans, ...findTerms(t, ['battalion', 'command', 'chief'])], wordCount(example));
  items.push(conciseItem(rubric, 'tr.concise', verbosity));
  const reviewFlags = ctx.transcriptUncertain ? ['Speech recognition confidence was low — review the transcript.'] : [];
  return finalize(rubric, 'transfer', items, { statements, spans, normalized: t, example, explanation: inst.explanations.transfer, verbosity, reviewFlags });
}
