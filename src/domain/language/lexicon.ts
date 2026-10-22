// Concept lexicon: regular-expression patterns over normalized text.
// Patterns are deliberately phrase-level so that harmless wording differences
// are accepted while facts are still extracted precisely. Instructors can add
// plain-phrase synonyms per concept through the vocabulary settings.

import { escapeRegex } from './normalize';

const SIDE = '(alpha|bravo|charlie|delta)';
const BLDG =
  '((\\d+|single|multi|multiple|split) (story|stories|level)|commercial|residential|residence|house|home|building|structure|apartments?|condo(minium)?s?|single family|family|duplex|town ?(home|house)s?|motel|hotel|strip|store|restaurant|office|mixed|multi ?family|high rise|garden|ranch|elevated|beach|dwelling|occupancy|convenience|shopping|retail)';

export const LEXICON = {
  onScene: ['\\b(on scene|on location|arriving|on the scene|at scene)\\b'],

  // --- Building description
  sizeSmall: [`\\bsmall(,)? (sized? )?${BLDG}`, '\\bsmall size\\b'],
  sizeMedium: [`\\bmedium(,)? (sized? )?${BLDG}`, '\\bmedium size\\b'],
  sizeLarge: [`\\blarge(,)? (sized? )?${BLDG}`, '\\blarge size\\b'],
  sizeMega: [`\\bmega(,)? (sized? )?${BLDG}`, '\\bmega size\\b'],

  occResidential: ['\\bresidential\\b', '\\bresidence\\b', '\\bhouse\\b', '\\bhome\\b', '\\bsingle family\\b', '\\bdwelling\\b', '\\branch\\b'],
  occMultifamily: [
    '\\bmulti ?family\\b', '\\bapartments?( building| complex)?\\b', '\\bcondo(minium)?s?\\b', '\\bduplex\\b',
    '\\btown ?(home|house)s?\\b', '\\bgarden style\\b', '\\bmulti ?unit\\b', '\\b(tri|four)plex\\b', '\\brow houses?\\b',
  ],
  occCommercial: [
    '\\bcommercial\\b', '\\bstrip (mall|center|plaza|shopping)\\b', '\\bshopping (center|plaza)\\b', '\\bstores?\\b',
    '\\brestaurant\\b', '\\boffice( building)?\\b', '\\bbusiness\\b', '\\bconvenience\\b', '\\bgas station\\b',
    '\\bretail\\b', '\\bwarehouse\\b',
  ],
  occHotel: ['\\bhotel\\b', '\\bmotel\\b', '\\bresort\\b', '\\binn\\b'],
  occMixed: ['\\bmixed use\\b', '\\bmixed occupancy\\b'],

  // --- Problem description
  nothingShowing: [
    '\\bnothing (is )?(showing|evident|visible|seen)\\b',
    '\\bno (smoke or fire|fire or smoke|smoke|fire|flames?) (showing|visible|evident|seen)\\b',
    '\\bno visible (smoke|fire|flames?)\\b',
    '\\bnothing (visible |evident )?from the (exterior|outside)\\b',
    '\\bnothing showing\\b',
  ],
  lightSmoke: ['\\blight (amount of |haze of )?smoke\\b', '\\b(small|little|slight) (amount of )?smoke\\b', '\\b(light )?haze\\b', '\\bwisps? of smoke\\b', '\\blight smoke\\b'],
  moderateSmoke: [
    '\\bmoderate (amount of |volume of )?smoke\\b', '\\bsmoke (is )?showing\\b', '\\b(gray|grey|white) smoke\\b',
    '\\bsmoke (coming|issuing|pushing|venting) (out )?(from|of)\\b', '\\bsmoke from\\b',
  ],
  workingFire: [
    '\\bworking (structure |house |commercial |residential )?fire\\b',
    '\\b(heavy|thick|dark|black|brown|large amount of|lot of|lots of) (black |dark |gray |grey |brown )?smoke\\b',
    '\\bfire (is )?showing\\b', '\\bflames? (showing|visible|from|coming)\\b', '\\bvisible (fire|flames?)\\b',
    '\\bfire (coming )?(from|through|out of|venting)\\b', '\\bsmoke and (fire|flames?)\\b', '\\b(fire|flames?) and smoke\\b',
    '\\bactive fire\\b', '\\bfire in the\\b',
    '\\b(dumpster|vehicle|car|trash|kitchen|garage|attic|room|bedroom|apartment|balcony|office|unit|wall|duct|hood) fire\\b',
  ],
  defensiveConditions: [
    '\\bdefensive (fire )?conditions\\b', '\\bfully involved\\b', '\\bheavily involved\\b', '\\bwell involved\\b',
    '\\b(heavy|large) (volume of )?fire (throughout|through the roof)\\b', '\\broof (has )?(partially )?collapsed?\\b',
    '\\bfire through the roof\\b', '\\bfully engulfed\\b',
  ],

  // --- Strategy
  offensive: ['\\boffensive( mode| strategy| operations)?\\b', '\\bgoing offensive\\b'],
  defensive: ['\\bdefensive(?! (fire )?conditions| (operations|attack|lines?|positions?)\\b)( mode| strategy)?\\b', '\\bgoing defensive\\b'],
  investigating: ['\\binvestigat(ing|ive|ion)( mode)?\\b'],

  // --- Initial actions
  actAttackLine: [
    '\\b(stretch|stretching|pull|pulling|deploy|deploying|advance|advancing|taking|take|going in with|bringing)( (a|an|the|our|my|1|2))?( \\S+)?( \\S+)? (hand ?line|attack line|lines?|pre ?connect|cross ?lay|1 3/4|1 and 3 quarters?|inch and 3 quarters?)\\b',
    '\\battack line\\b', '\\bhand ?line\\b', '\\binterior attack\\b', '\\boffensive attack\\b', '\\bfire attack\\b',
  ],
  actQuickAttack: ['\\bquick (attack|hit|knock ?down)\\b', '\\btransitional attack\\b', '\\bexterior (hit|attack)\\b', '\\bhit it from the (outside|exterior)\\b', '\\bfast attack\\b'],
  actSupplyLine: [
    '\\b(lay|laying|laid|layed|drop|dropping|dropped)( (a|in|our|my|the|own))*( own)? (supply ?line|5 inch|ldh|line|in)\\b',
    '\\blaying in\\b', '\\bforward lay\\b', '\\breverse lay\\b', '\\b(catch|catching|caught) (a|the) hydrant\\b',
    '\\bsupply line\\b', '\\bour own (water|supply)\\b', '\\b(establishing|establish) (our|my) (own )?water\\b',
  ],
  actDefensive: [
    '\\bmaster streams?\\b', '\\bdeck gun\\b', '\\bdefensive (operations|attack|lines?|positions?)\\b',
    '\\bexposure protection\\b', '\\bprotect(ing)? (the )?(\\w+ )?exposures?\\b', '\\bblitz\\b', '\\b2 1/2\\b', '\\bmonitor\\b',
  ],
  actInvestigate: ['\\binvestigat(e|ing|ion)\\b', '\\bcheck(ing)? (it|things|this) out\\b', '\\bgoing (in|inside) to (check|investigate|look)\\b'],
  actRescue: ['\\b(rescue|rescuing|removing|remove|removal of) (a |the |one |an )?(victim|occupant|person|patient|resident)s?\\b', '\\bmaking (a )?rescue\\b'],
  actStandpipe: ['\\bstandpipe\\b', '\\bhigh rise (pack|kit|bag)s?\\b', '\\bhose (pack|bag)s?\\b', '\\b(stairwell|stair) (connection|outlet)\\b'],

  // --- Tactical objectives
  objFireControl: ['\\bfire control\\b', '\\bextinguish(ment)?\\b', '\\bknock(ing)? (it |the fire )?down\\b', '\\bput(ting)? (it|the fire) out\\b', '\\bfire attack\\b', '\\bconfine\\b'],
  objPrimarySearch: ['\\bprimary( search)?\\b', '\\bsearch(ing)? (and rescue|for (victims|occupants|the occupant))\\b', '\\b(search|searching)\\b(?! complete)'],
  objExposure: ['\\bexposures?\\b'],

  // --- Resource determination
  resCancel: ['\\bcancel(ling)?( all| everyone| everybody| the rest| remaining| other| additional| incoming| any)*( units| companies| assignment| response| traffic| responding)?\\b', '\\bdisregard\\b', '\\breturn(ing)? (to|in) service\\b'],
  resReduce: ['\\breduce\\b', '\\bonly need\\b', '\\bcancel (engine|ladder|tower|rescue|squad|battalion|medic) \\d+', '\\b(keep|hold) (only )?(the )?(1st|2nd|next) (engine|due|in)\\b', '\\b(1st|2nd) due (continue|only)\\b'],
  resLevel1: ['\\blevel 1( staging| stage)?\\b', '\\bstage (at )?level 1\\b', '\\b(all|other|remaining|incoming) (units|companies) (stage|staging)\\b', '\\beveryone else stage\\b'],
  resContinue: ['\\b(all|everyone|everybody|other|remaining|incoming|responding)( other)?( units| companies)? (continue|keep coming|come on in|respond)\\b', '\\bcontinue (in|the|all|your|response)\\b', '\\bbring (them|everyone|everybody) in\\b'],
  resUpgrade: [
    '\\bupgrade\\b', '\\bworking fire (assignment|dispatch|response|alarm|box)\\b', '\\b(2nd|3rd|additional|another) alarm\\b',
    '\\brequest(ing)? (an? )?(additional|2nd|another|extra) (alarm|engines?|ladders?|units?|towers?|assignment|companies|rescue)\\b',
    '\\b(start|send) (me )?(an?|another|additional) (engine|ladder|unit|tower|alarm|rescue)\\b', '\\bbox alarm\\b', '\\bstrike (a|the) (2nd|second) alarm\\b',
  ],
  resHold: ['\\bhold (all |other |remaining |incoming )?(units|companies|traffic)\\b', '\\bhold (at|your) (the )?(hydrant|corner|position|intersection)\\b', '\\bhave (all )?units hold\\b'],

  // --- Command
  passingCommand: ['\\bpassing command\\b', '\\bpass(ing)? command to\\b'],
  fastAttackMode: ['\\bfast attack mode\\b', '\\bmobile command\\b', '\\bin fast attack\\b'],
  commandPost: ['\\bcommand (post )?(will be |is )?(at|located at|on) (the )?(engine 14|alpha|bravo|charlie|delta|\\w+ side|corner)'],

  // --- Follow-up
  recon360Complete: ['\\b360 (is |has been |was )?(complete|completed|done|finished)\\b', '\\b(completed|finished|did|done|made|have|performed) (my |the |a |our )?360\\b', '\\b360 (complete|all sides)\\b'],
  recon360Incomplete: [
    '\\b360 (is |was )?(not|incomplete|partial|unable|could not|couldn t|can t|cannot)\\b', '\\b(unable|not able|could not|couldn t|can t|cannot) (to )?(complete|do|make|perform|get) (a |the |my )?360\\b',
    '\\bno 360\\b', '\\bpartial 360\\b', '\\b360 not (complete|completed|possible|done)\\b', '\\bhave not (completed|done) (the |a |my )?360\\b',
  ],
  noBasement: ['\\bno basement\\b', '\\bslab( on grade)?\\b', '\\bwithout (a )?basement\\b', '\\bbasement negative\\b'],
  hasBasement: ['\\b(has|have|with) (a )?basement\\b', '\\bbasement (access|entrance|door) (is )?(on|at|from)\\b'],
  accountability: ['\\baccountability\\b', '\\bpar (is |will be )?(at|on)\\b', '\\bpassport\\b'],
  strategyContinue: ['\\b(remain|remaining|continue|continuing|stay|staying|still) (in )?(offensive|defensive|investigat\\w+)\\b', '\\bsame strategy\\b', '\\bno change in strategy\\b'],
  strategyChange: ['\\b(switch|switching|change|changing|going|transition|transitioning|move|moving) (to |into )?(an? )?(offensive|defensive|investigat\\w+)\\b'],

  // --- Transfer
  transferConfirm: [
    '\\byou (have|got|now have|ve got) command\\b', '\\b(transfer|transferring|pass|passing|turning|turn) (of )?command (over )?(to you)?\\b',
    '\\bcommand is (yours|transferred)\\b', '\\byou(r)? (are|re) (now )?(in )?command\\b', '\\bassume command\\b', '\\btake command\\b', '\\bhand(ing)? (off |over )?command\\b',
  ],
  needs: ['\\b(need|needs|needing|requesting|request|could use|would like|want)\\b', '\\bno (additional |other |further )?(needs|resources needed|requests)\\b', '\\bnothing (else )?(needed|further)\\b'],
  ack: ['\\b(copy|copies|copied|received|understood|affirm(ative)?|10 ?4|roger|good copy|copy that)\\b'],
  canRequest: ['\\bcan report\\b', '\\bconditions,? actions,? (and )?needs\\b', '\\bgive me (a |an )?(update|status|report)\\b', '\\bwhat are your conditions\\b'],
  parRequest: ['\\bpar\\b', '\\bpersonnel accountability\\b'],

  // --- Benchmarks (completed work)
  bmWaterSupply: ['\\b(water supply|hydrant)( is| has been)? (established|in place|secured|complete|completed)\\b', '\\b(we have|have|got|on) (a |our )?(water supply|hydrant)\\b', '\\bpositive water supply\\b', '\\bwater supply established\\b'],
  bmPrimary: ['\\bprimary( search)?( is| has been)? (all )?clear\\b', '\\bprimary( search)?( is| has been)? (complete|completed|negative|done)\\b', '\\ball clear\\b', '\\bprimary all clear\\b'],
  bmKnockdown: ['\\bknock(ed)? ?down\\b', '\\b(fire|it)( is| has been)? (out|under control|controlled|knocked down)\\b', '\\bfire control( is| has been)? (complete|achieved|established)\\b', '\\bfire under control\\b'],
  bmLossControl: ['\\bloss control( is| has been)? (complete|done|underway)\\b'],
} as const satisfies Record<string, readonly string[]>;

