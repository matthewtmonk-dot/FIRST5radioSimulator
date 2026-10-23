// Scene renderer: owns a canvas, a cached background per view, and the effect
// system. Works from the procedural building model or a user-supplied photo
// with placed anchors. Never invents a different building between views.

import type { ScenarioInstance } from '../domain/scenario/instance';
import { windDrift } from '../domain/scenario/instance';
import type { Emitter, ImageAsset, Side } from '../domain/scenario/schema';
import { EffectSystem, type PlacedEmitter } from './effects';
import { buildSpec, buildView, type BuildingSpec, type ViewModel } from './model';
import { lightingFor, makeCamera, paintView, toScreen, type Camera } from './painter';

export interface SceneState {
  view: Side;
  emitters: Emitter[];
}

export class SceneRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement = document.createElement('canvas');
  private bgKey = '';
  private effects = new EffectSystem();
  private inst: ScenarioInstance;
  private spec: BuildingSpec;
  private vm!: ViewModel;
  private cam!: Camera;
  private photo: { asset: ImageAsset; img: HTMLImageElement; ok: boolean } | null = null;
  private photoCache = new Map<string, { img: HTMLImageElement; ok: boolean }>();
  private raf = 0;
  private last = 0;
  private view: Side = 'alpha';
  private emitters: Emitter[] = [];
  private running = false;
  reducedMotion = false;
  onPhotoError?: (view: Side) => void;

  constructor(canvas: HTMLCanvasElement, inst: ScenarioInstance) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.inst = inst;
    this.spec = buildSpec(inst.building.archetype, inst.variant);
    this.effects.night = lightingFor(inst.environment).night;
  }

  /** Redraw everything after the browser dropped the canvas (GPU reset). */
  restore() {
    this.ctx = this.canvas.getContext('2d')!;
    this.bgKey = '';
    this.layout(true);
  }

  get source(): 'photo' | 'procedural' {
    return this.photo?.ok ? 'photo' : 'procedural';
  }

  resize(cssW: number, cssH: number) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(320, Math.round(cssW * dpr));
    const h = Math.max(180, Math.round(cssH * dpr));
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.bgKey = '';
    this.layout(true);
  }

  setState(next: SceneState) {
    const viewChanged = next.view !== this.view;
    this.view = next.view;
    this.emitters = next.emitters;
    if (viewChanged) {
      this.effects.clear();
      this.bgKey = '';
    }
    this.layout(viewChanged);
  }

  private layout(immediate: boolean) {
    const W = this.canvas.width;
    const H = this.canvas.height;
    this.vm = buildView(this.spec, this.view);
    this.cam = makeCamera(this.vm, W, H);
    const asset = this.inst.images.find((i) => i.view === this.view);
    this.photo = null;
    if (asset) {
      let cached = this.photoCache.get(asset.src);
      if (!cached) {
        const img = new Image();
        cached = { img, ok: false };
        this.photoCache.set(asset.src, cached);
        img.onload = () => {
          cached!.ok = true;
          this.bgKey = '';
          this.layout(true);
        };
        img.onerror = () => {
          cached!.ok = false;
          this.onPhotoError?.(this.view);
        };
        img.src = asset.src;
      }
      this.photo = { asset, ...cached };
    }
    this.effects.wind = windDrift(this.inst.environment, this.view);
    const placed: PlacedEmitter[] = [];
    for (const e of this.emitters.filter((x) => x.view === this.view)) {
      const p = this.place(e);
      if (p) placed.push(p);
    }
    const fresh = this.effects.particles.length === 0;
    this.effects.setEmitters(placed, immediate || fresh);
    if (fresh && placed.length) this.effects.warm(this.reducedMotion ? 2 : 7);
  }

  private photoRect() {
    const img = this.photo!.img;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    return { x: (W - w) / 2, y: (H - h) / 2, w, h };
  }

  private place(e: Emitter): PlacedEmitter | null {
    const key = `${e.view}|${e.anchor}|${e.kind}`;
    if (this.photo?.ok) {
      const a = this.photo.asset.anchors[e.anchor];
      if (!a) return null;
      const r = this.photoRect();
      const pxPerFt = r.w / 90;
      return { key, kind: e.kind, color: e.color, pressure: e.pressure, intensity: 0, target: e.intensity, x: r.x + a.x * r.w, y: r.y + a.y * r.h, width: a.w * r.w * e.spread, pxPerFt, acc: 0 };
    }
    const a = this.vm.anchors[e.anchor];
    if (!a) return null;
    const face = this.vm.faces.find((f) => a.x >= f.x0 - 0.5 && a.x <= f.x1 + 0.5) ?? this.vm.faces[this.vm.faces.length - 1];
    const depth = face?.depth ?? 0;
    const [x, y] = toScreen(this.cam, a.x, a.y, depth);
    let open: PlacedEmitter['open'];
    if (a.h && a.cy !== undefined && a.h < 14) {
      const [ox, oy] = toScreen(this.cam, a.x - a.w / 2, a.cy + a.h / 2, depth);
      open = { x: ox, y: oy, w: a.w * this.cam.scale, h: a.h * this.cam.scale };
    }
    return { key, kind: e.kind, color: e.color, pressure: e.pressure, intensity: 0, target: e.intensity, x, y, width: a.w * this.cam.scale * e.spread, pxPerFt: this.cam.scale, open, acc: 0 };
  }

  private ensureBackground() {
    const key = `${this.view}:${this.canvas.width}x${this.canvas.height}:${this.photo?.ok ? this.photo.asset.src.slice(-40) : 'proc'}`;
    if (key === this.bgKey) return;
    this.bg.width = this.canvas.width;
    this.bg.height = this.canvas.height;
    const g = this.bg.getContext('2d')!;
    if (this.photo?.ok) {
      const r = this.photoRect();
      g.fillStyle = '#000';
      g.fillRect(0, 0, this.bg.width, this.bg.height);
      g.drawImage(this.photo.img, r.x, r.y, r.w, r.h);
    } else {
      paintView(g, this.cam, { spec: this.spec, vm: this.vm, env: this.inst.environment, seed: this.inst.variant, placeName: this.inst.address.placeName });
    }
    this.bgKey = key;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      // ~30 fps is plenty for smoke and saves battery
      if (dt >= 1 / 32 || this.reducedMotion) {
        const t0 = performance.now();
        this.effects.update(this.reducedMotion ? dt * 0.5 : dt);
        this.draw();
        this.effects.adapt(performance.now() - t0);
        this.last = now;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  draw() {
    this.ensureBackground();
    const ctx = this.ctx;
    ctx.drawImage(this.bg, 0, 0);
    this.effects.drawGlow(ctx);
    this.effects.draw(ctx);
  }

  /** Text alternative describing what is visible (no hidden information). */
  describe(): string {
    const parts: string[] = [];
    const b = this.inst.building;
    parts.push(`${cap(this.view)} side view of a ${b.stories}-story ${b.occupancyLabel}${this.source === 'photo' ? ' (photograph)' : ''}.`);
    const vis = this.emitters.filter((e) => e.view === this.view && e.intensity > 0.05);
    if (!vis.length) parts.push('No smoke or fire visible from this side.');
    for (const e of vis) {
      const label = this.vm.anchors[e.anchor]?.label.replace(/^(\w+) /, '').replace(/-/g, ' ') ?? e.anchor;
      const amount = e.intensity > 0.6 ? 'heavy' : e.intensity > 0.3 ? 'moderate' : 'light';
      if (e.kind === 'smoke') parts.push(`${cap(amount)} ${e.color.replace('-', ' ')} smoke ${e.pressure === 'pushing' ? 'pushing' : 'drifting'} from ${label}.`);
      if (e.kind === 'fire') parts.push(`Visible flames at ${label}.`);
      if (e.kind === 'glow') parts.push(`Orange glow inside ${label}.`);
      if (e.kind === 'haze') parts.push(`Faint haze near ${label}.`);
    }
    return parts.join(' ');
  }

  /** Render one still frame offscreen (thumbnails, prompt export previews). */
  static snapshot(inst: ScenarioInstance, view: Side, emitters: Emitter[], w = 640, h = 360): string {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const r = new SceneRenderer(c, inst);
    r.resize(w, h);
    r.setState({ view, emitters });
    r.effects.warm(6);
    r.draw();
    return c.toDataURL('image/jpeg', 0.85);
  }
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
