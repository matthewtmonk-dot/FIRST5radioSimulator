// Plays new radio traffic through speech synthesis as it appears in the log.

import { useEffect, useRef, useState } from 'react';
import { radio, roleFor } from '../../audio/radio';
import type { RadioEntry } from '../../domain/engine/types';
import { useSettings } from '../../store/settings';

export function useRadioPlayback(log: RadioEntry[] | undefined, sessionKey: string, skipExisting: boolean) {
  const played = useRef(new Set<string>());
  const key = useRef('');
  const [speaking, setSpeaking] = useState<string | null>(null);
  const prefs = useSettings((s) => s.prefs);

  useEffect(() => radio.subscribe(setSpeaking) as () => void, []);

  useEffect(() => {
    radio.opts = {
      enabled: prefs.radioAudio,
      tones: prefs.radioTones,
      rate: prefs.voiceRate,
      voices: { dispatch: prefs.dispatchVoice, unit: prefs.unitVoice, chief: prefs.chiefVoice, crew: prefs.unitVoice },
    };
    if (!prefs.radioAudio) radio.stop();
  }, [prefs]);

  useEffect(() => {
    if (!log) return;
    if (key.current !== sessionKey) {
      key.current = sessionKey;
      played.current = new Set(skipExisting ? log.map((e) => e.id) : []);
      radio.stop();
    }
    for (const e of log) {
      if (played.current.has(e.id)) continue;
      played.current.add(e.id);
      if (e.kind === 'dispatch' || e.kind === 'unit') {
        radio.enqueue({ id: e.id, from: e.from, text: e.text, role: roleFor(e.from, e.kind), tone: e.tone ?? (e.faceToFace ? undefined : 'chirp') });
      }
    }
  }, [log, sessionKey, skipExisting]);

  useEffect(() => () => radio.stop(), []);

  return speaking;
}
