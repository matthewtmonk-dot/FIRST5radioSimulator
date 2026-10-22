// Paints a building view (sky, ground, building, site) into a canvas. The
// result is cached per view; smoke and fire are composited on top each frame.
// Style aims for a restrained, documentary architectural rendering — clearly
// an illustration, never presented as a photograph.

import type { Environment } from '../domain/scenario/instance';
import type { Side } from '../domain/scenario/schema';
import { createRng } from '../domain/rng';
import { makeNoise2D } from './noise';
import { roofTopY, type BuildingSpec, type FaceModel, type Feature, type SiteFeature, type ViewModel } from './model';

export interface Camera {
  /** Pixels per foot. */
  scale: number;
  /** Screen x of view-x = 0. */
  ox: number;
  /** Screen y of the ground line at depth 0. */
  groundY: number;
  /** Screen pixels of vertical offset per foot of depth. */
  depthPx: number;
  width: number;
  height: number;
}

export function makeCamera(vm: ViewModel, width: number, height: number): Camera {
  const sx = (width * 0.7) / Math.max(30, vm.width);
  const sy = (height * 0.56) / Math.max(18, vm.height + 6);
  const scale = Math.min(sx, sy);
  const groundY = height * 0.8;
  return { scale, ox: (width - vm.width * scale) / 2, groundY, depthPx: scale * 0.12, width, height };
}

/** Screen position of a point on a face at a given depth. */
export function toScreen(cam: Camera, x: number, y: number, depth = 0): [number, number] {
  return [cam.ox + x * cam.scale, cam.groundY - depth * cam.depthPx - y * cam.scale];
}

// ---------------------------------------------------------------------------
// Color helpers

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export function shade(hex: string, f: number, tint?: [number, number, number], tintAmt = 0): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number, t: number) => Math.max(0, Math.min(255, Math.round(c * f * (1 - tintAmt) + t * tintAmt)));
  const t = tint ?? [0, 0, 0];
  return `rgb(${mix(r, t[0])},${mix(g, t[1])},${mix(b, t[2])})`;
}

export interface Lighting {
  sky: [string, string, string];
  ambient: number;
  tint: [number, number, number];
  tintAmt: number;
  faceLight: Record<Side, number>;
  night: boolean;
  dusk: boolean;
  haze: number;
  sunX: number;
}

export function lightingFor(env: Environment): Lighting {
  const tod = env.timeOfDay;
  const overcast = env.weather === 'overcast' || env.weather === 'light rain';
  const sky: Record<Environment['timeOfDay'], [string, string, string]> = {
    morning: ['#7fa7c9', '#b9d0e2', '#e9e6d8'],
    midday: ['#5d8fc4', '#9fc3e3', '#dfe9ef'],
    afternoon: ['#6994c2', '#a9c6df', '#ece4cf'],
    dusk: ['#2d3a5c', '#8a6f86', '#e7a36a'],
    night: ['#070b14', '#101a2c', '#1c2638'],
  };
  let s = sky[tod];
  if (overcast && tod !== 'night') s = ['#8d97a2', '#a9b1b9', '#c4c8cb'];
  if (env.weather === 'humid haze' && tod !== 'night') s = [s[0], '#c3cfd6', '#e8e6dc'];
  const sunSide: Side = (['alpha', 'bravo', 'charlie', 'delta'] as Side[])[(['morning', 'midday', 'afternoon', 'dusk', 'night'].indexOf(tod) + env.windMph) % 4];
  const faceLight: Record<Side, number> = { alpha: 0.9, bravo: 0.85, charlie: 0.9, delta: 0.85 };
  if (!overcast && tod !== 'night') faceLight[sunSide] = 1.04;
  const ambient = tod === 'night' ? 0.32 : tod === 'dusk' ? 0.72 : overcast ? 0.9 : 1;
  return {
    sky: s,
    ambient,
    tint: tod === 'night' ? [20, 30, 60] : tod === 'dusk' ? [200, 120, 80] : [255, 255, 255],
    tintAmt: tod === 'night' ? 0.35 : tod === 'dusk' ? 0.12 : 0,
    faceLight,
    night: tod === 'night',
    dusk: tod === 'dusk',
    haze: env.weather === 'humid haze' ? 0.18 : overcast ? 0.1 : 0.04,
    sunX: tod === 'morning' ? 0.15 : tod === 'afternoon' || tod === 'dusk' ? 0.85 : 0.55,
  };
}

// ---------------------------------------------------------------------------
// Textures (cached)

const texCache = new Map<string, HTMLCanvasElement>();

function noiseTexture(key: string, w: number, h: number, draw: (img: ImageData) => void): HTMLCanvasElement {
  const k = `${key}:${w}x${h}`;
  const hit = texCache.get(k);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  draw(img);
  g.putImageData(img, 0, 0);
  texCache.set(k, c);
  return c;
}

function stuccoTexture(): HTMLCanvasElement {
  const n = makeNoise2D(7);
  return noiseTexture('stucco', 256, 256, (img) => {
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++) {
        const v = n.fbm(x / 9, y / 9, 3) * 0.7 + Math.random() * 0.3;
        const i = (y * 256 + x) * 4;
        const c = v > 0.5 ? 255 : 0;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = c;
        img.data[i + 3] = Math.abs(v - 0.5) * 70;
      }
  });
}

function grassTexture(): HTMLCanvasElement {
  const n = makeNoise2D(13);
  return noiseTexture('grass', 256, 128, (img) => {
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 256; x++) {
        const v = n.fbm(x / 6, y / 3, 3);
        const i = (y * 256 + x) * 4;
        img.data[i] = 40 + v * 50;
        img.data[i + 1] = 80 + v * 70;
        img.data[i + 2] = 30 + v * 30;
        img.data[i + 3] = 255;
      }
  });
}

function asphaltTexture(): HTMLCanvasElement {
  return noiseTexture('asphalt', 256, 128, (img) => {
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 70 + Math.random() * 26;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v + 3;
      img.data[i + 3] = 255;
    }
  });
}

function sandTexture(): HTMLCanvasElement {
  const n = makeNoise2D(29);
  return noiseTexture('sand', 256, 128, (img) => {
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 256; x++) {
        const v = n.fbm(x / 14, y / 5, 3) * 0.6 + Math.random() * 0.4;
        const i = (y * 256 + x) * 4;
        img.data[i] = 205 + v * 30;
        img.data[i + 1] = 190 + v * 28;
        img.data[i + 2] = 155 + v * 25;
        img.data[i + 3] = 255;
      }
  });
}

// ---------------------------------------------------------------------------
// Painter

