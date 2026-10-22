// Practice-mode coaching: hint questions, an example on request, and a live
// checklist for the transmission the officer is working on. Never shown in Test Mode.

import { useState } from 'react';
import { currentTask, type CurrentTask } from '../../../domain/engine/engine';
import type { SimState } from '../../../domain/engine/types';
import { dynamicFollowUpExample, dynamicTransferExample } from '../../../domain/grading/dynamicExamples';
import { exampleAssignment, exampleInitialReport } from '../../../domain/grading/examples';
import type { ItemResult } from '../../../domain/grading/types';
import { SECTION_LABELS, type SectionId } from '../../../domain/rubric/config';
import { useSession } from '../../../store/session';
import { useSettings } from '../../../store/settings';
import { Button } from '../../components/ui';

export function sectionFor(task: CurrentTask): SectionId | null {
  switch (task) {
    case 'Initial Radio Report':
      return 'initialReport';
    case '360 Follow-Up Report':
      return 'followUp';
    case 'Command Transfer':
    case 'Notify Dispatch':
      return 'transfer';
    case 'Unit Assignment':
    case 'Walk the 360 / Assign Units':
    case 'Manage the Incident':
      return 'assignments';
    default:
      return null;
  }
}

function exampleFor(sim: SimState, section: SectionId): string | undefined {
  if (section === 'initialReport') return exampleInitialReport(sim.instance);
  if (section === 'followUp') return dynamicFollowUpExample(sim);
  if (section === 'transfer') return dynamicTransferExample(sim);
  const waiting = sim.units.find((u) => u.awaitingSince !== undefined && u.status !== 'cancelled' && u.type !== 'battalion');
  return waiting ? exampleAssignment(sim.instance, waiting.id) : undefined;
}

const MARK: Record<ItemResult['status'], string> = {
  correct: 'text-signal-green',
  alternate: 'text-signal-green',
  partial: 'text-signal-amber',
  missing: 'text-ink-500',
  incorrect: 'text-signal-red',
  uncertain: 'text-signal-blue',
  na: 'text-ink-600',
};

export function CoachPanel({ sim }: { sim: SimState }) {
  const rubric = useSettings((s) => s.rubric);
  const [hint, setHint] = useState(false);
  const [example, setExample] = useState<string | null>(null);
  const task = currentTask(sim);
  const section = sectionFor(task);
  const [lastSection, setLastSection] = useState(section);
  if (section !== lastSection) {
    setLastSection(section);
    setHint(false);
    setExample(null);
  }
  if (!section) return <p className="p-3 text-sm text-ink-400">Read the dispatch, then arrive on scene.</p>;
  const items = rubric.items.filter((i) => i.section === section && i.enabled);
  const latest = [...sim.grades].reverse().find((g) => g.grade.section === section && !g.superseded);
  const status = new Map(latest?.grade.items.map((i) => [i.id, i]) ?? []);
  return (
    <div className="space-y-3 p-3 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-400">Working on</div>
          <div className="font-semibold text-ink-100">{SECTION_LABELS[section]}</div>
        </div>
        <div className="flex gap-1.5">
          <Button onClick={() => setHint(!hint)} aria-pressed={hint} className="!min-h-8 !px-2.5 text-xs">
            Hint
          </Button>
          <Button onClick={() => setExample(example ? null : exampleFor(sim, section) ?? 'No example available for this moment.')} aria-pressed={!!example} className="!min-h-8 !px-2.5 text-xs">
            Example
          </Button>
        </div>
      </div>
      {example && (
        <div className="rounded border border-signal-blue/40 bg-signal-blue/10 p-2">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-signal-blue">One good way to say it</div>
          <p className="font-mono text-[13px] text-ink-100">{example}</p>
        </div>
      )}
      <ul className="space-y-1">
        {items.map((i) => {
          const r = status.get(i.id);
          return (
            <li key={i.id} className="flex gap-2">
              <span className={`w-4 shrink-0 text-center ${r ? MARK[r.status] : 'text-ink-500'}`} aria-hidden>
                {r ? (r.status === 'correct' || r.status === 'alternate' ? '✓' : r.status === 'incorrect' ? '✕' : r.status === 'partial' ? '◐' : r.status === 'na' ? '–' : '○') : '○'}
              </span>
              <div>
                <span className={i.critical ? 'font-semibold text-ink-100' : 'text-ink-200'}>{i.label}</span>
                {hint && <p className="text-xs text-ink-400">{i.hint}</p>}
              </div>
            </li>
          );
        })}
      </ul>
      {rubric.provisional && <p className="text-[11px] text-ink-500">Provisional checklist — not an official standard.</p>}
      <InstructorControls sim={sim} />
    </div>
  );
}

/** Practice-only: lets an instructor push the scenario along. Reveals scenario content, so it starts collapsed. */
function InstructorControls({ sim }: { sim: SimState }) {
  const [open, setOpen] = useState(false);
  const fireEvent = useSession((s) => s.instructorEvent);
  const setCondition = useSession((s) => s.instructorCondition);
  if (sim.phase !== 'onScene' || sim.ended) return null;
  const pending = sim.instance.events.filter((e) => !sim.firedEvents.some((f) => f.id === e.id));
  return (
    <details className="rounded border border-ink-700 bg-ink-900" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-ink-400">Instructor controls (reveals scenario details)</summary>
      {open && (
        <div className="space-y-3 p-2 text-xs">
          <div>
            <div className="mb-1 text-ink-400">Conditions</div>
            <div className="flex flex-wrap gap-1">
              {sim.instance.conditionStates.map((c) => (
                <button
                  key={c.id}
                  title={c.description}
                  onClick={() => setCondition(c.id)}
                  className={`rounded px-2 py-1 ${c.id === sim.conditionId ? 'bg-signal-amber text-ink-950' : 'bg-ink-700 text-ink-200 hover:bg-ink-600'}`}
                >
                  {c.id}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-ink-400">Trigger an event now</div>
            {pending.length === 0 && <div className="text-ink-500">All scripted events have fired.</div>}
            <ul className="space-y-1">
              {pending.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-2">
                  <span className="text-ink-300">{e.explanation ?? e.id}</span>
                  <button onClick={() => fireEvent(e.id)} className="shrink-0 rounded bg-ink-700 px-2 py-0.5 text-ink-100 hover:bg-ink-600">
                    Fire
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-ink-500">Runs where these are used are marked in history.</p>
        </div>
      )}
    </details>
  );
}
