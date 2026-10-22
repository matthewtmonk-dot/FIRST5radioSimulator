import { useEffect, useState, type ReactNode } from 'react';
import { listVoices, onVoicesChanged, radio } from '../../audio/radio';
import { SECTION_LABELS, type RubricConfig, type SectionId } from '../../domain/rubric/config';
import type { UnitType } from '../../domain/scenario/schema';
import { useSettings, type Prefs } from '../../store/settings';
import { loadWhisper, useSttStatus, webSpeechSupported } from '../../transcription';
import { Badge, Button, Panel } from '../components/ui';

type Tab = 'speech' | 'exercise' | 'rubric' | 'vocab' | 'plan';

export function Settings() {
  const [tab, setTab] = useState<Tab>('speech');
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <div className="flex flex-wrap gap-1 border-b border-ink-700" role="tablist">
          {(
            [
              ['speech', 'Speech & radio'],
              ['exercise', 'Exercise'],
              ['rubric', 'Rubric'],
              ['vocab', 'Vocabulary'],
              ['plan', 'Response plan'],
            ] as const
          ).map(([id, l]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`px-3 py-2 text-sm ${tab === id ? 'border-b-2 border-signal-amber font-semibold' : 'text-ink-400 hover:text-ink-200'}`}
            >
              {l}
            </button>
          ))}
        </div>
        {tab === 'speech' && <SpeechSettings />}
        {tab === 'exercise' && <ExerciseSettings />}
        {tab === 'rubric' && <RubricSettings />}
        {tab === 'vocab' && <VocabSettings />}
        {tab === 'plan' && <PlanSettings />}
      </div>
    </div>
  );
}

