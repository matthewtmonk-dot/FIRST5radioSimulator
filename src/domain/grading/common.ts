import { countFillers } from '../language/normalize';
import type { Match } from '../language/lexicon';
import { findConcept } from '../language/lexicon';
import type { RubricConfig, RubricItem, SectionId } from '../rubric/config';
import type { ItemResult, ItemStatus, Severity, Statement, TransmissionGrade, VerbosityResult } from './types';

export function rubricItem(rubric: RubricConfig, id: string): RubricItem {
  const it = rubric.items.find((i) => i.id === id);
  if (!it) throw new Error(`Unknown rubric item ${id}`);
  return it;
}

const CREDIT: Record<ItemStatus, number> = { correct: 1, alternate: 1, partial: 0.5, missing: 0, incorrect: 0, uncertain: 0, na: 0 };

export function result(
  rubric: RubricConfig,
  id: string,
  status: ItemStatus,
  note: string,
  extra: Partial<Pick<ItemResult, 'heard' | 'expected' | 'severity' | 'credit'>> = {},
): ItemResult {
  const it = rubricItem(rubric, id);
  return {
    id,
    label: it.label,
    status: it.enabled ? status : 'na',
    credit: extra.credit ?? CREDIT[status],
    weight: it.weight,
    critical: it.critical,
    note: it.enabled ? note : 'Disabled in rubric settings.',
    heard: extra.heard,
    expected: extra.expected,
    severity: extra.severity,
  };
}

export function scoreItems(items: ItemResult[], rubric: RubricConfig, statements: Statement[] = []): number | null {
  let possible = 0;
  let earned = 0;
  let dangerous = false;
  for (const it of items) {
    if (it.status === 'na' || it.status === 'uncertain') continue;
    possible += it.weight;
    earned += it.weight * Math.max(0, Math.min(1, it.credit));
    if (it.status === 'incorrect') earned -= it.weight * rubric.incorrectPenalty;
    if (it.severity === 'dangerous') dangerous = true;
  }
  if (possible === 0) return null;
  let score = (earned / possible) * 100;
  // Unsupported statements not tied to a single item cost points directly.
  for (const s of statements) {
    if (s.severity === 'dangerous') dangerous = true;
    score -= s.severity === 'minor' ? 2 : 5;
  }
  score = Math.max(0, Math.min(100, score));
  if (dangerous) score = Math.min(score, rubric.dangerousCap);
  return Math.round(score);
}

export function analyzeVerbosity(normalized: string, spans: Match[], referenceWords: number): VerbosityResult {
  const words = normalized.split(/\s+/).filter((w) => /[a-z0-9]/.test(w)).length;
  const fillers = countFillers(normalized).found;
  // Split into clauses and find those without any checklist information
  const uninformative: string[] = [];
  let offset = 0;
  for (const raw of normalized.split(/([.,;:!?])/)) {
    const start = normalized.indexOf(raw, offset);
    const end = start + raw.length;
    offset = end;
    const clause = raw.trim();
    if (!clause || /^[.,;:!?]$/.test(clause)) continue;
    const clauseWords = clause.split(/\s+/).length;
    const covered = spans.some((s) => s.start < end && s.end > start);
    if (!covered && clauseWords >= 3) uninformative.push(clause);
  }
  const extraWords = uninformative.reduce((n, c) => n + c.split(/\s+/).length, 0);
  const ratio = words / Math.max(18, referenceWords);
  let level: VerbosityResult['level'] = 'concise';
  if (ratio > 1.25 || fillers.length >= 2 || extraWords >= 8) level = 'acceptable';
  if (ratio > 1.6 || fillers.length >= 4 || extraWords >= 14) level = 'wordy';
  if (ratio > 2.2 || fillers.length >= 7 || extraWords >= 24) level = 'very-wordy';
  return { words, referenceWords, fillers, uninformative, level };
}

export function conciseItem(rubric: RubricConfig, id: string, v: VerbosityResult): ItemResult {
  const filler = v.fillers.length ? ` Filler: ${[...new Set(v.fillers)].map((f) => `"${f}"`).join(', ')}.` : '';
  const extra = v.uninformative.length ? ` Clauses without checklist information: ${v.uninformative.map((c) => `"${c}"`).join('; ')}.` : '';
  switch (v.level) {
    case 'concise':
      return result(rubric, id, 'correct', `${v.words} words — efficient.`);
    case 'acceptable':
      return result(rubric, id, 'correct', `${v.words} words (reference about ${v.referenceWords}). Acceptable.${filler}${extra}`);
    case 'wordy':
      return result(rubric, id, 'partial', `${v.words} words against a reference of about ${v.referenceWords}. Tighten it up.${filler}${extra}`, { severity: 'minor' });
    default:
      return result(rubric, id, 'missing', `${v.words} words against a reference of about ${v.referenceWords}. Long transmissions tie up the channel.${filler}${extra}`, {
        severity: 'minor',
      });
  }
}

export function wordCount(s: string) {
  return s.split(/\s+/).filter(Boolean).length;
}

export function finalize(
  rubric: RubricConfig,
  section: SectionId,
  items: ItemResult[],
  opts: { statements?: Statement[]; spans: Match[]; normalized: string; example: string; explanation: string; verbosity?: VerbosityResult; reviewFlags?: string[] },
): TransmissionGrade {
  const statements = opts.statements ?? [];
  const dangerous = [
    ...items.filter((i) => i.severity === 'dangerous').map((i) => `${i.label}: ${i.note}`),
    ...statements.filter((s) => s.severity === 'dangerous').map((s) => `${s.text} — ${s.note}`),
  ];
  return {
    section,
    score: scoreItems(items, rubric, statements),
    items,
    verbosity: opts.verbosity,
    statements,
    dangerous,
    reviewFlags: [...(opts.reviewFlags ?? []), ...items.filter((i) => i.status === 'uncertain').map((i) => `${i.label}: ${i.note}`)],
    spans: opts.spans,
    normalized: opts.normalized,
    example: opts.example,
    explanation: opts.explanation,
  };
}

/** Claims that need facts the officer does not have. */
export function unsupportedClaims(
  text: string,
  facts: { primaryClear: boolean; waterSupply: boolean; knockdown: boolean; occupantsConfirmedOut: boolean },
): Statement[] {
  const out: Statement[] = [];
  const claim = (concept: string) => findConcept(text, concept)[0];
  const p = claim('bmPrimary');
  if (p && !facts.primaryClear) out.push({ text: p.text, note: 'No unit has reported a completed primary search.', severity: 'dangerous' });
  const w = claim('bmWaterSupply');
  if (w && !facts.waterSupply) out.push({ text: w.text, note: 'Water supply has not been reported as established.', severity: 'major' });
  const k = claim('bmKnockdown');
  if (k && !facts.knockdown && !/\b(no|not|before|until|prior to|awaiting|waiting)\b/.test(text.slice(Math.max(0, k.start - 25), k.start))) {
    out.push({ text: k.text, note: 'Knockdown has not been reported.', severity: 'major' });
  }
  const occ = /\b(all|everyone|everybody|the (occupants?|residents?|family)) (is |are )?(out|accounted for|evacuated|outside)\b|\bno one (is )?(inside|home)\b|\bnobody (is )?(inside|home)\b/.exec(text);
  if (occ && !facts.occupantsConfirmedOut) out.push({ text: occ[0], note: 'Occupants have not been confirmed out — this is not yet known.', severity: 'dangerous' });
  return out;
}

export function severityFor(cond: boolean, s: Severity, otherwise: Severity = 'minor'): Severity {
  return cond ? s : otherwise;
}
