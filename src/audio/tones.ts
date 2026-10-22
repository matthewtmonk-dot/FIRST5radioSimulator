// Radio tones synthesized with Web Audio: dispatch alert, talk-permit chirp,
// and a short squelch tail. No audio files needed.

let ctx: AudioContext | null = null;

export function audioContext(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function beep(c: AudioContext, freq: number, start: number, dur: number, gain = 0.12, type: OscillatorType = 'sine') {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.008);
  g.gain.setValueAtTime(gain, start + dur - 0.012);
  g.gain.linearRampToValueAtTime(0, start + dur);
  o.connect(g).connect(c.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

function noise(c: AudioContext, start: number, dur: number, gain = 0.05) {
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  bp.Q.value = 0.7;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(c.destination);
  src.start(start);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Two-tone dispatch alert (~1.2 s). */
export async function alertTones() {
  const c = audioContext();
  if (!c) return;
  const t = c.currentTime + 0.02;
  for (let i = 0; i < 4; i++) beep(c, i % 2 ? 960 : 853, t + i * 0.28, 0.27, 0.09, 'triangle');
  await wait(1200);
}

/** Talk-permit chirp when a transmission starts. */
export async function chirp() {
  const c = audioContext();
  if (!c) return;
  beep(c, 1400, c.currentTime + 0.01, 0.07, 0.06, 'square');
  await wait(110);
}

/** Squelch tail at the end of a received transmission. */
export function squelch() {
  const c = audioContext();
  if (!c) return;
  noise(c, c.currentTime + 0.01, 0.16, 0.035);
}

/** Key-up tone for the trainee's own PTT. */
export function keyUp() {
  const c = audioContext();
  if (!c) return;
  beep(c, 900, c.currentTime + 0.005, 0.05, 0.05, 'square');
}
