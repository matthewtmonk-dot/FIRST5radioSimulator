// Pure building geometry. Each archetype is described once as 3D-ish blocks
// (footprint + floors + roof) with features on each face. Every view (Alpha,
// Bravo, Charlie, Delta) is derived from the same description, which keeps
// the building consistent as the incident evolves and as views are revealed.
// No DOM access here — the validator and tests use this module too.

import { createRng } from '../domain/rng';
import type { Archetype, Side } from '../domain/scenario/schema';

export type RoofType = 'hip' | 'gable-x' | 'gable-d' | 'flat' | 'shed';
export type Material = 'shingle' | 'tile' | 'metal' | 'membrane';
export type WallType = 'stucco' | 'siding' | 'block' | 'brick' | 'board';

export interface Block {
  id: string;
  x0: number;
  x1: number;
  d0: number;
  d1: number;
  base: number;
  floors: number;
  floorH: number;
  roof: { type: RoofType; rise: number; overhang: number; material: Material; parapet?: number };
  wall: WallType;
  /** Optional wall color override index into palette accents. */
  accent?: boolean;
}

export type FeatureKind =
  | 'window'
  | 'door'
  | 'garage'
  | 'slider'
  | 'storefront'
  | 'gable-vent'
  | 'louver'
  | 'sign'
  | 'balcony'
  | 'stair'
  | 'meter'
  | 'ac'
  | 'hood'
  | 'railing'
  | 'canopy'
  | 'walkway'
  | 'shutter-window';

export interface Feature {
  id?: string;
  face: Side;
  block: string;
  kind: FeatureKind;
  /** Position along the face from the viewer's left, in feet. */
  u: number;
  /** Height above the block base, feet. */
  y: number;
  w: number;
  h: number;
  floor?: number;
  label?: string;
}

export type SiteKind = 'palm' | 'shrub' | 'oak' | 'car' | 'pickup' | 'hydrant' | 'pole' | 'fence' | 'dumpster' | 'pump-island' | 'mailbox' | 'seaoats' | 'parking-lines' | 'dune' | 'boat';

export interface SiteFeature {
  kind: SiteKind;
  view: Side | 'all';
  /** Feet from the left edge of the building face (may be negative or beyond width). */
  u: number;
  /** Distance in front of the face, feet (positive = closer to viewer). */
  z: number;
  scale?: number;
  color?: string;
  flip?: boolean;
  id?: string;
}

export interface Palette {
  wall: string;
  wallAlt: string;
  trim: string;
  roof: string;
  door: string;
  garage: string;
  accent: string;
}

export interface BuildingSpec {
  archetype: Archetype;
  width: number; // alpha frontage, ft
  depth: number; // ft
  blocks: Block[];
  features: Feature[];
  site: SiteFeature[];
  palette: Palette;
  ground: 'lawn' | 'sand' | 'asphalt' | 'mixed';
  /** Overhead power lines across the given views. */
  powerLines: Side[];
}

export interface Anchor {
  id: string;
  x: number; // ft from view left
  y: number; // ft above grade
  w: number; // ft — width of the opening/area
  /** Opening height and center (ft), for interior glow. */
  h?: number;
  cy?: number;
  label: string;
  floor?: number;
}

export interface ViewModel {
  view: Side;
  width: number;
  height: number;
  /** Visible block faces sorted back-to-front. */
  faces: FaceModel[];
  features: (Feature & { x: number; yAbs: number; depth: number })[];
  site: SiteFeature[];
  anchors: Record<string, Anchor>;
}

export interface FaceModel {
  block: Block;
  /** Left/right in view feet. */
  x0: number;
  x1: number;
  /** Distance from the viewer's reference plane (smaller = closer). */
  depth: number;
  base: number;
  wallTop: number;
  /** Ridge runs across the view (true) or toward the viewer (false). */
  ridgeAcross: boolean;
}

// ---------------------------------------------------------------------------
// Palettes

const PALETTES: Palette[] = [
  { wall: '#d9cdb4', wallAlt: '#cbbd9f', trim: '#f4f1ea', roof: '#5c5650', door: '#3e5560', garage: '#ece8de', accent: '#7c9a8e' },
  { wall: '#c9d6d3', wallAlt: '#b7c6c3', trim: '#fbfbf8', roof: '#4a4d52', door: '#7a3b2e', garage: '#f0efe9', accent: '#5f7f88' },
  { wall: '#e8dcc2', wallAlt: '#dacba9', trim: '#ffffff', roof: '#9b5a3c', door: '#2f4a3a', garage: '#f2ede2', accent: '#c58b5b' },
  { wall: '#e6e1d6', wallAlt: '#d6d0c2', trim: '#f9f9f6', roof: '#6b6f73', door: '#24425f', garage: '#efeee8', accent: '#9aa8a0' },
  { wall: '#d8c3a6', wallAlt: '#c8b090', trim: '#f3ede2', roof: '#47433e', door: '#5a3a2a', garage: '#ebe4d6', accent: '#8a6f55' },
  { wall: '#bfd0dc', wallAlt: '#a9bdcb', trim: '#ffffff', roof: '#8a8f94', door: '#1f3b57', garage: '#f4f5f6', accent: '#6d8ba0' },
  { wall: '#efe6cf', wallAlt: '#e2d6b8', trim: '#ffffff', roof: '#b3684a', door: '#356b6b', garage: '#f6f1e4', accent: '#d39b63' },
];

// ---------------------------------------------------------------------------
// Archetype builders

type Builder = (variant: number) => BuildingSpec;

const win = (face: Side, block: string, id: string, u: number, y: number, w = 4, h = 4.5, floor = 1): Feature => ({ id, face, block, kind: 'window', u, y, w, h, floor });

