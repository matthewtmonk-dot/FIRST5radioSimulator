// Initial radio report grading: facts in context, not keyword counting.

import { findConcept, findTerms, type Match } from '../language/lexicon';
import { extractReportFacts, type ReportFacts } from '../language/parse';
import { normalize } from '../language/normalize';
import type { RubricConfig, VocabularyConfig } from '../rubric/config';
import { PROBLEMS, type ConditionState, type Problem } from '../scenario/schema';
import type { ScenarioInstance } from '../scenario/instance';
import { analyzeVerbosity, conciseItem, finalize, result, unsupportedClaims, wordCount } from './common';
import { exampleInitialReport } from './examples';
import type { ItemResult, Statement, TransmissionGrade } from './types';

const PROBLEM_LABEL: Record<Problem | 'moderate', string> = {
  'nothing-showing': 'nothing showing',
  'light-smoke': 'light smoke',
  moderate: 'smoke showing',
  'working-fire': 'working fire',
  defensive: 'defensive fire conditions',
};
const rank = (p: Problem | 'moderate') => (p === 'moderate' ? 1.5 : PROBLEMS.indexOf(p));

export interface InitialReportContext {
  instance: ScenarioInstance;
  condition: ConditionState;
  rubric: RubricConfig;
  vocab?: VocabularyConfig;
  /** Speech-to-text flagged parts of the transcript as low confidence. */
  transcriptUncertain?: boolean;
}

