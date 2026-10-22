// Particle compositor for smoke, fire, interior glow and haze.
// Smoke uses pre-rendered, self-shadowed billow sprites (fractal-noise shaped)
// so a few hundred particles read as volumetric smoke on an ordinary laptop.
// Fire uses additive flame sprites plus a flickering light cast on the wall.

import type { Emitter, SmokeColor } from '../domain/scenario/schema';
import { makeNoise2D } from './noise';

export interface PlacedEmitter {
  key: string;
  kind: Emitter['kind'];
  color: SmokeColor;
  pressure: Emitter['pressure'];
  /** Current (tweened) and target intensity 0..1 */
  intensity: number;
  target: number;
  x: number;
  y: number;
  /** Width of the source in pixels. */
  width: number;
  /** Pixels per foot at this anchor. */
  pxPerFt: number;
  /** Opening rectangle (screen px) when the anchor is a window or door. */
  open?: { x: number; y: number; w: number; h: number };
  acc: number;
}

interface Particle {
  kind: 'smoke' | 'flame' | 'haze';
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  grow: number;
  rot: number;
  vr: number;
  alpha: number;
  sprite: number;
  color: SmokeColor;
  /** Buoyant acceleration (px/s²) and pixels per foot at the source. */
  lift: number;
  ftPx: number;
}

const SMOKE_RGB: Record<SmokeColor, [number, number, number]> = {
  white: [236, 236, 232],
  'light-gray': [196, 196, 192],
  gray: [142, 142, 140],
  'dark-gray': [84, 82, 80],
  black: [34, 32, 31],
  brown: [122, 98, 70],
};
const SMOKE_DENSITY: Record<SmokeColor, number> = { white: 0.62, 'light-gray': 0.7, gray: 0.8, 'dark-gray': 0.88, black: 0.95, brown: 0.85 };

const SPRITES = 8;

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SPRITE_PX = 128;
const spriteCache = new Map<string, HTMLCanvasElement[]>();