function ranch(variant: number): BuildingSpec {
  const r = createRng(variant);
  const tile = r.chance(0.4);
  const W = 72;
  const D = 38;
  const roof = { type: 'hip' as RoofType, rise: 7, overhang: 1.5, material: (tile ? 'tile' : 'shingle') as Material };
  const blocks: Block[] = [
    { id: 'main', x0: 0, x1: 50, d0: 0, d1: D, base: 0, floors: 1, floorH: 9, roof, wall: 'stucco' },
    { id: 'garage', x0: 50, x1: W, d0: -3, d1: 24, base: 0, floors: 1, floorH: 9, roof: { ...roof, rise: 5.5 }, wall: 'stucco' },
  ];
  const f: Feature[] = [
    win('alpha', 'main', 'win-a1', 6, 3, 5, 4.5),
    win('alpha', 'main', 'win-a2', 17, 3, 6, 4.5),
    { id: 'front-door', face: 'alpha', block: 'main', kind: 'door', u: 30, y: 0, w: 3.5, h: 7, floor: 1 },
    win('alpha', 'main', 'win-a3', 38, 3, 5, 4.5),
    { id: 'garage-door', face: 'alpha', block: 'garage', kind: 'garage', u: 53, y: 0, w: 16, h: 7.5, floor: 1 },
    // Bravo (left end): viewer sees depth; u from charlie end (left) to alpha end (right)
    win('bravo', 'main', 'win-b1', 8, 3, 4, 4.5),
    win('bravo', 'main', 'win-b2', 24, 3, 4, 4.5),
    { id: 'ac-unit', face: 'bravo', block: 'main', kind: 'ac', u: 15, y: 0, w: 3, h: 3 },
    // Charlie (rear, mirrored): garage now on the left
    { id: 'rear-garage-door', face: 'charlie', block: 'garage', kind: 'door', u: 9, y: 0, w: 3, h: 7, floor: 1 },
    win('charlie', 'main', 'win-c1', 28, 3, 4, 4.5),
    { id: 'slider-c', face: 'charlie', block: 'main', kind: 'slider', u: 38, y: 0, w: 8, h: 7, floor: 1 },
    win('charlie', 'main', 'win-c2', 58, 3, 5, 4.5),
    // Delta (right end): garage side wall nearest Alpha (right side of this view)
    { id: 'garage-side-door', face: 'delta', block: 'garage', kind: 'door', u: 10, y: 0, w: 3, h: 7, floor: 1 },
    win('delta', 'garage', 'win-d1', 16, 3.5, 3, 3),
    { id: 'meter', face: 'delta', block: 'garage', kind: 'meter', u: 4, y: 3.5, w: 1.2, h: 1.6 },
    win('delta', 'main', 'win-d2', 31, 3, 4, 4.5),
  ];
  return {
    archetype: 'ranch-1story',
    width: W,
    depth: D,
    blocks,
    features: f,
    site: [
      { kind: 'palm', view: 'alpha', u: -8, z: 14, scale: 1 },
      { kind: 'shrub', view: 'alpha', u: 4, z: 3 },
      { kind: 'shrub', view: 'alpha', u: 22, z: 3 },
      { kind: 'shrub', view: 'alpha', u: 40, z: 3 },
      { kind: r.chance(0.5) ? 'car' : 'pickup', view: 'alpha', u: 54, z: 20, color: r.pick(['#8c2f2f', '#2f3f5c', '#c9c9c9', '#1f1f1f', '#e6e6e6']) },
      { kind: 'mailbox', view: 'alpha', u: 78, z: 34 },
      { kind: 'palm', view: 'alpha', u: 76, z: 10, scale: 0.85 },
      { kind: 'palm', view: 'charlie', u: 64, z: 10, scale: 0.9 },
      { kind: 'fence', view: 'charlie', u: -10, z: 16 },
      { kind: 'shrub', view: 'bravo', u: 30, z: 3 },
      { kind: 'oak', view: 'delta', u: 44, z: 20 },
    ],
    palette: r.pick(PALETTES),
    ground: 'lawn',
    powerLines: [],
  };
}

function twoStory(variant: number): BuildingSpec {
  const r = createRng(variant + 11);
  const W = 64;
  const D = 36;
  const roof = { type: 'gable-x' as RoofType, rise: 8, overhang: 1.5, material: 'shingle' as Material };
  const blocks: Block[] = [
    { id: 'main', x0: 0, x1: 42, d0: 0, d1: D, base: 0, floors: 2, floorH: 9.5, roof, wall: r.chance(0.5) ? 'siding' : 'stucco' },
    { id: 'garage', x0: 42, x1: W, d0: -2, d1: 24, base: 0, floors: 1, floorH: 9.5, roof: { ...roof, rise: 5 }, wall: 'stucco' },
  ];
  const f: Feature[] = [
    win('alpha', 'main', 'win-a1-1', 5, 3, 5, 5),
    { id: 'front-door', face: 'alpha', block: 'main', kind: 'door', u: 19, y: 0, w: 3.5, h: 7.5, floor: 1 },
    win('alpha', 'main', 'win-a1-2', 30, 3, 6, 5),
    win('alpha', 'main', 'win-a2-1', 5, 12.5, 4.5, 4.5, 2),
    win('alpha', 'main', 'win-a2-2', 18.5, 12.5, 4.5, 4.5, 2),
    win('alpha', 'main', 'win-a2-3', 31, 12.5, 4.5, 4.5, 2),
    { id: 'garage-door', face: 'alpha', block: 'garage', kind: 'garage', u: 45, y: 0, w: 16, h: 7.5, floor: 1 },
    win('bravo', 'main', 'win-b1', 10, 3, 4, 4.5),
    win('bravo', 'main', 'win-b2', 22, 12.5, 4, 4.5, 2),
    { id: 'gable-b', face: 'bravo', block: 'main', kind: 'gable-vent', u: 16.5, y: 21, w: 2.5, h: 2.5 },
    { id: 'ac-unit', face: 'bravo', block: 'main', kind: 'ac', u: 28, y: 0, w: 3, h: 3 },
    { id: 'rear-garage-door', face: 'charlie', block: 'garage', kind: 'door', u: 9, y: 0, w: 3, h: 7, floor: 1 },
    { id: 'slider-c', face: 'charlie', block: 'main', kind: 'slider', u: 28, y: 0, w: 8, h: 7, floor: 1 },
    win('charlie', 'main', 'win-c1-1', 46, 3, 5, 4.5),
    win('charlie', 'main', 'win-c2-1', 26, 12.5, 4.5, 4.5, 2),
    win('charlie', 'main', 'win-c2-2', 46, 12.5, 4.5, 4.5, 2),
    { id: 'meter', face: 'delta', block: 'garage', kind: 'meter', u: 5, y: 3.5, w: 1.2, h: 1.6 },
    win('delta', 'main', 'win-d2', 26, 12.5, 4, 4.5, 2),
    { id: 'gable-d', face: 'delta', block: 'main', kind: 'gable-vent', u: 19.5, y: 21, w: 2.5, h: 2.5 },
  ];
  return {
    archetype: 'residence-2story',
    width: W,
    depth: D,
    blocks,
    features: f,
    site: [
      { kind: 'oak', view: 'alpha', u: -14, z: 18, scale: 1.1 },
      { kind: 'shrub', view: 'alpha', u: 6, z: 3 },
      { kind: 'shrub', view: 'alpha', u: 32, z: 3 },
      { kind: 'car', view: 'alpha', u: 46, z: 20, color: r.pick(['#d8d8d8', '#5a1f24', '#26323f', '#0f0f0f']) },
      { kind: 'palm', view: 'alpha', u: 70, z: 12, scale: 0.8 },
      { kind: 'mailbox', view: 'alpha', u: 70, z: 32 },
      { kind: 'fence', view: 'charlie', u: -10, z: 18 },
      { kind: 'palm', view: 'charlie', u: 4, z: 12, scale: 0.8 },
      { kind: 'shrub', view: 'delta', u: 30, z: 3 },
    ],
    palette: r.pick(PALETTES),
    ground: 'lawn',
    powerLines: r.chance(0.5) ? ['charlie'] : [],
  };
}

