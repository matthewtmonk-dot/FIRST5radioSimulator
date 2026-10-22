import type { Match } from '../language/lexicon';
import type { SectionId } from '../rubric/config';

export type ItemStatus = 'correct' | 'alternate' | 'partial' | 'missing' | 'incorrect' | 'uncertain' | 'na';
export type Severity = 'minor' | 'major' | 'dangerous';

export interface ItemResult {
  id: string;
  label: string;
  status: ItemStatus;
  /** 0..1 share of the item's weight earned. */
  credit: number;
  weight: number;
  critical: boolean;
  severity?: Severity;
  heard?: string;
  expected?: string;
  note: string;
}

export interface VerbosityResult {
  words: number;
  referenceWords: number;
  fillers: string[];
  /** Clauses that carried no checklist information. */
  uninformative: string[];
  level: 'concise' | 'acceptable' | 'wordy' | 'very-wordy';
}

export interface Statement {
  text: string;
  note: string;
  severity: Severity;
}

export interface TransmissionGrade {
  section: SectionId;
  /** null when nothing gradable (e.g. every item uncertain). */
  score: number | null;
  items: ItemResult[];
  verbosity?: VerbosityResult;
  /** Incorrect or unsupported statements. */
  statements: Statement[];
  dangerous: string[];
  reviewFlags: string[];
  /** Spans that mapped to checklist items, for highlighting. */
  spans: Match[];
  normalized: string;
  example: string;
  explanation: string;
}

export interface SectionScore {
  section: SectionId;
  score: number | null;
  applicable: boolean;
  items: ItemResult[];
  grades: TransmissionGrade[];
}

export interface SessionScore {
  overall: number | null;
  sections: SectionScore[];
  criticalOmissions: string[];
  incorrect: Statement[];
  strengths: string[];
  improvements: string[];
  reviewFlags: string[];
}
