// Compact tactical worksheet: only what the officer would know — units
// dispatched, who has arrived, the assignments given, and benchmarks reported.

import { benchmarks } from '../../../domain/engine/engine';
import type { SimState } from '../../../domain/engine/types';
import { TASK_INFO } from '../../../domain/language/tasks';
import { BOARD_REFERENCE, SECTION_LABELS, type SectionId } from '../../../domain/rubric/config';
import { useSettings } from '../../../store/settings';
import { fmtTime } from '../../components/ui';

export function CommandBoard({ sim }: { sim: SimState }) {
  const b = benchmarks(sim);
  const reported = (kw: RegExp) => sim.log.some((e) => e.kind === 'unit' && kw.test(e.text));
  // Tactical priorities as listed on the command board, plus water supply.
  // Fire control, secondary all clear and loss stopped come after the first
  // five minutes and are not simulated.
  const marks = [
    { label: 'Water on fire', on: b.waterOnFire },
    { label: 'Primary all clear', on: b.primaryClear && reported(/all clear|primary.*(clear|complete)/i) },
    { label: 'Fire knock down', on: b.knockdown && reported(/knock ?down|fire (is )?out|under control/i) },
    { label: 'Water supply', on: b.waterSupply && reported(/water supply|hydrant|supply line/i) },
  ];
  return (
    <div className="space-y-3 p-3 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Command" value={sim.commandEstablished ?? '—'} />
        <Field label="Strategy" value={sim.declaredStrategy ? sim.declaredStrategy.toUpperCase() : '—'} />
        <Field label="On scene" value={sim.phase === 'dispatch' ? '—' : fmtTime(sim.t)} />
        <Field label="360" value={sim.recon.status === 'complete' ? 'Complete' : sim.recon.status === 'inProgress' ? 'In progress' : 'Not started'} />
      </div>
      <div>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Tactical priorities</div>
        <div className="flex flex-wrap gap-1.5">
          {marks.map((m) => (
            <span key={m.label} className={`rounded border px-2 py-0.5 text-xs ${m.on ? 'border-signal-green/50 bg-signal-green/10 text-signal-green' : 'border-ink-600 text-ink-400'}`}>
              {m.on ? '✓ ' : ''}
              {m.label}
            </span>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Units</div>
        <table className="w-full text-xs">
          <tbody>
            <tr className="border-b border-ink-700/60">
              <td className="py-1 pr-2 font-semibold text-ink-100">{sim.instance.ownUnit}</td>
              <td className="py-1 pr-2 text-ink-300">{sim.phase === 'dispatch' ? 'En route' : 'On scene'}</td>
              <td className="py-1 text-ink-200">{ownTask(sim)}</td>
            </tr>
            {sim.units.map((u) => {
              const active = sim.assignments.filter((x) => x.unit === u.id && x.status !== 'reassigned');
              return (
                <tr key={u.id} className="border-b border-ink-700/60">
                  <td className="py-1 pr-2 font-semibold text-ink-100">{u.id}</td>
                  <td className="py-1 pr-2 text-ink-300">
                    {u.status === 'enroute' ? 'En route' : u.status === 'staged' ? 'Staged' : u.status === 'cancelled' ? 'Cancelled' : 'On scene'}
                    {u.awaitingSince !== undefined && u.status !== 'cancelled' && <span className="ml-1 text-signal-amber">· needs orders</span>}
                  </td>
                  <td className="py-1 text-ink-200">
                    <Tasks list={active} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ReferenceCard />
    </div>
  );
}

/** Collapsible reference built from the configured rubric (the officer's command board). */
function ReferenceCard() {
  const rubric = useSettings((s) => s.rubric);
  const sections: SectionId[] = ['initialReport', 'followUp', 'assignments', 'transfer'];
  return (
    <details className="rounded border border-ink-700 bg-ink-900">
      <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Command board reference</summary>
      <div className="space-y-2 p-2 text-xs">
        {sections.map((sec) => (
          <div key={sec}>
            <div className="font-semibold text-ink-200">{SECTION_LABELS[sec]}</div>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {rubric.items
                .filter((i) => i.section === sec && i.enabled && !i.id.endsWith('.concise'))
                .map((i) => (
                  <span key={i.id} className="rounded bg-ink-800 px-1.5 py-0.5 text-ink-300" title={i.label}>
                    {i.board ?? i.label}
                  </span>
                ))}
            </div>
          </div>
        ))}
        <div className="text-ink-500">{BOARD_REFERENCE.objectives}</div>
        <RefList title="Tactical priorities" items={BOARD_REFERENCE.tacticalPriorities} />
        <div>
          <div className="font-semibold text-ink-200">Communication tickets</div>
          <ul className="mt-0.5 space-y-0.5 text-ink-300">
            {BOARD_REFERENCE.communicationTickets.map(([name, text]) => (
              <li key={name}>
                <span className={name === 'Mayday' ? 'font-semibold text-signal-red' : 'font-semibold text-ink-200'}>{name}</span> — {text}
              </li>
            ))}
          </ul>
        </div>
        <RefList title="Mayday help order" items={BOARD_REFERENCE.maydayHelpOrder} />
        <RefList title="Mayday checklist" items={BOARD_REFERENCE.maydayChecklist} />
        <RefList title="Big box entry requirements" items={BOARD_REFERENCE.bigBoxEntry} />
        {rubric.provisional && <div className="text-ink-500">Training reference based on the Engine Company Incident Command Board. Command transfer items are provisional. Not an official standard.</div>}
      </div>
    </details>
  );
}

function RefList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="font-semibold text-ink-200">{title}</div>
      <div className="text-ink-300">{items.join(' · ')}</div>
    </div>
  );
}

function ownTask(sim: SimState) {
  return <Tasks list={sim.assignments.filter((x) => x.unit === sim.instance.ownUnit && x.status !== 'reassigned')} />;
}

function Tasks({ list }: { list: SimState['assignments'] }) {
  if (!list.length) return <span className="text-ink-500">—</span>;
  return (
    <>
      {list.map((a) => {
        const info = TASK_INFO[a.task];
        return (
          <span key={a.id} className="mr-2 inline-block">
            <span className="font-mono text-signal-amber">{info.code ?? info.label}</span>
            {a.location && <span className="text-ink-300"> {a.location}</span>}
            {a.status === 'complete' && <span className="ml-0.5 text-signal-green">✓</span>}
          </span>
        );
      })}
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-ink-700 bg-ink-900 px-2 py-1">
      <div className="text-[10px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className="truncate font-semibold text-ink-100">{value}</div>
    </div>
  );
}
