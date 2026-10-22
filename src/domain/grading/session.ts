// Whole-exercise scoring for the after-action review.

import type { SimState } from '../engine/types';
import { SECTION_LABELS, type RubricConfig, type SectionId } from '../rubric/config';
import { gradeAssignmentsSession } from './assignments';
import { result, scoreItems } from './common';
import type { ItemResult, SectionScore, SessionScore, Statement, TransmissionGrade } from './types';

function latest(state: SimState, section: SectionId): TransmissionGrade | undefined {
  const recs = state.grades.filter((g) => g.grade.section === section && !g.superseded);
  return recs[recs.length - 1]?.grade;
}

function missingSection(rubric: RubricConfig, section: SectionId, why: string): ItemResult[] {
  return rubric.items
    .filter((i) => i.section === section && i.enabled)
    .map((i) => result(rubric, i.id, 'missing', why, { severity: i.critical ? 'major' : undefined }));
}

export function scoreSession(state: SimState, rubric: RubricConfig): SessionScore {
  const inst = state.instance;
  const sections: SectionScore[] = [];
  const drill = state.mode === 'drill' ? state.drill : undefined;

  const include = (s: SectionId) => {
    if (!drill) return true;
    if (drill.checkpoint === 'assignment') return s === 'assignments';
    return drill.checkpoint === s;
  };

  // Initial report
  if (include('initialReport')) {
    const g = latest(state, 'initialReport');
    const items = g ? g.items : missingSection(rubric, 'initialReport', 'No initial radio report was given.');
    sections.push({ section: 'initialReport', applicable: true, items, grades: g ? [g] : [], score: g ? g.score : 0 });
  }

  // Assignments
  if (include('assignments')) {
    const grades = state.grades.filter((g) => g.grade.section === 'assignments' && !g.superseded).map((g) => g.grade);
    const items = drill
      ? (grades[grades.length - 1]?.items ?? missingSection(rubric, 'assignments', 'No assignment was given.'))
      : gradeAssignmentsSession({ instance: inst, rubric, transmissions: grades, assignments: state.assignments, units: state.units, log: state.log, endT: state.t });
    const applicable = items.some((i) => i.status !== 'na');
    sections.push({ section: 'assignments', applicable, items, grades, score: applicable ? scoreItems(items, rubric) : null });
  }

  // Follow-up
  if (include('followUp')) {
    const g = latest(state, 'followUp');
    const expected = inst.expectations.followUpExpected;
    if (g) sections.push({ section: 'followUp', applicable: true, items: g.items, grades: [g], score: g.score });
    else if (expected)
      sections.push({ section: 'followUp', applicable: true, items: missingSection(rubric, 'followUp', 'No follow-up report was given.'), grades: [], score: 0 });
    else sections.push({ section: 'followUp', applicable: false, items: [], grades: [], score: null });
  }

  // Transfer
  if (include('transfer')) {
    const g = latest(state, 'transfer');
    const bc = state.units.find((u) => u.id === state.transfer.bcUnit);
    const bcArrived = bc?.arrivedAt !== undefined;
    if (g) sections.push({ section: 'transfer', applicable: true, items: g.items, grades: [g], score: g.score });
    else if (inst.expectations.transferExpected && bcArrived)
      sections.push({ section: 'transfer', applicable: true, items: missingSection(rubric, 'transfer', 'Command was not transferred.'), grades: [], score: 0 });
    else if (inst.expectations.transferExpected && bc?.status === 'cancelled')
      sections.push({ section: 'transfer', applicable: true, items: missingSection(rubric, 'transfer', 'The battalion chief was cancelled, so no transfer occurred.'), grades: [], score: 0 });
    else sections.push({ section: 'transfer', applicable: false, items: [], grades: [], score: null });
  }

  const applicable = sections.filter((s) => s.applicable && s.score !== null);
  const totalW = applicable.reduce((n, s) => n + rubric.sectionWeights[s.section], 0);
  const overall = totalW ? Math.round(applicable.reduce((n, s) => n + (s.score ?? 0) * rubric.sectionWeights[s.section], 0) / totalW) : null;

  const all = sections.flatMap((s) => s.items.map((i) => ({ ...i, section: s.section })));
  const criticalOmissions = all.filter((i) => i.critical && i.status === 'missing').map((i) => `${SECTION_LABELS[i.section]} — ${i.label}`);
  const incorrect: Statement[] = [
    ...all.filter((i) => i.status === 'incorrect').map((i) => ({ text: `${SECTION_LABELS[i.section]} — ${i.label}${i.heard ? `: "${i.heard}"` : ''}`, note: i.note, severity: i.severity ?? 'minor' })),
    ...sections.flatMap((s) => s.grades.flatMap((g) => g.statements)),
  ];
  const strengths = [
    ...sections.filter((s) => s.applicable && (s.score ?? 0) >= 85).map((s) => `${SECTION_LABELS[s.section]}: ${s.score}`),
    ...all.filter((i) => i.critical && i.status === 'correct').map((i) => `${i.label} ✓`),
  ].slice(0, 8);
  const improvements = all
    .filter((i) => i.status === 'missing' || i.status === 'incorrect' || i.status === 'partial')
    .sort((a, b) => b.weight * (1 - b.credit) - a.weight * (1 - a.credit))
    .slice(0, 6)
    .map((i) => `${SECTION_LABELS[i.section]} — ${i.label}: ${i.note}`);
  const reviewFlags = [...new Set(sections.flatMap((s) => s.grades.flatMap((g) => g.reviewFlags)))];
  return { overall, sections, criticalOmissions, incorrect, strengths, improvements, reviewFlags };
}
