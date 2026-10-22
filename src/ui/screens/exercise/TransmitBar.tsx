// Push-to-talk and text entry. A transcript is shown for review before it is
// sent unless the trainee turned on auto-send.

import { useEffect, useRef, useState } from 'react';
import type { TransmitMeta } from '../../../domain/engine/engine';
import { useSettings } from '../../../store/settings';
import { useSttStatus } from '../../../transcription';
import { Button, Kbd } from '../../components/ui';
import { usePushToTalk, type PttResult } from '../../hooks/usePushToTalk';

interface Props {
  enabled: boolean;
  faceToFaceAvailable: boolean;
  faceToFaceWith?: string;
  onSend: (text: string, meta: TransmitMeta) => void;
}

const KEY_LABEL = { Space: 'Space', KeyT: 'T', ShiftRight: 'Right Shift' } as const;

export function TransmitBar({ enabled, faceToFaceAvailable, faceToFaceWith, onSend }: Props) {
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<PttResult | null>(null);
  const [f2f, setF2f] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const prefs = useSettings((s) => s.prefs);
  const stt = useSttStatus();

  useEffect(() => {
    if (!faceToFaceAvailable) setF2f(false);
  }, [faceToFaceAvailable]);

  const send = (text: string, r: PttResult | null) => {
    if (!text.trim()) return;
    onSend(text, {
      faceToFace: f2f && faceToFaceAvailable,
      audioId: r?.audioId,
      transcript: r ? { original: r.original, corrected: text, source: r.source, lowConfidence: r.lowConfidence } : { original: text, corrected: text, source: 'typed' },
    });
    setDraft('');
    setPending(null);
  };

  const ptt = usePushToTalk(
    (r) => {
      if (!r.text) {
        setPending(null);
        return;
      }
      if (prefs.autoSendTranscript && !r.lowConfidence) {
        send(r.text, r);
        return;
      }
      setPending(r);
      setDraft(r.text);
      setTimeout(() => area.current?.focus(), 0);
    },
    { enabled },
  );

  // Keyboard push-to-talk, ignored while typing in a field.
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.isContentEditable);
    const kd = (e: KeyboardEvent) => {
      if (e.code !== prefs.pttKey || e.repeat || typing(e.target)) return;
      e.preventDefault();
      void ptt.down();
    };
    const ku = (e: KeyboardEvent) => {
      if (e.code !== prefs.pttKey || typing(e.target)) return;
      e.preventDefault();
      void ptt.up();
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, [prefs.pttKey, ptt.down, ptt.up]);

  const recording = ptt.phase === 'recording' || ptt.phase === 'starting';
  const sttOff = ptt.engine === 'off';

  return (
    <div className="space-y-2 border-t border-ink-700 bg-ink-850 p-3">
      {ptt.error && (
        <div role="alert" className="flex items-start justify-between gap-2 rounded border border-signal-amber/40 bg-signal-amber/10 px-2 py-1.5 text-xs text-ink-100">
          <span>{ptt.error}</span>
          <button className="text-ink-300 hover:text-ink-100" onClick={ptt.clearError} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      {pending?.lowConfidence && (
        <div className="rounded border border-signal-amber/40 bg-signal-amber/10 px-2 py-1.5 text-xs text-ink-100">
          The transcript may be inaccurate. Check it against what you said, correct it if needed, then send.
        </div>
      )}
      {ptt.engine === 'whisper' && stt.whisper === 'loading' && (
        <div className="text-xs text-ink-300">
          Loading the local speech model… {stt.progress}% (first time only; text entry works meanwhile)
        </div>
      )}
      {ptt.engine === 'whisper' && stt.whisper === 'error' && (
        <div className="text-xs text-signal-amber">Local speech model unavailable ({stt.error}). Use text entry, or pick another engine in Settings.</div>
      )}
      <div className="flex items-stretch gap-2">
        {!sttOff && (
          <button
            type="button"
            disabled={!enabled}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              void ptt.down();
            }}
            onPointerUp={() => void ptt.up()}
            onPointerCancel={() => void ptt.up()}
            onContextMenu={(e) => e.preventDefault()}
            aria-label={recording ? 'Transmitting — release to stop' : 'Push to talk (hold)'}
            className={`relative flex w-24 shrink-0 select-none flex-col items-center justify-center rounded-lg border-2 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-40 sm:w-28 ${
              recording ? 'ptt-ring border-signal-red bg-signal-red text-white' : ptt.phase === 'transcribing' ? 'border-ink-500 bg-ink-700 text-ink-200' : 'border-signal-red/60 bg-ink-800 text-signal-red hover:bg-ink-700'
            }`}
            style={{ touchAction: 'none' }}
          >
            <span className="text-lg leading-none">{recording ? '●' : '🎙'}</span>
            <span className="mt-1">{recording ? 'On air' : ptt.phase === 'transcribing' ? 'Working…' : 'Hold to talk'}</span>
            {recording && <span className="absolute bottom-1 left-2 right-2 h-1 rounded bg-white/30"><span className="block h-1 rounded bg-white" style={{ width: `${Math.min(100, ptt.level * 220)}%` }} /></span>}
          </button>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <textarea
            ref={area}
            value={recording && ptt.interim ? ptt.interim : draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(draft, pending);
              }
              if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
            }}
            disabled={!enabled}
            rows={2}
            placeholder={enabled ? (sttOff ? 'Type your transmission…' : `Hold ${KEY_LABEL[prefs.pttKey]} or the button to talk — or type here`) : 'Radio unavailable'}
            aria-label="Transmission text"
            className="scroll-thin min-h-[3.25rem] w-full resize-none rounded-md border border-ink-600 bg-ink-900 px-3 py-2 font-mono text-sm text-ink-100 placeholder:text-ink-500 focus:border-signal-amber focus:outline-none"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-400">
            <div className="flex items-center gap-3">
              {faceToFaceAvailable && (
                <label className="flex cursor-pointer items-center gap-1.5 text-ink-200">
                  <input type="checkbox" checked={f2f} onChange={(e) => setF2f(e.target.checked)} className="accent-signal-amber" />
                  Face-to-face with {faceToFaceWith ?? 'the chief'}
                </label>
              )}
              {!sttOff && (
                <span className="hidden sm:inline">
                  <Kbd>{KEY_LABEL[prefs.pttKey]}</Kbd> push-to-talk · <Kbd>Enter</Kbd> send
                </span>
              )}
              {pending && <span>Transcribed by {pending.source === 'whisper' ? 'local Whisper' : 'browser speech recognition'} — edit if needed</span>}
            </div>
            <div className="flex gap-2">
              {pending && (
                <Button variant="ghost" className="!min-h-8 text-xs" onClick={() => { setPending(null); setDraft(''); }}>
                  Discard
                </Button>
              )}
              <Button variant="primary" className="!min-h-8 text-xs" disabled={!enabled || !draft.trim()} onClick={() => send(draft, pending)}>
                {f2f && faceToFaceAvailable ? 'Say it' : 'Transmit'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
