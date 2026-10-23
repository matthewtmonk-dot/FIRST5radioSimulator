// Instructor-configurable rubric, terminology and response-plan settings.
// The initial report, follow-up and unit assignment items follow the wording of
// the VCFR Engine Company Incident Command Board (Station 14 copy, provided by
// the project's instructor). The command transfer items are not on that board
// and remain provisional. Nothing here is an official or certified standard.

import type { UnitType } from '../scenario/schema';

export type SectionId = 'initialReport' | 'assignments' | 'followUp' | 'transfer';

export const SECTION_LABELS: Record<SectionId, string> = {
  initialReport: 'Initial Radio Report',
  assignments: 'Initial Actions & Assignments',
  followUp: 'Follow-Up Report',
  transfer: 'Command Transfer',
};

export interface RubricItem {
  id: string;
  section: SectionId;
  label: string;
  /** Coaching question shown by the Hint button — never the answer itself. */
  hint: string;
  /** Short board-style abbreviation for the compact command board. */
  board?: string;
  weight: number;
  critical: boolean;
  enabled: boolean;
}

export interface RubricConfig {
  version: number;
  provisional: boolean;
  source: string;
  items: RubricItem[];
  sectionWeights: Record<SectionId, number>;
  /** An incorrect item loses its own weight plus this fraction again. */
  incorrectPenalty: number;
  /** Section score ceiling when a dangerous misunderstanding is present. */
  dangerousCap: number;
  commandNaming: 'street' | 'any';
  transfer: {
    /** Who notifies dispatch after a transfer. */
    dispatchNotificationBy: 'receiving' | 'transferring';
  };
}

const item = (
  section: SectionId,
  id: string,
  label: string,
  weight: number,
  hint: string,
  opts: { critical?: boolean; board?: string } = {},
): RubricItem => ({
  id,
  section,
  label,
  weight,
  hint,
  critical: opts.critical ?? false,
  board: opts.board,
  enabled: true,
});