function elevatedBeach(variant: number): BuildingSpec {
  const r = createRng(variant + 23);
  const W = 46;
  const D = 40;
  const base = 9;
  const blocks: Block[] = [
    { id: 'main', x0: 0, x1: W, d0: 0, d1: D, base, floors: 2, floorH: 9.5, roof: { type: 'hip', rise: 8, overhang: 2, material: 'metal' }, wall: 'board' },
  ];
  const f: Feature[] = [
    { id: 'stair-a', face: 'alpha', block: 'main', kind: 'stair', u: 32, y: -base, w: 6, h: base },
    { id: 'front-door', face: 'alpha', block: 'main', kind: 'door', u: 34, y: 0, w: 3.5, h: 7, floor: 1 },
    { id: 'slider-a1', face: 'alpha', block: 'main', kind: 'slider', u: 6, y: 0, w: 10, h: 7, floor: 1 },
    win('alpha', 'main', 'win-a1', 21, 2.5, 5, 4.5),
    { id: 'balcony-a1', face: 'alpha', block: 'main', kind: 'balcony', u: 2, y: 0, w: 26, h: 3.5, floor: 1 },
    { id: 'slider-a2', face: 'alpha', block: 'main', kind: 'slider', u: 8, y: 9.5, w: 9, h: 7, floor: 2 },
    win('alpha', 'main', 'win-a2-1', 24, 12, 4.5, 4.5, 2),
    win('alpha', 'main', 'win-a2-2', 35, 12, 4.5, 4.5, 2),
    { id: 'balcony-a2', face: 'alpha', block: 'main', kind: 'balcony', u: 4, y: 9.5, w: 16, h: 3.5, floor: 2 },
    win('bravo', 'main', 'win-b1', 10, 2.5, 4, 4.5),
    win('bravo', 'main', 'win-b2', 26, 12, 4, 4.5, 2),
    { id: 'slider-c1', face: 'charlie', block: 'main', kind: 'slider', u: 14, y: 0, w: 14, h: 7, floor: 1 },
    { id: 'deck-c', face: 'charlie', block: 'main', kind: 'balcony', u: 4, y: 0, w: 38, h: 3.5, floor: 1 },
    { id: 'slider-c2', face: 'charlie', block: 'main', kind: 'slider', u: 16, y: 9.5, w: 10, h: 7, floor: 2 },
    { id: 'balcony-c2', face: 'charlie', block: 'main', kind: 'balcony', u: 10, y: 9.5, w: 22, h: 3.5, floor: 2 },
    win('charlie', 'main', 'win-c2-1', 36, 12, 4, 4.5, 2),
    { id: 'meter', face: 'delta', block: 'main', kind: 'meter', u: 20, y: -5, w: 1.2, h: 1.6 },
    win('delta', 'main', 'win-d1', 14, 2.5, 4, 4.5),
    win('delta', 'main', 'win-d2', 28, 12, 4, 4.5, 2),
  ];
  return {
    archetype: 'elevated-beach-house',
    width: W,
    depth: D,
    blocks,
    features: f,
    site: [
      { kind: 'car', view: 'alpha', u: 10, z: 6, color: r.pick(['#e8e8e8', '#2a4d6e', '#a83a32']) },
      { kind: 'seaoats', view: 'alpha', u: -6, z: 10 },
      { kind: 'palm', view: 'alpha', u: 52, z: 12, scale: 0.95 },
      { kind: 'dune', view: 'charlie', u: -20, z: 30 },
      { kind: 'seaoats', view: 'charlie', u: 6, z: 18 },
      { kind: 'seaoats', view: 'charlie', u: 30, z: 22 },
      { kind: 'seaoats', view: 'bravo', u: 6, z: 10 },
      { kind: 'boat', view: 'delta', u: 6, z: 8 },
    ],
    palette: r.pick(PALETTES),
    ground: 'sand',
    powerLines: ['alpha'],
  };
}

