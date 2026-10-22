// Scenario template schema. Templates are plain JSON so that authored content,
// builder-created content and imported packs all share one format.
import { z } from 'zod';

export const SIDES = ['alpha', 'bravo', 'charlie', 'delta'] as const;
export const Side = z.enum(SIDES);
export type Side = z.infer<typeof Side>;

export const ARCHETYPES = [
  'ranch-1story',
  'residence-2story',
  'elevated-beach-house',
  'duplex',
  'townhome-row',
  'garden-apartment',
  'highrise-condo',
  'motel-2story',
  'strip-center',
  'convenience-store',
  'small-office',
  'restaurant',
] as const;
export const Archetype = z.enum(ARCHETYPES);
export type Archetype = z.infer<typeof Archetype>;

export const SizeClass = z.enum(['small', 'medium', 'large', 'mega']);
export type SizeClass = z.infer<typeof SizeClass>;

export const OccupancyClass = z.enum(['residential', 'multifamily', 'commercial', 'hotel', 'mixed-use']);
export type OccupancyClass = z.infer<typeof OccupancyClass>;

/** Problem description classes, ordered from least to most severe. */
export const PROBLEMS = ['nothing-showing', 'light-smoke', 'working-fire', 'defensive'] as const;
export const Problem = z.enum(PROBLEMS);
export type Problem = z.infer<typeof Problem>;

export const Strategy = z.enum(['investigating', 'offensive', 'defensive']);
export type Strategy = z.infer<typeof Strategy>;

export const InitialAction = z.enum([
  'investigate',
  'attack-line',
  'quick-attack',
  'supply-line',
  'defensive-ops',
  'rescue',
  'standpipe-attack',
]);
export type InitialAction = z.infer<typeof InitialAction>;

export const ResourceDecision = z.enum(['cancel', 'reduce', 'level1', 'continue', 'upgrade', 'hold']);
export type ResourceDecision = z.infer<typeof ResourceDecision>;

export const TASKS = [
  'fireControl',
  'primarySearch',
  'waterSupply',
  'lossControl',
  'onDeck',
  'ventilation',
  'exposure',
  'rit',
  'utilities',
  'recon',
  'checkExtension',
  'investigate',
  'ladders',
  'backupLine',
  'defensive',
  'lobby',
  'medical',
  'stage',
] as const;
export const Task = z.enum(TASKS);
export type Task = z.infer<typeof Task>;

export const UnitType = z.enum(['engine', 'ladder', 'tower', 'rescue', 'squad', 'battalion', 'tanker', 'medic']);
export type UnitType = z.infer<typeof UnitType>;

export const Difficulty = z.enum(['easy', 'intermediate', 'difficult']);
export type Difficulty = z.infer<typeof Difficulty>;

export const SmokeColor = z.enum(['white', 'light-gray', 'gray', 'dark-gray', 'black', 'brown']);
export type SmokeColor = z.infer<typeof SmokeColor>;

/** A visual effect attached to a named anchor point of a building view. */
export const Emitter = z.object({
  id: z.string(),
  view: Side,
  anchor: z.string(),
  kind: z.enum(['smoke', 'fire', 'glow', 'haze']),
  /** 0..1 — volume of smoke or size of fire. */
  intensity: z.number().min(0).max(1),
  color: SmokeColor.default('gray'),
  /** lazy = buoyant drift, pushing = pressurized, turbulent. */
  pressure: z.enum(['lazy', 'moderate', 'pushing']).default('moderate'),
  /** Horizontal spread multiplier (wide openings such as a garage door). */
  spread: z.number().min(0.2).max(4).default(1),
});
export type Emitter = z.infer<typeof Emitter>;

export const ProblemLocation = z.object({
  side: Side.optional(),
  floor: z.number().int().min(1).optional(),
  /** e.g. "garage", "kitchen", "unit 204" */
  area: z.string(),
  /** Words an officer might use for this area. */
  areaTerms: z.array(z.string()).min(1),
});
export type ProblemLocation = z.infer<typeof ProblemLocation>;

/** One state of the incident's conditions (what is true and what can be seen). */
export const ConditionState = z.object({
  id: z.string(),
  /** Instructor description — never shown in Test Mode before the review. */
  description: z.string(),
  problem: Problem,
  acceptableProblems: z.array(Problem).min(1),
  acceptableStrategies: z.array(Strategy).min(1),
  location: ProblemLocation.optional(),
  /** Terms that describe these conditions in a transfer or follow-up (e.g. "knocked down"). */
  conditionTerms: z.array(z.string()).default([]),
  emitters: z.array(Emitter).default([]),
});
export type ConditionState = z.infer<typeof ConditionState>;

