// Push-to-talk: hold a key or the on-screen button to record, release to
// transcribe. Speech recognition never blocks the exercise — any failure
// leaves the trainee with the text box.

import { useCallback, useEffect, useRef, useState } from 'react';
import { radio } from '../../audio/radio';
import { micSupported, startRecording, type Recording } from '../../audio/recorder';
import { keyUp, squelch } from '../../audio/tones';
import { storage } from '../../storage/db';
import { useSettings } from '../../store/settings';
import { loadWhisper, startWebSpeech, transcribeWhisper, webSpeechSupported, type LiveRecognition } from '../../transcription';

export type PttPhase = 'idle' | 'starting' | 'recording' | 'transcribing';

export interface PttResult {
  text: string;
  original: string;
  source: 'whisper' | 'webspeech';
  lowConfidence: boolean;
  audioId?: string;
}

export function usePushToTalk(onResult: (r: PttResult) => void, opts: { enabled: boolean }) {
  const [phase, setPhase] = useState<PttPhase>('idle');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const [level, setLevel] = useState(0);
  const rec = useRef<Recording | null>(null);
  const live = useRef<LiveRecognition | null>(null);
  const held = useRef(false);
  const meter = useRef(0);
  const cb = useRef(onResult);
  cb.current = onResult;

  const engine = useSettings((s) => s.prefs.stt);
  const model = useSettings((s) => s.prefs.whisperModel);

  // Start downloading the speech model as soon as an exercise opens.
  useEffect(() => {
    if (opts.enabled && engine === 'whisper') loadWhisper(model).catch(() => {});
  }, [opts.enabled, engine, model]);

  const down = useCallback(async () => {
    if (!opts.enabled || held.current || engine === 'off') return;
    held.current = true;
    setError('');
    setInterim('');
    radio.stop();
    if (!micSupported()) {
      setError('This browser cannot record audio. Type the transmission instead.');
      held.current = false;
      return;
    }
    setPhase('starting');
    try {
      const r = await startRecording();
      keyUp();
      rec.current = r;
      if (engine === 'webspeech' && webSpeechSupported()) live.current = startWebSpeech(setInterim);
      if (!held.current) {
        // Released before the mic opened.
        r.cancel();
        live.current?.cancel();
        rec.current = null;
        live.current = null;
        setPhase('idle');
        return;
      }
      setPhase('recording');
      const loop = () => {
        if (!rec.current) return;
        setLevel(rec.current.level());
        meter.current = requestAnimationFrame(loop);
      };
      loop();
    } catch (e) {
      held.current = false;
      setPhase('idle');
      setError(
        (e as Error).name === 'NotAllowedError'
          ? 'Microphone permission was denied. Allow the microphone in the browser, or type the transmission.'
          : `Microphone unavailable (${(e as Error).message}). Type the transmission instead.`,
      );
    }
  }, [opts.enabled, engine]);

  const up = useCallback(async () => {
    if (!held.current) return;
    held.current = false;
    const r = rec.current;
    const l = live.current;
    rec.current = null;
    live.current = null;
    cancelAnimationFrame(meter.current);
    setLevel(0);
    if (!r) return; // still starting; down() will clean up
    squelch();
    setPhase('transcribing');
    try {
      const { blob, durationMs } = await r.stop();
      if (durationMs < 350) {
        l?.cancel();
        setPhase('idle');
        setError('Too short — hold the button while you talk.');
        return;
      }
      const audioId = `a${Date.now()}`;
      void storage.saveRecording(audioId, blob);
      let out: PttResult;
      if (l) {
        const t = await l.stop();
        out = { text: t.text, original: t.text, source: 'webspeech', lowConfidence: t.lowConfidence, audioId };
      } else {
        const t = await transcribeWhisper(blob, model, durationMs);
        out = { text: t.text, original: t.text, source: 'whisper', lowConfidence: t.lowConfidence, audioId };
      }
      setInterim('');
      setPhase('idle');
      cb.current(out);
    } catch (e) {
      setPhase('idle');
      setError(`Transcription failed (${(e as Error).message}). Type the transmission instead — your audio was kept for review.`);
    }
  }, [model]);

  return { phase, interim, error, level, down, up, engine, clearError: () => setError('') };
}
