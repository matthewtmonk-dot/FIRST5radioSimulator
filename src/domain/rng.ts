// Seeded random number generation so incidents can be reproduced exactly.

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(list: readonly T[]): T;
  weighted<T extends { weight?: number }>(list: readonly T[]): T;
  chance(p: number): boolean;
  shuffle<T>(list: readonly T[]): T[];
  fork(label: string): Rng;
}

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seed: number | string): Rng {
  let a = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    pick: (list) => list[Math.floor(next() * list.length)],
    weighted: (list) => {
      const total = list.reduce((s, x) => s + (x.weight ?? 1), 0);
      let r = next() * total;
      for (const x of list) {
        r -= x.weight ?? 1;
        if (r <= 0) return x;
      }
      return list[list.length - 1];
    },
    chance: (p) => next() < p,
    shuffle: (list) => {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    fork: (label) => createRng((hashString(label) ^ Math.floor(next() * 4294967296)) >>> 0),
  };
  return rng;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2_000_000_000) + 1;
}
