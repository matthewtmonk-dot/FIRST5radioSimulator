import type { TransmissionGrade } from '../grading/types';
import type { ScenarioInstance } from '../scenario/instance';
import type { Side, Strategy, Task } from '../scenario/schema';

export type Mode = 'practice' | 'test' | 'drill';
export type Checkpoint = 'initialReport' | 'followUp' | 'transfer';

export interface TranscriptInfo {
  original: string;
  corrected: string;
  source: 'typed' | 'whisper' | 'webspeech';
  lowConfidence?: boolean;
}

export interface RadioEntry {
  id: string;
  t: number;
  from: string;
  to?: string;
  text: string;
  kind: 'dispatch' | 'unit' | 'trainee' | 'system' | 'observation';
  requiresAck?: boolean;
  acked?: boolean;
  repeated?: boolean;
  audioId?: string;
  transcript?: TranscriptInfo;
  faceToFace?: boolean;
  /** Index into SimState.grades when this trainee transmission was graded. */
  gradeIds?: string[];
  /** Plays tones before speech (dispatch alerts). */
  tone?: 'alert' | 'chirp';
}

export interface AssignmentRecord {
  id: string;
  unit: string;
  task: Task;
  location: string;
  explicitObjective: boolean;
  at: number;
  /** Seconds when the work can begin (unit on scene). */
  startAt: number;
  status: 'assigned' | 'working' | 'complete' | 'blocked' | 'reassigned';
  completedAt?: number;
  via: 'radio' | 'initialReport' | 'autopilot';
}

export interface UnitState {
  id: string;
  role: string;
  type: string;
  arrival: number;
  status: 'enroute' | 'staged' | 'onScene' | 'cancelled';
  arrivedAt?: number;
  /** When the unit got an assignment or staging/cancel instruction. */
  directedAt?: number;
  awaitingSince?: number;
  promptedForAssignment?: boolean;
  pendingClarify?: { tasks: Task[]; asked: string; at: number };
}

export interface GradeRecord {
  id: string;
  entryId: string;
  t: number;
  grade: TransmissionGrade;
  /** Practice mode: true once the trainee has seen and accepted (or retried) the grade. */
  superseded?: boolean;
}

export interface SimState {
  instance: ScenarioInstance;
  mode: Mode;
  phase: 'dispatch' | 'onScene' | 'complete';
  t: number;
  conditionId: string;
  conditionChangedAt: number;
  log: RadioEntry[];
  units: UnitState[];
  assignments: AssignmentRecord[];
  recon: { status: 'none' | 'inProgress' | 'complete'; startedAt?: number; completedAt?: number };
  investigation: { status: 'none' | 'inProgress' | 'complete'; startedAt?: number; completedAt?: number };
  revealedFindings: string[];
  revealedViews: Side[];
  firedEvents: { id: string; t: number }[];
  checkpoints: Partial<Record<Checkpoint | 'reconStarted' | 'reconComplete' | 'investigateComplete' | 'transferConfirmed', number>>;
  declaredStrategy?: Strategy;
  commandEstablished?: string;
  resourceDecision?: string[];
  grades: GradeRecord[];
  transfer: {
    bcUnit?: string;
    status: 'none' | 'enroute' | 'arrived' | 'awaitingReport' | 'awaitingConfirm' | 'confirmed' | 'awaitingDispatch';
    reportAt?: number;
    confirmPrompted?: boolean;
    dispatchNotified?: boolean;
  };
  ended?: { reason: 'transfer' | 'resolved' | 'timeLimit' | 'drill' | 'abandoned'; t: number };
  seq: number;
  timeLimit: number;
  notes: string[];
  /** Drill: which single transmission is being practiced. */
  drill?: { checkpoint: Checkpoint | 'assignment'; unit?: string };
}

export interface EngineConfigLike {
  rubric: import('../rubric/config').RubricConfig;
  vocab: import('../rubric/config').VocabularyConfig;
}