export interface PaintInput {
  spec: BuildingSpec;
  vm: ViewModel;
  env: Environment;
  seed: number;
  placeName?: string;
}

export function paintView(ctx: CanvasRenderingContext2D, cam: Camera, input: PaintInput) {
  const { vm, spec, env } = input;
  const L = lightingFor(env);
  const W = cam.width;
  const H = cam.height;
  const rng = createRng(input.seed + vm.view.length * 101);

  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, cam.groundY);
  sky.addColorStop(0, L.sky[0]);
  sky.addColorStop(0.6, L.sky[1]);
  sky.addColorStop(1, L.sky[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  if (!L.night && env.weather !== 'overcast' && env.weather !== 'light rain') {
    const sun = ctx.createRadialGradient(W * L.sunX, H * 0.12, 0, W * L.sunX, H * 0.12, W * 0.35);
    sun.addColorStop(0, L.dusk ? 'rgba(255,190,120,0.55)' : 'rgba(255,250,235,0.45)');
    sun.addColorStop(1, 'rgba(255,250,235,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, H);
  }
  if (env.weather === 'scattered clouds' || env.weather === 'overcast' || env.weather === 'humid haze') drawClouds(ctx, W, cam.groundY, rng, env.weather, L);
  if (L.night) drawStars(ctx, W, cam.groundY * 0.7, rng);

  // Distant tree line / horizon silhouette
  drawTreeLine(ctx, cam, rng, L, spec.ground === 'sand' && vm.view === 'charlie');

  // Ground
  drawGround(ctx, cam, spec, vm, L);

  // Building shadow
  const left = toScreen(cam, Math.min(...vm.faces.map((f) => f.x0)), 0)[0];
  const right = toScreen(cam, Math.max(...vm.faces.map((f) => f.x1)), 0)[0];
  const shadowG = ctx.createLinearGradient(0, cam.groundY - 4, 0, cam.groundY + cam.scale * 6);
  shadowG.addColorStop(0, `rgba(0,0,0,${0.32 * L.ambient})`);
  shadowG.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadowG;
  const sdx = (L.sunX - 0.5) * -cam.scale * 8;
  ctx.beginPath();
  ctx.moveTo(left - cam.scale * 1.5, cam.groundY - 2);
  ctx.lineTo(right + cam.scale * 1.5, cam.groundY - 2);
  ctx.lineTo(right + cam.scale * 3 + sdx, cam.groundY + cam.scale * 6);
  ctx.lineTo(left - cam.scale * 1 + sdx, cam.groundY + cam.scale * 6);
  ctx.closePath();
  ctx.fill();

  // Site features behind the building (z < 0 is never used) — draw far ones first
  const site = [...vm.site].sort((a, b) => a.z - b.z);
  const behind = site.filter((s) => s.kind === 'oak' && s.z > 18);
  for (const s of behind) drawSite(ctx, cam, s, L, spec, rng);

  // Building faces back to front
  for (const face of vm.faces) drawFace(ctx, cam, face, vm, spec, L, input.placeName, rng);

  // Power lines
  if (spec.powerLines.includes(vm.view)) drawPowerLines(ctx, cam, vm, L);

  // Foreground site features
  for (const s of site.filter((x) => !behind.includes(x))) drawSite(ctx, cam, s, L, spec, rng);

  // Atmosphere
  if (L.haze > 0) {
    ctx.fillStyle = L.night ? `rgba(15,20,35,${L.haze})` : `rgba(220,226,230,${L.haze})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (env.weather === 'light rain') drawRain(ctx, W, H, rng);
  if (L.night) drawStreetLight(ctx, cam, vm);
  // Vignette
  const vg = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, H * 1.05);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, `rgba(0,0,0,${L.night ? 0.55 : 0.28})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function drawClouds(ctx: CanvasRenderingContext2D, W: number, gy: number, rng: ReturnType<typeof createRng>, weather: string, L: Lighting) {
  const count = weather === 'overcast' ? 16 : 7;
  for (let i = 0; i < count; i++) {
    const x = rng.next() * W;
    const y = gy * (0.05 + rng.next() * 0.35);
    const w = W * (0.1 + rng.next() * 0.18);
    for (let j = 0; j < 6; j++) {
      const cx = x + (rng.next() - 0.5) * w;
      const cy = y + (rng.next() - 0.5) * w * 0.12;
      const r = w * (0.15 + rng.next() * 0.2);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      const base = L.dusk ? '240,200,180' : weather === 'overcast' ? '200,205,210' : '255,255,255';
      g.addColorStop(0, `rgba(${base},${weather === 'overcast' ? 0.35 : 0.55})`);
      g.addColorStop(1, `rgba(${base},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  }
}

function drawStars(ctx: CanvasRenderingContext2D, W: number, h: number, rng: ReturnType<typeof createRng>) {
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 60; i++) ctx.fillRect(rng.next() * W, rng.next() * h, 1, 1);
}

function drawTreeLine(ctx: CanvasRenderingContext2D, cam: Camera, rng: ReturnType<typeof createRng>, L: Lighting, ocean: boolean) {
  const gy = cam.groundY - cam.depthPx * 60;
  if (ocean) {
    const sea = ctx.createLinearGradient(0, gy - cam.scale * 3, 0, gy + 4);
    sea.addColorStop(0, shade('#4f7f9c', L.ambient));
    sea.addColorStop(1, shade('#7fa8b8', L.ambient));
    ctx.fillStyle = sea;
    ctx.fillRect(0, gy - cam.scale * 3, cam.width, cam.scale * 3 + 6);
    return;
  }
  // Flat coastal horizon: distant roofs, low hammock canopy and a few pines/palms,
  // softened by aerial perspective.
  const far = shade('#6f8a7a', L.ambient * 0.95, L.tint, L.tintAmt);
  const near = shade('#4e6a55', L.ambient * 0.9, L.tint, L.tintAmt);
  const unit = cam.scale * 0.55;
  for (const [color, hBase, hVar, step] of [[far, 9, 7, 5], [near, 5, 6, 4]] as const) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, gy + 2);
    let x = -unit * 4;
    while (x < cam.width + unit * 8) {
      const w = unit * (step + rng.next() * step);
      const h = unit * (hBase + rng.next() * hVar);
      ctx.quadraticCurveTo(x + w * 0.5, gy - h * 1.25, x + w, gy - h * (0.6 + rng.next() * 0.3));
      x += w;
    }
    ctx.lineTo(cam.width, gy + 2);
    ctx.closePath();
    ctx.fill();
  }
  // a few distant palms above the canopy
  for (let i = 0; i < 4; i++) {
    const px = rng.next() * cam.width;
    const h = unit * (18 + rng.next() * 12);
    palmShape(ctx, px, gy, h, far, far, rng, 0.6);
  }
}

function drawGround(ctx: CanvasRenderingContext2D, cam: Camera, spec: BuildingSpec, vm: ViewModel, L: Lighting) {
  const gy = cam.groundY - cam.depthPx * 60;
  const kind = spec.ground;
  const tex = kind === 'sand' ? sandTexture() : kind === 'asphalt' ? asphaltTexture() : grassTexture();
  const pat = ctx.createPattern(tex, 'repeat')!;
  ctx.save();
  ctx.fillStyle = pat;
  ctx.fillRect(0, gy, cam.width, cam.height - gy);
  // darken with lighting
  ctx.fillStyle = `rgba(0,0,0,${1 - L.ambient})`;
  ctx.fillRect(0, gy, cam.width, cam.height - gy);
  // Distance fade near the horizon
  const fade = ctx.createLinearGradient(0, gy, 0, cam.groundY);
  fade.addColorStop(0, `rgba(${L.night ? '20,25,35' : '200,210,215'},0.45)`);
  fade.addColorStop(1, 'rgba(200,210,215,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, gy, cam.width, cam.groundY - gy);
  // Paved front for mixed sites and residential driveways
  if (kind === 'mixed' || kind === 'lawn') {
    const front = cam.groundY + cam.scale * 9;
    const asph = ctx.createPattern(asphaltTexture(), 'repeat')!;
    ctx.fillStyle = asph;
    ctx.fillRect(0, front, cam.width, cam.height - front);
    ctx.fillStyle = `rgba(0,0,0,${1 - L.ambient})`;
    ctx.fillRect(0, front, cam.width, cam.height - front);
    // curb / sidewalk
    ctx.fillStyle = shade('#c9c6bd', L.ambient, L.tint, L.tintAmt);
    ctx.fillRect(0, front - cam.scale * 1.2, cam.width, cam.scale * 1.2);
    if (vm.view === 'alpha' && (spec.archetype === 'ranch-1story' || spec.archetype === 'residence-2story')) {
      const g = vm.features.find((f) => f.kind === 'garage');
      if (g) {
        const [x0] = toScreen(cam, g.x - 1, 0);
        const [x1] = toScreen(cam, g.x + g.w + 1, 0);
        ctx.fillStyle = shade('#c4c0b6', L.ambient, L.tint, L.tintAmt);
        ctx.beginPath();
        ctx.moveTo(x0, cam.groundY + 2);
        ctx.lineTo(x1, cam.groundY + 2);
        ctx.lineTo(x1 + cam.scale * 3, front);
        ctx.lineTo(x0 - cam.scale * 3, front);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
          const y = cam.groundY + ((front - cam.groundY) * i) / 4;
          ctx.beginPath();
          ctx.moveTo(x0 - cam.scale * 0.8 * i, y);
          ctx.lineTo(x1 + cam.scale * 0.8 * i, y);
          ctx.stroke();
        }
      }
      // walkway to the door
      const d = vm.features.find((f) => f.kind === 'door');
      if (d) {
        const [x0] = toScreen(cam, d.x, 0);
        ctx.fillStyle = shade('#cfcac0', L.ambient, L.tint, L.tintAmt);
        ctx.fillRect(x0, cam.groundY + 2, d.w * cam.scale, front - cam.groundY - 2);
      }
    }
  }
}

function wallColor(spec: BuildingSpec, _face: FaceModel, vm: ViewModel, L: Lighting, alt = false) {
  const base = alt ? spec.palette.wallAlt : spec.palette.wall;
  return shade(base, L.faceLight[vm.view] * L.ambient, L.tint, L.tintAmt);
}

function drawFace(ctx: CanvasRenderingContext2D, cam: Camera, face: FaceModel, vm: ViewModel, spec: BuildingSpec, L: Lighting, placeName: string | undefined, rng: ReturnType<typeof createRng>) {
  const b = face.block;
  const [x0, yb] = toScreen(cam, face.x0, face.base, face.depth);
  const [x1, yt] = toScreen(cam, face.x1, face.wallTop, face.depth);
  const w = x1 - x0;
  const h = yb - yt;
  const lightF = L.faceLight[vm.view] * L.ambient;

  // Pilings and under-house area
  if (face.base > 0) {
    const [, g0] = toScreen(cam, 0, 0, face.depth);
    ctx.fillStyle = shade('#3a3a38', lightF);
    ctx.fillRect(x0, yb, w, g0 - yb);
    const n = Math.max(3, Math.round((face.x1 - face.x0) / 10));
    for (let i = 0; i <= n; i++) {
      const px = x0 + (w * i) / n - cam.scale * 0.5;
      ctx.fillStyle = shade('#cfc7b5', lightF, L.tint, L.tintAmt);
      ctx.fillRect(Math.min(px, x1 - cam.scale), yb, cam.scale, g0 - yb);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(Math.min(px, x1 - cam.scale) + cam.scale * 0.7, yb, cam.scale * 0.3, g0 - yb);
    }
    // beam
    ctx.fillStyle = shade('#8f8778', lightF);
    ctx.fillRect(x0, yb - cam.scale * 0.2, w, cam.scale * 0.9);
  }

  // Wall body
  const wc = wallColor(spec, face, vm, L, b.accent);
  ctx.fillStyle = wc;
  ctx.fillRect(x0, yt, w, h);
  // Wall texture
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, yt, w, h);
  ctx.clip();
  if (b.wall === 'stucco' || b.wall === 'block') {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = ctx.createPattern(stuccoTexture(), 'repeat')!;
    ctx.fillRect(x0, yt, w, h);
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  ctx.lineWidth = Math.max(1, cam.scale * 0.05);
  if (b.wall === 'siding') {
    for (let y = yb; y > yt; y -= cam.scale * 0.6) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
    }
  } else if (b.wall === 'board') {
    for (let x = x0; x < x1; x += cam.scale * 1.4) {
      ctx.beginPath();
      ctx.moveTo(x, yt);
      ctx.lineTo(x, yb);
      ctx.stroke();
    }
  } else if (b.wall === 'block') {
    for (let y = yb, row = 0; y > yt; y -= cam.scale * 0.67, row++) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      for (let x = x0 + (row % 2) * cam.scale * 0.67; x < x1; x += cam.scale * 1.33) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - cam.scale * 0.67);
        ctx.stroke();
      }
    }
  }
  // Ambient occlusion at top (under eaves) and at the base
  const ao = ctx.createLinearGradient(0, yt, 0, yt + cam.scale * 2.2);
  ao.addColorStop(0, 'rgba(0,0,0,0.35)');
  ao.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ao;
  ctx.fillRect(x0, yt, w, cam.scale * 2.2);
  const base = ctx.createLinearGradient(0, yb - cam.scale * 0.8, 0, yb);
  base.addColorStop(0, 'rgba(0,0,0,0)');
  base.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = base;
  ctx.fillRect(x0, yb - cam.scale * 0.8, w, cam.scale * 0.8);
  // Floor bands
  for (let fl = 1; fl < b.floors; fl++) {
    const [, fy] = toScreen(cam, 0, b.base + fl * b.floorH, face.depth);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x0, fy - cam.scale * 0.25, w, cam.scale * 0.25);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(x0, fy, w, cam.scale * 0.15);
  }
  ctx.restore();
  // Corner trim
  ctx.fillStyle = shade(spec.palette.trim, lightF * 0.95, L.tint, L.tintAmt);
  ctx.fillRect(x0, yt, Math.max(2, cam.scale * 0.35), h);
  ctx.fillRect(x1 - Math.max(2, cam.scale * 0.35), yt, Math.max(2, cam.scale * 0.35), h);

  // Features on this face (excluding rooftop items, drawn after the roof)
  const feats = vm.features.filter((f) => f.block === b.id);
  for (const f of feats.filter((x) => x.kind !== 'hood' && x.kind !== 'balcony' && x.kind !== 'stair' && x.kind !== 'railing' && x.kind !== 'canopy' && x.kind !== 'sign')) {
    drawFeature(ctx, cam, f, face, spec, L, rng, placeName);
  }

  // Roof
  drawRoof(ctx, cam, face, vm, spec, L);

  // Overlays that project from the wall
  for (const f of feats.filter((x) => x.kind === 'balcony' || x.kind === 'railing' || x.kind === 'canopy' || x.kind === 'stair' || x.kind === 'sign' || x.kind === 'hood')) {
    drawFeature(ctx, cam, f, face, spec, L, rng, placeName);
  }
}

function drawRoof(ctx: CanvasRenderingContext2D, cam: Camera, face: FaceModel, vm: ViewModel, spec: BuildingSpec, L: Lighting) {
  const b = face.block;
  const r = b.roof;
  const lightF = L.faceLight[vm.view] * L.ambient;
  const oh = r.overhang;
  const [ex0, ey] = toScreen(cam, face.x0 - oh, face.wallTop, face.depth);
  const [ex1] = toScreen(cam, face.x1 + oh, face.wallTop, face.depth);
  const [, ty] = toScreen(cam, 0, roofTopY(face), face.depth);
  const faceW = face.x1 - face.x0;
  const other = vm.view === 'alpha' || vm.view === 'charlie' ? b.d1 - b.d0 : b.x1 - b.x0;
  const roofColor = shade(spec.palette.roof, lightF * 0.95, L.tint, L.tintAmt);

  if (r.type === 'flat') {
    const [, py] = toScreen(cam, 0, face.wallTop + (r.parapet ?? 0), face.depth);
    const [px0] = toScreen(cam, face.x0, 0);
    const [px1] = toScreen(cam, face.x1, 0);
    ctx.fillStyle = wallColor(spec, face, vm, L);
    ctx.fillRect(px0, py, px1 - px0, ey - py);
    ctx.fillStyle = shade(spec.palette.trim, lightF, L.tint, L.tintAmt);
    ctx.fillRect(px0 - cam.scale * 0.3, py - cam.scale * 0.35, px1 - px0 + cam.scale * 0.6, cam.scale * 0.45);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(px0, py + cam.scale * 0.1, px1 - px0, cam.scale * 0.25);
    // Rooftop units
    const units = Math.max(1, Math.round(faceW / 40));
    for (let i = 0; i < units; i++) {
      const ux = face.x0 + ((i + 0.5) * faceW) / units - 3;
      const [ux0, uy] = toScreen(cam, ux, face.wallTop + (r.parapet ?? 0) + 3, face.depth + 10);
      ctx.fillStyle = shade('#a8acae', lightF * 0.9);
      ctx.fillRect(ux0, uy, cam.scale * 6, py - uy);
    }
    return;
  }
  const ridgeAcross = face.ridgeAcross;
  let inset: number;
  if (r.type === 'hip') inset = faceW <= other ? faceW / 2 + oh : other / 2;
  else if (ridgeAcross) inset = oh * 0.2;
  else inset = -1; // gable end
  ctx.save();
  if (inset >= 0) {
    const [rx0] = toScreen(cam, face.x0 - oh + inset, 0);
    const [rx1] = toScreen(cam, face.x1 + oh - inset, 0);
    const grad = ctx.createLinearGradient(0, ty, 0, ey);
    grad.addColorStop(0, shade(spec.palette.roof, lightF * 1.12, L.tint, L.tintAmt));
    grad.addColorStop(1, roofColor);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(ex0, ey);
    ctx.lineTo(ex1, ey);
    ctx.lineTo(Math.max(rx1, rx0), ty);
    ctx.lineTo(Math.min(rx0, rx1), ty);
    ctx.closePath();
    ctx.fill();
    ctx.clip();
    roofTexture(ctx, cam, r.material, ex0, ty, ex1 - ex0, ey - ty, spec.palette.roof, lightF);
    ctx.restore();
    // hip lines
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = Math.max(1, cam.scale * 0.12);
    if (r.type === 'hip') {
      ctx.beginPath();
      ctx.moveTo(ex0, ey);
      ctx.lineTo(Math.min(rx0, rx1), ty);
      ctx.moveTo(ex1, ey);
      ctx.lineTo(Math.max(rx1, rx0), ty);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(Math.min(rx0, rx1), ty + 1);
    ctx.lineTo(Math.max(rx1, rx0), ty + 1);
    ctx.stroke();
  } else {
    // Gable end: triangular wall plus rake
    const [mx] = toScreen(cam, (face.x0 + face.x1) / 2, 0);
    const [wx0] = toScreen(cam, face.x0, 0);
    const [wx1] = toScreen(cam, face.x1, 0);
    ctx.fillStyle = wallColor(spec, face, vm, L);
    ctx.beginPath();
    ctx.moveTo(wx0, ey);
    ctx.lineTo(wx1, ey);
    ctx.lineTo(mx, ty + cam.scale * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = roofColor;
    ctx.lineWidth = cam.scale * 0.9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ex0, ey + cam.scale * 0.3);
    ctx.lineTo(mx, ty);
    ctx.lineTo(ex1, ey + cam.scale * 0.3);
    ctx.stroke();
    ctx.strokeStyle = shade(spec.palette.trim, lightF, L.tint, L.tintAmt);
    ctx.lineWidth = cam.scale * 0.25;
    ctx.beginPath();
    ctx.moveTo(ex0, ey + cam.scale * 0.6);
    ctx.lineTo(mx, ty + cam.scale * 0.4);
    ctx.lineTo(ex1, ey + cam.scale * 0.6);
    ctx.stroke();
  }
  // Fascia
  ctx.fillStyle = shade(spec.palette.trim, lightF, L.tint, L.tintAmt);
  ctx.fillRect(ex0, ey - cam.scale * 0.1, ex1 - ex0, cam.scale * 0.55);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(ex0 + cam.scale * oh * 0.5, ey + cam.scale * 0.45, ex1 - ex0 - cam.scale * oh, cam.scale * 0.35);
}

function roofTexture(ctx: CanvasRenderingContext2D, cam: Camera, m: string, x: number, y: number, w: number, h: number, color: string, lightF: number) {
  ctx.lineWidth = Math.max(1, cam.scale * 0.06);
  if (m === 'shingle') {
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    const step = cam.scale * 0.55;
    let row = 0;
    for (let yy = y + h; yy > y; yy -= step, row++) {
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
      ctx.stroke();
      for (let xx = x + (row % 2) * cam.scale * 0.8; xx < x + w; xx += cam.scale * 1.6) {
        ctx.beginPath();
        ctx.moveTo(xx, yy);
        ctx.lineTo(xx, yy - step);
        ctx.stroke();
      }
    }
    // tonal variation
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},0.04)`;
      ctx.fillRect(x + Math.random() * w, y + Math.random() * h, cam.scale * 1.6, step);
    }
  } else if (m === 'tile') {
    const step = cam.scale * 0.9;
    for (let xx = x; xx < x + w; xx += step) {
      const g = ctx.createLinearGradient(xx, 0, xx + step, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.18)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.12)');
      g.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = g;
      ctx.fillRect(xx, y, step, h);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    for (let yy = y + h; yy > y; yy -= cam.scale * 1.2) {
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
      ctx.stroke();
    }
  } else if (m === 'metal') {
    ctx.strokeStyle = shade(color, lightF * 1.3);
    for (let xx = x; xx < x + w; xx += cam.scale * 1.5) {
      ctx.beginPath();
      ctx.moveTo(xx, y);
      ctx.lineTo(xx, y + h);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x, y, w, h * 0.35);
  }
}

function glass(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, L: Lighting) {
  const g = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
  if (L.night) {
    g.addColorStop(0, '#11161e');
    g.addColorStop(1, '#070a0f');
  } else {
    g.addColorStop(0, shade('#9fb8c8', L.ambient));
    g.addColorStop(0.45, shade('#4d6474', L.ambient));
    g.addColorStop(1, shade('#26333d', L.ambient));
  }
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  if (!L.night) {
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.1, y + h);
    ctx.lineTo(x + w * 0.45, y);
    ctx.lineTo(x + w * 0.62, y);
    ctx.lineTo(x + w * 0.27, y + h);
    ctx.closePath();
    ctx.fill();
  }
}

const SIGN_NAMES = ['SEA BREEZE MARKET', 'CORAL CAFE', 'TIDES DELI', 'DUNES NAILS', 'HARBOR INSURANCE', 'SURF & TACKLE', 'PELICAN PIZZA', 'SANDBAR GRILL'];

function drawFeature(ctx: CanvasRenderingContext2D, cam: Camera, f: Feature & { x: number; yAbs: number; depth: number }, face: FaceModel, spec: BuildingSpec, L: Lighting, rng: ReturnType<typeof createRng>, placeName?: string) {
  const [x, yBottom] = toScreen(cam, f.x, f.yAbs, face.depth);
  const w = f.w * cam.scale;
  const h = f.h * cam.scale;
  const y = yBottom - h;
  const s = cam.scale;
  const lightF = L.ambient;
  const trim = shade(spec.palette.trim, lightF, L.tint, L.tintAmt);
  switch (f.kind) {
    case 'window':
    case 'shutter-window': {
      ctx.fillStyle = trim;
      ctx.fillRect(x - s * 0.3, y - s * 0.3, w + s * 0.6, h + s * 0.6);
      glass(ctx, x, y, w, h, L);
      ctx.fillStyle = trim;
      ctx.fillRect(x, y + h / 2 - s * 0.08, w, s * 0.16);
      if (w > s * 4) ctx.fillRect(x + w / 2 - s * 0.08, y, s * 0.16, h);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(x - s * 0.4, y + h + s * 0.3, w + s * 0.8, s * 0.2);
      if (L.night && rng.chance(0.25)) {
        ctx.fillStyle = 'rgba(255,214,150,0.35)';
        ctx.fillRect(x, y, w, h);
      }
      break;
    }
    case 'door': {
      ctx.fillStyle = trim;
      ctx.fillRect(x - s * 0.35, y - s * 0.35, w + s * 0.7, h + s * 0.35);
      ctx.fillStyle = shade(spec.palette.door, lightF, L.tint, L.tintAmt);
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = Math.max(1, s * 0.08);
      ctx.strokeRect(x + w * 0.15, y + h * 0.08, w * 0.7, h * 0.36);
      ctx.strokeRect(x + w * 0.15, y + h * 0.52, w * 0.7, h * 0.4);
      ctx.fillStyle = '#c9b37a';
      ctx.fillRect(x + w * 0.8, y + h * 0.5, s * 0.25, s * 0.25);
      break;
    }
    case 'garage': {
      ctx.fillStyle = trim;
      ctx.fillRect(x - s * 0.5, y - s * 0.5, w + s, h + s * 0.5);
      ctx.fillStyle = shade(spec.palette.garage, lightF * 0.95, L.tint, L.tintAmt);
      ctx.fillRect(x, y, w, h);
      for (let i = 1; i < 4; i++) {
        ctx.fillStyle = 'rgba(0,0,0,0.13)';
        ctx.fillRect(x, y + (h * i) / 4 - s * 0.06, w, s * 0.12);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 8; c++) ctx.strokeRect(x + (w * c) / 8 + s * 0.2, y + (h * r) / 4 + s * 0.25, w / 8 - s * 0.4, h / 4 - s * 0.5);
      // shadow under header
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x, y, w, s * 0.4);
      break;
    }
    case 'slider': {
      ctx.fillStyle = shade('#dedad2', lightF);
      ctx.fillRect(x - s * 0.25, y - s * 0.25, w + s * 0.5, h + s * 0.25);
      glass(ctx, x, y, w / 2, h, L);
      glass(ctx, x + w / 2, y, w / 2, h, L);
      ctx.fillStyle = shade('#dedad2', lightF);
      ctx.fillRect(x + w / 2 - s * 0.1, y, s * 0.2, h);
      break;
    }
    case 'storefront': {
      ctx.fillStyle = shade('#8d9093', lightF);
      ctx.fillRect(x - s * 0.3, y - s * 0.3, w + s * 0.6, h + s * 0.3);
      glass(ctx, x, y, w, h, L);
      ctx.fillStyle = shade('#8d9093', lightF);
      const panes = Math.max(2, Math.round(f.w / 5));
      for (let i = 1; i < panes; i++) ctx.fillRect(x + (w * i) / panes - s * 0.08, y, s * 0.16, h);
      ctx.fillRect(x, y + h * 0.75, w, s * 0.15);
      // dim interior with displays
      ctx.fillStyle = 'rgba(30,30,35,0.35)';
      ctx.fillRect(x, y + h * 0.4, w, h * 0.35);
      if (L.night) {
        ctx.fillStyle = 'rgba(255,240,210,0.25)';
        ctx.fillRect(x, y, w, h);
      }
      break;
    }
    case 'gable-vent':
    case 'louver': {
      ctx.fillStyle = trim;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let i = 0; i < 4; i++) ctx.fillRect(x + s * 0.15, y + (h * (i + 0.3)) / 4, w - s * 0.3, h / 10);
      break;
    }
    case 'meter': {
      ctx.fillStyle = shade('#9da3a6', lightF);
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h * 0.4, Math.min(w, h) * 0.25, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'ac': {
      ctx.fillStyle = shade('#b8bcbd', lightF);
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h * 0.45, Math.min(w, h) * 0.35, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'hood': {
      ctx.fillStyle = shade('#a3a7aa', lightF);
      ctx.fillRect(x + w * 0.3, y + h * 0.4, w * 0.4, h * 0.6);
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h * 0.4, w / 2, h * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'sign': {
      ctx.fillStyle = shade('#f4f1e8', lightF);
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = shade(spec.palette.accent, lightF * 0.8);
      ctx.fillRect(x, y + h * 0.82, w, h * 0.18);
      ctx.fillStyle = shade('#2c3a4a', lightF);
      ctx.font = `600 ${Math.max(8, h * 0.5)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const name = f.id === 'sign' && placeName ? placeName.toUpperCase() : SIGN_NAMES[(Math.abs(Math.round(f.x)) + spec.width) % SIGN_NAMES.length];
      ctx.fillText(name, x + w / 2, y + h * 0.42, w * 0.92);
      break;
    }
    case 'balcony': {
      // slab edge
      const [, slabY] = toScreen(cam, 0, f.yAbs, face.depth);
      ctx.fillStyle = shade('#d6d2c8', lightF);
      ctx.fillRect(x, slabY - s * 0.5, w, s * 0.6);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x, slabY + s * 0.1, w, s * 0.5);
      ctx.strokeStyle = shade('#f5f5f2', lightF);
      ctx.lineWidth = Math.max(1, s * 0.12);
      ctx.beginPath();
      ctx.moveTo(x, slabY - h);
      ctx.lineTo(x + w, slabY - h);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, s * 0.07);
      for (let bx = x; bx <= x + w; bx += s * 0.7) {
        ctx.beginPath();
        ctx.moveTo(bx, slabY - h);
        ctx.lineTo(bx, slabY - s * 0.5);
        ctx.stroke();
      }
      break;
    }
    case 'railing': {
      const [, ry] = toScreen(cam, 0, f.yAbs, face.depth);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x, ry, w, s * 0.6);
      ctx.fillStyle = shade('#d9d6cf', lightF);
      ctx.fillRect(x, ry - s * 0.4, w, s * 0.5);
      ctx.strokeStyle = shade('#ecebe7', lightF);
      ctx.lineWidth = Math.max(1, s * 0.1);
      ctx.beginPath();
      ctx.moveTo(x, ry - h);
      ctx.lineTo(x + w, ry - h);
      ctx.stroke();
      for (let bx = x; bx <= x + w; bx += s * 0.6) {
        ctx.beginPath();
        ctx.moveTo(bx, ry - h);
        ctx.lineTo(bx, ry - s * 0.4);
        ctx.stroke();
      }
      break;
    }
    case 'walkway': {
      if (f.h > 5) {
        // breezeway opening
        ctx.fillStyle = 'rgba(25,25,28,0.75)';
        ctx.fillRect(x, y, w, h);
        for (let fl = 1; fl < 3; fl++) {
          const [, fy] = toScreen(cam, 0, f.yAbs + fl * 9.5, face.depth);
          ctx.fillStyle = shade('#cdc8be', lightF);
          ctx.fillRect(x, fy - s * 0.6, w, s * 0.6);
        }
      }
      break;
    }
    case 'stair': {
      ctx.strokeStyle = shade('#e7e4dc', lightF);
      ctx.lineWidth = Math.max(2, s * 0.3);
      ctx.beginPath();
      ctx.moveTo(x, yBottom);
      ctx.lineTo(x + w, y);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, s * 0.1);
      const steps = Math.max(4, Math.round(f.h / 0.7));
      for (let i = 0; i < steps; i++) {
        const sx = x + (w * i) / steps;
        const sy = yBottom - (h * i) / steps;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + w / steps, sy);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(x, yBottom - s * 3);
      ctx.lineTo(x + w, y - s * 3);
      ctx.stroke();
      break;
    }
    case 'canopy': {
      ctx.fillStyle = shade(spec.palette.accent, lightF * 0.9, L.tint, L.tintAmt);
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x, y + h, w, s * 1.2);
      break;
    }
  }
}

function palmShape(ctx: CanvasRenderingContext2D, x: number, groundY: number, height: number, trunk: string, frond: string, rng: ReturnType<typeof createRng>, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const lean = (rng.next() - 0.5) * height * 0.12;
  const topX = x + lean;
  const topY = groundY - height;
  // trunk: slightly tapered with ring texture
  const tw = Math.max(2, height * 0.04);
  ctx.fillStyle = trunk;
  ctx.beginPath();
  ctx.moveTo(x - tw * 0.6, groundY);
  ctx.quadraticCurveTo(x + lean * 0.3 - tw * 0.5, groundY - height * 0.5, topX - tw * 0.4, topY);
  ctx.lineTo(topX + tw * 0.4, topY);
  ctx.quadraticCurveTo(x + lean * 0.3 + tw * 0.5, groundY - height * 0.5, x + tw * 0.6, groundY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 14; i++) {
    const t = i / 14;
    const yy = groundY - height * t;
    const xx = x + (topX - x) * t * t;
    ctx.beginPath();
    ctx.moveTo(xx - tw * 0.5, yy);
    ctx.lineTo(xx + tw * 0.5, yy + 1);
    ctx.stroke();
  }
  // crown: fan fronds radiating, upper ones rising, lower ones drooping
  const fronds = 16;
  for (let i = 0; i < fronds; i++) {
    const a = -Math.PI + (i / (fronds - 1)) * Math.PI + (rng.next() - 0.5) * 0.25;
    const len = height * (0.2 + rng.next() * 0.09);
    const droop = Math.abs(Math.cos(a)) * len * 0.55;
    const ex = topX + Math.cos(a) * len;
    const ey = topY + Math.sin(a) * len * 0.75 + droop;
    const cx = topX + Math.cos(a) * len * 0.55;
    const cy = topY + Math.sin(a) * len * 0.8 - len * 0.12;
    const wdt = len * 0.16;
    const nx = -(ey - topY) / len;
    const ny = (ex - topX) / len;
    ctx.fillStyle = i % 3 === 0 ? shadeStr(frond, 0.8) : frond;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(cx + nx * wdt, cy + ny * wdt, ex, ey);
    ctx.quadraticCurveTo(cx - nx * wdt, cy - ny * wdt, topX, topY);
    ctx.fill();
  }
  // a few hanging dead fronds under the crown
  ctx.strokeStyle = shadeStr(trunk, 0.9);
  ctx.lineWidth = Math.max(1, height * 0.012);
  for (let i = 0; i < 3; i++) {
    const dx = (rng.next() - 0.5) * height * 0.12;
    ctx.beginPath();
    ctx.moveTo(topX, topY + height * 0.02);
    ctx.quadraticCurveTo(topX + dx * 1.5, topY + height * 0.06, topX + dx, topY + height * 0.14);
    ctx.stroke();
  }
  ctx.restore();
}

function shadeStr(color: string, f: number): string {
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(color);
  if (m) return `rgb(${Math.round(+m[1] * f)},${Math.round(+m[2] * f)},${Math.round(+m[3] * f)})`;
  return color.startsWith('#') ? shade(color, f) : color;
}

function drawSite(ctx: CanvasRenderingContext2D, cam: Camera, s: SiteFeature, L: Lighting, spec: BuildingSpec, rng: ReturnType<typeof createRng>) {
  const sc = (s.scale ?? 1) * (1 + s.z * 0.004);
  const [x, gy] = [cam.ox + s.u * cam.scale, cam.groundY + s.z * cam.depthPx * 1.2];
  const ft = cam.scale * sc;
  const amb = L.ambient;
  switch (s.kind) {
    case 'palm':
      palmShape(ctx, x, gy, ft * 26, shade('#8a7a60', amb, L.tint, L.tintAmt), shade('#3e6b3a', amb, L.tint, L.tintAmt), rng);
      break;
    case 'shrub': {
      for (let i = 0; i < 6; i++) {
        const cx = x + (rng.next() - 0.2) * ft * 4;
        const r = ft * (0.9 + rng.next() * 0.9);
        const g = ctx.createRadialGradient(cx - r * 0.3, gy - r * 1.2, r * 0.2, cx, gy - r, r);
        g.addColorStop(0, shade('#5a8a4c', amb, L.tint, L.tintAmt));
        g.addColorStop(1, shade('#2c4a28', amb, L.tint, L.tintAmt));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, gy - r * 0.9, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'oak': {
      ctx.fillStyle = shade('#5b4a3a', amb, L.tint, L.tintAmt);
      ctx.fillRect(x - ft * 0.8, gy - ft * 12, ft * 1.6, ft * 12);
      for (let i = 0; i < 14; i++) {
        const cx = x + (rng.next() - 0.5) * ft * 26;
        const cy = gy - ft * (14 + rng.next() * 10);
        const r = ft * (4 + rng.next() * 5);
        const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
        g.addColorStop(0, shade('#5d7f4a', amb, L.tint, L.tintAmt));
        g.addColorStop(1, shade('#2e4529', amb, L.tint, L.tintAmt));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'car':
    case 'pickup': {
      const len = ft * (s.kind === 'pickup' ? 18 : 15);
      const hgt = ft * (s.kind === 'pickup' ? 5.8 : 4.6);
      const body = shade(s.color ?? '#999999', amb, L.tint, L.tintAmt);
      const x0 = x;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(x0 + len / 2, gy, len * 0.55, ft * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(x0, gy - ft * 1);
      ctx.lineTo(x0, gy - hgt * 0.55);
      ctx.lineTo(x0 + len * 0.22, gy - hgt * 0.6);
      ctx.lineTo(x0 + len * 0.32, gy - hgt);
      ctx.lineTo(x0 + (s.kind === 'pickup' ? len * 0.62 : len * 0.72), gy - hgt);
      ctx.lineTo(x0 + (s.kind === 'pickup' ? len * 0.66 : len * 0.84), gy - hgt * 0.6);
      ctx.lineTo(x0 + len, gy - hgt * 0.55);
      ctx.lineTo(x0 + len, gy - ft * 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = L.night ? '#0c0f14' : shade('#3b4a55', amb);
      ctx.beginPath();
      ctx.moveTo(x0 + len * 0.26, gy - hgt * 0.62);
      ctx.lineTo(x0 + len * 0.34, gy - hgt * 0.94);
      ctx.lineTo(x0 + (s.kind === 'pickup' ? len * 0.6 : len * 0.7), gy - hgt * 0.94);
      ctx.lineTo(x0 + (s.kind === 'pickup' ? len * 0.63 : len * 0.8), gy - hgt * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x0, gy - hgt * 0.55, len, ft * 0.25);
      for (const wx of [0.2, 0.8]) {
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(x0 + len * wx, gy - ft * 1, ft * 1.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#777';
        ctx.beginPath();
        ctx.arc(x0 + len * wx, gy - ft * 1, ft * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'hydrant': {
      ctx.fillStyle = shade('#d9b51e', amb);
      ctx.fillRect(x, gy - ft * 2.6, ft * 0.9, ft * 2.6);
      ctx.beginPath();
      ctx.arc(x + ft * 0.45, gy - ft * 2.6, ft * 0.5, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(x - ft * 0.3, gy - ft * 1.8, ft * 1.5, ft * 0.4);
      break;
    }
    case 'mailbox': {
      ctx.fillStyle = shade('#6b5a44', amb);
      ctx.fillRect(x, gy - ft * 3.5, ft * 0.3, ft * 3.5);
      ctx.fillStyle = shade('#3a3d40', amb);
      ctx.fillRect(x - ft * 0.5, gy - ft * 4.2, ft * 1.4, ft * 0.8);
      break;
    }
    case 'fence': {
      ctx.fillStyle = shade('#a08c6c', amb, L.tint, L.tintAmt);
      ctx.fillRect(x, gy - ft * 6, ft * 14, ft * 6);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      for (let i = 0; i < 28; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * ft * 0.5, gy - ft * 6);
        ctx.lineTo(x + i * ft * 0.5, gy);
        ctx.stroke();
      }
      break;
    }
    case 'dumpster': {
      ctx.fillStyle = shade('#2f5a3e', amb);
      ctx.fillRect(x, gy - ft * 4.5, ft * 6.5, ft * 4.5);
      ctx.fillStyle = shade('#264a33', amb);
      ctx.fillRect(x - ft * 0.2, gy - ft * 4.9, ft * 6.9, ft * 0.5);
      break;
    }
    case 'pump-island': {
      // Fuel canopy with columns and pumps
      ctx.fillStyle = shade('#b9bec2', amb);
      ctx.fillRect(x + ft * 4, gy - ft * 15, ft * 1, ft * 15);
      ctx.fillRect(x + ft * 24, gy - ft * 15, ft * 1, ft * 15);
      ctx.fillStyle = shade('#f2f2ef', amb);
      ctx.fillRect(x - ft * 2, gy - ft * 18, ft * 34, ft * 3);
      ctx.fillStyle = shade(spec.palette.accent, amb);
      ctx.fillRect(x - ft * 2, gy - ft * 16.2, ft * 34, ft * 1.2);
      for (const px of [8, 18]) {
        ctx.fillStyle = shade('#e6e6e2', amb);
        ctx.fillRect(x + ft * px, gy - ft * 5.5, ft * 2.5, ft * 5.5);
        ctx.fillStyle = shade('#c0392b', amb);
        ctx.fillRect(x + ft * px, gy - ft * 5.5, ft * 2.5, ft * 1);
      }
      break;
    }
    case 'parking-lines': {
      ctx.strokeStyle = `rgba(240,240,235,${0.55 * amb})`;
      ctx.lineWidth = Math.max(1, ft * 0.25);
      for (let i = 0; i < 18; i++) {
        const lx = x + i * ft * 9.5;
        ctx.beginPath();
        ctx.moveTo(lx, gy - ft * 2);
        ctx.lineTo(lx + ft * 3, gy + ft * 3);
        ctx.stroke();
      }
      break;
    }
    case 'seaoats': {
      ctx.strokeStyle = shade('#a4a46a', amb, L.tint, L.tintAmt);
      ctx.lineWidth = Math.max(1, ft * 0.08);
      for (let i = 0; i < 26; i++) {
        const bx = x + rng.next() * ft * 12;
        const hh = ft * (2 + rng.next() * 3);
        ctx.beginPath();
        ctx.moveTo(bx, gy);
        ctx.quadraticCurveTo(bx + ft * 0.4, gy - hh * 0.6, bx + ft * (rng.next() - 0.3), gy - hh);
        ctx.stroke();
      }
      break;
    }
    case 'dune': {
      ctx.fillStyle = shade('#d9c9a0', amb, L.tint, L.tintAmt);
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.quadraticCurveTo(x + ft * 40, gy - ft * 8, x + ft * 90, gy - ft * 2);
      ctx.quadraticCurveTo(x + ft * 140, gy - ft * 6, x + ft * 200, gy);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'boat': {
      ctx.fillStyle = shade('#f0f0ee', amb);
      ctx.beginPath();
      ctx.moveTo(x, gy - ft * 4);
      ctx.lineTo(x + ft * 18, gy - ft * 4);
      ctx.lineTo(x + ft * 15, gy - ft * 1.5);
      ctx.lineTo(x + ft * 2, gy - ft * 1.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(x + ft * 8, gy - ft * 1, ft, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'pole':
      break;
  }
}

function drawPowerLines(ctx: CanvasRenderingContext2D, cam: Camera, vm: ViewModel, L: Lighting) {
  const poles = [-18, vm.width + 14];
  const topFt = 30;
  const [, gy] = toScreen(cam, 0, 0, -12);
  const pts = poles.map((p) => toScreen(cam, p, topFt, -12));
  ctx.fillStyle = shade('#5b4b3a', L.ambient);
  for (const [px] of pts) {
    ctx.fillRect(px - cam.scale * 0.45, pts[0][1] - cam.scale, cam.scale * 0.9, gy - pts[0][1] + cam.scale);
    ctx.fillRect(px - cam.scale * 3, pts[0][1], cam.scale * 6, cam.scale * 0.5);
  }
  ctx.strokeStyle = 'rgba(20,20,20,0.75)';
  ctx.lineWidth = Math.max(1, cam.scale * 0.08);
  for (const dy of [0, 0.4, 2.5]) {
    const [ax, ay] = pts[0];
    const [bx, by] = pts[1];
    ctx.beginPath();
    ctx.moveTo(ax - cam.width, ay + dy * cam.scale);
    ctx.lineTo(ax, ay + dy * cam.scale);
    ctx.quadraticCurveTo((ax + bx) / 2, ay + (dy + 3) * cam.scale, bx, by + dy * cam.scale);
    ctx.lineTo(bx + cam.width, by + dy * cam.scale);
    ctx.stroke();
  }
}

function drawRain(ctx: CanvasRenderingContext2D, W: number, H: number, rng: ReturnType<typeof createRng>) {
  ctx.strokeStyle = 'rgba(200,210,220,0.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 260; i++) {
    const x = rng.next() * W;
    const y = rng.next() * H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 3, y + 14);
    ctx.stroke();
  }
}

function drawStreetLight(ctx: CanvasRenderingContext2D, cam: Camera, vm: ViewModel) {
  const [x, y] = toScreen(cam, vm.width + 8, 22, -20);
  const g = ctx.createRadialGradient(x, y, 0, x, y, cam.scale * 30);
  g.addColorStop(0, 'rgba(255,200,130,0.35)');
  g.addColorStop(1, 'rgba(255,200,130,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - cam.scale * 30, y - cam.scale * 30, cam.scale * 60, cam.scale * 60);
}
