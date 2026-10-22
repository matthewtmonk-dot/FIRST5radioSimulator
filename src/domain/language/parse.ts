// Structured parsing of radio transmissions: addressing, unit segments,
// assignments, and report facts. Deterministic and explainable — every
// extracted fact carries the span of text that produced it.

import type {
  InitialAction,
  OccupancyClass,
  Problem,
  ResourceDecision,
  Side,
  SizeClass,
  Strategy,
  Task,
} from '../scenario/schema';
import { findConcept, findTerms, type Match } from './lexicon';
import { TASK_INFO, TASK_ORDER } from './tasks';

export const UNIT_WORD = '(engine|ladder|tower|truck|rescue|squad|battalion|medic|tanker|quint|brush)';
const CALLSIGN_RE = new RegExp(`\\b${UNIT_WORD} (\\d{1,3})\\b`, 'g');

export function canonicalUnit(type: string, num: string): string {
  const t = type === 'truck' ? 'Ladder' : type.charAt(0).toUpperCase() + type.slice(1);
  return `${t} ${num}`;
}

export function unitKey(unit: string): string {
  return unit.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface CallsignHit {
  unit: string;
  start: number;
  end: number;
}

export function findCallsigns(text: string): CallsignHit[] {
  const out: CallsignHit[] = [];
  CALLSIGN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CALLSIGN_RE.exec(text))) {
    out.push({ unit: canonicalUnit(m[1], m[2]), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

export interface Addressing {
  to: 'dispatch' | 'unit' | 'command' | 'all' | 'unknown';
  unit?: string;
  from?: string;
}

/** Determine the addressee of a transmission from its opening words. */
export function parseAddressing(text: string, ownUnit: string, dispatchName: string): Addressing {
  const head = text.slice(0, 80);
  const own = unitKey(ownUnit);
  const disp = dispatchName.toLowerCase();
  const dispatchWords = `(dispatch|${escape(disp)}|fire ?com|fire alarm|communications|central|county)`;
  const party = `(${UNIT_WORD} \\d{1,3}|${dispatchWords}|(?:[a-z0-9]+ ){0,2}command|all units)`;
  const xToY = new RegExp(`^${party}( from| to) ${party}`).exec(head);
  if (xToY) {
    const first = xToY[1];
    const second = xToY[xToY.length - 1] ?? '';
    const secondParty = head.slice(xToY.index + first.length).replace(/^ (from|to) /, '').slice(0, 60);
    const isTo = / to /.test(xToY[0].slice(first.length, first.length + 4));
    const receiver = isTo ? secondParty : first;
    const sender = isTo ? first : secondParty;
    void second;
    return { ...classifyParty(receiver, own, dispatchWords), from: sender.split(/[,.]/)[0].trim() };
  }
  // Leading party followed by a comma or directly by content
  const lead = new RegExp(`^${party}\\b`).exec(head);
  if (lead) {
    const p = classifyParty(lead[0], own, dispatchWords);
    if (p.to === 'unit' && unitKey(p.unit ?? '') === own) return { to: 'dispatch', from: ownUnit };
    return p;
  }
  return { to: 'unknown' };
}

function classifyParty(s: string, own: string, dispatchWords: string): Addressing {
  if (new RegExp(`^${dispatchWords}`).test(s)) return { to: 'dispatch' };
  if (/^all units/.test(s)) return { to: 'all' };
  const cs = findCallsigns(s)[0];
  if (cs && cs.start === 0) {
    if (unitKey(cs.unit) === own) return { to: 'dispatch', from: cs.unit };
    return { to: 'unit', unit: cs.unit };
  }
  if (/command/.test(s)) return { to: 'command' };
  return { to: 'unknown' };
}

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface UnitSegment {
  unit: string;
  start: number;
  end: number;
  text: string;
}

const BOUNDARY_BEFORE = /(^|[.,;:!?]|\band|\bto|\bthen|\balso|\bnext)\s*$/;

/** Split a transmission into parts addressed to individual units (excluding own unit). */
export function splitUnitSegments(text: string, ownUnit: string): { segments: UnitSegment[]; rest: string } {
  const own = unitKey(ownUnit);
  const hits = findCallsigns(text).filter((h) => unitKey(h.unit) !== own);
  const starts: CallsignHit[] = [];
  for (const h of hits) {
    const before = text.slice(Math.max(0, h.start - 12), h.start);
    // "Command to Engine 42" or "Sandpiper Command, Engine 42" style
    const afterCommand = /command\s*(to|,)?\s*$/.test(text.slice(Math.max(0, h.start - 30), h.start));
    if (!BOUNDARY_BEFORE.test(before) && !afterCommand) continue;
    if (/\b(cancel|cancelling|release|releasing|disregard)\s*$/.test(before)) continue;
    // "to Engine 14" only counts when it is the opening of the transmission (handled by addressing)
    if (/\bto\s*$/.test(before) && !afterCommand && h.start > 30) continue;
    starts.push(h);
  }
  const segments: UnitSegment[] = [];
  const restParts: string[] = [];
  let cursor = 0;
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1].start : text.length;
    // Text addressed to the unit runs until the next unit or a sentence that returns to dispatch
    let segEnd = end;
    const tail = text.slice(s.end, end);
    const back = /(\.|;)\s*(dispatch|all (other )?units|everyone|everybody|all remaining)/.exec(tail);
    if (back) segEnd = s.end + back.index + 1;
    restParts.push(text.slice(cursor, s.start));
    segments.push({ unit: s.unit, start: s.start, end: segEnd, text: text.slice(s.end, segEnd).replace(/^[\s,.:;]+/, '').trim() });
    cursor = segEnd;
  }
  restParts.push(text.slice(cursor));
  return { segments, rest: restParts.join(' ').replace(/\s+/g, ' ').trim() };
}

// ---------------------------------------------------------------------------
// Locations

export interface LocationFacts {
  sides: { side: Side; m: Match; alt?: boolean }[];
  floors: { floor: number; m: Match }[];
  areas: Match[];
  target?: string;
}

const GENERIC_AREAS = [
  'garage', 'attic', 'kitchen', 'bedroom', 'living room', 'roof', 'front door', 'rear door', 'side door', 'back door',
  'garage door', 'sliding door', 'hallway', 'interior', 'exterior', 'stairwell', 'stairs', 'stair', 'lobby', 'unit',
  'apartment', 'room', 'exposure', 'carport', 'porch', 'balcony', 'breezeway', 'hydrant', 'eaves', 'soffit', 'kitchen hood',
  'dining room', 'storage', 'utility room', 'laundry', 'crawl space', 'parking', 'pilings', 'fire floor', 'floor above',
  'cockloft', 'back of house', 'rear', 'front', 'entry', 'doorway', 'window', 'dumpster', 'store', 'office', 'corridor',
];

export function extractLocation(text: string, extraTerms: string[] = [], ownUnit = 'Engine 14'): LocationFacts {
  const sides: LocationFacts['sides'] = [];
  const sideRe = /\b(alpha|bravo|charlie|delta)\b/g;
  let m: RegExpExecArray | null;
  while ((m = sideRe.exec(text))) {
    sides.push({ side: m[1] as Side, m: { concept: 'side', start: m.index, end: m.index + m[0].length, text: m[0] } });
  }
  const altRe = /\b(front|rear|back)( of the (house|building|structure))?\b/g;
  while ((m = altRe.exec(text))) {
    if (/door|yard/.test(text.slice(m.index + m[0].length, m.index + m[0].length + 6))) continue;
    sides.push({
      side: m[1] === 'front' ? 'alpha' : 'charlie',
      alt: true,
      m: { concept: 'side', start: m.index, end: m.index + m[0].length, text: m[0] },
    });
  }
  const floors: LocationFacts['floors'] = [];
  const floorRes = [/\b(\d{1,2})(st|nd|rd|th)? (floor|story|level)\b/g, /\bfloor (\d{1,2})\b/g, /\bdivision (\d{1,2})\b/g];
  for (const re of floorRes) {
    while ((m = re.exec(text))) {
      // "2 story" is a height, not a location — require an ordinal or "floor"
      if (re === floorRes[0] && !m[2] && m[3] !== 'floor') continue;
      floors.push({ floor: Number(m[1]), m: { concept: 'floor', start: m.index, end: m.index + m[0].length, text: m[0] } });
    }
  }
  const areas = findTerms(text, [...GENERIC_AREAS, ...extraTerms]);
  const ownRe = new RegExp(`\\b(to|for|supply|feed|into|hook up to) ${ownUnit.toLowerCase()}\\b`);
  const target = ownRe.test(text) ? `to ${ownUnit}` : undefined;
  return { sides, floors, areas, target };
}

export function describeLocation(loc: LocationFacts): string {
  const parts: string[] = [];
  if (loc.target) parts.push(loc.target);
  const side = loc.sides.find((s) => !s.alt) ?? loc.sides[0];
  if (side) parts.push(`${cap(side.side)} side`);
  if (loc.floors[0]) parts.push(`floor ${loc.floors[0].floor}`);
  const area = loc.areas.find((a) => !/^(alpha|bravo|charlie|delta)$/.test(a.text));
  if (area && !parts.some((p) => p.toLowerCase().includes(area.text))) parts.push(area.text.replace(/^(front|rear)$/, '$1'));
  return parts.join(', ');
}

export function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Assignments

export interface ParsedAssignment {
  unit: string;
  tasks: Task[];
  taskMatches: Match[];
  location: LocationFacts;
  locationText: string;
  /** Objective stated explicitly (board code or objective words). */
  explicitObjective: boolean;
  isAck: boolean;
  isCanRequest: boolean;
  isCancel: boolean;
  text: string;
}

export function detectTasks(text: string): { tasks: Task[]; matches: Match[] } {
  const found = new Map<Task, Match>();
  for (const t of TASK_ORDER) {
    for (const p of TASK_INFO[t].patterns) {
      const re = new RegExp(p, 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        const before = text.slice(Math.max(0, m.index - 12), m.index);
        if (t === 'primarySearch' && /secondary\s*$/.test(before)) continue;
        if (/\b(no|not|don t|do not|negative)\s+$/.test(before)) continue;
        if (!found.has(t)) found.set(t, { concept: `task:${t}`, start: m.index, end: m.index + m[0].length, text: m[0] });
        break;
      }
    }
  }
  // Specific beats generic
  if (found.has('backupLine')) found.delete('fireControl');
  if (found.has('waterSupply') && found.has('fireControl')) {
    const fc = found.get('fireControl')!;
    if (/supply|lay/.test(fc.text)) found.delete('fireControl');
  }
  if (found.has('primarySearch') && found.has('stage')) found.delete('stage');
  if (found.size > 1 && found.has('recon') && /360/.test(text) && found.has('stage')) found.delete('stage');
  if (found.has('defensive') && found.has('fireControl') && /master|deck|aerial|2 1\/2/.test(text)) found.delete('fireControl');
  if (found.has('onDeck')) found.delete('stage');
  const tasks = [...found.keys()];
  return { tasks, matches: [...found.values()].sort((a, b) => a.start - b.start) };
}

export function parseAssignment(seg: UnitSegment, ownUnit: string, extraTerms: string[] = []): ParsedAssignment {
  const text = seg.text;
  const { tasks, matches } = detectTasks(text);
  const location = extractLocation(text, extraTerms, ownUnit);
  const explicitObjective =
    /\b(fire control|primary search|water supply|loss control|on deck|for (fire control|search|primary|water supply|exposure|loss control|extension|ventilation))\b/.test(text) ||
    /\b(to|so we can) (protect|confirm|find|stop|prevent|keep|support|control|cut off|check|get|clear)\b/.test(text);
  const isAck = findConcept(text, 'ack').length > 0 && tasks.length === 0;
  const isCanRequest = findConcept(text, 'canRequest').length > 0;
  const isCancel = /\b(cancel|return to quarters|back in service|release|you re released|available)\b/.test(text) && tasks.length === 0;
  return {
    unit: seg.unit,
    tasks,
    taskMatches: matches,
    location,
    locationText: describeLocation(location),
    explicitObjective,
    isAck,
    isCanRequest,
    isCancel,
    text,
  };
}

// ---------------------------------------------------------------------------
// Report facts (initial report, follow-up, transfer)

export interface ReportFacts {
  onScene: Match[];
  sizes: { value: SizeClass; m: Match }[];
  stories: { value: number; m: Match }[];
  highRise: Match[];
  occupancies: { value: OccupancyClass; m: Match }[];
  problems: { value: Problem | 'moderate'; m: Match }[];
  strategies: { value: Strategy; m: Match }[];
  actions: { value: InitialAction; m: Match }[];
  objectives: { value: 'fireControl' | 'primarySearch' | 'exposure' | 'investigate'; m: Match }[];
  resources: { value: ResourceDecision; m: Match }[];
  command: { established: boolean; name?: string; m?: Match; passing: Match[]; fastAttack: Match[] };
  location: LocationFacts;
}

type Syn = Record<string, string[]> | undefined;

function collect<T>(text: string, pairs: [string, T][], syn: Syn): { value: T; m: Match }[] {
  const out: { value: T; m: Match }[] = [];
  for (const [concept, value] of pairs) for (const m of findConcept(text, concept, { synonyms: syn })) out.push({ value, m });
  return out.sort((a, b) => a.m.start - b.m.start);
}

const NAME_STOP = new Set([
  'establish', 'establishing', 'established', 'assume', 'assuming', 'will', 'be', 'is', 'taking', 'take', 'initiate',
  'initiating', 'have', 'has', 'in', 'of', 'the', 'and', 'to', 'from', 'as', 'this', 'passing', 'pass', 'transfer',
  'transferring', 'you', 'i', 'm', 'we', 'll', 'at', 'with', 'for', 'mobile', 'fast', 'attack', 'a', 're', 'are', 'your',
  'my', 'our', 'into', 'on', 'scene', 'command', 's', 'it', 'until', 'now', 'got', 'hold', 'holding', 'retain', 'keep',
]);

export function extractCommand(text: string): ReportFacts['command'] {
  const passing = findConcept(text, 'passingCommand');
  const fastAttack = findConcept(text, 'fastAttackMode');
  const re = /\b((?:[a-z0-9]+ ){0,3})command\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const words = m[1].trim().split(/\s+/).filter(Boolean);
    const name: string[] = [];
    let stopper = '';
    for (let i = words.length - 1; i >= 0; i--) {
      if (NAME_STOP.has(words[i])) {
        stopper = words[i];
        break;
      }
      name.unshift(words[i]);
    }
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 20);
    const establishedPhrase =
      /\b(establish\w*|assum\w*|initiat\w*|taking|will be|is)\s*$/.test(m[1]) || /^\s*(is )?(established|will be)/.test(after) || /^\s*post\b/.test(after) === false;
    if (stopper === 'pass' || stopper === 'passing' || stopper === 'transfer' || stopper === 'transferring') continue;
    if ((stopper === 'to' || stopper === 'from') && name.length) continue; // addressing another party
    if (/\byou (have|got)\s*$/.test(m[1])) continue;
    if (name.length && name.length <= 3) {
      return {
        established: true,
        name: name.join(' '),
        m: { concept: 'command', start: m.index, end: m.index + m[0].length, text: m[0] },
        passing,
        fastAttack,
      };
    }
    if (!name.length && /\b(establish\w*|assum\w*|initiat\w*|taking)\s*$/.test(m[1]) && establishedPhrase) {
      return { established: true, m: { concept: 'command', start: m.index, end: m.index + m[0].length, text: m[0] }, passing, fastAttack };
    }
  }
  return { established: false, passing, fastAttack };
}

