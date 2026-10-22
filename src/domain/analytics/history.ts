// Performance history and metrics. Pure functions over saved session records.

import type { Checkpoint, Mode } from '../engine/types';
import type { SessionScore } from '../grading/types';
import type { SectionId } from '../rubric/config';

export interface TranscriptLine {
  id: string;
  t: number;
  from: string;
  text: string;
  kind: string;
  original?: string;
  source?: string;
  audioId?: string;
}

export interface SessionRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  mode: Mode;
  drill?: Checkpoint | 'assignment';
  templateId: string;
  title: string;
  address: string;
  seed: number;
  branchId: string | null;
  overall: number | null;
  sections: Partial<Record<SectionId, number | null>>;
  /** Rubric item ids that were missing or incorrect. */
  missed: string[];
  timeToInitialReport?: number;
  transcript: TranscriptLine[];
  score: SessionScore;
  endReason: string;
  /** Practice runs where an instructor triggered events manually. */
  instructorAltered?: boolean;
}

export interface Metrics {
  total: number;
  average: number | null;
  recentAverage: number | null;
  priorAverage: number | null;
  improvement: number | null;
  sections: Record<SectionId, { mean: number | null; consistency: number | null; n: number }>;
  topMissed: { id: string; count: number; rate: number }[];
  avgTimeToInitialReport: number | null;
  trend: { at: number; score: number }[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs: number[]) => {
  const m = mean(xs);
  if (m === null || xs.length < 2) return null;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};

export function computeMetrics(records: SessionRecord[]): Metrics {
  const sorted = [...records].sort((a, b) => a.endedAt - b.endedAt);
  const scores = sorted.map((r) => r.overall).filter((x): x is number => x !== null);
  const recent = scores.slice(-5);
  const prior = scores.slice(-10, -5);
  const sections = {} as Metrics['sections'];
  for (const s of ['initialReport', 'assignments', 'followUp', 'transfer'] as SectionId[]) {
    const xs = sorted.map((r) => r.sections[s]).filter((x): x is number => typeof x === 'number');
    const dev = sd(xs);
    sections[s] = { mean: mean(xs) === null ? null : Math.round(mean(xs)!), consistency: dev === null ? null : Math.max(0, Math.round(100 - dev * 2)), n: xs.length };
  }
  const counts = new Map<string, number>();
  for (const r of sorted) for (const id of new Set(r.missed)) counts.set(id, (counts.get(id) ?? 0) + 1);
  const topMissed = [...counts.entries()]
    .map(([id, count]) => ({ id, count, rate: count / Math.max(1, sorted.length) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const tir = sorted.map((r) => r.timeToInitialReport).filter((x): x is number => typeof x === 'number');
  const ra = mean(recent);
  const pa = mean(prior);
  return {
    total: sorted.length,
    average: mean(scores) === null ? null : Math.round(mean(scores)!),
    recentAverage: ra === null ? null : Math.round(ra),
    priorAverage: pa === null ? null : Math.round(pa),
    improvement: ra !== null && pa !== null ? Math.round(ra - pa) : null,
    sections,
    topMissed,
    avgTimeToInitialReport: mean(tir) === null ? null : Math.round(mean(tir)!),
    trend: sorted.filter((r) => r.overall !== null).map((r) => ({ at: r.endedAt, score: r.overall! })),
  };
}

/** Pick the drill that targets the weakest checklist item. */
export function weakAreaDrill(m: Metrics): { checkpoint: Checkpoint | 'assignment'; itemId?: string } {
  const top = m.topMissed[0];
  if (!top) return { checkpoint: 'initialReport' };
  const prefix = top.id.split('.')[0];
  const checkpoint = ({ ir: 'initialReport', fu: 'followUp', tr: 'transfer', as: 'assignment' } as const)[prefix as 'ir'] ?? 'initialReport';
  return { checkpoint, itemId: top.id };
}
