import { useEffect, useMemo, useState } from 'react';
import { computeMetrics, weakAreaDrill, type SessionRecord } from '../../domain/analytics/history';
import { SECTION_LABELS, type SectionId } from '../../domain/rubric/config';
import { storage } from '../../storage/db';
import { useSession } from '../../store/session';
import { useSettings } from '../../store/settings';
import { Badge, Button, Panel, scoreTone, fmtTime } from '../components/ui';

export function History() {
  const [records, setRecords] = useState<SessionRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [includeAltered, setIncludeAltered] = useState(false);
  const { viewRecord, start } = useSession();
  const rubric = useSettings((s) => s.rubric);

  useEffect(() => {
    void storage.listSessions().then((r) => {
      setRecords(r);
      setLoaded(true);
    });
  }, []);

  const counted = includeAltered ? records : records.filter((r) => !r.instructorAltered);
  const m = useMemo(() => computeMetrics(counted), [counted]);
  const weak = weakAreaDrill(m);
  const label = (id: string) => rubric.items.find((i) => i.id === id)?.label ?? id;

  const exportAll = () => {
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `first-five-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">Performance history</h1>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-ink-300">
              <input type="checkbox" checked={includeAltered} onChange={(e) => setIncludeAltered(e.target.checked)} className="accent-signal-amber" />
              Include instructor-adjusted runs
            </label>
            <Button onClick={exportAll} disabled={!records.length}>
              Export JSON
            </Button>
            <Button
              variant="ghost"
              disabled={!records.length}
              onClick={async () => {
                if (!confirm('Delete all saved sessions and scores? This cannot be undone.')) return;
                await storage.clearSessions();
                setRecords([]);
              }}
            >
              Clear history
            </Button>
          </div>
        </div>

        {loaded && records.length === 0 && <p className="text-ink-400">No exercises yet. Finish a drill or an incident and it will appear here.</p>}

        {counted.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Metric label="Completed exercises" value={m.total} />
              <Metric label="Average score" value={m.average ?? '—'} />
              <Metric label="Last 5 average" value={m.recentAverage ?? '—'} />
              <Metric label="Change vs. prior 5" value={m.improvement === null ? '—' : `${m.improvement > 0 ? '+' : ''}${m.improvement}`} />
              <Metric label="Avg time to initial report" value={m.avgTimeToInitialReport === null ? '—' : fmtTime(m.avgTimeToInitialReport)} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Panel title="Score trend">
                <Trend points={m.trend.slice(-40)} />
              </Panel>
              <Panel title="By transmission">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-ink-400">
                      <th className="px-3 py-2 font-medium">Section</th>
                      <th className="px-3 py-2 font-medium">Mean</th>
                      <th className="px-3 py-2 font-medium" title="100 = identical scores every time">Consistency</th>
                      <th className="px-3 py-2 font-medium">n</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Object.keys(SECTION_LABELS) as SectionId[]).map((s) => (
                      <tr key={s} className="border-t border-ink-700/60">
                        <td className="px-3 py-2">{SECTION_LABELS[s]}</td>
                        <td className="tabular px-3 py-2">{m.sections[s].mean ?? '—'}</td>
                        <td className="tabular px-3 py-2">{m.sections[s].consistency ?? '—'}</td>
                        <td className="tabular px-3 py-2 text-ink-400">{m.sections[s].n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </div>

            <Panel
              title="Most frequently missed checklist items"
              right={
                m.topMissed.length > 0 && (
                  <Button variant="primary" className="!min-h-8 text-xs" onClick={() => start({ mode: 'drill', drill: weak.checkpoint })}>
                    Drill weakest area
                  </Button>
                )
              }
            >
              <ul className="space-y-2 p-3">
                {m.topMissed.length === 0 && <li className="text-sm text-ink-400">Nothing missed repeatedly.</li>}
                {m.topMissed.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 text-sm">
                    <span className="w-56 shrink-0 truncate">{label(t.id)}</span>
                    <span className="h-2 flex-1 rounded bg-ink-700">
                      <span className="block h-2 rounded bg-signal-amber" style={{ width: `${Math.round(t.rate * 100)}%` }} />
                    </span>
                    <span className="tabular w-20 text-right text-ink-300">
                      {t.count}× ({Math.round(t.rate * 100)}%)
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </>
        )}

        {records.length > 0 && (
          <Panel title="Sessions">
            <ul className="divide-y divide-ink-700/60">
              {records.map((r) => (
                <li key={r.id}>
                  <button onClick={() => viewRecord(r)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-ink-800">
                    <Badge tone={scoreTone(r.overall)} className="w-10 justify-center">
                      {r.overall ?? '—'}
                    </Badge>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{r.title}</span>
                      <span className="block text-xs text-ink-400">
                        {new Date(r.endedAt).toLocaleString()} · {r.mode === 'drill' ? `drill: ${r.drill}` : r.mode} {r.instructorAltered ? '· instructor-adjusted' : ''}
                      </span>
                    </span>
                    <span className="text-ink-500">›</span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-850 p-3">
      <div className="tabular text-2xl font-bold">{value}</div>
      <div className="text-xs text-ink-400">{label}</div>
    </div>
  );
}

function Trend({ points }: { points: { at: number; score: number }[] }) {
  if (points.length < 2) return <p className="p-3 text-sm text-ink-400">Complete a few more exercises to see a trend.</p>;
  const W = 520;
  const H = 150;
  const x = (i: number) => 24 + (i / (points.length - 1)) * (W - 36);
  const y = (s: number) => 10 + (1 - s / 100) * (H - 30);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full p-2" role="img" aria-label={`Score trend over ${points.length} exercises, latest ${points[points.length - 1].score}`}>
      {[50, 75, 100].map((g) => (
        <g key={g}>
          <line x1={24} x2={W - 12} y1={y(g)} y2={y(g)} stroke="#2a3441" strokeDasharray="3 4" />
          <text x={2} y={y(g) + 4} fontSize={10} fill="#5d6b7c">
            {g}
          </text>
        </g>
      ))}
      <path d={d} fill="none" stroke="#e8a33d" strokeWidth={2} />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.score)} r={2.5} fill="#e8a33d" />
      ))}
    </svg>
  );
}