export type ConceptId = keyof typeof LEXICON;

export const SIDE_RE = SIDE;

export interface Match {
  concept: string;
  start: number;
  end: number;
  text: string;
}

const NEGATORS = /\b(no|not|without|negative|nothing|none|never|isn t|isnt|aren t|n t)\s+([a-z0-9]+\s+){0,1}$/;

const cache = new Map<string, RegExp[]>();

export function compileConcept(concept: string, synonyms?: Record<string, string[]>): RegExp[] {
  const extra = synonyms?.[concept] ?? [];
  const key = `${concept}::${extra.join('|')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const base = (LEXICON as Record<string, readonly string[]>)[concept] ?? [];
  const res = [...base, ...extra.filter((s) => s.trim()).map((s) => `\\b${escapeRegex(s.trim().toLowerCase())}\\b`)].map(
    (p) => new RegExp(p, 'g'),
  );
  cache.set(key, res);
  return res;
}

export function findConcept(
  text: string,
  concept: string,
  opts: { synonyms?: Record<string, string[]>; allowNegated?: boolean } = {},
): Match[] {
  const out: Match[] = [];
  for (const re of compileConcept(concept, opts.synonyms)) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      const before = text.slice(Math.max(0, m.index - 24), m.index);
      if (!opts.allowNegated && NEGATORS.test(before)) continue;
      if (!out.some((o) => o.start <= m!.index && o.end >= m!.index + m![0].length)) {
        out.push({ concept, start: m.index, end: m.index + m[0].length, text: m[0] });
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export function hasConcept(text: string, concept: string, synonyms?: Record<string, string[]>): boolean {
  return findConcept(text, concept, { synonyms }).length > 0;
}

/** Match a plain term list (used for scenario-specific area terms and finding matchers). */
export function findTerms(text: string, terms: string[]): Match[] {
  const out: Match[] = [];
  for (const term of terms) {
    const t = term.trim().toLowerCase();
    if (!t) continue;
    const re = new RegExp(`\\b${escapeRegex(t).replace(/\\\*/g, '\\w*')}`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) out.push({ concept: `term:${t}`, start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** True if every term in any group appears (wildcard * allowed at end of a term). */
export function matchesGroups(text: string, groups: string[][]): Match[] | null {
  for (const group of groups) {
    const spans: Match[] = [];
    let ok = true;
    for (const term of group) {
      const found = findTerms(text, [term]);
      if (!found.length) {
        ok = false;
        break;
      }
      spans.push(found[0]);
    }
    if (ok) return spans;
  }
  return null;
}
