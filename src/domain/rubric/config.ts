// Instructor-configurable rubric, terminology and response-plan settings.
// PROVISIONAL: these items are drawn from the FIRST FIVE build brief (section 2),
// not from the department's Engine Company Incident Command Board. They must be
// validated against approved VCFR instructional language before being treated as policy.

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
  version: 1,
  provisional: true,
  source:
    'Provisional checklist derived from the FIRST FIVE build brief (Blue Card-style framework). Not taken from the VCFR Engine Company Incident Command Board and not an official or certified standard. Awaiting instructor validation.',
  items: [
    item('initialReport', 'ir.onScene', 'Unit on scene', 0.5, 'Did you identify your unit and that you are on scene?'),
    item('initialReport', 'ir.size', 'Building size', 1.5, 'How big is the building: small, medium, large or mega?', { board: 'Size' }),
    item('initialReport', 'ir.height', 'Building height', 1.5, 'How many stories?', { board: 'Height' }),
    item('initialReport', 'ir.occupancy', 'Occupancy type', 1.5, 'What kind of occupancy is it?', { board: 'Occupancy' }),
    item('initialReport', 'ir.problem', 'Problem / conditions', 3, 'What do you see: nothing showing, light smoke, working fire, or defensive conditions?', { critical: true, board: 'Problem' }),
    item('initialReport', 'ir.location', 'Location of the problem', 2, 'Where is the problem (side, floor, area)?', { board: 'Location' }),
    item('initialReport', 'ir.action', 'Initial task', 3, 'What is your crew doing first?', { critical: true, board: 'Task' }),
    item('initialReport', 'ir.actionLocation', 'Location of assigned work', 1, 'Where is that work being done?', { board: 'Where' }),
    item('initialReport', 'ir.objectives', 'Tactical objectives', 1.5, 'Which tactical objectives apply (fire control, primary search)?', { board: 'F/C · P/S' }),
    item('initialReport', 'ir.strategy', 'Strategy', 3, 'Offensive, defensive, or investigating?', { critical: true, board: 'Strategy' }),
    item('initialReport', 'ir.resources', 'Resource determination', 2, 'What do the incoming resources need to do: cancel, Level One staging, or upgrade?', { board: 'Resources' }),
    item('initialReport', 'ir.command', 'Establish and name command', 3, 'Did you establish and name command?', { critical: true, board: 'Command' }),
    item('initialReport', 'ir.concise', 'Concise transmission', 1, 'Could the same information be said with fewer words?'),

    item('assignments', 'as.who', 'Who — unit identified', 1, 'Did each assignment name the receiving unit?', { board: 'Who' }),
    item('assignments', 'as.what', 'What — task', 2, 'Did each assignment state the task?', { board: 'What' }),
    item('assignments', 'as.where', 'Where — location', 1.5, 'Did each assignment say where to work?', { board: 'Where' }),
    item('assignments', 'as.why', 'Why — tactical objective', 1, 'Did the unit know which objective it is accomplishing?', { board: 'F/C P/S W/S L/C O/D' }),
    item('assignments', 'as.coverage', 'Critical tasks assigned', 3, 'Are the critical tactical objectives covered by someone?', { critical: true }),
    item('assignments', 'as.consistent', 'Consistent with strategy', 2, 'Do the assignments match your declared strategy?', { critical: true }),
    item('assignments', 'as.loop', 'Communication loop closed', 1.5, 'Did you acknowledge benchmark and progress reports?'),
    item('assignments', 'as.idle', 'Arriving units given direction', 1, 'Did every arriving unit receive an assignment or staging instruction?'),

    item('followUp', 'fu.360', '360 status', 2, 'Did you say whether the 360 was completed?', { critical: true, board: '360' }),
    item('followUp', 'fu.basement', 'Basement', 1, 'Is there a basement, and where is access?', { board: 'Basement' }),
    item('followUp', 'fu.sides', 'Conditions on other sides', 2, 'What did you find on the other sides?', { board: 'Sides' }),
    item('followUp', 'fu.safety', 'Immediate safety concerns', 2, 'Are there hazards everyone needs to hear about?', { critical: true, board: 'Safety' }),
    item('followUp', 'fu.strategy', 'Confirm or change strategy', 2, 'Is your strategy the same or changing?', { board: 'Strategy' }),
    item('followUp', 'fu.iap', 'Updated action plan', 1.5, 'What is the plan now?', { board: 'IAP' }),
    item('followUp', 'fu.accountability', 'Accountability location', 1, 'Where is accountability?', { board: 'Acct' }),
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
