// Microphone capture for push-to-talk. Keeps one open stream for the session
// so PTT starts instantly, and records each press with MediaRecorder.

let stream: MediaStream | null = null;

export function micSupported() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

export async function ensureMic(): Promise<MediaStream> {
  if (stream && stream.getAudioTracks().some((t) => t.readyState === 'live')) return stream;
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  return stream;
}

export function releaseMic() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

export interface Recording {
  stop: () => Promise<{ blob: Blob; durationMs: number }>;
  cancel: () => void;
  level: () => number;
}

export async function startRecording(): Promise<Recording> {
  const s = await ensureMic();
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
  const rec = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const started = performance.now();
  rec.start(100);
  // Input level meter
  const AC = window.AudioContext;
  const ac = new AC();
  const src = ac.createMediaStreamSource(s);
  const an = ac.createAnalyser();
  an.fftSize = 512;
  src.connect(an);
  const buf = new Uint8Array(an.fftSize);
  return {
    level: () => {
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      return peak / 128;
    },
    cancel: () => {
      rec.onstop = null;
      if (rec.state !== 'inactive') rec.stop();
      void ac.close();
    },
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = () => {
          void ac.close();
          resolve({ blob: new Blob(chunks, { type: rec.mimeType || 'audio/webm' }), durationMs: performance.now() - started });
        };
        if (rec.state !== 'inactive') rec.stop();
      }),
  };
}

/** Decode a recording to 16 kHz mono PCM for speech recognition. */
export async function toPcm16k(blob: Blob): Promise<Float32Array> {
  const arr = await blob.arrayBuffer();
  const ac = new AudioContext();
  const decoded = await ac.decodeAudioData(arr);
  void ac.close();
  const frames = Math.ceil(decoded.duration * 16000);
  const off = new OfflineAudioContext(1, Math.max(1, frames), 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}