export const DEFAULT_RUBRIC: RubricConfig = {
  version: 2,
  provisional: true,
  source:
    'Initial Radio Report, Follow-Up Report and Unit Assignment items follow the wording of the Engine Company Incident Command Board (Station 14 copy). Command Transfer items are not on the board and are provisional. Weights, penalties and pass levels are training choices, not department policy. Not an official or certified standard.',
  items: [
    item('initialReport', 'ir.onScene', 'Unit on scene', 0.5, 'Did you identify your unit and that you are on scene?'),
    item('initialReport', 'ir.size', 'Building size', 1.5, 'Size: small, medium, large or mega?', { board: 'Size S/M/L/Mega' }),
    item('initialReport', 'ir.height', 'Building height', 1.5, 'Height: how many stories (1 to 5+)?', { board: 'Height 1–5' }),
    item('initialReport', 'ir.occupancy', 'Occupancy type', 1.5, 'Occupancy type?', { board: 'Occupancy type' }),
    item('initialReport', 'ir.problem', 'Problem description', 3, 'Nothing showing, light smoke, working fire, or defensive fire conditions?', { critical: true, board: 'Problem' }),
    item('initialReport', 'ir.location', 'Location of the problem', 2, 'Location of the problem (side, floor, area)?', { board: 'Location of problem' }),
    item('initialReport', 'ir.action', 'IAP task', 3, 'Initial incident action plan task: supply-line, stretch attack line, quick hit, or defensive operations?', { critical: true, board: 'IAP task' }),
    item('initialReport', 'ir.actionLocation', 'IAP location', 1, 'Where is that task being done?', { board: 'IAP location' }),
    item('initialReport', 'ir.objectives', 'IAP objectives', 1.5, 'Objectives: fire control, primary search?', { board: 'Objectives F/C · P/S' }),
    item('initialReport', 'ir.strategy', 'Strategy', 3, 'Strategy: offensive, defensive, or investigating?', { critical: true, board: 'Strategy' }),
    item('initialReport', 'ir.resources', 'Resource determination', 2, 'Cancel additional, Level One staging, or upgrade to a 2nd+ alarm?', { board: 'Resource determination' }),
    item('initialReport', 'ir.command', 'Assume and name command', 3, 'Did you assume and name command?', { critical: true, board: 'Assume & name command' }),
    item('initialReport', 'ir.concise', 'Concise transmission', 1, 'Could the same information be said with fewer words?'),

    item('assignments', 'as.who', 'Unit', 1, 'Did each assignment name the receiving unit?', { board: 'Unit' }),
    item('assignments', 'as.what', 'Tasks', 2, 'Did each assignment state the task?', { board: 'Tasks' }),
    item('assignments', 'as.where', 'Location', 1.5, 'Did each assignment say where to work?', { board: 'Location' }),
    item('assignments', 'as.why', 'Objectives', 1, 'Did the unit know its objective: F/C, P/S, W/S, L/C or O/D?', { board: 'Objectives F/C P/S W/S L/C O/D' }),
    item('assignments', 'as.coverage', 'Critical tasks assigned', 3, 'Are the critical tactical objectives covered by someone?', { critical: true }),
    item('assignments', 'as.consistent', 'Consistent with strategy', 2, 'Do the assignments match your declared strategy?', { critical: true }),
    item('assignments', 'as.loop', 'Communication loop closed', 1.5, 'Did you acknowledge benchmark and progress reports?'),
    item('assignments', 'as.idle', 'Arriving units given direction', 1, 'Did every arriving unit receive an assignment or staging instruction?'),

    item('followUp', 'fu.360', 'Results of the 360', 2, 'Was the 360 completed or not completed?', { critical: true, board: '360 completed / not' }),
    item('followUp', 'fu.basement', 'Basement', 1, 'Basement yes or no? If yes: window well, look-out, or walk-out?', { board: 'Basement Y/N' }),
    item('followUp', 'fu.sides', '360 findings', 2, 'What did the 360 show on the other sides?', { board: '360 findings' }),
    item('followUp', 'fu.safety', 'Immediate safety concerns', 2, 'Any immediate safety concerns everyone needs to hear?', { critical: true, board: 'Immediate safety concerns' }),
    item('followUp', 'fu.strategy', 'Confirm strategy', 2, 'Confirm strategy: offensive or defensive?', { board: 'Confirm strategy' }),
    item('followUp', 'fu.iap', 'Changes to IAP', 1.5, 'Any changes to the incident action plan?', { board: 'Changes to IAP' }),
    item('followUp', 'fu.accountability', 'Accountability location', 1, 'Accountability location: Alpha, Bravo, Charlie or Delta?', { board: 'Accountability A/B/C/D' }),
    item('followUp', 'fu.concise', 'Concise transmission', 1, 'Could the same information be said with fewer words?'),

    item('transfer', 'tr.conditions', 'Current conditions', 2, 'What are the building and fire conditions now?'),
    item('transfer', 'tr.strategy', 'Current strategy', 2, 'What is the strategy?'),
    item('transfer', 'tr.actions', 'Actions completed & underway', 2, 'What has been completed and what is in progress?'),
    item('transfer', 'tr.units', 'Unit locations & assignments', 2, 'Where is each unit and what is it doing?'),
    item('transfer', 'tr.priorities', 'Priorities & benchmarks remaining', 1.5, 'What benchmarks or priorities remain?'),
    item('transfer', 'tr.safety', 'Safety concerns', 1.5, 'Which hazards does the incoming commander need to know?'),
    item('transfer', 'tr.needs', 'Outstanding needs', 1, 'What resources or support are still needed?'),
    item('transfer', 'tr.confirm', 'Transfer explicitly confirmed', 2, 'Was the transfer of command clearly stated and acknowledged?', { critical: true }),
    item('transfer', 'tr.dispatch', 'Dispatch notified', 1, 'Was dispatch told who has command?'),
    item('transfer', 'tr.concise', 'Organized and concise', 1, 'Was the briefing organized and free of filler?'),
  ],
  sectionWeights: { initialReport: 35, assignments: 20, followUp: 20, transfer: 25 },
  incorrectPenalty: 0.5,
  dangerousCap: 50,
  commandNaming: 'street',
  transfer: { dispatchNotificationBy: 'receiving' },
};