function Row({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-ink-700/60 px-3 py-3 sm:grid-cols-[240px_1fr] sm:gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {help && <div className="text-xs text-ink-400">{help}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

const input = 'rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm text-ink-100 focus:border-signal-amber focus:outline-none';

function Toggle({ k }: { k: keyof Prefs }) {
  const v = useSettings((s) => s.prefs[k]) as boolean;
  const set = useSettings((s) => s.setPrefs);
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={v} onChange={(e) => set({ [k]: e.target.checked } as Partial<Prefs>)} className="h-4 w-4 accent-signal-amber" />
      {v ? 'On' : 'Off'}
    </label>
  );
}

function SpeechSettings() {
  const prefs = useSettings((s) => s.prefs);
  const set = useSettings((s) => s.setPrefs);
  const stt = useSttStatus();
  const [voices, setVoices] = useState(listVoices());
  useEffect(() => onVoicesChanged(() => setVoices(listVoices())), []);
  const voiceSelect = (k: 'dispatchVoice' | 'unitVoice' | 'chiefVoice') => (
    <select className={input} value={prefs[k]} onChange={(e) => set({ [k]: e.target.value })}>
      <option value="">Automatic</option>
      {voices.map((v) => (
        <option key={v.name} value={v.name}>
          {v.name} {v.localService ? '' : '(online)'}
        </option>
      ))}
    </select>
  );
  return (
    <>
      <Panel title="Speech-to-text">
        <Row
          label="Recognition engine"
          help="Text entry always works. Recognition never blocks the exercise."
        >
          <select className={input} value={prefs.stt} onChange={(e) => set({ stt: e.target.value as Prefs['stt'] })}>
            <option value="whisper">Local Whisper (private, offline after first download)</option>
            <option value="webspeech" disabled={!webSpeechSupported()}>
              Browser speech recognition {webSpeechSupported() ? '' : '(not supported here)'}
            </option>
            <option value="off">Off — type only</option>
          </select>
        </Row>
        {prefs.stt === 'webspeech' && (
          <div className="mx-3 my-2 rounded border border-signal-amber/40 bg-signal-amber/10 p-2 text-xs text-ink-200">
            Privacy notice: in Chrome and Edge, browser speech recognition sends your audio to the browser vendor's online service. It needs an internet
            connection and is not available in all browsers. Local Whisper keeps audio on this computer.
          </div>
        )}
        {prefs.stt === 'whisper' && (
          <>
            <Row
              label="Whisper model"
              help="Larger models are more accurate but slower. Downloaded once from Hugging Face, then cached by the browser."
            >
              <select className={input} value={prefs.whisperModel} onChange={(e) => set({ whisperModel: e.target.value as Prefs['whisperModel'] })}>
                <option value="onnx-community/whisper-tiny.en">tiny.en (~40 MB, fastest)</option>
                <option value="onnx-community/whisper-base.en">base.en (~80 MB, recommended)</option>
                <option value="onnx-community/whisper-small.en">small.en (~250 MB, best accuracy, needs WebGPU)</option>
              </select>
            </Row>
            <Row label="Model status">
              <Badge tone={stt.whisper === 'ready' ? 'green' : stt.whisper === 'error' ? 'red' : stt.whisper === 'loading' ? 'amber' : 'neutral'}>
                {stt.whisper === 'loading' ? `loading ${stt.progress}%` : stt.whisper}
              </Badge>
              {stt.device && <span className="text-xs text-ink-400">running on {stt.device === 'webgpu' ? 'GPU (WebGPU)' : 'CPU (WebAssembly)'}</span>}
              {stt.error && <span className="text-xs text-signal-red">{stt.error}</span>}
              <Button className="!min-h-8 text-xs" onClick={() => loadWhisper(prefs.whisperModel).catch(() => {})} disabled={stt.whisper === 'loading'}>
                {stt.whisper === 'ready' ? 'Reload' : 'Download / load now'}
              </Button>
            </Row>
          </>
        )}
        <Row label="Auto-send transcripts" help="Off: you review and correct each transcript before it is sent. Low-confidence transcripts always wait for review.">
          <Toggle k="autoSendTranscript" />
        </Row>
        <Row label="Push-to-talk key">
          <select className={input} value={prefs.pttKey} onChange={(e) => set({ pttKey: e.target.value as Prefs['pttKey'] })}>
            <option value="Space">Space</option>
            <option value="KeyT">T</option>
            <option value="ShiftRight">Right Shift</option>
          </select>
        </Row>
      </Panel>
      <Panel title="Simulated radio">
        <Row label="Radio voices" help="Uses the browser's built-in speech synthesis.">
          <Toggle k="radioAudio" />
        </Row>
        <Row label="Radio tones">
          <Toggle k="radioTones" />
        </Row>
        <Row label="Captions" help="Show who is talking and what they said over the scene.">
          <Toggle k="captions" />
        </Row>
        <Row label="Speaking rate">
          <input type="range" min={0.8} max={1.5} step={0.02} value={prefs.voiceRate} onChange={(e) => set({ voiceRate: Number(e.target.value) })} />
          <span className="tabular text-sm text-ink-300">{prefs.voiceRate.toFixed(2)}×</span>
        </Row>
        <Row label="Dispatch voice">{voiceSelect('dispatchVoice')}</Row>
        <Row label="Unit voice">{voiceSelect('unitVoice')}</Row>
        <Row label="Battalion chief voice">{voiceSelect('chiefVoice')}</Row>
        <Row label="Test">
          <Button
            className="!min-h-8 text-xs"
            onClick={() => {
              radio.opts = { enabled: true, tones: prefs.radioTones, rate: prefs.voiceRate, voices: { dispatch: prefs.dispatchVoice, unit: prefs.unitVoice, chief: prefs.chiefVoice } };
              radio.enqueue({ id: 'test1', from: 'Dispatch', role: 'dispatch', text: 'Engine 14, respond to a residential structure fire, 412 Sandpiper Lane.', tone: 'alert' });
              radio.enqueue({ id: 'test2', from: 'Engine 42', role: 'unit', text: 'Engine 42 copies, water supply.', tone: 'chirp' });
              radio.enqueue({ id: 'test3', from: 'Battalion 1', role: 'chief', text: 'Battalion 1 on scene.', tone: 'chirp' });
            }}
          >
            Play sample traffic
          </Button>
        </Row>
      </Panel>
    </>
  );
}

function ExerciseSettings() {
  const prefs = useSettings((s) => s.prefs);
  const set = useSettings((s) => s.setPrefs);
  return (
    <Panel>
      <Row label="Exercise time limit" help="Training normally stops around five minutes or at the first command transfer.">
        <select className={input} value={prefs.timeLimit} onChange={(e) => set({ timeLimit: Number(e.target.value) })}>
          {[300, 360, 420, 480, 600].map((s) => (
            <option key={s} value={s}>
              {s / 60} minutes
            </option>
          ))}
        </select>
      </Row>
      <Row label="Clock speed" help="1× is real time.">
        <select className={input} value={prefs.clockSpeed} onChange={(e) => set({ clockSpeed: Number(e.target.value) })}>
          {[0.75, 1, 1.5, 2].map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </Row>
      <Row label="Pause clock during feedback" help="Practice Mode only.">
        <Toggle k="practicePauseOnFeedback" />
      </Row>
      <Row label="Coach tab (live checklist)" help="Practice Mode only. Never shown in Test Mode.">
        <Toggle k="showLiveChecklist" />
      </Row>
      <Row label="Reduced motion" help="Slower, calmer smoke animation.">
        <Toggle k="reducedMotion" />
      </Row>
    </Panel>
  );
}

function download(name: string, data: unknown) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = name;
  a.click();
}

function readJson(onLoad: (v: unknown) => void) {
  const i = document.createElement('input');
  i.type = 'file';
  i.accept = 'application/json,.json';
  i.onchange = async () => {
    const f = i.files?.[0];
    if (!f) return;
    try {
      onLoad(JSON.parse(await f.text()));
    } catch {
      alert('That file is not valid JSON.');
    }
  };
  i.click();
}

function RubricSettings() {
  const rubric = useSettings((s) => s.rubric);
  const setRubric = useSettings((s) => s.setRubric);
  const reset = useSettings((s) => s.resetRubric);
  const upd = (patch: Partial<RubricConfig>) => setRubric({ ...rubric, ...patch });
  const updItem = (id: string, patch: Partial<RubricConfig['items'][number]>) => upd({ items: rubric.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  return (
    <>
      <div className="rounded-lg border border-signal-amber/40 bg-signal-amber/10 p-3 text-sm">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          {rubric.provisional ? <Badge tone="amber">Provisional</Badge> : <Badge tone="green">Instructor-validated</Badge>} Rubric source
        </div>
        <textarea className={`${input} w-full`} rows={2} value={rubric.source} onChange={(e) => upd({ source: e.target.value })} />
        <label className="mt-2 flex items-center gap-2 text-xs text-ink-300">
          <input type="checkbox" checked={!rubric.provisional} onChange={(e) => upd({ provisional: !e.target.checked })} className="accent-signal-amber" />
          I have checked these items against approved department instructional language
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => download('first-five-rubric.json', rubric)}>Export rubric</Button>
        <Button
          onClick={() =>
            readJson((v) => {
              const r = v as RubricConfig;
              if (!r || !Array.isArray(r.items) || !r.sectionWeights) return alert('That file is not a FIRST FIVE rubric.');
              setRubric(r);
            })
          }
        >
          Import rubric
        </Button>
        <Button variant="ghost" onClick={() => confirm('Restore the default provisional rubric?') && reset()}>
          Restore defaults
        </Button>
      </div>
      <Panel title="Scoring">
        {(Object.keys(SECTION_LABELS) as SectionId[]).map((s) => (
          <Row key={s} label={`${SECTION_LABELS[s]} weight`} help="Share of the overall score (normalized across applicable sections).">
            <input type="number" min={0} max={100} className={`${input} w-20`} value={rubric.sectionWeights[s]} onChange={(e) => upd({ sectionWeights: { ...rubric.sectionWeights, [s]: Number(e.target.value) } })} />
          </Row>
        ))}
        <Row label="Incorrect-item penalty" help="An incorrect item loses its weight plus this fraction again — wrong information costs more than missing information.">
          <input type="number" step={0.1} min={0} max={2} className={`${input} w-20`} value={rubric.incorrectPenalty} onChange={(e) => upd({ incorrectPenalty: Number(e.target.value) })} />
        </Row>
        <Row label="Dangerous-error ceiling" help="Maximum section score when a dangerous misunderstanding is present.">
          <input type="number" min={0} max={100} className={`${input} w-20`} value={rubric.dangerousCap} onChange={(e) => upd({ dangerousCap: Number(e.target.value) })} />
        </Row>
        <Row label="Command naming" help="Street: expect “<Street> Command”. Any: accept any command name.">
          <select className={input} value={rubric.commandNaming} onChange={(e) => upd({ commandNaming: e.target.value as RubricConfig['commandNaming'] })}>
            <option value="street">Street name</option>
            <option value="any">Any name</option>
          </select>
        </Row>
        <Row label="Dispatch notification after transfer">
          <select className={input} value={rubric.transfer.dispatchNotificationBy} onChange={(e) => upd({ transfer: { dispatchNotificationBy: e.target.value as 'receiving' | 'transferring' } })}>
            <option value="receiving">Made by the receiving officer (chief)</option>
            <option value="transferring">Made by the transferring officer (you)</option>
          </select>
        </Row>
      </Panel>
      {(Object.keys(SECTION_LABELS) as SectionId[]).map((s) => (
        <Panel key={s} title={SECTION_LABELS[s]}>
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-ink-400">
                  <th className="px-2 py-2 font-medium">On</th>
                  <th className="px-2 py-2 font-medium">Item</th>
                  <th className="px-2 py-2 font-medium">Board label</th>
                  <th className="px-2 py-2 font-medium">Hint question</th>
                  <th className="px-2 py-2 font-medium">Weight</th>
                  <th className="px-2 py-2 font-medium">Critical</th>
                </tr>
              </thead>
              <tbody>
                {rubric.items
                  .filter((i) => i.section === s)
                  .map((i) => (
                    <tr key={i.id} className="border-t border-ink-700/60 align-top">
                      <td className="px-2 py-1.5">
                        <input type="checkbox" checked={i.enabled} onChange={(e) => updItem(i.id, { enabled: e.target.checked })} className="accent-signal-amber" aria-label={`Enable ${i.label}`} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input className={`${input} w-full`} value={i.label} onChange={(e) => updItem(i.id, { label: e.target.value })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input className={`${input} w-24`} value={i.board ?? ''} onChange={(e) => updItem(i.id, { board: e.target.value || undefined })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input className={`${input} w-full`} value={i.hint} onChange={(e) => updItem(i.id, { hint: e.target.value })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" step={0.5} min={0} className={`${input} w-16`} value={i.weight} onChange={(e) => updItem(i.id, { weight: Number(e.target.value) })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="checkbox" checked={i.critical} onChange={(e) => updItem(i.id, { critical: e.target.checked })} className="accent-signal-amber" aria-label={`${i.label} critical`} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}
      <p className="text-xs text-ink-500">
        Item recognition (what counts as “offensive”, “Level One staging”, etc.) is built into the grading engine; extra accepted phrases can be added under
        Vocabulary.
      </p>
    </>
  );
}

function VocabSettings() {
  const vocab = useSettings((s) => s.vocab);
  const setVocab = useSettings((s) => s.setVocab);
  const reset = useSettings((s) => s.resetVocab);
  const [syn, setSyn] = useState(JSON.stringify(vocab.synonyms, null, 2));
  const [synErr, setSynErr] = useState('');
  return (
    <>
      <Panel title="Transcript corrections" right={<span className="text-xs text-ink-400">Applied before grading · case-insensitive</span>}>
        <div className="space-y-1.5 p-3">
          {vocab.corrections.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={`${input} flex-1`} value={c.from} aria-label="Heard as" onChange={(e) => setVocab({ ...vocab, corrections: vocab.corrections.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) })} />
              <span className="text-ink-400">→</span>
              <input className={`${input} flex-1`} value={c.to} aria-label="Replace with" onChange={(e) => setVocab({ ...vocab, corrections: vocab.corrections.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) })} />
              <button className="px-2 text-ink-400 hover:text-signal-red" aria-label="Remove" onClick={() => setVocab({ ...vocab, corrections: vocab.corrections.filter((_, j) => j !== i) })}>
                ✕
              </button>
            </div>
          ))}
          <Button className="!min-h-8 text-xs" onClick={() => setVocab({ ...vocab, corrections: [...vocab.corrections, { from: '', to: '' }] })}>
            + Add correction
          </Button>
        </div>
      </Panel>
      <Panel title="Recognition hints" right={<span className="text-xs text-ink-400">Department call signs and terms, comma-separated</span>}>
        <div className="p-3">
          <textarea className={`${input} w-full`} rows={3} value={vocab.hints.join(', ')} onChange={(e) => setVocab({ ...vocab, hints: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
          <p className="mt-1 text-xs text-ink-400">A reference list of the terms your transmissions use. Speech engines are not tuned with it; when a term is consistently misheard, add a correction above.</p>
        </div>
      </Panel>
      <Panel title="Extra accepted phrases" right={<span className="text-xs text-ink-400">JSON: concept id → phrases</span>}>
        <div className="p-3">
          <textarea
            className={`${input} w-full font-mono text-xs`}
            rows={6}
            value={syn}
            onChange={(e) => {
              setSyn(e.target.value);
              try {
                const v = JSON.parse(e.target.value);
                setVocab({ ...vocab, synonyms: v });
                setSynErr('');
              } catch {
                setSynErr('Not valid JSON yet.');
              }
            }}
          />
          {synErr && <p className="text-xs text-signal-amber">{synErr}</p>}
          <p className="mt-1 text-xs text-ink-400">
            Example: {'{ "resLevel1": ["hold at level 1"], "offensive": ["going interior"] }'}. Concept ids are listed in the Help page.
          </p>
        </div>
      </Panel>
      <Button variant="ghost" onClick={() => confirm('Restore default vocabulary?') && (reset(), setSyn(JSON.stringify({}, null, 2)))}>
        Restore defaults
      </Button>
    </>
  );
}

const TYPES: UnitType[] = ['engine', 'ladder', 'tower', 'rescue', 'squad', 'battalion', 'tanker', 'medic'];

function PlanSettings() {
  const plan = useSettings((s) => s.plan);
  const setPlan = useSettings((s) => s.setPlan);
  const reset = useSettings((s) => s.resetPlan);
  return (
    <>
      <div className="rounded-lg border border-signal-amber/40 bg-signal-amber/10 p-3 text-sm text-ink-200">
        These call signs are <b>samples</b>, not actual district assignments. Scenarios draw arriving units from these pools by type. Edit them to match your
        response plan.
      </div>
      <Panel>
        <Row label="Your unit">
          <input className={input} value={plan.ownUnit} onChange={(e) => setPlan({ ...plan, ownUnit: e.target.value, sample: false })} />
        </Row>
        <Row label="Dispatch call sign">
          <input className={input} value={plan.dispatchName} onChange={(e) => setPlan({ ...plan, dispatchName: e.target.value, sample: false })} />
        </Row>
        {TYPES.map((t) => (
          <Row key={t} label={`${t[0].toUpperCase()}${t.slice(1)} pool`} help="Comma-separated">
            <input
              className={`${input} w-full`}
              value={plan.pools[t].join(', ')}
              onChange={(e) => setPlan({ ...plan, sample: false, pools: { ...plan.pools, [t]: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } })}
            />
          </Row>
        ))}
      </Panel>
      <Button variant="ghost" onClick={() => confirm('Restore sample response plan?') && reset()}>
        Restore samples
      </Button>
    </>
  );
}
