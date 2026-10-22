import { useEffect, useMemo, useState } from 'react';
import { computeMetrics, weakAreaDrill, type SessionRecord } from '../../domain/analytics/history';
import type { DrillKind } from '../../domain/engine/autopilot';
import type { ScenarioTemplateInput } from '../../domain/scenario/schema';
import { storage } from '../../storage/db';
import { useSession } from '../../store/session';
import { useSettings } from '../../store/settings';
import { Badge, Button, Panel } from '../components/ui';

type Filter = 'any' | 'residential' | 'multifamily' | 'commercial';

const FILTERS: { id: Filter; label: string; test: (t: ScenarioTemplateInput) => boolean }[] = [
  { id: 'any', label: 'Any occupancy', test: () => true },
  { id: 'residential', label: 'Residential', test: (t) => t.building.occupancy === 'residential' },
  { id: 'multifamily', label: 'Multifamily', test: (t) => t.building.occupancy === 'multifamily' },
  { id: 'commercial', label: 'Commercial / hotel', test: (t) => ['commercial', 'hotel', 'mixed-use'].includes(t.building.occupancy) },
];

const DRILLS: { id: DrillKind; label: string; detail: string }[] = [
  { id: 'initialReport', label: 'Initial report', detail: 'Arrive and give the initial radio report.' },
  { id: 'assignment', label: 'Unit assignment', detail: 'An arriving unit needs orders.' },
  { id: 'followUp', label: 'Follow-up report', detail: '360 complete — give the follow-up.' },
  { id: 'transfer', label: 'Command transfer', detail: 'The chief is face-to-face with you.' },
];

