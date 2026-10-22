// Image-generation prompt export. Produces one prompt per side of the
// building with continuity instructions, so a separately generated (or
// photographed) image set shows the same structure from every angle.
// Base plates are requested WITHOUT smoke or fire — FIRST FIVE composites
// effects at the anchor points, so the same image serves every condition state.

import type { ScenarioInstance } from '../domain/scenario/instance';
import { SIDES, type ScenarioTemplateInput, type Side } from '../domain/scenario/schema';
import { buildSpec, buildView, type BuildingSpec } from './model';

const ARCH: Record<string, string> = {
  'ranch-1story': 'single-story Florida ranch house',
  'residence-2story': 'two-story Florida single-family house',
  'elevated-beach-house': 'elevated coastal beach house raised on pilings with parking underneath and exterior stairs',
  duplex: 'single-story side-by-side duplex',
  'townhome-row': 'row of two-story attached townhomes',
  'garden-apartment': 'two/three-story garden-style apartment building with open exterior stairways and breezeways',
  'highrise-condo': 'multistory beachfront condominium tower with balconies',
  'motel-2story': 'two-story exterior-corridor beach motel',
  'strip-center': 'single-story strip shopping center with storefronts and a flat roof with parapet',
  'convenience-store': 'single-story convenience store with fuel canopy',
  'small-office': 'single-story small professional office building',
  restaurant: 'freestanding single-story restaurant',
};

function colorName(hex: string): string {
  const m = hex.replace('#', '').match(/.{2}/g);
  if (!m) return hex;
  const [r, g, b] = m.map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max !== min) {
    if (max === r) h = ((g - b) / (max - min)) % 6;
    else if (max === g) h = (b - r) / (max - min) + 2;
    else h = (r - g) / (max - min) + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  if (l > 0.9) return s > 0.25 ? 'off-white' : 'white';
  const tone = l > 0.85 ? 'white' : l > 0.7 ? 'pale' : l < 0.25 ? 'dark' : l < 0.4 ? 'deep' : '';
  if (s < 0.12) return l > 0.85 ? 'white' : l < 0.25 ? 'charcoal' : l > 0.6 ? 'light gray' : 'gray';
  const hue =
    h < 15 || h >= 345 ? 'red' : h < 40 ? 'terracotta/orange' : h < 60 ? 'sand/tan' : h < 80 ? 'yellow' : h < 160 ? 'green' : h < 200 ? 'teal/aqua' : h < 255 ? 'blue' : h < 290 ? 'purple' : 'pink/coral';
  return `${tone ? `${tone} ` : ''}${hue}`.trim();
}

const VIEW_DESC: Record<Side, string> = {
  alpha: 'the Alpha side (street/address side, the front of the building), viewed from the street at the apparatus position',
  bravo: 'the Bravo side (the left side when facing the front), viewed from the side yard',
  charlie: 'the Charlie side (the rear of the building), viewed from the back yard',
  delta: 'the Delta side (the right side when facing the front), viewed from the side yard',
};

export interface ImagePrompt {
  view: Side;
  filename: string;
  prompt: string;
  negative: string;
  anchors: { id: string; label: string }[];
}

function describeSpec(spec: BuildingSpec) {
  const p = spec.palette;
  const roofs = [...new Set(spec.blocks.map((b) => `${b.roof.material === 'shingle' ? 'asphalt shingle' : b.roof.material === 'tile' ? 'barrel tile' : b.roof.material === 'metal' ? 'standing-seam metal' : 'flat membrane'} ${b.roof.type.startsWith('gable') ? 'gable' : b.roof.type} roof`))];
  const walls = [...new Set(spec.blocks.map((b) => b.wall))];
  return {
    roofs: roofs.join(' and '),
    walls: walls.map((w) => (w === 'block' ? 'painted concrete block' : w === 'board' ? 'board-and-batten' : w)).join(' / '),
    colors: `${colorName(p.wall)} walls, ${colorName(p.trim)} trim, ${colorName(p.roof)} roof, ${colorName(p.door)} front door${spec.blocks.some((b) => b.accent) ? `, ${colorName(p.accent)} accent wall` : ''}`,
    ground: spec.ground === 'sand' ? 'sandy yard with sea oats and scrub' : spec.ground === 'asphalt' ? 'asphalt parking lot' : spec.ground === 'mixed' ? 'patchy St. Augustine lawn and sand' : 'St. Augustine grass lawn',
    footprint: `about ${Math.round(spec.width)} ft wide by ${Math.round(spec.depth)} ft deep`,
  };
}