/** Reference panels from the Engine Company Incident Command Board, shown on the in-app command board. */
export const BOARD_REFERENCE = {
  tacticalPriorities: ['Water on fire', 'Primary all clear', 'Fire knock down', 'Fire control', 'Secondary all clear', 'Loss stopped'],
  communicationTickets: [
    ['Mayday', '"Mayday, Mayday, Mayday", CAN report: who, what, where, needs'],
    ['Priority traffic', 'Information that may change the IAP, fire in the attic or other concealed space, victims located'],
    ['Roof report', 'Type, stability, conditions, firewall location, dead loads, attic condition'],
    ['Status change', 'Achievement of tasks or tactical priorities, request for new assignment'],
  ] as [string, string][],
  objectives: 'F/C Fire control · P/S Primary search · W/S Water supply · L/C Loss control · O/D On deck',
  maydayHelpOrder: ['Firefighter self-rescues', "Firefighter's crew", 'Another interior crew', 'On-deck company'],
  maydayChecklist: ['Calm down', 'Control breathing', 'Conserve air, report air level', 'Activate PASS device', 'Thermal imaging camera?'],
  bigBoxEntry: ['Fire attack team (2 companies)', 'Supply FDC', 'Roof/tilt wall report', 'On-deck company'],
};

export interface ResponsePlanConfig {
  ownUnit: string;
  dispatchName: string;
  /** Sample call signs by unit type. Edit to match the district — these are not real assignments. */
  pools: Record<UnitType, string[]>;
  sample: boolean;
}

export const DEFAULT_RESPONSE_PLAN: ResponsePlanConfig = {
  ownUnit: 'Engine 14',
  dispatchName: 'Dispatch',
  pools: {
    engine: ['Engine 42', 'Engine 12', 'Engine 15', 'Engine 13', 'Engine 46'],
    ladder: ['Ladder 41', 'Ladder 11'],
    tower: ['Tower 15'],
    rescue: ['Rescue 14', 'Rescue 12'],
    squad: ['Squad 11'],
    battalion: ['Battalion 1'],
    tanker: ['Tanker 21'],
    medic: ['Medic 14'],
  },
  sample: true,
};

/** Speech-to-text correction rules and extra accepted terminology. */
export interface VocabularyConfig {
  /** Applied to raw transcripts before parsing (case-insensitive). */
  corrections: { from: string; to: string }[];
  /** Additional accepted phrases per concept id (see language/lexicon.ts). */
  synonyms: Record<string, string[]>;
  /** Extra words given to speech recognizers as hints. */
  hints: string[];
}

export const DEFAULT_VOCABULARY: VocabularyConfig = {
  corrections: [
    { from: 'engine fourteen', to: 'Engine 14' },
    { from: 'engine one four', to: 'Engine 14' },
    { from: 'alfa', to: 'Alpha' },
    { from: 'charley', to: 'Charlie' },
    { from: 'brava', to: 'Bravo' },
    { from: 'delta side', to: 'Delta side' },
    { from: 'offence', to: 'offensive' },
    { from: 'offense of', to: 'offensive' },
    { from: 'defense of', to: 'defensive' },
    { from: 'level won', to: 'level one' },
    { from: 'can report', to: 'CAN report' },
    { from: 'three sixty', to: '360' },
    { from: 'primary surge', to: 'primary search' },
    { from: 'water supplied', to: 'water supply' },
    { from: 'battalion won', to: 'Battalion 1' },
  ],
  synonyms: {},
  hints: [
    'Engine 14', 'Command', 'Alpha', 'Bravo', 'Charlie', 'Delta', 'offensive', 'defensive', 'investigating',
    'primary search', 'water supply', 'Level One staging', 'CAN report', '360', 'fire control', 'loss control',
    'on deck', 'accountability', 'Battalion 1', 'all clear', 'knockdown',
  ],
};