function duplex(variant: number): BuildingSpec {
  const r = createRng(variant + 31);
  const W = 70;
  const D = 34;
  const blocks: Block[] = [
    { id: 'main', x0: 0, x1: W, d0: 0, d1: D, base: 0, floors: 1, floorH: 9, roof: { type: 'hip', rise: 7, overhang: 1.5, material: 'shingle' }, wall: 'stucco' },
  ];
  const f: Feature[] = [
    win('alpha', 'main', 'unitA-win-1', 5, 3, 5, 4.5),
    { id: 'unitA-door', face: 'alpha', block: 'main', kind: 'door', u: 15, y: 0, w: 3.5, h: 7 },
    win('alpha', 'main', 'unitA-win-2', 24, 3, 5, 4.5),
    win('alpha', 'main', 'unitB-win-2', 41, 3, 5, 4.5),
    { id: 'unitB-door', face: 'alpha', block: 'main', kind: 'door', u: 51.5, y: 0, w: 3.5, h: 7 },
    win('alpha', 'main', 'unitB-win-1', 60, 3, 5, 4.5),
    win('bravo', 'main', 'win-b1', 14, 3, 4, 4.5),
    { id: 'unitB-rear-door', face: 'charlie', block: 'main', kind: 'door', u: 12, y: 0, w: 3, h: 7 },
    win('charlie', 'main', 'unitB-win-c', 24, 3, 4, 4.5),
    win('charlie', 'main', 'unitA-win-c', 44, 3, 4, 4.5),
    { id: 'unitA-rear-door', face: 'charlie', block: 'main', kind: 'door', u: 56, y: 0, w: 3, h: 7 },
    win('delta', 'main', 'win-d1', 16, 3, 4, 4.5),
    { id: 'meter', face: 'delta', block: 'main', kind: 'meter', u: 8, y: 3.5, w: 1.2, h: 1.6 },
  ];
  return {
    archetype: 'duplex',
    width: W,
    depth: D,
    blocks,
    features: f,
    site: [
      { kind: 'car', view: 'alpha', u: 10, z: 18, color: '#d2d2d2' },
      { kind: 'pickup', view: 'alpha', u: 50, z: 18, color: r.pick(['#3a3a3a', '#7d1e1e', '#e8e8e8']) },
      { kind: 'palm', view: 'alpha', u: 34, z: 8, scale: 0.85 },
      { kind: 'shrub', view: 'alpha', u: 2, z: 3 },
      { kind: 'shrub', view: 'alpha', u: 64, z: 3 },
      { kind: 'fence', view: 'charlie', u: -10, z: 14 },
    ],
    palette: r.pick(PALETTES),
    ground: 'lawn',
    powerLines: r.chance(0.6) ? ['alpha'] : [],
  };
}

function townhomes(variant: number): BuildingSpec {
  const r = createRng(variant + 41);
  const units = 5;
  const uw = 20;
  const W = units * uw;
  const D = 38;
  const blocks: Block[] = [
    { id: 'main', x0: 0, x1: W, d0: 0, d1: D, base: 0, floors: 2, floorH: 9.5, roof: { type: 'gable-x', rise: 8, overhang: 1.5, material: 'shingle' }, wall: 'stucco' },
  ];
  const f: Feature[] = [];
  for (let i = 0; i < units; i++) {
    const n = i + 1;
    const x = i * uw;
    f.push({ id: `th${n}-door`, face: 'alpha', block: 'main', kind: 'door', u: x + 3, y: 0, w: 3.5, h: 7.5, floor: 1 });
    f.push(win('alpha', 'main', `th${n}-win-1`, x + 11, 3, 5, 4.5));
    f.push(win('alpha', 'main', `th${n}-win-2`, x + 4, 12.5, 4, 4.5, 2));
    f.push(win('alpha', 'main', `th${n}-win-3`, x + 12, 12.5, 4, 4.5, 2));
    // Charlie mirrors unit order: unit n appears at W - x - uw
    const cx = W - x - uw;
    f.push({ id: `th${n}-slider`, face: 'charlie', block: 'main', kind: 'slider', u: cx + 6, y: 0, w: 8, h: 7, floor: 1 });
    f.push(win('charlie', 'main', `th${n}-win-c2`, cx + 8, 12.5, 4, 4.5, 2));
  }
  f.push({ id: 'gable-b', face: 'bravo', block: 'main', kind: 'gable-vent', u: 17.5, y: 21, w: 2.5, h: 2.5 });
  f.push(win('bravo', 'main', 'win-b1', 10, 12.5, 4, 4.5, 2));
  f.push({ id: 'gable-d', face: 'delta', block: 'main', kind: 'gable-vent', u: 17.5, y: 21, w: 2.5, h: 2.5 });
  f.push({ id: 'meter-bank', face: 'delta', block: 'main', kind: 'meter', u: 8, y: 3, w: 4, h: 2.5 });
  return {
    archetype: 'townhome-row',
    width: W,
    depth: D,
    blocks,
    features: f,
    site: [
      { kind: 'car', view: 'alpha', u: 6, z: 22, color: '#b9b9b9' },
      { kind: 'car', view: 'alpha', u: 46, z: 22, color: r.pick(['#2c3e50', '#7b2d26']) },
      { kind: 'parking-lines', view: 'alpha', u: 0, z: 24 },
      { kind: 'palm', view: 'alpha', u: -6, z: 8, scale: 0.9 },
      { kind: 'palm', view: 'alpha', u: 104, z: 8, scale: 0.9 },
      { kind: 'shrub', view: 'alpha', u: 30, z: 3 },
      { kind: 'shrub', view: 'alpha', u: 70, z: 3 },
      { kind: 'fence', view: 'charlie', u: -10, z: 16 },
    ],
    palette: r.pick(PALETTES),
    ground: 'mixed',
    powerLines: [],
  };
}

