// Tactical task catalog: how assignments are recognized in speech and how
// units report progress on them. Board codes follow the trainee's command
// board abbreviations (F/C, P/S, W/S, L/C, O/D).

import type { Task } from '../scenario/schema';

export interface TaskInfo {
  id: Task;
  label: string;
  code?: string;
  /** Regex patterns over normalized text. */
  patterns: string[];
  /** Does a complete assignment need a location ("where")? */
  needsLocation: boolean;
  /** Interior operations are inconsistent with a defensive strategy. */
  interior: boolean;
  /** Default seconds from assignment (or arrival) to the completion report. */
  duration: number;
  /** Progress reports; {unit} {command} {loc} are filled at runtime. */
  ack: string;
  report?: string;
  /** Reports needing acknowledgment from command to close the loop. */
  benchmark?: string;
}

export const TASK_INFO: Record<Task, TaskInfo> = {
  fireControl: {
    id: 'fireControl', label: 'Fire control', code: 'F/C',
    patterns: [
      '\\bfire control\\b', '\\bfire attack\\b', '\\battack line\\b', '\\bhand ?line\\b',
      '\\b(stretch|pull|take|advance|deploy|get)( (a|an|the|another|your|1|2))?( \\S+)? (line|hand ?line|1 3/4|attack line)\\b',
      '\\b(extinguish|knock down|put out|attack) (the )?fire\\b', '\\bgo(ing)? (in|interior) (with|on) (a|the) line\\b',
    ],
    needsLocation: true, interior: true, duration: 110,
    ack: '{unit} copies, fire control {loc}.',
    report: '{unit} to {command}, we have knockdown on the fire {loc}.',
    benchmark: 'knockdown',
  },
  backupLine: {
    id: 'backupLine', label: 'Backup line',
    patterns: ['\\bback ?up (line|the attack line|engine 14|the line|crew)\\b', '\\b(2nd|another|additional) (attack )?line\\b', '\\bback ?up\\b'],
    needsLocation: false, interior: true, duration: 60,
    ack: '{unit} copies, backup line {loc}.',
    report: '{unit} to {command}, backup line in place {loc}.',
  },
  primarySearch: {
    id: 'primarySearch', label: 'Primary search', code: 'P/S',
    patterns: ['\\bprimary( search)?\\b', '\\bsearch and rescue\\b', '\\b(search|searching)\\b'],
    needsLocation: true, interior: true, duration: 100,
    ack: '{unit} copies, primary search {loc}.',
    report: '{unit} to {command}, primary search complete {loc}, all clear.',
    benchmark: 'primary all clear',
  },
  waterSupply: {
    id: 'waterSupply', label: 'Water supply', code: 'W/S',
    patterns: [
      '\\bwater supply\\b', '\\b(lay|laying|catch|catching|bring|establish) (in|a|the|me|us|your)? ?(supply ?line|hydrant|5 inch|water)\\b',
      '\\blay in\\b', '\\bforward lay\\b', '\\breverse lay\\b', '\\bhydrant\\b', '\\b(supply|feed|hook up to|hit) engine 14\\b',
    ],
    needsLocation: false, interior: false, duration: 75,
    ack: '{unit} copies, water supply {loc}.',
    report: '{unit} to {command}, water supply established.',
    benchmark: 'water supply established',
  },
  lossControl: {
    id: 'lossControl', label: 'Loss control', code: 'L/C',
    patterns: ['\\bloss control\\b', '\\bsalvage\\b', '\\bproperty conservation\\b', '\\bcover (the )?(contents|furniture)\\b'],
    needsLocation: true, interior: true, duration: 120,
    ack: '{unit} copies, loss control {loc}.',
    report: '{unit} to {command}, loss control underway {loc}.',
  },
  onDeck: {
    id: 'onDeck', label: 'On deck', code: 'O/D',
    patterns: ['\\bon deck\\b', '\\bstand ?by at the (entry|door|front door)\\b'],
    needsLocation: true, interior: false, duration: 30,
    ack: '{unit} copies, on deck {loc}.',
    report: '{unit} to {command}, {unit} on deck {loc} with tools.',
  },
  ventilation: {
    id: 'ventilation', label: 'Ventilation',
    patterns: ['\\bventilat(e|ion|ing)\\b', '\\bvent(ing)?\\b', '\\bppv\\b', '\\bpositive pressure\\b', '\\b(horizontal|vertical) vent\\b'],
    needsLocation: true, interior: false, duration: 90,
    ack: '{unit} copies, ventilation {loc}.',
    report: '{unit} to {command}, ventilation complete {loc}.',
  },
  exposure: {
    id: 'exposure', label: 'Exposure protection',
    patterns: ['\\bexposure( protection)?\\b', '\\bprotect (the )?(\\w+ )?(exposure|house|building|unit|structure)\\b'],
    needsLocation: true, interior: false, duration: 90,
    ack: '{unit} copies, exposure protection {loc}.',
    report: '{unit} to {command}, line in place protecting the exposure {loc}.',
  },
  rit: {
    id: 'rit', label: 'Rapid intervention',
    patterns: ['\\brit\\b', '\\brapid intervention\\b', '\\biric\\b', '\\bric\\b'],
    needsLocation: false, interior: false, duration: 45,
    ack: '{unit} copies, RIT {loc}.',
    report: '{unit} to {command}, RIT established {loc}.',
  },
  utilities: {
    id: 'utilities', label: 'Utilities',
    patterns: ['\\butilities\\b', '\\b(secure|pull|kill|shut off|control) (the )?(power|meter|electric|gas|utilities)\\b'],
    needsLocation: false, interior: false, duration: 60,
    ack: '{unit} copies, utilities {loc}.',
    report: '{unit} to {command}, utilities secured {loc}.',
  },
  recon: {
    id: 'recon', label: 'Recon / 360',
    patterns: ['\\b360\\b', '\\brecon(naissance)?\\b', '\\b(check|look at) the (alpha|bravo|charlie|delta|rear|back)\\b'],
    needsLocation: false, interior: false, duration: 50,
    ack: '{unit} copies, recon {loc}.',
  },
  checkExtension: {
    id: 'checkExtension', label: 'Check for extension',
    patterns: ['\\b(check|checking) (for )?extension\\b', '\\bextension\\b', '\\b(open|opening|pull|pulling) (up )?(the )?(ceiling|attic|walls?)\\b', '\\boverhaul\\b'],
    needsLocation: true, interior: true, duration: 90,
    ack: '{unit} copies, check for extension {loc}.',
    report: '{unit} to {command}, checked for extension {loc}.',
  },
  investigate: {
    id: 'investigate', label: 'Investigate',
    patterns: ['\\binvestigat(e|ion|ing)\\b', '\\bfind the (source|cause)\\b'],
    needsLocation: true, interior: true, duration: 75,
    ack: '{unit} copies, investigate {loc}.',
  },
  ladders: {
    id: 'ladders', label: 'Ladders',
    patterns: ['\\b(throw|throwing|raise|raising) (ground )?ladders\\b', '\\bladder (the|all) (building|sides)\\b', '\\bground ladders\\b'],
    needsLocation: true, interior: false, duration: 60,
    ack: '{unit} copies, ladders {loc}.',
    report: '{unit} to {command}, ladders in place {loc}.',
  },
  defensive: {
    id: 'defensive', label: 'Defensive operations',
    patterns: ['\\bmaster stream\\b', '\\bdeck gun\\b', '\\baerial (master stream|operations|stream)\\b', '\\bdefensive (line|position|operations|attack)\\b', '\\b2 1/2\\b'],
    needsLocation: true, interior: false, duration: 90,
    ack: '{unit} copies, defensive operations {loc}.',
    report: '{unit} to {command}, master stream in operation {loc}.',
  },
  lobby: {
    id: 'lobby', label: 'Lobby / elevator control',
    patterns: ['\\blobby( control)?\\b', '\\belevator( control)?\\b', '\\bfire alarm panel\\b', '\\bfacp\\b'],
    needsLocation: false, interior: true, duration: 40,
    ack: '{unit} copies, lobby control {loc}.',
    report: '{unit} to {command}, lobby control established, elevators recalled.',
  },
  medical: {
    id: 'medical', label: 'Medical / occupant care',
    patterns: ['\\b(medical|ems|triage|treat|evaluate|assess)\\b', '\\b(check|take care of) the (occupants?|residents?|patients?)\\b', '\\brehab\\b'],
    needsLocation: false, interior: false, duration: 60,
    ack: '{unit} copies, medical {loc}.',
    report: '{unit} to {command}, occupants evaluated, no injuries.',
  },
  stage: {
    id: 'stage', label: 'Stage / stand by',
    patterns: ['\\b(stage|staging|stand ?by|hold) (at|on|in|your|level)\\b', '\\blevel 1\\b', '\\bstand ?by\\b'],
    needsLocation: false, interior: false, duration: 10,
    ack: '{unit} copies, staging {loc}.',
  },
};

export const TASK_ORDER: Task[] = [
  'fireControl', 'primarySearch', 'waterSupply', 'lossControl', 'onDeck', 'ventilation', 'exposure', 'rit',
  'utilities', 'checkExtension', 'investigate', 'ladders', 'backupLine', 'defensive', 'lobby', 'medical', 'recon', 'stage',
];
