// Small helpers for authoring scenario content in TypeScript. Output is plain
// JSON-compatible data identical to what the Scenario Builder produces.

import type { Emitter, Side } from '../domain/scenario/schema';

let n = 0;
type Opts = Partial<Pick<Emitter, 'color' | 'pressure' | 'spread'>>;

export function smoke(view: Side, anchor: string, intensity: number, opts: Opts = {}): Emitter {
  return { id: `e${++n}`, view, anchor, kind: 'smoke', intensity, color: opts.color ?? 'gray', pressure: opts.pressure ?? 'moderate', spread: opts.spread ?? 1 };
}
export function fire(view: Side, anchor: string, intensity: number, opts: Opts = {}): Emitter {
  return { id: `e${++n}`, view, anchor, kind: 'fire', intensity, color: 'gray', pressure: opts.pressure ?? 'moderate', spread: opts.spread ?? 1 };
}
export function glow(view: Side, anchor: string, intensity: number, opts: Opts = {}): Emitter {
  return { id: `e${++n}`, view, anchor, kind: 'glow', intensity, color: 'gray', pressure: 'lazy', spread: opts.spread ?? 1 };
}
export function haze(view: Side, anchor: string, intensity: number, opts: Opts = {}): Emitter {
  return { id: `e${++n}`, view, anchor, kind: 'haze', intensity, color: opts.color ?? 'light-gray', pressure: 'lazy', spread: opts.spread ?? 1 };
}
