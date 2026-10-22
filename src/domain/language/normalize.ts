// Text normalization for radio transmissions (typed or transcribed).
// Produces lowercase text with digits for spoken numbers and phonetic sides
// so that lexicon patterns can be written once.

import type { VocabularyConfig } from '../rubric/config';

const UNITS: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const ORDINALS: Record<string, string> = {
  first: '1st', second: '2nd', third: '3rd', fourth: '4th', fifth: '5th', sixth: '6th', seventh: '7th',
  eighth: '8th', ninth: '9th', tenth: '10th', eleventh: '11th', twelfth: '12th',
};
const DIGIT_WORDS = new Set(['zero', 'oh', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']);
const UNIT_WORDS = /^(engine|ladder|tower|truck|rescue|squad|battalion|medic|tanker|quint|brush|level|unit|apartment|room|floor|division)$/;

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function applyCorrections(text: string, vocab?: Pick<VocabularyConfig, 'corrections'>): string {
  if (!vocab) return text;
  let out = text;
  for (const { from, to } of vocab.corrections) {
    if (!from.trim()) continue;
    out = out.replace(new RegExp(`\\b${escapeRegex(from.trim())}\\b`, 'gi'), to);
  }
  return out;
}

/** Converts spoken numbers to digits. "engine four two" → "engine 42", "forty two" → "42". */
function numbersToDigits(words: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const prev = out[out.length - 1] ?? '';
    // Radio-style digit sequences after a unit word: "engine four two", "battalion one"
    if (UNIT_WORDS.test(prev) && DIGIT_WORDS.has(w)) {
      let digits = '';
      let j = i;
      while (j < words.length && DIGIT_WORDS.has(words[j])) {
        digits += String(UNITS[words[j]]);
        j++;
      }
      // "engine fourteen" style handled below; a single digit word is fine here too
      out.push(digits);
      i = j - 1;
      continue;
    }
    if (w in TENS) {
      const next = words[i + 1];
      if (next && next in UNITS && UNITS[next] > 0 && UNITS[next] < 10) {
        out.push(String(TENS[w] + UNITS[next]));
        i++;
      } else {
        out.push(String(TENS[w]));
      }
      continue;
    }
    if (w in UNITS && w !== 'oh') {
      // Keep "no one", "anyone" etc. untouched (they are separate tokens only for "no one").
      if (w === 'one' && (prev === 'no' || prev === 'every' || prev === 'any' || prev === 'some')) {
        out.push(w);
        continue;
      }
      out.push(String(UNITS[w]));
      continue;
    }
    if (w in ORDINALS) {
      // "second" is only an ordinal when followed by a location word
      const next = words[i + 1] ?? '';
      if (/^(floor|story|storey|level|alarm|due|engine|in|unit|line)$/.test(next) || w !== 'second') {
        out.push(ORDINALS[w]);
        continue;
      }
    }
    out.push(w);
  }
  return out;
}

export interface Normalized {
  /** Normalized text: lowercase, digits, spaced punctuation kept as clause markers. */
  text: string;
  /** Original text after vocabulary corrections. */
  corrected: string;
  wordCount: number;
}

export function normalize(input: string, vocab?: Pick<VocabularyConfig, 'corrections'>): Normalized {
  const corrected = applyCorrections(input, vocab).trim();
  let t = corrected;
  // Side letters before lowercasing (uppercase letters are reliable side references)
  t = t.replace(/\b([ABCD])[- ]side\b/g, (_, l: string) => `${letterSide(l)} side`);
  t = t.replace(/\bside[- ]([ABCDabcd])\b/g, (_, l: string) => `side ${letterSide(l.toUpperCase())}`);
  t = t.toLowerCase();
  t = t.replace(/[’']/g, "'").replace(/[“”"]/g, '');
  t = t.replace(/&/g, ' and ');
  t = t.replace(/\b(\d+)\s*-\s*(story|stories|storey|level)\b/g, '$1 $2');
  t = t.replace(/\b(\d)\s*\/\s*(\d)\b/g, '$1/$2');
  t = t.replace(/\bf\s*\/\s*c\b/g, 'fire control').replace(/\bp\s*\/\s*s\b/g, 'primary search');
  t = t.replace(/\bw\s*\/\s*s\b/g, 'water supply').replace(/\bl\s*\/\s*c\b/g, 'loss control');
  t = t.replace(/\bo\s*\/\s*d\b/g, 'on deck');
  t = t.replace(/\bthree[- ]sixty\b/g, '360');
  t = t.replace(/\b(e|eng)\s?(\d{1,3})\b/g, 'engine $2').replace(/\b(l|lad)\s?(\d{1,3})\b/g, 'ladder $2');
  t = t.replace(/\b(bc|bat|batt)\s?(\d{1,2})\b/g, 'battalion $2').replace(/\b(t|twr)\s?(\d{2,3})\b/g, 'tower $2');
  t = t.replace(/\b(r|res)\s?(\d{2,3})\b/g, 'rescue $2').replace(/\b(sq)\s?(\d{1,3})\b/g, 'squad $2');
  // Separate punctuation into clause markers
  t = t.replace(/([.,;:!?])/g, ' $1 ');
  t = t.replace(/[^a-z0-9/.,;:!?\s-]/g, ' ');
  t = t.replace(/-/g, ' ');
  const words = t.split(/\s+/).filter(Boolean);
  const digits = numbersToDigits(words);
  const text = digits.join(' ').replace(/ ([.,;:!?])/g, '$1').replace(/\s+/g, ' ').trim();
  // Collapse phonetic and letter sides into names
  const final = text
    .replace(/\balfa\b/g, 'alpha')
    .replace(/\bcharley\b/g, 'charlie')
    .replace(/\b(\d+) (\d+)\b(?= (story|stories|floor))/g, '$1$2');
  return { text: final, corrected, wordCount: words.filter((w) => /[a-z0-9]/.test(w)).length };
}

function letterSide(l: string): string {
  return ({ A: 'alpha', B: 'bravo', C: 'charlie', D: 'delta' } as Record<string, string>)[l] ?? l;
}

export const FILLERS = [
  'uh', 'um', 'uhh', 'umm', 'er', 'like', 'you know', 'kind of', 'sort of', 'be advised', 'at this time',
  'go ahead and', 'going to go ahead', 'basically', 'just', 'looks like we have', 'it appears', 'appears to be',
  'what appears to be', 'okay', 'ok', 'alright', 'all right so',
];

export function countFillers(normalized: string): { count: number; found: string[] } {
  const found: string[] = [];
  for (const f of FILLERS) {
    const re = new RegExp(`\\b${escapeRegex(f)}\\b`, 'g');
    const m = normalized.match(re);
    if (m) for (let i = 0; i < m.length; i++) found.push(f);
  }
  return { count: found.length, found };
}

export { escapeRegex };
