import { useEffect, useMemo, useState } from 'react';
import { currentTask, getCondition } from '../../../domain/engine/engine';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { SIDES, type Side } from '../../../domain/scenario/schema';
import { useSession } from '../../../store/session';
import { useSettings } from '../../../store/settings';
import { GradeCard } from '../../components/GradeCard';
import { Scene } from '../../components/Scene';
import { Badge, Button, Panel, fmtTime } from '../../components/ui';
import { useRadioPlayback } from '../../hooks/useRadioPlayback';
import { CoachPanel } from './CoachPanel';
import { CommandBoard } from './CommandBoard';
import { RadioLog } from './RadioLog';
import { TransmitBar } from './TransmitBar';

const MODE_LABEL = { practice: 'Practice', test: 'Test', drill: 'Quick Drill' } as const;

export function Exercise() {
  const sim = useSession((s) => s.sim)!;
  const store = useSession();
  const prefs = useSettings((s) => s.prefs);
  const [view, setView] = useState<Side>('alpha');
  const [side, setSide] = useState<'radio' | 'board' | 'coach'>('radio');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const coaching = sim.mode !== 'test';
  const sessionKey = sim.instance.instanceId + store.startedAt;
  const speaking = useRadioPlayback(sim.log, sessionKey, sim.mode === 'drill');

  // Simulation clock
  useEffect(() => {
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = ((now - last) / 1000) * useSettings.getState().prefs.clockSpeed;
      last = now;
      useSession.getState().tick(dt);
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => setView('alpha'), [sessionKey]);

  const condition = getCondition(sim);
  const emitters = useMemo(() => condition.emitters, [condition]);
  const task = currentTask(sim);
  const bc = sim.transfer.bcUnit;
  const bcHere = !!bc && sim.units.some((u) => u.id === bc && u.status === 'onScene');
  const remaining = sim.timeLimit - sim.t;
  const feedback = store.feedback;
  const inst = sim.instance;
  const header = `${inst.dispatch.nature} · ${inst.address.full}${inst.address.placeName ? ` (${inst.address.placeName})` : ''}`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-ink-700 bg-ink-850 px-3 py-2">
        <Badge tone={sim.mode === 'test' ? 'red' : sim.mode === 'drill' ? 'blue' : 'amber'}>{MODE_LABEL[sim.mode]}</Badge>
        <div className="min-w-0 flex-1 truncate text-sm text-ink-200">{header}</div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-ink-400">Task:</span>
          <span className="font-semibold text-signal-amber" data-testid="current-task">{task}</span>
          <span className="tabular rounded bg-ink-900 px-2 py-0.5 font-mono text-ink-100" title="Time on scene">
            {sim.phase === 'dispatch' ? '--:--' : fmtTime(sim.t)}
          </span>
          {sim.phase === 'onScene' && remaining < 90 && !sim.ended && <span className="tabular text-xs text-signal-red">{fmtTime(remaining)} left</span>}
          {sim.phase === 'onScene' && !sim.ended && (
            <Button variant="ghost" className="!min-h-8 text-xs" onClick={() => store.setPaused(!store.paused)} aria-pressed={store.paused}>
              {store.paused ? '▶ Resume' : '❚❚ Pause'}
            </Button>
          )}
          <Button variant="ghost" className="!min-h-8 text-xs" onClick={() => setConfirmEnd(true)}>
            End
          </Button>
        </div>
      </div>

      <div className="scroll-thin grid min-h-0 flex-1 grid-cols-1 content-start overflow-y-auto lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[minmax(0,1fr)_auto_auto] lg:content-stretch lg:overflow-hidden">
        {/* Scene */}
          {sim.phase === 'dispatch' ? (
            <div className="flex lg:col-start-1 lg:row-start-1 lg:min-h-0">
              <DispatchCard onArrive={store.arrive} text={sim.log[0]?.text ?? ''} />
            </div>
          ) : (
            <div className="relative aspect-video max-h-[60vh] w-full lg:col-start-1 lg:row-start-1 lg:aspect-auto lg:max-h-none lg:min-h-[220px]">
              <ErrorBoundary area="the building view" inline>
                <Scene instance={inst} view={view} emitters={emitters} reducedMotion={prefs.reducedMotion} className="absolute inset-0">
                  <div className="absolute left-2 top-2 flex gap-1" role="tablist" aria-label="Building side">
                    {SIDES.map((s) => {
                      const open = sim.revealedViews.includes(s);
                      return (
                        <button
                          key={s}
                          role="tab"
                          aria-selected={view === s}
                          disabled={!open}
                          title={open ? `${s} side` : 'Walk the 360 to see this side'}
                          onClick={() => setView(s)}
                          className={`rounded px-2.5 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur ${
                            view === s ? 'bg-signal-amber text-ink-950' : open ? 'bg-black/60 text-ink-100 hover:bg-black/80' : 'cursor-not-allowed bg-black/60 text-ink-300'
                          }`}
                        >
                          {open ? s : `${s} 🔒`}
                        </button>
                      );
                    })}
                  </div>
                  {prefs.captions && speaking && <Caption text={sim.log.find((e) => e.id === speaking)} />}
                  {store.paused && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-lg font-semibold tracking-widest text-ink-100">PAUSED</div>
                  )}
                  {sim.ended && !feedback && (
                    <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-2 bg-black/75 p-3">
                      <span className="text-sm text-ink-100">{endText(sim.ended.reason)}</span>
                      <Button variant="primary" onClick={() => void store.finish()} data-testid="view-review">
                        View after-action review
                      </Button>
                    </div>
                  )}
                </Scene>
              </ErrorBoundary>
            </div>
          )}

          {/* Officer actions */}
          {sim.phase === 'onScene' && !sim.ended && (
            <div className="flex flex-wrap items-center gap-2 border-t border-ink-700 bg-ink-850 px-3 py-2 lg:col-start-1 lg:row-start-2">
              <Button onClick={store.recon} disabled={sim.recon.status !== 'none' || store.paused} data-testid="walk-360">
                {sim.recon.status === 'inProgress' ? `${inst.recon.label}…` : sim.recon.status === 'complete' ? `${inst.recon.label} ✓` : inst.recon.label}
              </Button>
              {inst.investigation && (
                <Button onClick={store.investigate} disabled={sim.investigation.status !== 'none' || store.paused}>
                  {sim.investigation.status === 'complete' ? `${inst.investigation.label} ✓` : sim.investigation.status === 'inProgress' ? `${inst.investigation.label}…` : inst.investigation.label}
                </Button>
              )}
              <Button onClick={store.next} disabled={store.paused || !!feedback} title="Skip ahead to the next radio traffic or observation">
                Next traffic ⏭
              </Button>
              {bcHere && <span className="text-xs text-ink-300">{bc} is on scene and can meet you face-to-face.</span>}
            </div>
          )}


        {/* Side panel */}
        <div className="flex min-h-[45vh] flex-col border-ink-700 bg-ink-900 max-lg:border-t lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:min-h-0 lg:border-l">
          <div className="flex border-b border-ink-700" role="tablist">
            {(['radio', 'board', ...(coaching && prefs.showLiveChecklist ? ['coach'] : [])] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={side === t}
                onClick={() => setSide(t as typeof side)}
                className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wider ${side === t ? 'border-b-2 border-signal-amber text-ink-100' : 'text-ink-400 hover:text-ink-200'}`}
              >
                {t === 'radio' ? 'Radio log' : t === 'board' ? 'Command board' : 'Coach'}
              </button>
            ))}
          </div>
          <ErrorBoundary key={side} area="this panel" inline>
            {side === 'radio' && <RadioLog sim={sim} speaking={speaking} showScores={coaching} />}
            {side === 'board' && (
              <div className="scroll-thin flex-1 overflow-y-auto">
                <CommandBoard sim={sim} />
              </div>
            )}
            {side === 'coach' && coaching && (
              <div className="scroll-thin flex-1 overflow-y-auto">
                <CoachPanel sim={sim} />
              </div>
            )}
          </ErrorBoundary>
        </div>
      
        {/* Transmit — sticky at the bottom on small screens */}
        <div className="sticky bottom-0 z-10 lg:static lg:col-start-1 lg:row-start-3">
          <TransmitBar
            enabled={sim.phase === 'onScene' && !sim.ended && !store.paused && !feedback}
            faceToFaceAvailable={bcHere}
            faceToFaceWith={bc}
            onSend={(text, meta) => store.send(text, meta)}
          />
        </div>
      </div>

      {/* Practice feedback */}
      {feedback && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-2 sm:items-center" role="dialog" aria-modal="true" aria-label="Transmission feedback">
          <div className="scroll-thin max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-ink-600 bg-ink-850 shadow-2xl">
            <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
              <h2 className="font-semibold">Feedback</h2>
              <span className="text-xs text-ink-400">The clock is paused while you review.</span>
            </div>
            <div className="space-y-6 p-4">
              {feedback.grades.map((g, i) => (
                <GradeCard key={i} grade={g} yours={sim.log.find((e) => e.id === feedback.entryId)?.text} />
              ))}
            </div>
            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-ink-700 bg-ink-850 px-4 py-3">
              <Button onClick={store.retryLast} data-testid="retry">
                ↺ Retry this transmission
              </Button>
              <Button variant="primary" onClick={store.dismissFeedback} data-testid="continue" autoFocus>
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmEnd && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-lg border border-ink-600 bg-ink-850 p-4">
            <h2 className="font-semibold">End this exercise?</h2>
            <p className="mt-1 text-sm text-ink-300">You'll go to the after-action review. Transmissions you haven't made will count as missing.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={() => setConfirmEnd(false)}>Keep going</Button>
              <Button variant="danger" onClick={() => { setConfirmEnd(false); void store.finish(); }}>
                End and review
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Caption({ text }: { text?: { from: string; text: string } }) {
  if (!text) return null;
  return (
    <div className="pointer-events-none absolute inset-x-4 top-11 hidden justify-center sm:flex" aria-hidden>
      <div className="line-clamp-3 max-w-3xl rounded bg-black/75 px-3 py-1.5 text-center text-sm text-ink-100">
        <span className="font-semibold text-signal-blue">{text.from}: </span>
        {text.text}
      </div>
    </div>
  );
}

function endText(reason: string) {
  return (
    {
      transfer: 'Command has been transferred. Exercise complete.',
      resolved: 'The incident is resolved. Exercise complete.',
      timeLimit: 'Time is up for this exercise.',
      drill: 'Drill complete.',
      abandoned: 'Exercise ended.',
    } as Record<string, string>
  )[reason] ?? 'Exercise complete.';
}

function DispatchCard({ text, onArrive }: { text: string; onArrive: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Panel title="Dispatch — en route" className="w-full max-w-2xl">
        <div className="space-y-4 p-4">
          <p className="font-mono text-[15px] leading-relaxed text-ink-100">{text}</p>
          <p className="text-sm text-ink-400">
            Listen to the dispatch, think about what you expect to find, then arrive. The clock starts when you arrive. Use the side views, the radio, and
            the “Walk the 360” action to gather information — only what you could actually see or hear is shown.
          </p>
          <Button variant="go" onClick={onArrive} data-testid="arrive" autoFocus>
            Arrive on scene ▶
          </Button>
        </div>
      </Panel>
    </div>
  );
}