export function gradeInitialReport(text: string, ctx: InitialReportContext): TransmissionGrade {
  const { instance: inst, condition: cond, rubric } = ctx;
  const norm = normalize(text, ctx.vocab);
  const t = norm.text;
  const areaTerms = [...(cond.location?.areaTerms ?? []), ...inst.expectations.actionLocationTerms];
  const f = extractReportFacts(t, ctx.vocab?.synonyms, areaTerms, inst.ownUnit);
  const items: ItemResult[] = [];
  const spans: Match[] = [];
  const add = (...ms: (Match | undefined)[]) => ms.forEach((m) => m && spans.push(m));
  const b = inst.building;

  // Unit on scene
  const own = inst.ownUnit.toLowerCase();
  const ownHit = findTerms(t, [own])[0];
  add(ownHit, ...f.onScene);
  items.push(
    f.onScene.length
      ? result(rubric, 'ir.onScene', 'correct', 'Arrival announced.', { heard: f.onScene[0].text })
      : result(rubric, 'ir.onScene', 'missing', `Announce "${inst.ownUnit} on scene" so dispatch can time-stamp arrival.`, { severity: 'minor' }),
  );

  // Size
  items.push(gradeAgainst(rubric, 'ir.size', f.sizes, b.acceptableSizes, b.size, 'size', add));

  // Height
  {
    const accepted = f.stories.find((s) => b.acceptableStories.includes(s.value));
    const wrong = f.stories.find((s) => !b.acceptableStories.includes(s.value));
    add(...f.stories.map((s) => s.m), ...f.highRise);
    if (accepted) items.push(result(rubric, 'ir.height', 'correct', 'Height matches the building.', { heard: accepted.m.text }));
    else if (f.highRise.length && b.stories >= 7)
      items.push(result(rubric, 'ir.height', 'alternate', `"High-rise" is accurate; giving the story count (${b.stories}) is more precise.`, { heard: 'high-rise', expected: `${b.stories} stories` }));
    else if (wrong)
      items.push(result(rubric, 'ir.height', 'incorrect', `Reported ${wrong.value} stories; the building is ${describeStories(inst)}.`, { heard: wrong.m.text, expected: describeStories(inst), severity: 'minor' }));
    else items.push(result(rubric, 'ir.height', 'missing', 'Give the number of stories.', { expected: describeStories(inst) }));
  }

  // Occupancy
  items.push(gradeAgainst(rubric, 'ir.occupancy', f.occupancies, b.acceptableOccupancies, b.occupancy, 'occupancy', add, b.occupancyLabel));

  // Problem description
  items.push(gradeProblem(rubric, f, cond, add));

  // Problem location
  items.push(gradeLocation(rubric, f, cond, t, inst, add));

  // Initial task
  const okAction = f.actions.find((a) => inst.expectations.initialActions.includes(a.value));
  add(...f.actions.map((a) => a.m));
  if (okAction) {
    items.push(result(rubric, 'ir.action', 'correct', 'Initial task fits the conditions.', { heard: okAction.m.text }));
  } else if (f.actions.length) {
    const a = f.actions[0];
    const interior = a.value === 'attack-line' || a.value === 'rescue' || a.value === 'investigate' || a.value === 'standpipe-attack';
    const defensiveOnly = cond.acceptableStrategies.every((s) => s === 'defensive');
    items.push(
      result(rubric, 'ir.action', 'incorrect', `"${a.m.text}" does not fit these conditions. Acceptable first tasks: ${inst.expectations.initialActions.join(', ')}.`, {
        heard: a.m.text,
        expected: inst.expectations.initialActions.join(' / '),
        severity: interior && defensiveOnly ? 'dangerous' : 'major',
      }),
    );
  } else {
    items.push(result(rubric, 'ir.action', 'missing', 'State what your crew is doing first.', { expected: inst.expectations.initialActions.join(' / ') }));
  }

  // Location of assigned work
  {
    const terms = findTerms(t, inst.expectations.actionLocationTerms);
    const anyLoc = f.location.sides.length || f.location.areas.length || f.location.floors.length || terms.length;
    add(...terms, ...f.location.areas, ...f.location.sides.map((s) => s.m), ...f.location.floors.map((x) => x.m));
    if (!f.actions.length) items.push(result(rubric, 'ir.actionLocation', 'missing', 'No initial task was given, so no work location.'));
    else if (anyLoc) items.push(result(rubric, 'ir.actionLocation', 'correct', 'Work location given.'));
    else items.push(result(rubric, 'ir.actionLocation', 'missing', 'Say where the crew is working (side, door, floor).', { severity: 'minor' }));
  }

  // Tactical objectives
  {
    const expected = inst.expectations.objectives.filter((o) => o === 'fireControl' || o === 'primarySearch' || o === 'exposure');
    add(...f.objectives.map((o) => o.m));
    if (!expected.length) items.push(result(rubric, 'ir.objectives', 'na', 'No specific tactical objective expected in this report.'));
    else {
      const notes: string[] = [];
      let got = 0;
      for (const o of expected) {
        const explicit = f.objectives.find((x) => x.value === o);
        const implied =
          o === 'fireControl' && f.actions.some((a) => a.value === 'attack-line' || a.value === 'quick-attack' || a.value === 'standpipe-attack');
        if (explicit) got += 1;
        else if (implied) {
          got += 1;
          notes.push('Fire control is implied by the attack line; naming "fire control" is clearer.');
        } else notes.push(`${o === 'fireControl' ? 'Fire control' : o === 'primarySearch' ? 'Primary search' : 'Exposure protection'} not mentioned.`);
      }
      const credit = got / expected.length;
      items.push(
        result(rubric, 'ir.objectives', credit === 1 ? (notes.length ? 'alternate' : 'correct') : credit > 0 ? 'partial' : 'missing', notes.join(' ') || 'Objectives stated.', {
          credit,
          expected: expected.map((o) => (o === 'fireControl' ? 'F/C' : o === 'primarySearch' ? 'P/S' : 'exposures')).join(' + '),
        }),
      );
    }
  }

  // Strategy
  items.push(gradeStrategy(rubric, 'ir.strategy', f, cond, add));

  // Resource determination
  {
    const vals = [...new Set(f.resources.map((r) => r.value))];
    add(...f.resources.map((r) => r.m));
    const ok = vals.filter((v) => inst.expectations.resourceDecisions.includes(v));
    const contradictory = vals.includes('cancel') && (vals.includes('upgrade') || vals.includes('continue'));
    const heavy = cond.problem === 'working-fire' || cond.problem === 'defensive';
    if (!vals.length) items.push(result(rubric, 'ir.resources', 'missing', 'Tell incoming units what to do (cancel, Level One staging, upgrade).', { expected: inst.expectations.resourceDecisions.join(' / ') }));
    else if (contradictory) items.push(result(rubric, 'ir.resources', 'uncertain', `Heard conflicting resource decisions (${vals.join(', ')}). Flagged for instructor review.`));
    else if (ok.length) items.push(result(rubric, 'ir.resources', 'correct', 'Resource decision fits the conditions.', { heard: f.resources[0].m.text }));
    else
      items.push(
        result(rubric, 'ir.resources', 'incorrect', `"${f.resources[0].m.text}" does not fit. Expected: ${inst.expectations.resourceDecisions.join(' or ')}.`, {
          heard: f.resources[0].m.text,
          expected: inst.expectations.resourceDecisions.join(' / '),
          severity: vals.includes('cancel') && heavy ? 'dangerous' : 'major',
        }),
      );
  }

  // Command
  {
    const c = f.command;
    add(c.m, ...c.passing, ...c.fastAttack);
    const streetWords = [inst.address.streetName.split(' ')[0], inst.address.placeName?.split(' ')[0]].filter(Boolean).map((w) => w!.toLowerCase());
    if (c.established && c.name) {
      const streetNamed = streetWords.some((w) => c.name!.includes(w));
      if (rubric.commandNaming === 'street' && !streetNamed)
        items.push(result(rubric, 'ir.command', 'alternate', `Command established as "${c.name} command". The configured convention names command after the street (${inst.commandName}).`, { heard: c.m?.text, expected: inst.commandName }));
      else items.push(result(rubric, 'ir.command', 'correct', 'Command established and named.', { heard: c.m?.text }));
    } else if (c.established) items.push(result(rubric, 'ir.command', 'partial', `Command established but not named. Name it (${inst.commandName}).`, { expected: inst.commandName }));
    else if (c.passing.length)
      items.push(result(rubric, 'ir.command', 'uncertain', 'Command was passed rather than established. Whether that is acceptable depends on local procedure — flagged for instructor review.'));
    else items.push(result(rubric, 'ir.command', 'missing', 'Establish and name command.', { expected: `${inst.ownUnit} establishing ${inst.commandName}`, severity: 'major' }));
  }

  // Unsupported statements
  const occupantsKnownOut = inst.occupants.status === 'all-out' && /\b(out|evacuated|outside|accounted)\b/i.test(inst.occupants.dispatchInfo + ' ' + inst.dispatch.callerReport);
  const statements: Statement[] = unsupportedClaims(t, { primaryClear: false, waterSupply: false, knockdown: false, occupantsConfirmedOut: occupantsKnownOut });
  // Heights or floors that the building does not have
  for (const fl of f.location.floors) {
    if (fl.floor > b.stories) statements.push({ text: fl.m.text, note: `The building has ${b.stories} ${b.stories === 1 ? 'story' : 'stories'}.`, severity: 'major' });
  }
  if (findConcept(t, 'hasBasement').length && !b.basement) statements.push({ text: 'basement', note: 'There is no basement.', severity: 'minor' });

  // Concise
  const example = exampleInitialReport(inst);
  const verbosity = analyzeVerbosity(t, [...spans, ...findTerms(t, ['dispatch', inst.dispatchName.toLowerCase()])], wordCount(example));
  items.push(conciseItem(rubric, 'ir.concise', verbosity));

  const reviewFlags: string[] = [];
  if (ctx.transcriptUncertain) reviewFlags.push('Speech recognition confidence was low for this transmission — review the transcript before relying on this grade.');

  return finalize(rubric, 'initialReport', items, {
    statements,
    spans,
    normalized: t,
    example,
    explanation: inst.explanations.initialReport,
    verbosity,
    reviewFlags,
  });
}

