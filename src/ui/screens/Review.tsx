// After-action review: the ten required items, the transcript with audio
// replay, side-by-side comparison, and (now that it is over) what was really
// going on in the scenario.

import { useMemo, useState } from 'react';
import { createInstance } from '../../domain/scenario/instance';
import { SECTION_LABELS, type SectionId } from '../../domain/rubric/config';
import { useSession } from '../../store/session';
import { useSettings } from '../../store/settings';
import { GradeCard } from '../components/GradeCard';
import { Badge, Button, Panel, ScoreDial, fmtTime } from '../components/ui';
import { ReplayButton } from './exercise/RadioLog';

const ORDER: SectionId[] = ['initialReport', 'followUp', 'assignments', 'transfer'];

export function Review() {
  const { record, library, start, lastStart, nav } = useSession();
  const plan = useSettings((s) => s.plan);
  const [tab, setTab] = useState<'summary' | 'transmissions' | 'transcript' | 'debrief'>('summary');
  const template = library.find((t) => t.id === record?.templateId);
  const inst = useMemo(() => (template && record ? createInstance(template, { seed: record.seed, branchId: record.branchId, plan }) : null), [template, record, plan]);
  if (!record) return null;
  const score = record.score;
  const sec = (id: SectionId) => score.sections.find((s) => s.section === id);
  const graded = ORDER.flatMap((id) => (sec(id)?.grades ?? []).map((g) => ({ id, g })));

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-ink-400">
              After-action review
              <Badge tone={record.mode === 'test' ? 'red' : record.mode === 'drill' ? 'blue' : 'amber'}>{record.mode === 'drill' ? 'Quick Drill' : record.mode}</Badge>
              {record.instructorAltered && <Badge>instructor-adjusted</Badge>}
            </div>
            <h1 className="mt-1 text-2xl font-bold">{record.title}</h1>
            <p className="text-sm text-ink-400">
              {record.address} · seed {record.seed}
              {record.branchId ? ` · ${inst?.branchLabel ?? record.branchId}` : ''} · {endLabel(record.endReason)}
              {record.timeToInitialReport !== undefined && ` · initial report at ${fmtTime(record.timeToInitialReport)}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {lastStart && (
              <Button onClick={() => start({ ...lastStart })} data-testid="retry-same">
                ↺ Retry same incident
              </Button>
            )}
            <Button variant="primary" onClick={() => start({ mode: record.mode === 'drill' ? 'drill' : record.mode, drill: record.drill, seed: undefined })} data-testid="new-incident">
              New incident
            </Button>
            <Button variant="ghost" onClick={() => nav('home')}>
              Home
            </Button>
          </div>
        </header>

        {/* 1–5: scores */}
        <Panel>
          <div className="flex flex-wrap items-center justify-around gap-4 p-4">
            <ScoreDial score={score.overall} size={110} label="Overall (of 100)" />
            {ORDER.map((id) => {
              const s = sec(id);
              return (
                <div key={id} className={s?.applicable ? '' : 'opacity-40'}>
                  <ScoreDial score={s?.applicable ? s.score : null} size={76} label={SECTION_LABELS[id] + (s?.applicable ? '' : ' (n/a)')} />
                </div>
              );
            })}
          </div>
          {score.reviewFlags.length > 0 && (
            <div className="border-t border-ink-700 p-3 text-sm text-ink-200">
              <span className="mr-2 font-semibold text-signal-blue">⚑ Needs instructor review:</span>
              {score.reviewFlags.join(' · ')}
            </div>
          )}
        </Panel>

        <div className="flex gap-1 border-b border-ink-700" role="tablist">
          {(
            [
              ['summary', 'Summary'],
              ['transmissions', 'Your transmissions vs. examples'],
              ['transcript', 'Transcript & audio'],
              ['debrief', 'Scenario debrief'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`px-3 py-2 text-sm ${tab === id ? 'border-b-2 border-signal-amber font-semibold text-ink-100' : 'text-ink-400 hover:text-ink-200'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'summary' && (
          <div className="grid gap-4 md:grid-cols-2">
            <ListPanel title="Critical omissions" tone="red" items={score.criticalOmissions} empty="No critical items missed." />
            <ListPanel title="Incorrect or unsupported statements" tone="red" items={score.incorrect.map((s) => `“${s.text}” — ${s.note}`)} empty="Nothing incorrect or unsupported was said." />
            <ListPanel title="What went well" tone="green" items={score.strengths} empty="Keep working — strengths will show here." />
            <ListPanel title="What to improve" tone="amber" items={score.improvements} empty="Nothing major to improve." />
            <Panel title="Example of a concise preferred transmission" className="md:col-span-2">
              <div className="space-y-3 p-3">
                {graded.length === 0 && <p className="text-sm text-ink-400">No transmissions were graded.</p>}
                {graded.slice(0, 1).map(({ id, g }, i) => (
                  <div key={i} className="grid gap-3 md:grid-cols-2">
                    <div className="rounded border border-ink-700 bg-ink-900 p-3">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">You said · {SECTION_LABELS[id]}</div>
                      <p className="font-mono text-[13px] text-ink-200">{g.normalized}</p>
                    </div>
                    <div className="rounded border border-ink-700 bg-ink-900 p-3">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Example</div>
                      <p className="font-mono text-[13px] text-ink-100">{g.example}</p>
                    </div>
                  </div>
                ))}
                {graded.length > 1 && (
                  <button className="text-sm text-signal-amber hover:underline" onClick={() => setTab('transmissions')}>
                    See all {graded.length} transmissions side by side ›
                  </button>
                )}
              </div>
            </Panel>
          </div>
        )}

        {tab === 'transmissions' && (
          <div className="space-y-4">
            {graded.length === 0 && <p className="text-sm text-ink-400">No graded transmissions.</p>}
            {graded.map(({ g }, i) => (
              <Panel key={i}>
                <div className="p-4">
                  <GradeCard grade={g} yours={g.normalized} />
                </div>
              </Panel>
            ))}
            {ORDER.map((id) => {
              const s = sec(id);
              if (!s?.applicable || s.grades.length) return null;
              return (
                <Panel key={id} title={SECTION_LABELS[id]}>
                  <ul className="space-y-1 p-3 text-sm">
                    {s.items.filter((i) => i.status !== 'na').map((i) => (
                      <li key={i.id} className="text-ink-300">
                        <b className="text-ink-100">{i.label}:</b> {i.note}
                      </li>
                    ))}
                  </ul>
                </Panel>
              );
            })}
          </div>
        )}

        {tab === 'transcript' && (
          <Panel title="Complete radio transcript">
            <ol className="divide-y divide-ink-700/60">
              {record.transcript.map((l) => (
                <li key={l.id} className={`flex gap-3 px-3 py-2 text-sm ${l.kind === 'trainee' ? 'bg-signal-amber/5' : ''}`}>
                  <span className="tabular w-12 shrink-0 text-ink-400">{fmtTime(l.t)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-ink-200">{l.kind === 'observation' ? 'You observed' : l.from}</span>
                      {l.source && l.source !== 'typed' && <Badge>{l.source === 'whisper' ? 'voice · Whisper' : 'voice · browser'}</Badge>}
                      {l.source === 'typed' && l.kind === 'trainee' && <Badge>typed</Badge>}
                      <ReplayButton entry={l} />
                    </div>
                    <p className={l.kind === 'system' ? 'italic text-ink-400' : 'text-ink-100'}>{l.text}</p>
                    {l.original && <p className="text-xs text-ink-400">Original transcript before correction: “{l.original}”</p>}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        )}

        {tab === 'debrief' && (
          <Panel title="What was really going on">
            {!inst ? (
              <p className="p-3 text-sm text-ink-400">This scenario is no longer in the library.</p>
            ) : (
              <div className="space-y-4 p-4 text-sm">
                <p className="text-ink-200">{inst.summary}</p>
                <div>
                  <h3 className="mb-1 font-semibold">Conditions</h3>
                  <ul className="list-disc space-y-1 pl-5 text-ink-300">
                    {inst.conditionStates.map((c) => (
                      <li key={c.id}>
                        <b className="text-ink-100">{c.id}</b> — {c.description} <span className="text-ink-400">(acceptable strategy: {c.acceptableStrategies.join(' / ')})</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-1 font-semibold">Findings available</h3>
                  <ul className="list-disc space-y-1 pl-5 text-ink-300">
                    {inst.findings.map((f) => (
                      <li key={f.id}>
                        {f.side !== 'general' && <b className="text-ink-100">{f.side}: </b>}
                        {f.text} {f.safety && <Badge tone="red">safety</Badge>} <span className="text-ink-500">({f.revealedBy})</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-1 font-semibold">Occupants</h3>
                  <p className="text-ink-300">
                    {inst.occupants.dispatchInfo} Actual: {inst.occupants.status.replace('-', ' ')}
                    {inst.occupants.victimLocation ? ` (${inst.occupants.victimLocation})` : ''}.
                  </p>
                </div>
                {ORDER.map((id) => (inst.explanations[id] ? (
                  <div key={id}>
                    <h3 className="mb-1 font-semibold">{SECTION_LABELS[id]} — instructor notes</h3>
                    <p className="text-ink-300">{inst.explanations[id]}</p>
                  </div>
                ) : null))}
                <p className="text-xs text-ink-500">Scenario content is a training construct. Tactics described are illustrative and should be checked against department policy.</p>
              </div>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}

function ListPanel({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone: 'red' | 'green' | 'amber' }) {
  const color = { red: 'text-signal-red', green: 'text-signal-green', amber: 'text-signal-amber' }[tone];
  return (
    <Panel title={<span className={color}>{title}</span>}>
      <ul className="space-y-1.5 p-3 text-sm">
        {items.length === 0 && <li className="text-ink-400">{empty}</li>}
        {items.map((t, i) => (
          <li key={i} className="flex gap-2 text-ink-200">
            <span className={color}>•</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function endLabel(r: string) {
  return ({ transfer: 'command transferred', resolved: 'incident resolved', timeLimit: 'time limit reached', drill: 'drill', abandoned: 'ended early' } as Record<string, string>)[r] ?? r;
}
