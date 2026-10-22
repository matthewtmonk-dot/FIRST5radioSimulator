// Simulated radio playback using the browser's free speech synthesis.
// Messages are queued so transmissions never overlap; the trainee keying the
// mic interrupts playback, like being stepped on.

import { alertTones, chirp, squelch } from './tones';

export type VoiceRole = 'dispatch' | 'unit' | 'chief' | 'crew';

export interface RadioMessage {
  id: string;
  from: string;
  text: string;
  role: VoiceRole;
  tone?: 'alert' | 'chirp';
}

export interface RadioOptions {
  enabled: boolean;
  tones: boolean;
  rate: number;
  voices: Partial<Record<VoiceRole, string>>;
}

type Listener = (speakingId: string | null) => void;

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

export function speechAvailable() {
  return !!synth;
}

export function listVoices(): SpeechSynthesisVoice[] {
  return synth?.getVoices().filter((v) => v.lang.startsWith('en')) ?? [];
}

/** Voices load asynchronously in Chrome. */
export function onVoicesChanged(fn: () => void) {
  synth?.addEventListener?.('voiceschanged', fn);
  return () => synth?.removeEventListener?.('voiceschanged', fn);
}

const PITCH: Record<VoiceRole, number> = { dispatch: 1.05, unit: 0.9, chief: 0.82, crew: 0.95 };

function pickVoice(role: VoiceRole, preferred: string | undefined, from: string): SpeechSynthesisVoice | undefined {
  const voices = listVoices();
  if (!voices.length) return undefined;
  if (preferred) {
    const v = voices.find((x) => x.name === preferred);
    if (v) return v;
  }
  // Spread different units across available voices deterministically
  let h = 0;
  for (const ch of from) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const local = voices.filter((v) => v.localService);
  const pool = local.length >= 2 ? local : voices;
  if (role === 'dispatch') return pool.find((v) => /female|zira|samantha|aria|jenny|susan|karen/i.test(v.name)) ?? pool[0];
  return pool[h % pool.length];
}

/** Expand radio shorthand so synthesized speech sounds like radio traffic. */
export function speakable(text: string): string {
  return text
    .replace(/\b(\d{2})(\d{2})\b(?=\.?$)/, '$1 $2')
    .replace(/\bPAR\b/g, 'par')
    .replace(/\bRIT\b/g, 'rit')
    .replace(/\bF\/C\b/g, 'fire control')
    .replace(/\bP\/S\b/g, 'primary search')
    .replace(/\bW\/S\b/g, 'water supply')
    .replace(/\bL\/C\b/g, 'loss control')
    .replace(/\bO\/D\b/g, 'on deck')
    .replace(/\bCAN\b/g, 'C-A-N');
}

class RadioPlayer {
  private queue: RadioMessage[] = [];
  private playing = false;
  private listeners = new Set<Listener>();
  private current: string | null = null;
  private generation = 0;
  opts: RadioOptions = { enabled: true, tones: true, rate: 1.08, voices: {} };

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(id: string | null) {
    this.current = id;
    this.listeners.forEach((l) => l(id));
  }

  get speaking() {
    return this.current;
  }

  enqueue(m: RadioMessage) {
    if (!this.opts.enabled) return;
    this.queue.push(m);
    if (!this.playing) void this.run();
  }

  /** Stop all playback (trainee keyed up, exercise ended). */
  stop() {
    this.generation++;
    this.queue = [];
    synth?.cancel();
    this.playing = false;
    this.emit(null);
  }

  private async run() {
    this.playing = true;
    const gen = this.generation;
    while (this.queue.length && gen === this.generation) {
      const m = this.queue.shift()!;
      this.emit(m.id);
      if (this.opts.tones) {
        if (m.tone === 'alert') await alertTones();
        else if (m.tone === 'chirp') await chirp();
      }
      if (gen !== this.generation) break;
      await this.speak(m);
      if (gen !== this.generation) break;
      if (this.opts.tones && m.tone) squelch();
      await new Promise((r) => setTimeout(r, 350));
    }
    if (gen === this.generation) {
      this.playing = false;
      this.emit(null);
    }
  }

  private speak(m: RadioMessage): Promise<void> {
    return new Promise((resolve) => {
      if (!synth) return resolve();
      const u = new SpeechSynthesisUtterance(speakable(m.text));
      const v = pickVoice(m.role, this.opts.voices[m.role], m.from);
      if (v) u.voice = v;
      u.rate = this.opts.rate * (m.role === 'dispatch' ? 1.02 : 1.06);
      u.pitch = PITCH[m.role];
      u.volume = 0.95;
      const done = () => resolve();
      u.onend = done;
      u.onerror = done;
      // Chrome can stall long utterances; resolve after a generous timeout.
      setTimeout(done, 1500 + m.text.length * 110);
      synth.speak(u);
    });
  }
}

export const radio = new RadioPlayer();

export function roleFor(from: string, kind: string): VoiceRole {
  if (kind === 'dispatch') return 'dispatch';
  if (/^battalion/i.test(from)) return 'chief';
  if (/engineer|crew/i.test(from)) return 'crew';
  return 'unit';
}
