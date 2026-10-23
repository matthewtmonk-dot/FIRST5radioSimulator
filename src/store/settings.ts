import { create } from 'zustand';
import {
  DEFAULT_RESPONSE_PLAN,
  DEFAULT_RUBRIC,
  DEFAULT_VOCABULARY,
  type ResponsePlanConfig,
  type RubricConfig,
  type VocabularyConfig,
} from '../domain/rubric/config';
import { loadPref, savePref } from '../storage/db';

export type SttEngine = 'whisper' | 'webspeech' | 'off';

export interface Prefs {
  stt: SttEngine;
  whisperModel: 'onnx-community/whisper-tiny.en' | 'onnx-community/whisper-base.en' | 'onnx-community/whisper-small.en';
  /** Run Whisper on the graphics card (WebGPU). Off by default: on some computers it crashes the page. */
  whisperGpu: boolean;
  autoSendTranscript: boolean;
  radioAudio: boolean;
  radioTones: boolean;
  voiceRate: number;
  dispatchVoice: string;
  unitVoice: string;
  chiefVoice: string;
  captions: boolean;
  pttKey: 'Space' | 'KeyT' | 'ShiftRight';
  practicePauseOnFeedback: boolean;
  showLiveChecklist: boolean;
  timeLimit: number;
  reducedMotion: boolean;
  /** Seconds per real second for the simulation clock. */
  clockSpeed: number;
}

export const DEFAULT_PREFS: Prefs = {
  stt: 'whisper',
  whisperModel: 'onnx-community/whisper-base.en',
  whisperGpu: false,
  autoSendTranscript: false,
  radioAudio: true,
  radioTones: true,
  voiceRate: 1.08,
  dispatchVoice: '',
  unitVoice: '',
  chiefVoice: '',
  captions: true,
  pttKey: 'Space',
  practicePauseOnFeedback: true,
  showLiveChecklist: true,
  timeLimit: 420,
  reducedMotion: false,
  clockSpeed: 1,
};

interface SettingsState {
  prefs: Prefs;
  rubric: RubricConfig;
  vocab: VocabularyConfig;
  plan: ResponsePlanConfig;
  setPrefs: (p: Partial<Prefs>) => void;
  setRubric: (r: RubricConfig) => void;
  setVocab: (v: VocabularyConfig) => void;
  setPlan: (p: ResponsePlanConfig) => void;
  resetRubric: () => void;
  resetVocab: () => void;
  resetPlan: () => void;
}

function loadRubric(): RubricConfig {
  const saved = loadPref<RubricConfig>('rubric', DEFAULT_RUBRIC);
  // Keep newly added default items if the saved rubric predates them.
  const ids = new Set(saved.items.map((i) => i.id));
  const items = [...saved.items, ...DEFAULT_RUBRIC.items.filter((i) => !ids.has(i.id))];
  if ((saved.version ?? 1) >= DEFAULT_RUBRIC.version) return { ...saved, items };
  // Older saved rubric: take the new wording and source, keep the instructor's weights and switches.
  const byId = new Map(DEFAULT_RUBRIC.items.map((i) => [i.id, i]));
  return {
    ...saved,
    version: DEFAULT_RUBRIC.version,
    source: DEFAULT_RUBRIC.source,
    items: items.map((i) => {
      const d = byId.get(i.id);
      return d ? { ...i, label: d.label, hint: d.hint, board: d.board } : i;
    }),
  };
}

export const useSettings = create<SettingsState>((set) => ({
  prefs: loadPref('prefs', DEFAULT_PREFS),
  rubric: loadRubric(),
  vocab: loadPref('vocab', DEFAULT_VOCABULARY),
  plan: loadPref('plan', DEFAULT_RESPONSE_PLAN),
  setPrefs: (p) =>
    set((s) => {
      const prefs = { ...s.prefs, ...p };
      savePref('prefs', prefs);
      return { prefs };
    }),
  setRubric: (rubric) => {
    savePref('rubric', rubric);
    set({ rubric });
  },
  setVocab: (vocab) => {
    savePref('vocab', vocab);
    set({ vocab });
  },
  setPlan: (plan) => {
    savePref('plan', plan);
    set({ plan });
  },
  resetRubric: () => {
    savePref('rubric', DEFAULT_RUBRIC);
    set({ rubric: DEFAULT_RUBRIC });
  },
  resetVocab: () => {
    savePref('vocab', DEFAULT_VOCABULARY);
    set({ vocab: DEFAULT_VOCABULARY });
  },
  resetPlan: () => {
    savePref('plan', DEFAULT_RESPONSE_PLAN);
    set({ plan: DEFAULT_RESPONSE_PLAN });
  },
}));
