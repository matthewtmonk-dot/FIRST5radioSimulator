import { useEffect, useRef } from 'react';
import { radio, roleFor } from '../../../audio/radio';
import type { RadioEntry, SimState } from '../../../domain/engine/types';
import { storage } from '../../../storage/db';
import { Badge, fmtTime, scoreTone } from '../../components/ui';

const KIND: Record<RadioEntry['kind'], string> = {
  dispatch: 'border-l-signal-blue',
  unit: 'border-l-ink-400',
  trainee: 'border-l-signal-amber bg-signal-amber/5',
  system: 'border-l-transparent text-ink-400',
  observation: 'border-l-signal-green/70 bg-signal-green/5',
};

export function RadioLog({ sim, speaking, showScores }: { sim: SimState; speaking: string | null; showScores: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }), [sim.log.length]);
  const gradeById = new Map(sim.grades.map((g) => [g.id, g]));
  return (
    <div className="scroll-thin flex-1 space-y-1 overflow-y-auto p-2" role="log" aria-live="polite" aria-label="Radio log">
      {sim.log.map((e) => {
        const scores = showScores ? (e.gradeIds ?? []).map((id) => gradeById.get(id)).filter((g) => g && !g.superseded) : [];
        return (
          <div key={e.id} className={`rounded-r border-l-2 px-2 py-1.5 text-sm ${KIND[e.kind]} ${speaking === e.id ? 'ring-1 ring-signal-blue/60' : ''}`}>
            <div className="flex items-center gap-2 text-[11px] text-ink-400">
              <span className="tabular">{sim.phase === 'dispatch' && e.kind === 'dispatch' ? 'DISP' : fmtTime(e.t)}</span>
              {e.kind === 'observation' ? (
                <span className="font-semibold uppercase tracking-wider text-signal-green">You observe</span>
              ) : e.kind === 'system' ? null : (
                <span className="font-semibold text-ink-200">
                  {e.from}
                  {e.to ? <span className="font-normal text-ink-400"> → {e.to}</span> : null}
                </span>
              )}
              {e.faceToFace && <Badge>face-to-face</Badge>}
              {speaking === e.id && <span className="text-signal-blue">● on air</span>}
              <ReplayButton entry={e} />
              {scores.map((g) => (
                <Badge key={g!.id} tone={scoreTone(g!.grade.score)}>
                  {g!.grade.score ?? '?'}
                </Badge>
              ))}
            </div>
            <p className={e.kind === 'observation' ? 'text-ink-100' : e.kind === 'system' ? 'italic' : 'text-ink-100'}>{e.text}</p>
            {e.transcript && e.transcript.original && e.transcript.original !== e.text && (
              <p className="text-[11px] text-ink-400">Speech recognition heard: “{e.transcript.original}”</p>
            )}
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}

let current: HTMLAudioElement | null = null;

/** Replays a simulated transmission, or the trainee's own recorded audio. */
export function ReplayButton({ entry }: { entry: { id: string; kind: string; from: string; text: string; audioId?: string } }) {
  if (entry.kind === 'trainee' && entry.audioId) {
    return (
      <button
        className="ml-auto text-ink-400 hover:text-ink-100"
        title="Play your recorded transmission"
        aria-label="Play your recorded transmission"
        onClick={async () => {
          const blob = await storage.getRecording(entry.audioId!);
          if (!blob) return;
          current?.pause();
          radio.stop();
          current = new Audio(URL.createObjectURL(blob));
          void current.play();
        }}
      >
        ▶ audio
      </button>
    );
  }
  if (entry.kind === 'dispatch' || entry.kind === 'unit') {
    return (
      <button
        className="ml-auto text-ink-400 hover:text-ink-100"
        title="Replay this transmission"
        aria-label="Replay this transmission"
        onClick={() => {
          radio.stop();
          const wasEnabled = radio.opts.enabled;
          radio.opts = { ...radio.opts, enabled: true };
          radio.enqueue({ id: entry.id, from: entry.from, text: entry.text, role: roleFor(entry.from, entry.kind), tone: 'chirp' });
          radio.opts = { ...radio.opts, enabled: wasEnabled };
        }}
      >
        ↻
      </button>
    );
  }
  return null;
}
