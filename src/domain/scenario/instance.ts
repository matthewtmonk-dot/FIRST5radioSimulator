// Resolves a scenario template into a concrete, reproducible incident.
// Only compatible elements are randomized: address, environment, call signs,
// arrival timing, colors and an authored branch. Building facts, hazards and
// fire location come from the template or branch so they stay consistent.

import { DEFAULT_RESPONSE_PLAN, type ResponsePlanConfig } from '../rubric/config';
import { createRng, hashString, type Rng } from '../rng';
import { ScenarioTemplate, type ScenarioTemplateInput, type Side } from './schema';

export const BRANCH_KEYS = [
  'title', 'summary', 'conditionStates', 'initialCondition', 'findings', 'events', 'occupants', 'dispatch',
  'expectations', 'taskOutcomes', 'examples', 'explanations', 'endWhen', 'investigation', 'recon', 'units', 'difficulty',
] as const;

const STREETS: Record<'residential' | 'beachfront' | 'commercial', string[]> = {
  residential: [
    'Sandpiper Lane', 'Pelican Way', 'Seagrape Drive', 'Heron Point Road', 'Tarpon Avenue', 'Saltmarsh Court', 'Coquina Way',
    'Sea Oat Lane', 'Osprey Circle', 'Mangrove Lane', 'Sanderling Drive', 'Spoonbill Court', 'Driftwood Avenue', 'Ibis Trail',
    'Palmetto Hammock Drive', 'Conch Shell Court', 'Marsh Wren Lane', 'Gull Harbor Drive',
  ],
  beachfront: ['Dune Crest Boulevard', 'Surfside Drive', 'Seawall Avenue', 'Turtle Watch Way', 'Tidewater Drive', 'Breakers Row', 'Sea Mist Lane'],
  commercial: ['Seaview Boulevard', 'Harbor Commons Drive', 'Coastline Parkway', 'Marina Point Road', 'Lagoon Plaza Drive', 'Shell Bank Road'],
};
const CROSS = ['Coral Drive', 'Anchor Street', 'Bayberry Road', 'Lantana Avenue', 'Seabreeze Court', 'Wahoo Way', 'Kingfish Road', 'Shoreline Drive'];

export const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'] as const;
export type Compass = (typeof COMPASS)[number];

export interface Environment {
  timeOfDay: 'morning' | 'midday' | 'afternoon' | 'dusk' | 'night';
  clock: string;
  weather: 'clear' | 'scattered clouds' | 'overcast' | 'humid haze' | 'light rain';
  windFrom: Compass;
  windMph: number;
  /** Compass direction that the Alpha side faces. */
  alphaFaces: Compass;
  temperatureF: number;
}

export interface ResolvedUnit {
  id: string;
  role: string;
  type: string;
  arrival: number;
}

export type ScenarioInstance = Omit<ScenarioTemplate, 'branches' | 'units'> & {
  instanceId: string;
  templateId: string;
  seed: number;
  branchId: string | null;
  branchLabel: string | null;
  address: { number: number; street: string; streetName: string; cross: string; full: string; placeName?: string };
  commandName: string;
  environment: Environment;
  ownUnit: string;
  dispatchName: string;
  units: ResolvedUnit[];
  roleMap: Record<string, string>;
  variant: number;
};

export function fillPlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/\{([A-Z][A-Z0-9_]*)\}/g, (whole, key: string) => (key in vars ? vars[key] : whole));
}

function deepFill<T>(value: T, vars: Record<string, string>): T {
  if (typeof value === 'string') return fillPlaceholders(value, vars) as T;
  if (Array.isArray(value)) return value.map((v) => deepFill(v, vars)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepFill(v, vars);
    return out as T;
  }
  return value;
}

export function applyBranch(t: ScenarioTemplate, branchId: string | null): ScenarioTemplate {
  if (!branchId) return t;
  const b = t.branches.find((x) => x.id === branchId);
  if (!b) return t;
  const merged: Record<string, unknown> = { ...t };
  for (const [k, v] of Object.entries(b.patch)) {
    if ((BRANCH_KEYS as readonly string[]).includes(k)) merged[k] = v;
  }
  return ScenarioTemplate.parse(merged);
}

function windRelativeToView(env: Environment, view: Side): number {
  // Horizontal drift in the view: +1 = toward the right of the image.
  // Compass indexes in 45° steps clockwise from north. Bravo is the viewer's left
  // when facing Alpha, so each side's outward normal is Alpha's plus 90° steps.
  const idx = (c: Compass) => COMPASS.indexOf(c);
  const blowsToward = (idx(env.windFrom) + 4) % 8;
  const faceNormal = (idx(env.alphaFaces) + { alpha: 0, bravo: 2, charlie: 4, delta: 6 }[view]) % 8;
  const viewerLooks = (faceNormal + 4) % 8;
  const right = (viewerLooks + 2) % 8;
  const angle = ((blowsToward - right) * Math.PI) / 4;
  return Math.cos(angle) * Math.min(1, env.windMph / 18);
}

export function windDrift(env: Environment, view: Side): number {
  return windRelativeToView(env, view);
}

export interface InstanceOptions {
  seed: number;
  branchId?: string | null;
  plan?: ResponsePlanConfig;
}