function describeStories(inst: ScenarioInstance) {
  const s = inst.building.acceptableStories;
  return s.length > 1 ? `${s.join(' or ')} stories as seen` : `${inst.building.stories} ${inst.building.stories === 1 ? 'story' : 'stories'}`;
}

function gradeAgainst<T extends string>(
  rubric: RubricConfig,
  id: string,
  found: { value: T; m: Match }[],
  acceptable: T[],
  truth: T,
  what: string,
  add: (...m: Match[]) => void,
  label?: string,
): ItemResult {
  add(...found.map((x) => x.m));
  const ok = found.find((x) => acceptable.includes(x.value));
  const bad = found.find((x) => !acceptable.includes(x.value));
  if (ok && !bad) return result(rubric, id, 'correct', `${cap1(what)} matches.`, { heard: ok.m.text });
  if (ok && bad) return result(rubric, id, 'alternate', `Heard both "${ok.m.text}" and "${bad.m.text}" — one clear description is better.`, { heard: ok.m.text });
  if (bad)
    return result(rubric, id, 'incorrect', `Reported "${bad.m.text}"; this is a ${label ?? truth} (${acceptable.join(' or ')}).`, {
      heard: bad.m.text,
      expected: label ?? acceptable.join(' / '),
      severity: 'minor',
    });
  return result(rubric, id, 'missing', `Describe the building ${what}.`, { expected: label ?? acceptable.join(' / ') });
}