function gardenApartment(variant: number): BuildingSpec {
  const r = createRng(variant + 53);
  const W = 120;
  const D = 44;
  const blocks: Block[] = [
    { id: 'main', x0: 0, x1: W, d0: 0, d1: D, base: 0, floors: 3, floorH: 9.5, roof: { type: 'hip', rise: 9, overhang: 2, material: 'shingle' }, wall: 'stucco' },
  ];
  const f: Feature[] = [];
  // Open breezeway in the middle with stairs
  f.push({ id: 'breezeway', face: 'alpha', block: 'main', kind: 'walkway', u: 52, y: 0, w: 16, h: 28.5 });
  f.push({ id: 'stair-a', face: 'alpha', block: 'main', kind: 'stair', u: 54, y: 0, w: 12, h: 28.5 });
  for (let fl = 1; fl <= 3; fl++) {
    const y = (fl - 1) * 9.5;
    // two units each side of the breezeway; unit numbering fl0n
    const unitsX = [6, 30, 74, 98];
    unitsX.forEach((x, i) => {
      const n = `${fl}0${i + 1}`;
      f.push(win('alpha', 'main', `apt-${n}`, x, y + 3, 6, 4.5, fl));
      f.push(win('alpha', 'main', `apt-${n}-b`, x + 10, y + 3, 4, 4.5, fl));
      // Charlie: balconies/sliders, mirrored
      const cx = W - x - 14;
      f.push({ id: `apt-${n}-slider`, face: 'charlie', block: 'main', kind: 'slider', u: cx + 2, y, w: 7, h: 7, floor: fl });
      f.push({ id: `apt-${n}-balcony`, face: 'charlie', block: 'main', kind: 'balcony', u: cx, y, w: 11, h: 3.5, floor: fl });
    });
  }
  f.push(win('bravo', 'main', 'win-b1', 18, 3, 4, 4.5));
  f.push(win('bravo', 'main', 'win-b2', 18, 12.5, 4, 4.5, 2));
  f.push(win('bravo', 'main', 'win-b3', 18, 22, 4, 4.5, 3));
  f.push({ id: 'meter-bank', face: 'delta', block: 'main', kind: 'meter', u: 10, y: 3, w: 6, h: 3 });
  f.push(win('delta', 'main', 'win-d3', 22, 22, 4, 4.5, 3));
  return {
    archetype: 'garden-apartment',
    width: W,
    depth: D,
    blocks,
    features: f,
    site: [
      { kind: 'parking-lines', view: 'alpha', u: -10, z: 26 },
      { kind: 'car', view: 'alpha', u: 4, z: 26, color: '#c4c4c4' },
      { kind: 'car', view: 'alpha', u: 20, z: 26, color: '#1f2c3a' },
      { kind: 'pickup', view: 'alpha', u: 84, z: 26, color: '#efefef' },
      { kind: 'car', view: 'alpha', u: 100, z: 26, color: '#6b1d1d' },
      { kind: 'palm', view: 'alpha', u: 46, z: 10, scale: 1.1 },
      { kind: 'palm', view: 'alpha', u: 72, z: 10, scale: 1.05 },
      { kind: 'shrub', view: 'alpha', u: 10, z: 3 },
      { kind: 'shrub', view: 'alpha', u: 100, z: 3 },
      { kind: 'hydrant', view: 'alpha', u: 126, z: 30, id: 'hydrant' },
      { kind: 'oak', view: 'charlie', u: -8, z: 22 },
      { kind: 'dumpster', view: 'delta', u: 30, z: 18 },
    ],
    palette: r.pick(PALETTES),
    ground: 'mixed',
    powerLines: [],
  };
}

function highriseCondo(variant: number): BuildingSpec {
  const r = createRng(variant + 61);
  const W = 120;
  const D = 70;
  const floors = 12;
  const blocks: Block[] = [
    { id: 'tower', x0: 0, x1: W, d0: 0, d1: D, base: 0, floors, floorH: 10, roof: { type: 'flat', rise: 0, overhang: 0.5, material: 'membrane', parapet: 4 }, wall: 'stucco' },
  ];
  const f: Feature[] = [];
  const bays = 5;
  const bw = W / bays;
  for (let fl = 1; fl <= floors; fl++) {
    const y = (fl - 1) * 10;
    for (let b = 1; b <= bays; b++) {
      const x = (b - 1) * bw;
      if (fl === 1) {
        if (b === 3) f.push({ id: 'lobby', face: 'alpha', block: 'tower', kind: 'storefront', u: x + 2, y: 0, w: bw - 4, h: 8.5, floor: 1 });
        else f.push(win('alpha', 'tower', `unit-1-${b}`, x + 6, 3, bw - 12, 5, 1));
      } else {
        f.push({ id: `unit-${fl}-${b}`, face: 'alpha', block: 'tower', kind: 'window', u: x + 4, y: y + 2.5, w: bw - 8, h: 5.5, floor: fl });
      }
      // Ocean side (Charlie) has balconies on every unit
      const cx = W - x - bw;
      if (fl > 1) {
        f.push({ id: `balcony-${fl}-${b}`, face: 'charlie', block: 'tower', kind: 'slider', u: cx + 4, y, w: bw - 8, h: 7.5, floor: fl });
        f.push({ face: 'charlie', block: 'tower', kind: 'balcony', u: cx + 2, y, w: bw - 4, h: 3.5, floor: fl });
      }
    }
  }
  f.push({ id: 'canopy', face: 'alpha', block: 'tower', kind: 'canopy', u: 2 * bw - 4, y: 9, w: bw + 8, h: 1.2 });
  f.push({ id: 'sign', face: 'alpha', block: 'tower', kind: 'sign', u: 2 * bw + 4, y: 10.5, w: bw - 8, h: 2 });
  for (let fl = 2; fl <= floors; fl += 1) {
    f.push(win('bravo', 'tower', `bravo-${fl}`, 30, (fl - 1) * 10 + 2.5, 8, 5, fl));
    f.push(win('delta', 'tower', `delta-${fl}`, 30, (fl - 1) * 10 + 2.5, 8, 5, fl));
  }
  f.push({ id: 'stair-door-b', face: 'bravo', block: 'tower', kind: 'door', u: 52, y: 0, w: 3.5, h: 7.5, floor: 1 });
  f.push({ id: 'fdc', face: 'alpha', block: 'tower', kind: 'meter', u: 2 * bw - 8, y: 2, w: 1.5, h: 1.2 });
  return {
    archetype: 'highrise-condo',
    width: W,
    depth: D,
    blocks,
    features: f,
    site: [
      { kind: 'palm', view: 'alpha', u: -10, z: 16, scale: 1.3 },
      { kind: 'palm', view: 'alpha', u: 20, z: 18, scale: 1.25 },
      { kind: 'palm', view: 'alpha', u: 100, z: 18, scale: 1.3 },
      { kind: 'palm', view: 'alpha', u: 130, z: 16, scale: 1.2 },
      { kind: 'car', view: 'alpha', u: 52, z: 30, color: '#f0f0f0' },
      { kind: 'hydrant', view: 'alpha', u: 34, z: 34, id: 'hydrant' },
      { kind: 'dune', view: 'charlie', u: -40, z: 60 },
      { kind: 'seaoats', view: 'charlie', u: 10, z: 40 },
      { kind: 'seaoats', view: 'charlie', u: 80, z: 44 },
      { kind: 'parking-lines', view: 'bravo', u: -10, z: 24 },
    ],
    palette: r.pick(PALETTES.slice(0, 4)),
    ground: 'mixed',
    powerLines: [],
  };
}

