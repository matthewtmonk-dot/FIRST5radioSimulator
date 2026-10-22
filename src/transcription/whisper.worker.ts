/// <reference lib="webworker" />
// Local Whisper speech-to-text via Transformers.js (ONNX Runtime Web).
// Uses WebGPU when available, otherwise WebAssembly on the CPU. The model is
// downloaded once from the Hugging Face hub (or served from /models/ for fully
// offline use) and cached by the browser.

import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

declare const self: DedicatedWorkerGlobalScope;

env.localModelPath = '/models/';
// ONNX Runtime binaries are served locally (copied to /ort by scripts/copy-ort.mjs)
if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = '/ort/';

let asr: AutomaticSpeechRecognitionPipeline | null = null;
let loadedModel = '';
let device: 'webgpu' | 'wasm' = 'wasm';

type In =
  | { type: 'load'; model: string; allowRemote: boolean }
  | { type: 'transcribe'; id: string; audio: Float32Array; prompt?: string };

/** Use /models/<id>/ only when it really holds the model (a dev server answers unknown paths with index.html). */
async function hasLocalCopy(model: string) {
  try {
    const r = await fetch(`/models/${model}/config.json`, { method: 'GET' });
    return r.ok && (r.headers.get('content-type') ?? '').includes('json');
  } catch {
    return false;
  }
}

function explain(e: unknown): string {
  const m = (e as Error)?.message ?? String(e);
  if (/Unexpected token|is not valid JSON|Failed to fetch|NetworkError|status 403|status 404|Could not locate/i.test(m))
    return 'Could not download the speech model. The first download needs internet access to huggingface.co (or place the model files under public/models/).';
  return m;
}

async function load(model: string, allowRemote: boolean) {
  if (asr && loadedModel === model) return;
  env.allowLocalModels = await hasLocalCopy(model);
  env.allowRemoteModels = allowRemote;
  const hasGpu = 'gpu' in navigator && !!(await (navigator as Navigator & { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter().catch(() => null));
  device = hasGpu ? 'webgpu' : 'wasm';
  const progress = (p: { status: string; file?: string; progress?: number; loaded?: number; total?: number }) =>
    self.postMessage({ type: 'progress', status: p.status, file: p.file, progress: p.progress, loaded: p.loaded, total: p.total });
  try {
    // Cast through unknown: the pipeline() overloads produce a union too complex for tsc.
    const make = pipeline as unknown as (task: string, model: string, opts: Record<string, unknown>) => Promise<AutomaticSpeechRecognitionPipeline>;
    asr = await make('automatic-speech-recognition', model, {
      device,
      dtype: device === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
      progress_callback: progress,
    });
  } catch (e) {
    if (device === 'webgpu') {
      device = 'wasm';
      const make = pipeline as unknown as (task: string, model: string, opts: Record<string, unknown>) => Promise<AutomaticSpeechRecognitionPipeline>;
      asr = await make('automatic-speech-recognition', model, { device: 'wasm', dtype: 'q8', progress_callback: progress });
    } else throw e;
  }
  loadedModel = model;
  self.postMessage({ type: 'ready', model, device });
}

self.onmessage = async (ev: MessageEvent<In>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'load') await load(msg.model, msg.allowRemote);
    if (msg.type === 'transcribe') {
      if (!asr) throw new Error('Speech model not loaded');
      const started = performance.now();
      const out = (await asr(msg.audio, { chunk_length_s: 30, return_timestamps: false })) as { text: string };
      self.postMessage({ type: 'result', id: msg.id, text: out.text.trim(), ms: performance.now() - started, device });
    }
  } catch (e) {
    self.postMessage({ type: 'error', id: 'id' in msg ? msg.id : undefined, message: explain(e) });
  }
};