function cap1(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function gradeProblem(rubric: RubricConfig, f: ReportFacts, cond: ConditionState, add: (...m: Match[]) => void): ItemResult {
  add(...f.problems.map((p) => p.m));
  if (!f.problems.length) return result(rubric, 'ir.problem', 'missing', 'Describe what you see.', { expected: cond.acceptableProblems.map((p) => PROBLEM_LABEL[p]).join(' / '), severity: 'major' });
  const acceptable = (p: Problem | 'moderate') =>
    p === 'moderate' ? cond.acceptableProblems.includes('light-smoke') || cond.acceptableProblems.includes('working-fire') : cond.acceptableProblems.includes(p);
  const ok = f.problems.filter((p) => acceptable(p.value));
  const bad = f.problems.filter((p) => !acceptable(p.value));
  const truthRank = rank(cond.problem);
  if (ok.length && !bad.length) {
    const declared = ok.find((p) => p.value !== 'moderate');
    if (!declared)
      return result(rubric, 'ir.problem', 'alternate', 'Smoke described; declaring the problem (light smoke / working fire) is clearer.', { heard: ok[0].m.text, credit: 0.75 });
    return result(rubric, 'ir.problem', 'correct', 'Conditions reported accurately.', { heard: declared.m.text });
  }
  const worst = bad.reduce((a, b) => (Math.abs(rank(b.value) - truthRank) > Math.abs(rank(a.value) - truthRank) ? b : a), bad[0]);
  const under = rank(worst.value) < truthRank;
  const gap = Math.abs(rank(worst.value) - truthRank);
  if (ok.length && gap < 1.5)
    return result(rubric, 'ir.problem', 'partial', `Heard "${worst.m.text}" alongside "${ok[0].m.text}". Pick the one that matches what you see.`, { heard: worst.m.text });
  return result(
    rubric,
    'ir.problem',
    'incorrect',
    under
      ? `Reported "${worst.m.text}" but the visible conditions are ${PROBLEM_LABEL[cond.problem]}. Under-reporting delays resources.`
      : `Reported "${worst.m.text}" but the visible conditions are ${PROBLEM_LABEL[cond.problem]}.`,
    { heard: worst.m.text, expected: cond.acceptableProblems.map((p) => PROBLEM_LABEL[p]).join(' / '), severity: under && gap >= 1.5 ? 'dangerous' : 'major' },
  );
}

function gradeLocation(rubric: RubricConfig, f: ReportFacts, cond: ConditionState, t: string, inst: ScenarioInstance, add: (...m: Match[]) => void): ItemResult {
  const loc = cond.location;
  if (!loc) return result(rubric, 'ir.location', 'na', 'No visible problem to locate.');
  const areaHits = findTerms(t, loc.areaTerms);
  const sideOk = loc.side ? f.location.sides.find((s) => s.side === loc.side) : undefined;
  const sideBad = loc.side ? f.location.sides.find((s) => s.side !== loc.side && !s.alt) : undefined;
  const floorOk = loc.floor ? f.location.floors.find((x) => x.floor === loc.floor) : undefined;
  const floorBad = loc.floor ? f.location.floors.find((x) => x.floor !== loc.floor) : undefined;
  add(...areaHits, ...f.location.sides.map((s) => s.m), ...f.location.floors.map((x) => x.m));
  const expected = [loc.side ? `${loc.side} side` : '', loc.floor && inst.building.stories > 1 ? `floor ${loc.floor}` : '', loc.area].filter(Boolean).join(', ');
  const needFloor = !!loc.floor && inst.building.stories > 2;
  if (floorBad && !floorOk && needFloor)
    return result(rubric, 'ir.location', 'incorrect', `Reported ${floorBad.m.text}; the problem is on floor ${loc.floor}.`, { heard: floorBad.m.text, expected, severity: 'major' });
  if ((sideOk || areaHits.length) && (!needFloor || floorOk)) {
    if (sideOk?.alt) return result(rubric, 'ir.location', 'alternate', `"${sideOk.m.text}" is understood; using the side designation (${loc.side}) is standard.`, { heard: sideOk.m.text, expected });
    return result(rubric, 'ir.location', 'correct', 'Problem located.', { heard: (sideOk?.m ?? areaHits[0]).text });
  }
  if (needFloor && !floorOk && (sideOk || areaHits.length))
    return result(rubric, 'ir.location', 'partial', `Give the floor (floor ${loc.floor}).`, { expected });
  if (sideBad) return result(rubric, 'ir.location', 'incorrect', `Reported the ${sideBad.side} side; the problem is ${expected}.`, { heard: sideBad.m.text, expected, severity: 'major' });
  return result(rubric, 'ir.location', 'missing', 'Say where the problem is.', { expected });
}

export function gradeStrategy(
  rubric: RubricConfig,
  id: string,
  f: Pick<ReportFacts, 'strategies'>,
  cond: ConditionState,
  add: (...m: Match[]) => void,
): ItemResult {
  add(...f.strategies.map((s) => s.m));
  const vals = [...new Set(f.strategies.map((s) => s.value))];
  if (!vals.length) return result(rubric, id, 'missing', 'Declare the strategy.', { expected: cond.acceptableStrategies.join(' / '), severity: 'major' });
  const final = f.strategies[f.strategies.length - 1];
  if (vals.length > 1) {
    // "switching from offensive to defensive" names both; the last one stated wins if it is acceptable
    if (cond.acceptableStrategies.includes(final.value))
      return result(rubric, id, 'alternate', `More than one strategy heard; final strategy "${final.value}" fits.`, { heard: final.m.text });
    return result(rubric, id, 'uncertain', `Heard ${vals.join(' and ')}. Flagged for instructor review.`, { heard: vals.join(' / ') });
  }
  if (cond.acceptableStrategies.includes(final.value)) return result(rubric, id, 'correct', 'Strategy fits the conditions.', { heard: final.m.text });
  const dangerous = final.value === 'offensive' && cond.acceptableStrategies.every((s) => s === 'defensive');
  return result(rubric, id, 'incorrect', `"${final.value}" does not fit these conditions (${cond.acceptableStrategies.join(' or ')}).`, {
    heard: final.m.text,
    expected: cond.acceptableStrategies.join(' / '),
    severity: dangerous ? 'dangerous' : 'major',
  });
}