function motel(variant: number): BuildingSpec {
  const r = createRng(variant + 71);
  const rooms = 8;
  const rw = 14;
  const W = rooms * rw + 8;
  const D = 34;
  const blocks: Block[] = [
    { id: 'main', x0: 0, x1: W, d0: 0, d1: D, base: 0, floors: 2, floorH: 9.5, roof: { type: 'gable-x', rise: 6, overhang: 2, material: 'shingle' }, wall: 'block' },
  ];
  const f: Feature[] = [];
  f.push({ id: 'walkway-2', face: 'alpha', block: 'main', kind: 'walkway', u: 0, y: 9.5, w: W, h: 1 });
  f.push({ id: 'railing-2', face: 'alpha', block: 'main', kind: 'railing', u: 0, y: 9.5, w: W, h: 3.5 });
  f.push({ id: 'stair-a', face: 'alpha', block: 'main', kind: 'stair', u: W - 8, y: 0, w: 7, h: 9.5 });
  for (let fl = 1; fl <= 2; fl++) {
    for (let i = 0; i < rooms; i++) {
      const n = `${fl}${String(i + 1).padStart(2, '0')}`;
      const x = 2 + i * rw;
      const y = (fl - 1) * 9.5;
      f.push({ id: `room-${n}-door`, face: 'alpha', block: 'main', kind: 'door', u: x + 1.5, y, w: 3.2, h: 7, floor: fl });
      f.push({ id: `room-${n}`, face: 'alpha', block: 'main', kind: 'window', u: x + 6.5, y: y + 3, w: 5, h: 3.8, floor: fl });
      const cx = W - x - rw;
      f.push({ id: `room-${n}-rear`, face: 'charlie', block: 'main', kind: 'louver', u: cx + 5, y: y + 5, w: 3, h: 2, floor: fl });
    }
  }
  f.push({ id: 'office', face: 'bravo', block: 'main', kind: 'storefront', u: 12, y: 0, w: 10, h: 7.5, floor: 1 });
  f.push({ id: 'sign', face: 'bravo', block: 'main', kind: 'sign', u: 10, y: 9, w: 14, h: 2.2 });
  f.push({ id: 'meter-bank', face: 'delta', block: 'main', kind: 'meter', u: 10, y: 3, w: 5, h: 3 });
  return {
    archetype: 'motel-2story',
    width: W,
    depth: D,
    blocks,
    features: f,
    site: [
      { kind: 'parking-lines', view: 'alpha', u: 0, z: 22 },
      { kind: 'car', view: 'alpha', u: 16, z: 22, color: '#bdbdbd' },
      { kind: 'car', view: 'alpha', u: 58, z: 22, color: '#2b3a55' },
      { kind: 'pickup', view: 'alpha', u: 86, z: 22, color: '#8a1f1f' },
      { kind: 'palm', view: 'alpha', u: -8, z: 10, scale: 1.1 },
      { kind: 'palm', view: 'alpha', u: 124, z: 10, scale: 1.0 },
      { kind: 'dumpster', view: 'charlie', u: 20, z: 14 },
      { kind: 'hydrant', view: 'alpha', u: 132, z: 30, id: 'hydrant' },
    ],
    palette: r.pick(PALETTES),
    ground: 'asphalt',
    powerLines: ['alpha'],
  };
}

function stripCenter(variant: number): BuildingSpec {
  const r = createRng(variant + 83);
  const stores = 5;
  const sw = 26;
  const W = stores * sw;
  const D = 60;
  const blocks: Block[] = [
    { id: 'main', x0: 0, x1: W, d0: 0, d1: D, base: 0, floors: 1, floorH: 15, roof: { type: 'flat', rise: 0, overhang: 0.5, material: 'membrane', parapet: 4 }, wall: 'stucco' },
  ];
  const f: Feature[] = [];
  f.push({ id: 'canopy', face: 'alpha', block: 'main', kind: 'canopy', u: 0, y: 10.5, w: W, h: 1.5 });
  for (let i = 0; i < stores; i++) {
    const n = i + 1;
    const x = i * sw;
    f.push({ id: `store-${n}`, face: 'alpha', block: 'main', kind: 'storefront', u: x + 3, y: 0, w: sw - 6, h: 9, floor: 1 });
    f.push({ id: `sign-${n}`, face: 'alpha', block: 'main', kind: 'sign', u: x + 4, y: 13, w: sw - 8, h: 3 });
    const cx = W - x - sw;
    f.push({ id: `store-${n}-rear`, face: 'charlie', block: 'main', kind: 'door', u: cx + 10, y: 0, w: 3.5, h: 7.5, floor: 1 });
    f.push({ id: `roof-${n}`, face: 'alpha', block: 'main', kind: 'hood', u: x + sw / 2 - 2, y: 19, w: 4, h: 2.5 });
  }
  f.push({ id: 'hood-exhaust', face: 'charlie', block: 'main', kind: 'hood', u: 8, y: 19, w: 4, h: 3 });
  f.push({ id: 'meter-bank', face: 'charlie', block: 'main', kind: 'meter', u: 60, y: 3, w: 8, h: 4 });
  f.push({ id: 'side-door-b', face: 'bravo', block: 'main', kind: 'door', u: 20, y: 0, w: 3.5, h: 7.5, floor: 1 });
  f.push({ id: 'side-door-d', face: 'delta', block: 'main', kind: 'door', u: 34, y: 0, w: 3.5, h: 7.5, floor: 1 });
  return {
    archetype: 'strip-center',
    width: W,
    depth: D,
    blocks,
    features: f,
    site: [
      { kind: 'parking-lines', view: 'alpha', u: -20, z: 30 },
      { kind: 'car', view: 'alpha', u: 6, z: 30, color: '#d6d6d6' },
      { kind: 'car', view: 'alpha', u: 26, z: 30, color: '#1c2833' },
      { kind: 'pickup', view: 'alpha', u: 70, z: 30, color: '#3f5e3f' },
      { kind: 'car', view: 'alpha', u: 104, z: 30, color: '#9a2a2a' },
      { kind: 'palm', view: 'alpha', u: -14, z: 14, scale: 1.2 },
      { kind: 'palm', view: 'alpha', u: 140, z: 14, scale: 1.15 },
      { kind: 'dumpster', view: 'charlie', u: 30, z: 14 },
      { kind: 'dumpster', view: 'charlie', u: 92, z: 14 },
      { kind: 'hydrant', view: 'alpha', u: -24, z: 40, id: 'hydrant' },
    ],
    palette: r.pick(PALETTES),
    ground: 'asphalt',
    powerLines: ['charlie'],
  };
}