export function createInstance(templateInput: ScenarioTemplateInput | ScenarioTemplate, opts: InstanceOptions): ScenarioInstance {
  const template = ScenarioTemplate.parse(templateInput);
  const plan = opts.plan ?? DEFAULT_RESPONSE_PLAN;
  const rng = createRng(hashString(`${template.id}:${opts.seed}`));
  const branchRng = rng.fork('branch');
  const branchId =
    opts.branchId !== undefined ? opts.branchId : template.branches.length ? branchRng.weighted(template.branches).id : null;
  const t = applyBranch(template, branchId);
  const branch = template.branches.find((b) => b.id === branchId) ?? null;

  const streetKind = t.setting.streetKind;
  const street = rng.pick(STREETS[streetKind]);
  const streetName = street.split(' ').slice(0, -1).join(' ');
  const number = streetKind === 'commercial' ? rng.int(10, 49) * 100 + rng.pick([0, 10, 20, 50]) : rng.int(1, 79) * 10 + rng.pick([0, 2, 4, 6, 8]) + (streetKind === 'beachfront' ? 2000 : 0);
  const cross = rng.pick(CROSS);
  const placeName = t.setting.placeName;
  const commandName = `${(placeName && streetKind !== 'residential' ? placeName.split(' ')[0] : streetName.split(' ')[0])} Command`;

  const env = makeEnvironment(rng.fork('env'));
  const { units, roleMap } = assignUnits(t, plan, rng.fork('units'));

  const vars: Record<string, string> = {
    OWN: plan.ownUnit,
    COMMAND: commandName,
    ADDRESS: `${number} ${street}`,
    STREET: street,
    CROSS: cross,
    PLACE: placeName ?? '',
    DISPATCH: plan.dispatchName,
    WIND: `${env.windFrom} at ${env.windMph}`,
    ...roleMap,
  };
  const filled = deepFill({ ...t, units: undefined, branches: undefined }, vars);
  const variant = t.setting.variant ?? rng.int(0, 999);

  return {
    ...(filled as unknown as ScenarioTemplate),
    instanceId: `${template.id}#${opts.seed}${branchId ? `:${branchId}` : ''}`,
    templateId: template.id,
    seed: opts.seed,
    branchId,
    branchLabel: branch?.label ?? null,
    address: { number, street, streetName, cross, full: `${number} ${street}`, placeName },
    commandName,
    environment: env,
    ownUnit: plan.ownUnit,
    dispatchName: plan.dispatchName,
    units,
    roleMap,
    variant,
  } as ScenarioInstance;
}

function makeEnvironment(rng: Rng): Environment {
  const timeOfDay = rng.weighted([
    { v: 'morning' as const, weight: 2 },
    { v: 'midday' as const, weight: 3 },
    { v: 'afternoon' as const, weight: 3 },
    { v: 'dusk' as const, weight: 1.5 },
    { v: 'night' as const, weight: 1 },
  ]).v;
  const hour = { morning: rng.int(7, 10), midday: rng.int(11, 13), afternoon: rng.int(14, 17), dusk: rng.int(18, 19), night: rng.pick([21, 22, 23, 1, 3]) }[timeOfDay];
  const weather = rng.weighted([
    { v: 'clear' as const, weight: 3 },
    { v: 'scattered clouds' as const, weight: 3 },
    { v: 'overcast' as const, weight: 1.5 },
    { v: 'humid haze' as const, weight: 1 },
    { v: 'light rain' as const, weight: 0.5 },
  ]).v;
  return {
    timeOfDay,
    clock: `${String(hour).padStart(2, '0')}${String(rng.int(0, 59)).padStart(2, '0')}`,
    weather,
    windFrom: rng.weighted([
      { v: 'east' as Compass, weight: 3 }, { v: 'northeast' as Compass, weight: 2 }, { v: 'southeast' as Compass, weight: 2 },
      { v: 'south' as Compass, weight: 1 }, { v: 'west' as Compass, weight: 1 }, { v: 'north' as Compass, weight: 1 },
      { v: 'southwest' as Compass, weight: 0.7 }, { v: 'northwest' as Compass, weight: 0.7 },
    ]).v,
    windMph: rng.int(4, 18),
    alphaFaces: rng.pick(COMPASS.filter((_, i) => i % 2 === 0)),
    temperatureF: rng.int(68, 92),
  };
}

function assignUnits(t: ScenarioTemplate, plan: ResponsePlanConfig, rng: Rng) {
  const used = new Set<string>([plan.ownUnit.toLowerCase()]);
  const roleMap: Record<string, string> = {};
  const units: ResolvedUnit[] = [];
  for (const r of t.units) {
    const pool = rng.shuffle(plan.pools[r.type] ?? []).filter((u) => !used.has(u.toLowerCase()));
    const id = pool[0] ?? `${r.type.charAt(0).toUpperCase()}${r.type.slice(1)} ${90 + units.length}`;
    used.add(id.toLowerCase());
    roleMap[r.role] = id;
    const jitter = r.type === 'battalion' ? rng.int(-10, 15) : rng.int(-12, 12);
    units.push({ id, role: r.role, type: r.type, arrival: Math.max(20, r.arrival + jitter) });
  }
  return { units: units.sort((a, b) => a.arrival - b.arrival), roleMap };
}