function smokeSprites(color: SmokeColor, night: boolean): HTMLCanvasElement[] {
  const key = `${color}:${night}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const [r, g, b] = SMOKE_RGB[color];
  const out: HTMLCanvasElement[] = [];
  for (let s = 0; s < SPRITES; s++) {
    const n = makeNoise2D(101 + s * 17);
    const rng = mulberry(977 + s * 31);
    // Cauliflower billow: several overlapping lobes with noisy edges,
    // shaded as if lit from above so each puff reads as a volume.
    const lobes = Array.from({ length: 6 + Math.floor(rng() * 4) }, (_, i) => {
      const a = rng() * Math.PI * 2;
      const d = i === 0 ? 0 : 0.12 + rng() * 0.2;
      return { x: Math.cos(a) * d, y: Math.sin(a) * d * 0.8, r: 0.2 + rng() * 0.16 + (i === 0 ? 0.08 : 0) };
    });
    const c = document.createElement('canvas');
    c.width = c.height = SPRITE_PX;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(SPRITE_PX, SPRITE_PX);
    const half = SPRITE_PX / 2;
    for (let y = 0; y < SPRITE_PX; y++) {
      for (let x = 0; x < SPRITE_PX; x++) {
        const px = (x - half) / half;
        const py = (y - half) / half;
        const rough = n.fbm(x / 10 + s * 3, y / 10, 4);
        let field = 0;
        let shadeY = 0;
        for (const l of lobes) {
          const dx = px - l.x;
          const dy = py - l.y;
          const f = 1 - Math.sqrt(dx * dx + dy * dy) / (l.r * (0.85 + rough * 0.4));
          if (f > field) {
            field = f;
            shadeY = dy / l.r;
          }
        }
        const t = Math.max(0, Math.min(1, (field + 0.05) / 0.6));
        const a = t * t * (3 - 2 * t) * (0.75 + rough * 0.35);
        // lit from above: brighter upper half of each lobe, darker belly
        const light = (1.06 - shadeY * 0.14 - (py + 1) * 0.07) * (0.93 + rough * 0.14);
        const lf = night ? light * 0.72 : light;
        const i = (y * SPRITE_PX + x) * 4;
        img.data[i] = Math.min(255, r * lf);
        img.data[i + 1] = Math.min(255, g * lf);
        img.data[i + 2] = Math.min(255, b * lf);
        img.data[i + 3] = Math.max(0, Math.min(255, a * 255));
      }
    }
    ctx.putImageData(img, 0, 0);
    out.push(c);
  }
  spriteCache.set(key, out);
  return out;
}

let flameSprite: HTMLCanvasElement | null = null;
function flame(): HTMLCanvasElement {
  if (flameSprite) return flameSprite;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 64, 2, 32, 56, 40);
  g.addColorStop(0, 'rgba(255,250,220,1)');
  g.addColorStop(0.25, 'rgba(255,200,90,0.95)');
  g.addColorStop(0.55, 'rgba(240,110,30,0.6)');
  g.addColorStop(1, 'rgba(160,30,10,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(32, 2);
  ctx.bezierCurveTo(52, 30, 60, 60, 32, 94);
  ctx.bezierCurveTo(4, 60, 12, 30, 32, 2);
  ctx.fill();
  flameSprite = c;
  return c;
}

export class EffectSystem {
  particles: Particle[] = [];
  emitters = new Map<string, PlacedEmitter>();
  wind = 0;
  night = false;
  maxParticles = 1400;
  private budget = 1;
  private time = 0;
  private noise = makeNoise2D(5);

  setEmitters(list: PlacedEmitter[], immediate: boolean) {
    const keep = new Set(list.map((e) => e.key));
    for (const e of list) {
      const cur = this.emitters.get(e.key);
      if (cur) {
        Object.assign(cur, { color: e.color, pressure: e.pressure, x: e.x, y: e.y, width: e.width, pxPerFt: e.pxPerFt, open: e.open, target: e.target });
        if (immediate) cur.intensity = e.target;
      } else {
        this.emitters.set(e.key, { ...e, intensity: immediate ? e.target : 0, acc: 0 });
      }
    }
    for (const [k, e] of this.emitters) if (!keep.has(k)) e.target = 0;
  }

  /** Pre-run the simulation so smoke is already established when a view appears. */
  warm(seconds: number) {
    for (let t = 0; t < seconds; t += 1 / 20) this.update(1 / 20);
  }

  clear() {
    this.particles = [];
    this.emitters.clear();
  }

  update(dt: number) {
    this.time += dt;
    // Tween intensities: smoke volume changes over several seconds
    for (const [k, e] of this.emitters) {
      const rate = e.target > e.intensity ? 0.18 : 0.12;
      e.intensity += Math.sign(e.target - e.intensity) * Math.min(Math.abs(e.target - e.intensity), rate * dt);
      if (e.intensity <= 0.001 && e.target === 0) this.emitters.delete(k);
    }
    // Spawn
    for (const e of this.emitters.values()) this.spawn(e, dt);
    // Integrate
    const gust = (this.noise.fbm(this.time * 0.15, 0.5, 2) - 0.5) * 2;
    const alive: Particle[] = [];
    for (const p of this.particles) {
      p.age += dt;
      if (p.age >= p.life) continue;
      const t = p.age / p.life;
      if (p.kind === 'flame') {
        p.vy -= 30 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.size *= 1 - 0.9 * dt;
      } else {
        // Buoyant plume: hot smoke accelerates upward and slows as it cools and
        // mixes; it picks up the wind speed as it rises.
        const buoy = p.lift * Math.pow(1 - t, 1.4);
        p.vy += -buoy * dt;
        p.vy *= 1 - 0.55 * dt;
        const windTarget = this.wind * p.ftPx * (1.5 + 7 * t) * (1 + gust * 0.35);
        const turb = (this.noise.noise(p.x * 0.012 + this.time * 0.35, p.y * 0.012 + p.sprite) - 0.5) * p.ftPx * 3;
        p.vx += ((windTarget - p.vx) * 0.7 + turb) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.size += p.grow * dt * (1 - t * 0.5);
        p.rot += p.vr * dt;
      }
      alive.push(p);
    }
    this.particles = alive;
  }

  private spawn(e: PlacedEmitter, dt: number) {
    if (e.intensity <= 0.005) return;
    const s = e.pxPerFt;
    if (e.kind === 'glow') return;
    const widthFt = e.width / s;
    let rate: number;
    if (e.kind === 'fire') rate = (14 + widthFt * 4) * e.intensity;
    else if (e.kind === 'haze') rate = 1.4 * e.intensity * Math.max(1, widthFt / 10);
    else rate = (4 + widthFt * 0.9) * (0.35 + e.intensity * 1.8) * (e.pressure === 'pushing' ? 1.5 : e.pressure === 'lazy' ? 0.8 : 1);
    rate *= this.budget;
    e.acc += rate * dt;
    while (e.acc >= 1) {
      e.acc -= 1;
      if (this.particles.length >= this.maxParticles) {
        e.acc = 0;
        return;
      }
      const ox = (Math.random() - 0.5) * e.width;
      if (e.kind === 'fire') {
        this.particles.push({
          kind: 'flame', x: e.open ? e.open.x + Math.random() * e.open.w : e.x + ox, y: e.open ? e.open.y + e.open.h * (0.15 + Math.random() * 0.5) : e.y + Math.random() * s * 1.5, vx: (Math.random() - 0.5) * s * 0.8 + this.wind * s * 0.8,
          vy: -s * (2.5 + Math.random() * 3) * (0.6 + e.intensity), age: 0, life: 0.35 + Math.random() * 0.5 * (0.5 + e.intensity),
          size: s * (1.4 + Math.random() * 1.8) * (0.6 + e.intensity * 0.9), grow: 0, rot: 0, vr: 0, alpha: 0.85, sprite: 0, color: 'gray', lift: 0, ftPx: s,
        });
      } else if (e.kind === 'haze') {
        this.particles.push({
          kind: 'haze', x: e.x + ox, y: e.y - Math.random() * s * 4, vx: this.wind * s, vy: -s * 0.4, age: 0, life: 9 + Math.random() * 5,
          size: s * (8 + Math.random() * 6), grow: s * 0.8, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.1, alpha: 0.12 * e.intensity,
          sprite: Math.floor(Math.random() * SPRITES), color: e.color, lift: s * 0.3, ftPx: s,
        });
      } else {
        const push = e.pressure === 'pushing' ? 1.7 : e.pressure === 'lazy' ? 0.55 : 1;
        this.particles.push({
          kind: 'smoke',
          x: e.x + ox,
          y: e.y + (Math.random() - 0.5) * s * 0.8,
          vx: (Math.random() - 0.5) * s * 1.2 * push,
          vy: -s * (1.2 + Math.random() * 1.4) * push * (0.7 + e.intensity * 0.6),
          lift: s * (2.2 + Math.random() * 1.2) * (0.6 + push * 0.4) * (0.7 + e.intensity * 0.6),
          ftPx: s,
          age: 0,
          life: 5 + Math.random() * 3 + e.intensity * 4,
          size: s * (1.8 + Math.random() * 1.4) * (0.7 + Math.min(1, widthFt / 14)),
          grow: s * (0.9 + Math.random() * 0.7) * (0.7 + push * 0.3) * (0.8 + e.intensity * 0.5),
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 0.25,
          alpha: Math.min(0.9, (0.3 + e.intensity * 0.5) * SMOKE_DENSITY[e.color]),
          sprite: Math.floor(Math.random() * SPRITES),
          color: e.color,
        });
      }
    }
  }

  /** Light cast by fire on surrounding surfaces, drawn before particles. */
  drawGlow(ctx: CanvasRenderingContext2D) {
    for (const e of this.emitters.values()) {
      if (e.kind !== 'glow' && e.kind !== 'fire') continue;
      const flick = 0.75 + this.noise.noise(this.time * 6, e.x * 0.01) * 0.5;
      const r = (e.width * 0.9 + e.pxPerFt * 6) * (0.6 + e.intensity * 0.8);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
      const a = (this.night ? 0.55 : 0.32) * e.intensity * flick;
      g.addColorStop(0, `rgba(255,150,50,${a})`);
      g.addColorStop(0.5, `rgba(240,90,20,${a * 0.45})`);
      g.addColorStop(1, 'rgba(200,60,10,0)');
      ctx.fillStyle = g;
      ctx.fillRect(e.x - r, e.y - r, r * 2, r * 2);
      ctx.restore();
      if (e.kind === 'glow' || (e.kind === 'fire' && e.open)) {
        // Interior fire seen through the opening, clipped to the opening
        const o = e.open ?? { x: e.x - e.width / 2, y: e.y - e.pxPerFt * 2, w: e.width, h: e.pxPerFt * 4 };
        ctx.save();
        ctx.globalAlpha = Math.min(1, (e.kind === 'fire' ? 0.6 : 1) * e.intensity * flick + 0.15);
        const ig = ctx.createLinearGradient(0, o.y, 0, o.y + o.h);
        ig.addColorStop(0, 'rgba(255,200,110,0.95)');
        ig.addColorStop(0.6, 'rgba(235,110,30,0.85)');
        ig.addColorStop(1, 'rgba(150,40,10,0.8)');
        ctx.fillStyle = ig;
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.restore();
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    // Haze and smoke first (normal blend), flames on top (additive), with smoke
    // drawn again lightly over flames so they read as partly obscured.
    const byColor = new Map<string, HTMLCanvasElement[]>();
    const sprites = (c: SmokeColor) => {
      let s = byColor.get(c);
      if (!s) byColor.set(c, (s = smokeSprites(c, this.night)));
      return s;
    };
    for (const p of this.particles) {
      if (p.kind === 'flame') continue;
      const t = p.age / p.life;
      const fadeIn = Math.min(1, p.age / 0.4);
      const a = p.alpha * fadeIn * Math.pow(1 - t, 1.6);
      if (a <= 0.003) continue;
      const img = sprites(p.color)[p.sprite];
      ctx.globalAlpha = a;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.drawImage(img, -p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    const f = flame();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      if (p.kind !== 'flame') continue;
      const t = p.age / p.life;
      ctx.globalAlpha = p.alpha * (1 - t);
      const w = p.size * 0.7;
      const h = p.size * 1.2;
      ctx.drawImage(f, p.x - w / 2, p.y - h * 0.8, w, h);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Adapts particle budget to frame time. */
  adapt(frameMs: number) {
    if (frameMs > 28) this.budget = Math.max(0.4, this.budget * 0.95);
    else if (frameMs < 18) this.budget = Math.min(1, this.budget * 1.02);
  }
}