function convenience(variant: number): BuildingSpec {
  const r = createRng(variant + 97);
  const W = 60;
  const D = 46;
  const blocks: Block[] = [
    { id: 'main', x0: 0, x1: W, d0: 0, d1: D, base: 0, floors: 1, floorH: 14, roof: { type: 'flat', rise: 0, overhang: 0.5, material: 'membrane', parapet: 3 }, wall: 'block' },
  ];
  const f: Feature[] = [
    { id: 'storefront', face: 'alpha', block: 'main', kind: 'storefront', u: 6, y: 0, w: 40, h: 9, floor: 1 },
    { id: 'sign', face: 'alpha', block: 'main', kind: 'sign', u: 8, y: 11, w: 34, h: 3 },
    { id: 'side-door-b', face: 'bravo', block: 'main', kind: 'door', u: 30, y: 0, w: 3.5, h: 7.5, floor: 1 },
    { id: 'rear-door', face: 'charlie', block: 'main', kind: 'door', u: 20, y: 0, w: 3.5, h: 7.5, floor: 1 },
    { id: 'cooler-condensers', face: 'charlie', block: 'main', kind: 'ac', u: 34, y: 0, w: 10, h: 4 },
    { id: 'meter-bank', face: 'delta', block: 'main', kind: 'meter', u: 12, y: 3, w: 3, h: 3 },
    { id: 'delta-wall', face: 'delta', block: 'main', kind: 'louver', u: 26, y: 8, w: 3, h: 2 },
  ];
  return {
    archetype: 'convenience-store',
    width: W,
    depth: D,
    blocks,
    features: f,
    site: [
      { kind: 'pump-island', view: 'alpha', u: -8, z: 36, id: 'pumps' },
      { kind: 'pump-island', view: 'alpha', u: 26, z: 36 },
      { kind: 'car', view: 'alpha', u: 48, z: 18, color: '#bcbcbc' },
      { kind: 'dumpster', view: 'delta', u: 34, z: 8, id: 'dumpster' },
      { kind: 'dumpster', view: 'charlie', u: 4, z: 8 },
      { kind: 'palm', view: 'alpha', u: 70, z: 12, scale: 1 },
      { kind: 'hydrant', view: 'alpha', u: 76, z: 40, id: 'hydrant' },
    ],
    palette: { ...r.pick(PALETTES), wall: '#e3e0d8' },
    ground: 'asphalt',
    powerLines: ['alpha'],
  };
}

function office(variant: number): BuildingSpec {
  const r = createRng(variant + 101);
  const W = 80;
  const D = 50;
  const blocks: Block[] = [
    { id: 'main', x0: 0, x1: W, d0: 0, d1: D, base: 0, floors: 1, floorH: 11, roof: { type: 'hip', rise: 8, overhang: 2, material: r.chance(0.5) ? 'metal' : 'shingle' }, wall: 'stucco' },
  ];
  const f: Feature[] = [
    win('alpha', 'main', 'win-a1', 6, 3, 8, 5),
    win('alpha', 'main', 'win-a2', 20, 3, 8, 5),
    { id: 'entry', face: 'alpha', block: 'main', kind: 'storefront', u: 34, y: 0, w: 12, h: 8.5, floor: 1 },
    win('alpha', 'main', 'win-a3', 52, 3, 8, 5),
    win('alpha', 'main', 'win-a4', 66, 3, 8, 5),
    win('bravo', 'main', 'win-b1', 10, 3, 8, 5),
    win('bravo', 'main', 'win-b2', 30, 3, 8, 5),
    { id: 'rear-door', face: 'charlie', block: 'main', kind: 'door', u: 40, y: 0, w: 3.5, h: 7.5, floor: 1 },
    win('charlie', 'main', 'win-c1', 14, 3, 8, 5),
    win('charlie', 'main', 'win-c2', 58, 3, 8, 5),
    { id: 'ac-pad', face: 'charlie', block: 'main', kind: 'ac', u: 26, y: 0, w: 6, h: 3.5 },
    { id: 'meter', face: 'delta', block: 'main', kind: 'meter', u: 8, y: 3.5, w: 1.5, h: 2 },
    win('delta', 'main', 'win-d1', 24, 3, 8, 5),
  ];
  return {
    archetype: 'small-office',
    width: W,
    depth: D,
    blocks,
    features: f,
    site: [
      { kind: 'parking-lines', view: 'alpha', u: -10, z: 26 },
      { kind: 'car', view: 'alpha', u: 4, z: 26, color: '#2d2d2d' },
      { kind: 'car', view: 'alpha', u: 62, z: 26, color: '#d0d0d0' },
      { kind: 'oak', view: 'alpha', u: -16, z: 14, scale: 1.1 },
      { kind: 'palm', view: 'alpha', u: 88, z: 12 },
      { kind: 'shrub', view: 'alpha', u: 10, z: 3 },
      { kind: 'shrub', view: 'alpha', u: 64, z: 3 },
    ],
    palette: r.pick(PALETTES),
    ground: 'mixed',
    powerLines: ['delta'],
  };
}

function restaurant(variant: number): BuildingSpec {
  const r = createRng(variant + 113);
  const W = 70;
  const D = 56;
  const blocks: Block[] = [
    { id: 'main', x0: 0, x1: W, d0: 0, d1: D, base: 0, floors: 1, floorH: 13, roof: { type: 'hip', rise: 7, overhang: 2.5, material: 'metal' }, wall: 'stucco' },
  ];
  const f: Feature[] = [
    { id: 'entry', face: 'alpha', block: 'main', kind: 'storefront', u: 26, y: 0, w: 14, h: 9, floor: 1 },
    win('alpha', 'main', 'dining-win-1', 4, 2.5, 16, 6),
    win('alpha', 'main', 'dining-win-2', 46, 2.5, 18, 6),
    { id: 'sign', face: 'alpha', block: 'main', kind: 'sign', u: 22, y: 10, w: 22, h: 2.4 },
    { id: 'kitchen-door', face: 'charlie', block: 'main', kind: 'door', u: 30, y: 0, w: 3.5, h: 7.5, floor: 1 },
    { id: 'hood-exhaust', face: 'charlie', block: 'main', kind: 'hood', u: 22, y: 18, w: 4, h: 3 },
    { id: 'hood-exhaust-a', face: 'alpha', block: 'main', kind: 'hood', u: 44, y: 18, w: 4, h: 3 },
    { id: 'grease-trap', face: 'charlie', block: 'main', kind: 'ac', u: 44, y: 0, w: 6, h: 3 },
    win('bravo', 'main', 'win-b1', 10, 2.5, 12, 6),
    { id: 'side-door-d', face: 'delta', block: 'main', kind: 'door', u: 40, y: 0, w: 3.5, h: 7.5, floor: 1 },
    { id: 'meter-bank', face: 'delta', block: 'main', kind: 'meter', u: 46, y: 3, w: 4, h: 3 },
  ];
  return {
    archetype: 'restaurant',
    width: W,
    depth: D,
    blocks,
    features: f,
    site: [
      { kind: 'parking-lines', view: 'alpha', u: -16, z: 28 },
      { kind: 'car', view: 'alpha', u: -4, z: 28, color: '#d4d4d4' },
      { kind: 'car', view: 'alpha', u: 52, z: 28, color: '#21334a' },
      { kind: 'palm', view: 'alpha', u: -10, z: 10, scale: 1.1 },
      { kind: 'palm', view: 'alpha', u: 80, z: 10, scale: 1.1 },
      { kind: 'dumpster', view: 'charlie', u: 54, z: 12, id: 'dumpster' },
    ],
    palette: r.pick(PALETTES),
    ground: 'asphalt',
    powerLines: ['charlie'],
  };
}

