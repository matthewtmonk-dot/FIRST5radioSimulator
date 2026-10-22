// Copies ONNX Runtime Web binaries from node_modules into public/ort so the
// local Whisper model runs without any CDN.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const src = join('node_modules', '@huggingface', 'transformers', 'dist');
const dest = join('public', 'ort');
if (!existsSync(src)) {
  console.warn('[copy-ort] @huggingface/transformers not installed; speech-to-text will be unavailable.');
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
for (const f of readdirSync(src)) {
  if (/^ort-wasm.*\.(wasm|mjs)$/.test(f)) cpSync(join(src, f), join(dest, f));
}
console.log('[copy-ort] ONNX Runtime files copied to public/ort');