export const Finding = z.object({
  id: z.string(),
  side: z.enum(['alpha', 'bravo', 'charlie', 'delta', 'interior', 'roof', 'general']),
  /** What the officer observes when the finding is revealed. */
  text: z.string(),
  kind: z.enum(['conditions', 'access', 'hazard', 'life-safety', 'basement', 'exposure', 'cause', 'utility']),
  safety: z.boolean().default(false),
  reportable: z.enum(['required', 'recommended', 'optional']).default('recommended'),
  /** Any-of list of all-of term groups used to recognize the finding in a report. */
  match: z.array(z.array(z.string()).min(1)).min(1),
  revealedBy: z.enum(['recon', 'investigate', 'event', 'arrival']).default('recon'),
});
export type Finding = z.infer<typeof Finding>;

export const UnitRole = z.object({
  /** Placeholder used in text, e.g. "E2" → "{E2}". */
  role: z.string().regex(/^[A-Z][A-Z0-9]{0,4}$/),
  type: UnitType,
  /** Seconds after Engine 14 arrives on scene. */
  arrival: z.number().min(0),
});
export type UnitRole = z.infer<typeof UnitRole>;

export const Trigger: z.ZodType<TriggerT> = z.lazy(() =>
  z.union([
    z.object({ at: z.number().min(0) }),
    z.object({
      after: z.enum(['initialReport', 'followUp', 'reconStarted', 'reconComplete', 'investigateComplete', 'transfer']),
      delay: z.number().min(0).default(0),
    }),
    z.object({
      task: Task,
      status: z.enum(['assigned', 'complete']).default('assigned'),
      delay: z.number().min(0).default(0),
    }),
    z.object({ notTask: Task, by: z.number().min(0) }),
    z.object({ notComplete: Task, by: z.number().min(0) }),
    z.object({ event: z.string(), delay: z.number().min(0).default(0) }),
    z.object({ allOf: z.array(Trigger).min(1) }),
  ]),
);
export type TriggerT =
  | { at: number }
  | {
      after: 'initialReport' | 'followUp' | 'reconStarted' | 'reconComplete' | 'investigateComplete' | 'transfer';
      delay?: number;
    }
  | { task: Task; status?: 'assigned' | 'complete'; delay?: number }
  | { notTask: Task; by: number }
  | { notComplete: Task; by: number }
  | { event: string; delay?: number }
  | { allOf: TriggerT[] };

export const RadioFrom = z.string(); // a role placeholder ("E2", "BC"), "Dispatch", "OWN" (own crew) or literal

export const Effect = z.union([
  z.object({ radio: z.object({ from: RadioFrom, text: z.string(), requiresAck: z.boolean().default(false) }) }),
  z.object({ setCondition: z.string() }),
  z.object({ reveal: z.string() }),
  z.object({ note: z.string() }),
]);
export type Effect = z.infer<typeof Effect>;

export const ScenarioEvent = z.object({
  id: z.string(),
  when: Trigger,
  effects: z.array(Effect).min(1),
  /** Instructor explanation of why this happens. */
  explanation: z.string().optional(),
});
export type ScenarioEvent = z.infer<typeof ScenarioEvent>;

export const TaskOutcome = z.object({
  duration: z.number().min(5).optional(),
  report: z.string().optional(),
  requires: z.array(Task).default([]),
  effects: z.array(Effect).default([]),
  /** If set, the task never completes (e.g. defensive conditions block interior search). */
  blocked: z.string().optional(),
});
export type TaskOutcome = z.infer<typeof TaskOutcome>;

export const Branch = z.object({
  id: z.string(),
  weight: z.number().min(0).default(1),
  label: z.string(),
  /** Keys replace the template's top-level values when this branch is selected. */
  patch: z.record(z.string(), z.unknown()),
});
export type Branch = z.infer<typeof Branch>;

export const PreferredAssignment = z.object({
  role: z.string(),
  task: Task,
  text: z.string(),
});

export const ImageAsset = z.object({
  view: Side,
  /** data: URL or relative path within a pack. */
  src: z.string(),
  origin: z.enum(['own-photo', 'licensed', 'ai-generated', 'user-supplied']),
  license: z.string().default(''),
  credit: z.string().default(''),
  /** Normalized anchor positions (0..1) on this photo, by anchor id. */
  anchors: z.record(z.string(), z.object({ x: z.number(), y: z.number(), w: z.number().default(0.08) })),
});
export type ImageAsset = z.infer<typeof ImageAsset>;

