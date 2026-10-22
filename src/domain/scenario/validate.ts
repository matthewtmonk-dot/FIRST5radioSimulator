// Scenario validator: schema checks (Zod) plus operational consistency checks.
// Errors block a scenario from being used; warnings are shown to the author.

import { anchorIds } from '../../render/model';
import { TASK_INFO } from '../language/tasks';
import { applyBranch } from './instance';
import { ScenarioTemplate, PROBLEMS, type ScenarioTemplateInput, type TriggerT } from './schema';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  template?: ScenarioTemplate;
}

export function validateScenario(input: unknown): ValidationResult {
  const parsed = ScenarioTemplate.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
      warnings: [],
    };
  }
  const t = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  checkVariant(t, 'base', errors, warnings);
  for (const b of t.branches) {
    const bad = Object.keys(b.patch).filter(
      (k) => !['title', 'summary', 'conditionStates', 'initialCondition', 'findings', 'events', 'occupants', 'dispatch', 'expectations', 'taskOutcomes', 'examples', 'explanations', 'endWhen', 'investigation', 'recon', 'units', 'difficulty'].includes(k),
    );
    if (bad.length) errors.push(`branch ${b.id}: cannot change ${bad.join(', ')} (building facts must stay consistent across branches)`);
    try {
      checkVariant(applyBranch(t, b.id), `branch ${b.id}`, errors, warnings);
    } catch (e) {
      errors.push(`branch ${b.id}: ${(e as Error).message.slice(0, 300)}`);
    }
  }
  if (new Set(t.branches.map((b) => b.id)).size !== t.branches.length) errors.push('branch ids must be unique');
  return { ok: errors.length === 0, errors, warnings, template: t };
}