const BUILDERS: Record<Archetype, Builder> = {
  'ranch-1story': ranch,
  'residence-2story': twoStory,
  'elevated-beach-house': elevatedBeach,
  duplex,
  'townhome-row': townhomes,
  'garden-apartment': gardenApartment,
  'highrise-condo': highriseCondo,
  'motel-2story': motel,
  'strip-center': stripCenter,
  'convenience-store': convenience,
  'small-office': office,
  restaurant,
};

export function buildSpec(archetype: Archetype, variant = 0): BuildingSpec {
  return BUILDERS[archetype](variant);
}

// ---------------------------------------------------------------------------
// Views

/** Face extents in view coordinates for a block. */
function faceExtent(b: Block, view: Side, W: number, D: number): { x0: number; x1: number; depth: number } {
  switch (view) {
    case 'alpha':
      return { x0: b.x0, x1: b.x1, depth: b.d0 };
    case 'charlie':
      return { x0: W - b.x1, x1: W - b.x0, depth: D - b.d1 };
    case 'bravo':
      return { x0: D - b.d1, x1: D - b.d0, depth: b.x0 };
    case 'delta':
      return { x0: b.d0, x1: b.d1, depth: W - b.x1 };
  }
}

export function viewWidth(spec: BuildingSpec, view: Side) {
  return view === 'alpha' || view === 'charlie' ? spec.width : spec.depth;
}

export function roofTopY(face: FaceModel): number {
  const r = face.block.roof;
  if (r.type === 'flat') return face.wallTop + (r.parapet ?? 0);
  return face.wallTop + r.rise;
}

export function buildView(spec: BuildingSpec, view: Side): ViewModel {
  const W = spec.width;
  const D = spec.depth;
  const faces: FaceModel[] = spec.blocks
    .map((b) => {
      const e = faceExtent(b, view, W, D);
      const wallTop = b.base + b.floors * b.floorH;
      const ridgeAcross =
        b.roof.type === 'gable-x' ? view === 'alpha' || view === 'charlie' : b.roof.type === 'gable-d' ? view === 'bravo' || view === 'delta' : true;
      return { block: b, x0: e.x0, x1: e.x1, depth: e.depth, base: b.base, wallTop, ridgeAcross };
    })
    .sort((a, b) => b.depth - a.depth);
  // Feature positions are authored in view coordinates (feet from the viewer's left).
  const features = spec.features
    .filter((f) => f.face === view)
    .map((f) => {
      const face = faces.find((x) => x.block.id === f.block)!;
      return { ...f, x: f.u, yAbs: face.base + f.y, depth: face.depth };
    });
  const anchors: Record<string, Anchor> = {};
  for (const f of features) {
    if (!f.id) continue;
    anchors[f.id] = { id: f.id, x: f.x + f.w / 2, y: f.yAbs + f.h / 2, w: f.w, h: f.h, cy: f.yAbs + f.h / 2, label: `${f.kind} ${f.id}`, floor: f.floor };
    if (f.kind === 'garage' || f.kind === 'door' || f.kind === 'slider' || f.kind === 'storefront') {
      anchors[f.id].y = f.yAbs + f.h * 0.75; // smoke leaves the top of openings
    }
  }
  for (const face of faces) {
    const b = face.block;
    const mid = (face.x0 + face.x1) / 2;
    const top = roofTopY(face);
    anchors[`roof-${b.id}`] = { id: `roof-${b.id}`, x: mid, y: top, w: (face.x1 - face.x0) * 0.4, label: `roof of ${b.id}` };
    anchors[`eaves-${b.id}`] = { id: `eaves-${b.id}`, x: mid, y: face.wallTop, w: (face.x1 - face.x0) * 0.85, label: `eaves/soffit of ${b.id}` };
    anchors[`wall-${b.id}`] = { id: `wall-${b.id}`, x: mid, y: (face.base + face.wallTop) / 2, w: (face.x1 - face.x0) * 0.6, label: `wall of ${b.id}` };
    if (!face.ridgeAcross && b.roof.type !== 'hip' && b.roof.type !== 'flat') {
      anchors[`gable-${b.id}`] = { id: `gable-${b.id}`, x: mid, y: face.wallTop + b.roof.rise * 0.45, w: 3, label: `gable end of ${b.id}` };
    }
    for (let fl = 1; fl <= b.floors; fl++) {
      anchors[`floor-${b.id}-${fl}`] = {
        id: `floor-${b.id}-${fl}`,
        x: mid,
        y: b.base + (fl - 0.5) * b.floorH,
        w: (face.x1 - face.x0) * 0.7,
        label: `floor ${fl} of ${b.id}`,
        floor: fl,
      };
    }
  }
  const site = spec.site.filter((s) => s.view === view || s.view === 'all');
  for (const s of site) if (s.id) anchors[s.id] = { id: s.id, x: s.u + 2, y: 3, w: 6, label: s.kind };
  const height = Math.max(...faces.map(roofTopY));
  return { view, width: viewWidth(spec, view), height, faces, features, site, anchors };
}

export function anchorIds(archetype: Archetype, view: Side, variant = 0): string[] {
  return Object.keys(buildView(buildSpec(archetype, variant), view).anchors);
}
