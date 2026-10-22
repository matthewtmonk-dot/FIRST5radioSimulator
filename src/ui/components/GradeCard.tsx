import type { ItemResult, TransmissionGrade } from '../../domain/grading/types';
import { SECTION_LABELS } from '../../domain/rubric/config';
import { Badge, ScoreDial } from './ui';

const STATUS: Record<ItemResult['status'], { icon: string; cls: string; label: string }> = {
  correct: { icon: '✓', cls: 'text-signal-green', label: 'Correct' },
  alternate: { icon: '≈', cls: 'text-signal-green', label: 'Acceptable alternate' },
  partial: { icon: '◐', cls: 'text-signal-amber', label: 'Partial' },
  missing: { icon: '○', cls: 'text-ink-300', label: 'Missing' },
  incorrect: { icon: '✕', cls: 'text-signal-red', label: 'Incorrect' },
  uncertain: { icon: '?', cls: 'text-signal-blue', label: 'Needs instructor review' },
  na: { icon: '–', cls: 'text-ink-500', label: 'Not applicable' },
};

export function ItemRow({ item }: { item: ItemResult }) {
  const s = STATUS[item.status];
  return (
    <li className="flex gap-2 py-1.5 text-sm">
      <span className={`w-5 shrink-0 text-center font-bold ${s.cls}`} title={s.label}>
        <span aria-hidden="true">{s.icon}</span>
        <span className="sr-only">{s.label}</span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-ink-100">{item.label}</span>
          {item.critical && <span className="text-[10px] uppercase tracking-wider text-ink-400">critical</span>}
          {item.severity === 'dangerous' && <Badge tone="red">Dangerous</Badge>}
          {item.status === 'uncertain' && <Badge tone="blue">Review</Badge>}
        </div>
        <p className="text-ink-300">{item.note}</p>
        {(item.heard || item.expected) && item.status !== 'correct' && (
          <p className="mt-0.5 text-xs text-ink-400">
            {item.heard && (
              <>
                Heard: <span className="text-ink-200">“{item.heard}”</span>
              </>
            )}
            {item.heard && item.expected && ' · '}
            {item.expected && (
              <>
                Expected: <span className="text-ink-200">{item.expected}</span>
              </>
            )}
          </p>
        )}
      </div>
    </li>
  );
}

/** Highlights the trainee's words: checklist information vs. clauses that added nothing. */
export function HighlightedTranscript({ grade }: { grade: TransmissionGrade }) {
  const text = grade.normalized;
  const marks = new Array(text.length).fill(0);
  for (const s of grade.spans) for (let i = Math.max(0, s.start); i < Math.min(text.length, s.end); i++) marks[i] = 1;
  const extra = grade.verbosity?.uninformative ?? [];
  for (const clause of extra) {
    const at = text.indexOf(clause);
    if (at >= 0) for (let i = at; i < at + clause.length; i++) if (!marks[i]) marks[i] = 2;
  }
  const out: { t: string; k: number }[] = [];
  for (let i = 0; i < text.length; i++) {
    const k = marks[i];
    if (out.length && out[out.length - 1].k === k) out[out.length - 1].t += text[i];
    else out.push({ t: text[i], k });
  }
  return (
    <p className="font-mono text-[13px] leading-relaxed text-ink-200">
      {out.map((o, i) =>
        o.k === 1 ? (
          <mark key={i} className="rounded-sm bg-signal-green/15 text-ink-100">
            {o.t}
          </mark>
        ) : o.k === 2 ? (
          <span key={i} className="text-ink-400 underline decoration-signal-amber/70 decoration-wavy underline-offset-4" title="No checklist information in this clause">
            {o.t}
          </span>
        ) : (
          <span key={i}>{o.t}</span>
        ),
      )}
    </p>
  );
}

export function GradeCard({ grade, yours, compact }: { grade: TransmissionGrade; yours?: string; compact?: boolean }) {
  const items = grade.items.filter((i) => i.status !== 'na');
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <ScoreDial score={grade.score} size={compact ? 56 : 68} />
        <div>
          <div className="text-xs uppercase tracking-[0.14em] text-ink-400">{SECTION_LABELS[grade.section]}</div>
          <div className="text-sm text-ink-200">
            {grade.dangerous.length ? (
              <span className="text-signal-red">Consequential error — score capped.</span>
            ) : grade.score === null ? (
              'Flagged for instructor review.'
            ) : grade.score >= 85 ? (
              'Solid transmission.'
            ) : grade.score >= 65 ? (
              'Workable — tighten the gaps below.'
            ) : (
              'Important elements missing or wrong.'
            )}
          </div>
          {grade.verbosity && (
            <div className="text-xs text-ink-400">
              {grade.verbosity.words} words · reference ≈{grade.verbosity.referenceWords} · {grade.verbosity.level.replace('-', ' ')}
            </div>
          )}
        </div>
      </div>
      {grade.reviewFlags.length > 0 && (
        <div className="rounded border border-signal-blue/40 bg-signal-blue/10 p-2 text-xs text-ink-200">
          {grade.reviewFlags.map((f) => (
            <div key={f}>⚑ {f}</div>
          ))}
        </div>
      )}
      {grade.statements.length > 0 && (
        <div className="rounded border border-signal-red/40 bg-signal-red/10 p-2 text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-signal-red">Unsupported or incorrect statements</div>
          {grade.statements.map((s, i) => (
            <div key={i} className="text-ink-200">
              “{s.text}” — {s.note}
            </div>
          ))}
        </div>
      )}
      <ul className="divide-y divide-ink-700/70">{items.map((i) => <ItemRow key={i.id} item={i} />)}</ul>
      {!compact && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-ink-700 bg-ink-900 p-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">You said</div>
            {yours !== undefined ? <HighlightedTranscript grade={grade} /> : null}
            <div className="mt-2 flex gap-3 text-[11px] text-ink-400">
              <span>
                <mark className="rounded-sm bg-signal-green/15 px-1 text-ink-100">checklist info</mark>
              </span>
              <span className="underline decoration-signal-amber/70 decoration-wavy underline-offset-4">no checklist info</span>
            </div>
          </div>
          <div className="rounded-md border border-ink-700 bg-ink-900 p-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">One good way to say it</div>
            <p className="font-mono text-[13px] leading-relaxed text-ink-100">{grade.example}</p>
            <p className="mt-2 text-[11px] text-ink-400">Other wording that carries the same facts is equally acceptable.</p>
          </div>
        </div>
      )}
      {!compact && grade.explanation && <p className="text-sm leading-relaxed text-ink-300">{grade.explanation}</p>}
    </div>
  );
}