export function buildImagePrompts(t: ScenarioTemplateInput, inst: ScenarioInstance): ImagePrompt[] {
  const spec = buildSpec(t.building.archetype, inst.variant);
  const d = describeSpec(spec);
  // Base plates are daylight: one photo set serves every seeded run of the scenario.
  const light = 'ordinary daylight (mid-morning to afternoon), light Florida haze, a few cumulus clouds';
  const base = [
    `Documentary-style, photorealistic photograph of a ${ARCH[t.building.archetype] ?? t.building.occupancyLabel} in a coastal Florida neighborhood (Volusia County barrier-island character).`,
    `${t.building.stories} ${t.building.stories === 1 ? 'story' : 'stories'}, ${t.building.occupancyLabel}, ${t.building.construction}. Footprint ${d.footprint}.`,
    `Exterior: ${d.walls}; ${d.roofs}; ${d.colors}.`,
    t.building.features?.length ? `Features: ${t.building.features.join(', ')}.` : '',
    `Setting: ${d.ground}; Florida vegetation (sabal palms, sea grape, palmetto); ${t.setting?.streetKind === 'beachfront' ? 'dunes and ocean glimpses behind' : t.setting?.streetKind === 'commercial' ? 'commercial corridor' : 'quiet residential street'}.`,
    `Lighting and weather: ${light}.`,
  ].filter(Boolean);
  const continuity =
    'CONTINUITY: This is one of four images of the SAME building. Keep identical architecture, colors, materials, window and door positions, roof form, and landscaping across all four views. Eye-level camera at about 5.5 ft, 28–35 mm equivalent lens, entire building in frame with some ground and sky, no people, no vehicles blocking openings.';
  const plate =
    'BASE PLATE: Show the building in normal condition with NO smoke, NO fire, NO fire apparatus and NO emergency lighting. Smoke and fire are added later by the simulator at specific openings, so every door, window, vent and eave must be clearly visible and unobstructed.';
  return SIDES.map((view) => {
    const vm = buildView(spec, view);
    const anchors = Object.values(vm.anchors).map((a) => ({ id: a.id, label: a.label }));
    const visible = [...new Set(vm.features.filter((f) => f.face === view).map((f) => f.kind.replace('-', ' ')))];
    return {
      view,
      filename: `${t.id}-${view}.jpg`,
      prompt: [
        ...base,
        `View: ${VIEW_DESC[view]}.`,
        visible.length ? `Visible on this side: ${visible.join(', ')}.` : '',
        vm.anchors && spec.powerLines.includes(view) ? 'Overhead service drop / power lines cross this side.' : '',
        continuity,
        plate,
        'Style: realistic, unremarkable documentary photo as if taken by a firefighter from the street; natural color; no HDR, no cinematic grading, no text or watermarks. 16:9, at least 1920×1080.',
      ]
        .filter(Boolean)
        .join('\n'),
      negative: 'smoke, fire, flames, fire trucks, firefighters, people, text, watermark, logo, fisheye, tilt-shift, cartoon, illustration, 3D render, dramatic sky, HDR',
      anchors,
    };
  });
}

/** Plain-text bundle for copy/paste or download. */
export function promptsToText(t: ScenarioTemplateInput, prompts: ImagePrompt[]): string {
  return [
    `FIRST FIVE — image prompts for "${t.title}" (${t.id})`,
    'Generate each image separately with any image tool you have rights to use. Record origin and license in the Scenario Builder.',
    'After importing a photo, place the listed anchor points on it so smoke and fire appear at the right openings.',
    '',
    ...prompts.flatMap((p) => [
      `=== ${p.view.toUpperCase()} — save as ${p.filename} ===`,
      p.prompt,
      `Negative prompt: ${p.negative}`,
      `Anchor points to place: ${p.anchors.map((a) => a.id).join(', ')}`,
      '',
    ]),
  ].join('\n');
}