export const ScenarioTemplate = z.object({
  schemaVersion: z.literal(1).default(1),
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  summary: z.string(),
  difficulty: Difficulty,
  tags: z.array(z.string()).default([]),
  building: z.object({
    archetype: Archetype,
    occupancy: OccupancyClass,
    acceptableOccupancies: z.array(OccupancyClass).min(1),
    occupancyLabel: z.string(),
    size: SizeClass,
    acceptableSizes: z.array(SizeClass).min(1),
    stories: z.number().int().min(1).max(40),
    /** Heights an officer could reasonably report (e.g. elevated house: 1 or 2). */
    acceptableStories: z.array(z.number().int().min(1)).min(1),
    construction: z.string(),
    basement: z.boolean().default(false),
    /** Whether a basement statement is expected in the follow-up. */
    basementRelevant: z.boolean().default(false),
    features: z.array(z.string()).default([]),
  }),
  setting: z
    .object({
      streetKind: z.enum(['residential', 'beachfront', 'commercial']).default('residential'),
      /** Business or complex name, e.g. "Coquina Towers". */
      placeName: z.string().optional(),
      /** Seeded variation of building colors and layout details. */
      variant: z.number().int().min(0).optional(),
    })
    .default({ streetKind: 'residential' }),
  dispatch: z.object({
    nature: z.string(),
    callerReport: z.string(),
    notes: z.array(z.string()).default([]),
  }),
  occupants: z.object({
    dispatchInfo: z.string(),
    /** Ground truth (hidden): all-out | trapped | unknown | none */
    status: z.enum(['all-out', 'trapped', 'unknown', 'none']),
    victimLocation: z.string().optional(),
  }),
  units: z.array(UnitRole).min(1),
  conditionStates: z.array(ConditionState).min(1),
  initialCondition: z.string(),
  findings: z.array(Finding).default([]),
  recon: z.object({
    kind: z.enum(['360', 'interior', 'lobby']).default('360'),
    label: z.string().default('Walk the 360'),
    duration: z.number().min(10).max(180).default(45),
    /** Some buildings cannot be circled; a "360 complete" claim is then wrong. */
    full360Possible: z.boolean().default(true),
  }),
  investigation: z
    .object({ label: z.string(), duration: z.number().min(10).max(240) })
    .optional(),
  expectations: z.object({
    initialActions: z.array(InitialAction).min(1),
    actionLocationTerms: z.array(z.string()).default([]),
    objectives: z.array(z.enum(['fireControl', 'primarySearch', 'investigate', 'exposure'])).default([]),
    resourceDecisions: z.array(ResourceDecision).min(1),
    criticalTasks: z.array(Task).default([]),
    expectedTasks: z.array(Task).default([]),
    /** Interior tasks become dangerous when the strategy is defensive. */
    followUpExpected: z.boolean().default(true),
    transferExpected: z.boolean().default(true),
    accountabilityExpected: z.boolean().default(true),
    /** Outstanding priorities a good transfer mentions. */
    transferPriorities: z.array(z.string()).default([]),
  }),
  taskOutcomes: z.record(z.string(), TaskOutcome).default({}),
  events: z.array(ScenarioEvent).default([]),
  examples: z
    .object({
      initialReport: z.array(z.string()).default([]),
      followUp: z.array(z.string()).default([]),
      assignments: z.array(PreferredAssignment).default([]),
      transfer: z.array(z.string()).default([]),
    })
    .default({ initialReport: [], followUp: [], assignments: [], transfer: [] }),
  explanations: z
    .object({
      initialReport: z.string().default(''),
      followUp: z.string().default(''),
      assignments: z.string().default(''),
      transfer: z.string().default(''),
    })
    .default({ initialReport: '', followUp: '', assignments: '', transfer: '' }),
  branches: z.array(Branch).default([]),
  images: z.array(ImageAsset).default([]),
  /** Ends without a battalion chief when the incident resolves (e.g. nonfire cause). */
  endWhen: z.enum(['transfer', 'followUp']).default('transfer'),
});
export type ScenarioTemplate = z.infer<typeof ScenarioTemplate>;
export type ScenarioTemplateInput = z.input<typeof ScenarioTemplate>;