export function Home() {
  const { start, library, loadLibrary } = useSession();
  const plan = useSettings((s) => s.plan);
  const rubric = useSettings((s) => s.rubric);
  const [filter, setFilter] = useState<Filter>('residential');
  const [error, setError] = useState('');
  const [seedText, setSeedText] = useState('');
  const [records, setRecords] = useState<SessionRecord[]>([]);
  const [pick, setPick] = useState<string>('');

  useEffect(() => {
    void loadLibrary();
    void storage.listSessions().then(setRecords);
  }, [loadLibrary]);

  const metrics = useMemo(() => computeMetrics(records), [records]);
  const weak = weakAreaDrill(metrics);
  const weakItem = rubric.items.find((i) => i.id === weak.itemId);
  const f = FILTERS.find((x) => x.id === filter)!;
  const seed = seedText.trim() ? Number(seedText.trim()) : undefined;

  const go = (o: Parameters<typeof start>[0]) => {
    const err = start({ ...o, seed: Number.isFinite(seed) ? seed : undefined });
    setError(err ?? '');
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              FIRST <span className="text-signal-red">FIVE</span>
            </h1>
            <p className="mt-1 max-w-xl text-ink-300">
              Fireground radio command practice for the first-arriving officer. {plan.ownUnit} perspective — arrive, size it up, put it on the radio.
            </p>
          </div>
          {records.length > 0 && (
            <div className="flex gap-4 text-sm">
              <Stat label="Exercises" value={metrics.total} />
              <Stat label="Average" value={metrics.average ?? '—'} />
              <Stat label="Last 5" value={metrics.recentAverage ?? '—'} />
            </div>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Occupancy filter">
          {FILTERS.map((x) => (
            <button
              key={x.id}
              role="radio"
              aria-checked={filter === x.id}
              onClick={() => setFilter(x.id)}
              className={`rounded-full border px-3 py-1.5 text-sm ${filter === x.id ? 'border-signal-amber bg-signal-amber/15 text-signal-amber' : 'border-ink-600 text-ink-300 hover:text-ink-100'}`}
            >
              {x.label}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-xs text-ink-400">
            Seed
            <input
              value={seedText}
              onChange={(e) => setSeedText(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="random"
              inputMode="numeric"
              className="w-28 rounded border border-ink-600 bg-ink-900 px-2 py-1 font-mono text-ink-100"
              aria-label="Seed to reproduce an incident"
            />
          </label>
        </div>
        {error && <div role="alert" className="rounded border border-signal-red/40 bg-signal-red/10 p-2 text-sm">{error}</div>}

        <div className="grid gap-4 md:grid-cols-3">
          <Panel title="Quick Drill · 30–60 s">
            <div className="space-y-2 p-3">
              <p className="text-sm text-ink-300">One transmission, then feedback. Built for ten reps before shift.</p>
              {DRILLS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => go({ mode: 'drill', drill: d.id, filter: f.test })}
                  className="flex w-full items-center justify-between rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-left hover:border-ink-500"
                  data-testid={`drill-${d.id}`}
                >
                  <span>
                    <span className="block text-sm font-semibold">{d.label}</span>
                    <span className="block text-xs text-ink-400">{d.detail}</span>
                  </span>
                  <span className="text-ink-400">›</span>
                </button>
              ))}
              {records.length >= 3 && (
                <button
                  onClick={() => go({ mode: 'drill', drill: weak.checkpoint, filter: f.test })}
                  className="flex w-full items-center justify-between rounded-md border border-signal-amber/40 bg-signal-amber/10 px-3 py-2 text-left hover:border-signal-amber"
                >
                  <span>
                    <span className="block text-sm font-semibold text-signal-amber">Weak-area drill</span>
                    <span className="block text-xs text-ink-300">Most missed: {weakItem?.label ?? 'initial report'}</span>
                  </span>
                  <span className="text-ink-400">›</span>
                </button>
              )}
            </div>
          </Panel>

          <Panel title="Practice · Full First Five">
            <div className="space-y-3 p-3">
              <p className="text-sm text-ink-300">The whole first five minutes with hints, examples, the live checklist, and feedback after every transmission. Retry any transmission.</p>
              <Button variant="primary" className="w-full" onClick={() => go({ mode: 'practice', filter: f.test })} data-testid="start-practice">
                Random incident
              </Button>
              <div className="flex gap-2">
                <select value={pick} onChange={(e) => setPick(e.target.value)} className="min-w-0 flex-1 rounded border border-ink-600 bg-ink-900 px-2 py-2 text-sm" aria-label="Choose a scenario">
                  <option value="">Choose a scenario…</option>
                  {library.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({t.difficulty})
                    </option>
                  ))}
                </select>
                <Button disabled={!pick} onClick={() => go({ mode: 'practice', templateId: pick })}>
                  Start
                </Button>
              </div>
            </div>
          </Panel>

          <Panel title="Test · Full First Five">
            <div className="space-y-3 p-3">
              <p className="text-sm text-ink-300">A randomized incident with no coaching. Five-minute clock, scored at the end with a full transcript and side-by-side review.</p>
              <Button variant="danger" className="w-full" onClick={() => go({ mode: 'test', filter: f.test })} data-testid="start-test">
                Start test
              </Button>
              <p className="text-xs text-ink-400">The scenario is chosen at random from the selected occupancy group; its name is not shown until the review.</p>
            </div>
          </Panel>
        </div>

        <Panel title="How it works">
          <div className="grid gap-4 p-4 text-sm text-ink-300 md:grid-cols-4">
            <Step n={1} title="Dispatch">Listen to the dispatch, then arrive on scene. The clock starts on arrival.</Step>
            <Step n={2} title="Size-up & report">Look at the building. Hold <b>Space</b> (or the mic button) and give your initial report — or type it.</Step>
            <Step n={3} title="Run the first five">Assign arriving units, walk the 360, give the follow-up, acknowledge reports.</Step>
            <Step n={4} title="Transfer & review">Transfer command face-to-face with the chief. Review scores, transcript and audio.</Step>
          </div>
        </Panel>

        <p className="text-xs leading-relaxed text-ink-500">
          FIRST FIVE is an independent training aid. Its checklist is <Badge tone="amber">provisional</Badge> and is not an official Blue Card, VCFR, or certified
          standard. Call signs and response plans are configurable samples, not actual district assignments. Addresses are fictional. Building views are
          procedural illustrations unless a photo has been added.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-ink-700 bg-ink-850 px-3 py-2 text-center">
      <div className="tabular text-xl font-bold">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-ink-400">{label}</div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 font-semibold text-ink-100">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-signal-red/20 text-xs text-signal-red">{n}</span>
        {title}
      </div>
      <p>{children}</p>
    </div>
  );
}