export function extractReportFacts(text: string, syn?: Syn, areaTerms: string[] = [], ownUnit = 'Engine 14'): ReportFacts {
  const stories: ReportFacts['stories'] = [];
  const storyRe = /\b(\d{1,2}) (story|stories|storey|level)\b/g;
  let m: RegExpExecArray | null;
  while ((m = storyRe.exec(text))) {
    stories.push({ value: Number(m[1]), m: { concept: 'stories', start: m.index, end: m.index + m[0].length, text: m[0] } });
  }
  const singleRe = /\bsingle (story|level)\b/g;
  while ((m = singleRe.exec(text))) stories.push({ value: 1, m: { concept: 'stories', start: m.index, end: m.index + m[0].length, text: m[0] } });
  const floorsBldg = /\b(\d{1,2}) floors?\b(?! (above|below|up|down))/g;
  while ((m = floorsBldg.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 10), m.index);
    if (/\b(on|the|to|of)\s*$/.test(before)) continue;
    stories.push({ value: Number(m[1]), m: { concept: 'stories', start: m.index, end: m.index + m[0].length, text: m[0] } });
  }
  return {
    onScene: findConcept(text, 'onScene', { synonyms: syn }),
    sizes: collect<SizeClass>(text, [['sizeSmall', 'small'], ['sizeMedium', 'medium'], ['sizeLarge', 'large'], ['sizeMega', 'mega']], syn),
    stories: stories.sort((a, b) => a.m.start - b.m.start),
    highRise: [...text.matchAll(/\bhigh rise\b/g)].map((x) => ({ concept: 'highRise', start: x.index!, end: x.index! + x[0].length, text: x[0] })),
    occupancies: collect<OccupancyClass>(
      text,
      [['occResidential', 'residential'], ['occMultifamily', 'multifamily'], ['occCommercial', 'commercial'], ['occHotel', 'hotel'], ['occMixed', 'mixed-use']],
      syn,
    ),
    problems: dedupeProblems(
      collect<Problem | 'moderate'>(
        text,
        [['nothingShowing', 'nothing-showing'], ['lightSmoke', 'light-smoke'], ['moderateSmoke', 'moderate'], ['workingFire', 'working-fire'], ['defensiveConditions', 'defensive']],
        syn,
      ),
    ),
    strategies: collect<Strategy>(text, [['offensive', 'offensive'], ['defensive', 'defensive'], ['investigating', 'investigating']], syn),
    actions: collect<InitialAction>(
      text,
      [['actAttackLine', 'attack-line'], ['actQuickAttack', 'quick-attack'], ['actSupplyLine', 'supply-line'], ['actDefensive', 'defensive-ops'], ['actInvestigate', 'investigate'], ['actRescue', 'rescue'], ['actStandpipe', 'standpipe-attack']],
      syn,
    ),
    objectives: collect(text, [['objFireControl', 'fireControl' as const], ['objPrimarySearch', 'primarySearch' as const], ['objExposure', 'exposure' as const]], syn).filter(
      (o) => !(o.value === 'primarySearch' && /secondary\s*$/.test(text.slice(Math.max(0, o.m.start - 12), o.m.start))),
    ),
    resources: dedupeResources(
      collect<ResourceDecision>(
        text,
        [['resCancel', 'cancel'], ['resReduce', 'reduce'], ['resLevel1', 'level1'], ['resContinue', 'continue'], ['resUpgrade', 'upgrade'], ['resHold', 'hold']],
        syn,
      ),
    ),
    command: extractCommand(text),
    location: extractLocation(text, areaTerms, ownUnit),
  };
}

function overlaps(a: Match, b: Match) {
  return a.start < b.end && b.start < a.end;
}

function dedupeProblems(list: { value: Problem | 'moderate'; m: Match }[]) {
  // A more specific (longer) phrase wins over a generic overlapping one
  return list.filter((p) => !list.some((q) => q !== p && overlaps(p.m, q.m) && q.m.text.length > p.m.text.length));
}

function dedupeResources(list: { value: ResourceDecision; m: Match }[]) {
  return list.filter(
    (p) => !list.some((q) => q !== p && overlaps(p.m, q.m) && (q.m.text.length > p.m.text.length || (p.value === 'cancel' && q.value === 'reduce'))),
  );
}