function checkVariant(t: ScenarioTemplate, where: string, errors: string[], warnings: string[]) {
  const e = (m: string) => errors.push(`${where}: ${m}`);
  const w = (m: string) => warnings.push(`${where}: ${m}`);
  const b = t.building;
  const states = new Map(t.conditionStates.map((c) => [c.id, c]));

  if (!b.acceptableSizes.includes(b.size)) e(`building.size "${b.size}" must be listed in acceptableSizes`);
  if (!b.acceptableOccupancies.includes(b.occupancy)) e(`building.occupancy must be listed in acceptableOccupancies`);
  if (!b.acceptableStories.includes(b.stories)) w('building.stories is not listed in acceptableStories');
  if (b.acceptableStories.some((s) => Math.abs(s - b.stories) > 1)) e('acceptableStories differs from the real story count by more than one');
  if (b.basementRelevant === false && b.basement) w('building has a basement but basementRelevant is false');
  if (!states.has(t.initialCondition)) e(`initialCondition "${t.initialCondition}" does not exist`);
  if (new Set(t.conditionStates.map((c) => c.id)).size !== t.conditionStates.length) e('condition state ids must be unique');
  if (new Set(t.findings.map((f) => f.id)).size !== t.findings.length) e('finding ids must be unique');
  if (new Set(t.units.map((u) => u.role)).size !== t.units.length) e('unit roles must be unique');

  // Conditions
  for (const c of t.conditionStates) {
    if (!c.acceptableProblems.includes(c.problem)) e(`condition ${c.id}: problem "${c.problem}" must be in acceptableProblems`);
    const rank = PROBLEMS.indexOf(c.problem);
    if (c.problem === 'defensive' && c.acceptableStrategies.includes('offensive')) e(`condition ${c.id}: defensive fire conditions cannot accept an offensive strategy`);
    if (c.problem === 'nothing-showing' && c.acceptableStrategies.includes('defensive')) e(`condition ${c.id}: nothing showing cannot accept a defensive strategy`);
    if (rank >= 2 && c.acceptableStrategies.includes('investigating')) e(`condition ${c.id}: a working fire cannot accept investigating mode`);
    if (c.location?.floor && c.location.floor > b.stories) e(`condition ${c.id}: fire on floor ${c.location.floor} of a ${b.stories}-story building`);
    if (c.problem === 'nothing-showing' && c.emitters.some((x) => (x.kind === 'fire' || x.kind === 'smoke') && x.intensity > 0.15 && x.view === 'alpha'))
      e(`condition ${c.id}: "nothing showing" but visible smoke or fire is drawn on Alpha`);
    if (rank >= 1 && c.emitters.filter((x) => x.kind !== 'haze').length === 0) w(`condition ${c.id}: ${c.problem} with no visible smoke or fire effects`);
    if (c.problem !== 'nothing-showing' && !c.location) w(`condition ${c.id}: no problem location given`);
    for (const em of c.emitters) {
      const ids = anchorIds(b.archetype, em.view);
      if (!ids.includes(em.anchor)) e(`condition ${c.id}: emitter anchor "${em.anchor}" does not exist on the ${em.view} view of ${b.archetype}`);
      else {
        const m = /^(?:floor-\w+-|unit-|balcony-|apt-|room-)(\d+)/.exec(em.anchor);
        if (m && Number(m[1].slice(0, m[1].length > 2 ? 1 : undefined)) > b.stories + 1) w(`condition ${c.id}: emitter "${em.anchor}" may be above the top floor`);
      }
    }
    if (t.images.length) {
      for (const em of c.emitters) {
        const img = t.images.find((i) => i.view === em.view);
        if (img && !img.anchors[em.anchor]) w(`condition ${c.id}: photo for ${em.view} has no anchor "${em.anchor}" placed — effect will not be shown on the photo`);
      }
    }
  }
  // Findings
  for (const f of t.findings) {
    if (f.kind === 'basement' && !b.basement && !/no basement|slab/i.test(f.text)) e(`finding ${f.id}: describes a basement but the building has none`);
    if (/\b(\d+)(st|nd|rd|th) floor\b/i.test(f.text)) {
      const fl = Number(/\b(\d+)(st|nd|rd|th) floor\b/i.exec(f.text)![1]);
      if (fl > b.stories) e(`finding ${f.id}: mentions floor ${fl} of a ${b.stories}-story building`);
    }
    if (b.stories === 1 && /second[- ]floor|upstairs/i.test(f.text)) e(`finding ${f.id}: mentions a second floor on a one-story building`);
    if (f.revealedBy === 'investigate' && !t.investigation) e(`finding ${f.id}: revealed by investigation but no investigation is defined`);
    if (!t.recon.full360Possible && f.revealedBy === 'recon' && ['charlie'].includes(f.side) && t.recon.kind === '360') w(`finding ${f.id}: Charlie finding but a full 360 is marked not possible`);
  }
  // Units and events
  const roles = new Set(t.units.map((u) => u.role));
  const bc = t.units.find((u) => u.type === 'battalion');
  if (t.endWhen === 'transfer' && t.expectations.transferExpected && !bc) e('transfer expected but no battalion unit is defined');
  if (bc && (bc.arrival < 120 || bc.arrival > 330)) w(`battalion arrives at ${bc.arrival}s; the exercise targets a transfer near five minutes`);
  const eventIds = new Set(t.events.map((x) => x.id));
  for (const ev of t.events) {
    walkTrigger(ev.when, (tr) => {
      if ('event' in tr && !eventIds.has(tr.event)) e(`event ${ev.id}: trigger references unknown event "${tr.event}"`);
    });
    for (const ef of ev.effects) {
      if ('setCondition' in ef && !states.has(ef.setCondition)) e(`event ${ev.id}: unknown condition "${ef.setCondition}"`);
      if ('reveal' in ef && !t.findings.some((f) => f.id === ef.reveal)) e(`event ${ev.id}: unknown finding "${ef.reveal}"`);
      if ('radio' in ef && !['Dispatch', 'OWN'].includes(ef.radio.from) && !roles.has(ef.radio.from) && !/^[A-Z][a-z]+ \d+$/.test(ef.radio.from))
        e(`event ${ev.id}: radio from unknown role "${ef.radio.from}"`);
    }
  }
  for (const [task, outcome] of Object.entries(t.taskOutcomes)) {
    if (!(task in TASK_INFO)) e(`taskOutcomes: unknown task "${task}"`);
    for (const ef of outcome.effects) if ('setCondition' in ef && !states.has(ef.setCondition)) e(`taskOutcomes.${task}: unknown condition "${ef.setCondition}"`);
  }
  // Expectations
  const init = states.get(t.initialCondition);
  if (init) {
    const offensiveOnly = init.acceptableStrategies.every((s) => s === 'offensive');
    if (init.problem === 'nothing-showing' && t.expectations.initialActions.some((a) => a === 'attack-line' || a === 'defensive-ops'))
      w('nothing showing on arrival but an attack line or defensive operations is an expected initial action');
    if (init.acceptableStrategies.every((s) => s === 'defensive') && t.expectations.initialActions.some((a) => a === 'attack-line' || a === 'rescue'))
      e('defensive-only conditions cannot expect an interior initial action');
    if (init.problem !== 'nothing-showing' && t.expectations.resourceDecisions.includes('cancel') && offensiveOnly) e('cancelling resources is not consistent with a working fire');
  }
  if (t.occupants.status !== 'none' && t.occupants.status !== 'all-out' && !t.expectations.criticalTasks.includes('primarySearch') && init?.problem !== 'nothing-showing')
    w('occupants unknown or trapped but primary search is not a critical task');
  for (const r of t.examples.assignments) if (!roles.has(r.role)) e(`examples.assignments: unknown role "${r.role}"`);
  // Placeholders
  const text = JSON.stringify(t);
  for (const m of text.matchAll(/\{([A-Z][A-Z0-9_]*)\}/g)) {
    if (!['OWN', 'COMMAND', 'ADDRESS', 'STREET', 'CROSS', 'PLACE', 'DISPATCH', 'WIND', 'UNIT'].includes(m[1]) && !roles.has(m[1])) e(`unknown placeholder {${m[1]}}`);
  }
  if (!t.examples.initialReport.length) w('no authored initial report example; one will be generated');
}

function walkTrigger(tr: TriggerT, fn: (t: TriggerT) => void) {
  fn(tr);
  if ('allOf' in tr) tr.allOf.forEach((x) => walkTrigger(x, fn));
}

export function assertValid(input: ScenarioTemplateInput): ScenarioTemplate {
  const r = validateScenario(input);
  if (!r.ok) throw new Error(`Invalid scenario ${(input as { id?: string }).id}: ${r.errors.join('; ')}`);
  return r.template!;
}
