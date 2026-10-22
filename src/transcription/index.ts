// Transcription subsystem. Three engines:
//  - whisper: local Whisper model in a Web Worker (private, free, offline after first download)
//  - webspeech: the browser's SpeechRecognition (explicit opt-in; Chrome sends audio to a cloud service)
//  - off: type only
// Speech recognition never blocks the app: any failure falls back to text entry.

import { create } from 'zustand';
import { toPcm16k } from '../audio/recorder';

export interface TranscriptResult {
  text: string;
  lowConfidence: boolean;
  engine: 'whisper' | 'webspeech';
  ms?: number;
}

interface SttStatus {
  whisper: 'idle' | 'loading' | 'ready' | 'error';
  progress: number;
  device: string;
  error: string;
  model: string;
}

export const useSttStatus = create<SttStatus>(() => ({ whisper: 'idle', progress: 0, device: '', error: '', model: '' }));

let worker: Worker | null = null;
const pending = new Map<string, { resolve: (r: { text: string; ms: number }) => void; reject: (e: Error) => void }>();
let readyPromise: Promise<void> | null = null;
let readyModel = '';

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
  const files = new Map<string, number>();
  worker.onmessage = (ev) => {
    const m = ev.data;
    if (m.type === 'progress') {
      if (m.file && typeof m.progress === 'number') files.set(m.file, m.progress);
      const vals = [...files.values()];
      useSttStatus.setState({ progress: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0 });
    } else if (m.type === 'ready') {
      useSttStatus.setState({ whisper: 'ready', device: m.device, progress: 100, model: m.model });
    } else if (m.type === 'result') {
      pending.get(m.id)?.resolve({ text: m.text, ms: m.ms });
      pending.delete(m.id);
    } else if (m.type === 'error') {
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)!.reject(new Error(m.message));
        pending.delete(m.id);
      } else useSttStatus.setState({ whisper: 'error', error: m.message });
    }
  };
  worker.onerror = (e) => useSttStatus.setState({ whisper: 'error', error: e.message || 'Speech worker failed to start' });
  return worker;
}

export function loadWhisper(model: string): Promise<void> {
  if (readyPromise && readyModel === model && useSttStatus.getState().whisper !== 'error') return readyPromise;
  readyModel = model;
  useSttStatus.setState({ whisper: 'loading', progress: 0, error: '', model });
  const w = getWorker();
  readyPromise = new Promise((resolve, reject) => {
    const unsub = useSttStatus.subscribe((s) => {
      if (s.whisper === 'ready') {
        unsub();
        resolve();
      } else if (s.whisper === 'error') {
        unsub();
        reject(new Error(s.error));
      }
    });
  });
  w.postMessage({ type: 'load', model, allowRemote: true });
  return readyPromise;
}

const HALLUCINATIONS = /^(thank you\.?|thanks for watching\.?|you\.?|\[blank_audio\]|\(.*\)|\.|bye\.?)$/i;

export async function transcribeWhisper(blob: Blob, model: string, durationMs: number): Promise<TranscriptResult> {
  await loadWhisper(model);
  const audio = await toPcm16k(blob);
  const id = Math.random().toString(36).slice(2);
  const r = await new Promise<{ text: string; ms: number }>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ type: 'transcribe', id, audio }, [audio.buffer]);
  });
  const text = r.text.replace(/\[.*?\]/g, '').trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  const lowConfidence = !text || HALLUCINATIONS.test(text) || words < Math.max(1, durationMs / 1000 / 2.5);
  return { text: HALLUCINATIONS.test(text) ? '' : text, lowConfidence, engine: 'whisper', ms: r.ms };
}

// ---------------------------------------------------------------------------
// Browser-native recognition (opt-in)

type SR = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export function webSpeechSupported() {
  return typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
}

export interface LiveRecognition {
  stop: () => Promise<TranscriptResult>;
  cancel: () => void;
}

export function startWebSpeech(onInterim: (text: string) => void): LiveRecognition | null {
  if (!webSpeechSupported()) return null;
  const Ctor = (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition: new () => SR }).webkitSpeechRecognition;
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-US';
  let final = '';
  let confSum = 0;
  let confN = 0;
  let interim = '';
  rec.onresult = (e) => {
    interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) {
        final += `${r[0].transcript} `;
        confSum += r[0].confidence || 0;
        confN++;
      } else interim += r[0].transcript;
    }
    onInterim((final + interim).trim());
  };
  let ended: () => void = () => {};
  const endP = new Promise<void>((r) => (ended = r));
  rec.onend = () => ended();
  rec.onerror = () => ended();
  rec.start();
  return {
    cancel: () => rec.abort(),
    stop: async () => {
      rec.stop();
      await Promise.race([endP, new Promise((r) => setTimeout(r, 2500))]);
      const text = (final + interim).trim();
      const conf = confN ? confSum / confN : 0;
      return { text, lowConfidence: !text || conf < 0.6, engine: 'webspeech' };
    },
  };
}
