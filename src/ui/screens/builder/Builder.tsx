// Scenario Builder: author, validate, preview, test, save, import and export
// scenarios. Everything is stored locally (IndexedDB) and exchanged as JSON
// packs with photos embedded, so a pack is a single portable file.

import { useEffect, useMemo, useState } from 'react';
import { BUILT_IN_SCENARIOS } from '../../../content';
import { TASK_INFO } from '../../../domain/language/tasks';
import { createInstance } from '../../../domain/scenario/instance';
import {
  ARCHETYPES,
  InitialAction,
  PROBLEMS,
  ResourceDecision,
  SIDES,
  SmokeColor,
  TASKS,
  UnitType,
  type ConditionState,
  type Emitter,
  type ImageAsset,
  type ScenarioTemplateInput,
  type Side,
} from '../../../domain/scenario/schema';
import { validateScenario } from '../../../domain/scenario/validate';
import { anchorIds } from '../../../render/model';
import { buildImagePrompts, promptsToText } from '../../../render/prompts';
import { storage } from '../../../storage/db';
import { useSession } from '../../../store/session';
import { useSettings } from '../../../store/settings';
import { Scene } from '../../components/Scene';
import { Badge, Button } from '../../components/ui';
import { Card, Check, Field, List, Multi, Num, RemoveBtn, Select, Text, inputCls } from './fields';
import { PhotoAnchors } from './PhotoAnchors';

type Draft = ScenarioTemplateInput;
type Tab = 'basics' | 'dispatch' | 'conditions' | 'findings' | 'events' | 'expectations' | 'photos' | 'prompts' | 'json';

const TABS: [Tab, string][] = [
  ['basics', 'Building'],
  ['dispatch', 'Dispatch & units'],
  ['conditions', 'Conditions & effects'],
  ['findings', '360 findings'],
  ['events', 'Timed events'],
  ['expectations', 'Checklist & wording'],
  ['photos', 'Photos'],
  ['prompts', 'Image prompts'],
  ['json', 'JSON'],
];

const PACK_FORMAT = 'first-five-scenario-pack';

function blank(): Draft {
  return {
    id: `custom-${Date.now().toString(36)}`,
    title: 'New scenario',
    summary: 'Describe what the trainee will find and what the scenario teaches.',
    difficulty: 'easy',
    tags: [],
    building: {
      archetype: 'ranch-1story',
      occupancy: 'residential',
      acceptableOccupancies: ['residential'],
      occupancyLabel: 'single-family residence',
      size: 'small',
      acceptableSizes: ['small', 'medium'],
      stories: 1,
      acceptableStories: [1],
      construction: 'Concrete block with stucco, wood truss roof',
      basement: false,
      basementRelevant: false,
      features: [],
    },
    setting: { streetKind: 'residential' },
    dispatch: { nature: 'Residential structure fire', callerReport: 'Caller reports smoke from the house.', notes: [] },
    occupants: { dispatchInfo: 'Caller believes everyone is out.', status: 'all-out' },
    units: [
      { role: 'E2', type: 'engine', arrival: 80 },
      { role: 'L1', type: 'ladder', arrival: 120 },
      { role: 'BC', type: 'battalion', arrival: 220 },
    ],
    conditionStates: [
      {
        id: 'arrival',
        description: 'Nothing showing from the Alpha side.',
        problem: 'nothing-showing',
        acceptableProblems: ['nothing-showing'],
        acceptableStrategies: ['investigating'],
        conditionTerms: [],
        emitters: [],
      },
    ],
    initialCondition: 'arrival',
    findings: [],
    recon: { kind: '360', label: 'Walk the 360', duration: 45, full360Possible: true },
    expectations: {
      initialActions: ['investigate'],
      actionLocationTerms: [],
      objectives: ['investigate'],
      resourceDecisions: ['level1', 'hold'],
      criticalTasks: [],
      expectedTasks: [],
      followUpExpected: true,
      transferExpected: true,
      accountabilityExpected: true,
      transferPriorities: [],
    },
    taskOutcomes: {},
    events: [],
    examples: { initialReport: [], followUp: [], assignments: [], transfer: [] },
    explanations: { initialReport: '', followUp: '', assignments: '', transfer: '' },
    branches: [],
    images: [],
    endWhen: 'transfer',
  };
}

const clone = <T,>(x: T): T => structuredClone(x);

function download(name: string, data: unknown) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = name;
  a.click();
}

export function Builder() {
  const { start, loadLibrary } = useSession();
  const plan = useSettings((s) => s.plan);
  const [custom, setCustom] = useState<Draft[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isBuiltIn, setIsBuiltIn] = useState(false);
  const [tab, setTab] = useState<Tab>('basics');
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState('');

  const refresh = async () => setCustom(await storage.listScenarios());
  useEffect(() => {
    void refresh();
  }, []);

  const validation = useMemo(() => (draft ? validateScenario(draft) : null), [draft]);

  const upd = (fn: (d: Draft) => void) => {
    setDraft((d) => {
      if (!d) return d;
      const n = clone(d);
      fn(n);
      return n;
    });
    setDirty(true);
  };

  const open = (d: Draft, builtIn: boolean) => {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    setDraft(clone(d));
    setIsBuiltIn(builtIn);
    setDirty(false);
    setMsg('');
  };

  const save = async () => {
    if (!draft) return;
    if (BUILT_IN_SCENARIOS.some((b) => b.id === draft.id)) {
      setMsg('Built-in scenarios cannot be overwritten. Change the id to save a copy.');
      return;
    }
    await storage.saveScenario(draft);
    await refresh();
    await loadLibrary();
    setIsBuiltIn(false);
    setDirty(false);
    setMsg(validation?.ok ? 'Saved. It is now in the scenario library.' : 'Saved as a draft. It will not appear in the library until the errors are fixed.');
  };

  const importPack = () => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = '.json,application/json';
    i.onchange = async () => {
      const f = i.files?.[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        const list: Draft[] = data?.format === PACK_FORMAT ? data.scenarios : Array.isArray(data) ? data : [data];
        let ok = 0;
        const problems: string[] = [];
        for (const s of list) {
          if (!s?.id) continue;
          if (BUILT_IN_SCENARIOS.some((b) => b.id === s.id)) {
            problems.push(`${s.id}: same id as a built-in scenario — skipped`);
            continue;
          }
          const v = validateScenario(s);
          if (!v.ok) problems.push(`${s.id}: ${v.errors.length} error(s) — imported as draft`);
          await storage.saveScenario(s);
          ok++;
        }
        await refresh();
        await loadLibrary();
        setMsg(`Imported ${ok} scenario(s).${problems.length ? ` ${problems.join('; ')}` : ''}`);
      } catch (e) {
        setMsg(`Import failed: ${(e as Error).message}`);
      }
    };
    i.click();
  };

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <aside className="scroll-thin shrink-0 space-y-3 overflow-y-auto border-ink-700 bg-ink-900 p-3 max-lg:max-h-56 max-lg:border-b lg:w-64 lg:border-r">
        <div className="flex flex-wrap gap-1.5">
          <Button variant="primary" className="!min-h-8 text-xs" onClick={() => open(blank(), false)}>
            + New
          </Button>
          <Button className="!min-h-8 text-xs" onClick={importPack}>
            Import
          </Button>
          <Button className="!min-h-8 text-xs" disabled={!custom.length} onClick={() => download('first-five-scenarios.json', { format: PACK_FORMAT, version: 1, scenarios: custom })}>
            Export all
          </Button>
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">My scenarios</div>
          {custom.length === 0 && <p className="text-xs text-ink-500">None yet. Create one or duplicate a built-in.</p>}
          {custom.map((c) => {
            const ok = validateScenario(c).ok;
            return (
              <button key={c.id} onClick={() => open(c, false)} className={`block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-ink-800 ${draft?.id === c.id ? 'bg-ink-800' : ''}`}>
                <span className={ok ? 'text-signal-green' : 'text-signal-amber'}>{ok ? '●' : '◐'}</span> {c.title}
              </button>
            );
          })}
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Built-in (view / duplicate)</div>
          {BUILT_IN_SCENARIOS.map((c) => (
            <button key={c.id} onClick={() => open(c, true)} className={`block w-full truncate rounded px-2 py-1.5 text-left text-sm text-ink-300 hover:bg-ink-800 ${draft?.id === c.id ? 'bg-ink-800' : ''}`}>
              {c.title}
            </button>
          ))}
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!draft ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-ink-400">
            <div className="max-w-md space-y-2">
              <p className="text-lg text-ink-200">Scenario Builder</p>
              <p className="text-sm">
                Create a new scenario, duplicate a built-in one as a starting point, or import a scenario pack. The validator checks every change for
                inconsistencies (a one-story building with a third-floor fire, effects on a missing window, a defensive fire with an investigating strategy…).
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-ink-700 bg-ink-850 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">
                  {draft.title} {isBuiltIn && <Badge>built-in · duplicate to save changes</Badge>} {dirty && <Badge tone="amber">unsaved</Badge>}
                </div>
                <div className="font-mono text-[11px] text-ink-400">{draft.id}</div>
              </div>
              {isBuiltIn ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    upd((d) => {
                      d.id = `${d.id}-copy-${Date.now().toString(36).slice(-4)}`;
                      d.title = `${d.title} (copy)`;
                    });
                    setIsBuiltIn(false);
                  }}
                >
                  Duplicate to edit
                </Button>
              ) : (
                <Button variant="primary" onClick={() => void save()}>
                  Save
                </Button>
              )}
              <Button
                variant="go"
                disabled={!validation?.ok}
                title={validation?.ok ? 'Run this scenario in Practice Mode' : 'Fix validation errors first'}
                onClick={async () => {
                  if (!isBuiltIn) await save();
                  start({ mode: 'practice', templateId: draft.id });
                }}
              >
                Test ▶
              </Button>
              <Button onClick={() => download(`${draft.id}.json`, { format: PACK_FORMAT, version: 1, scenarios: [draft] })}>Export</Button>
              {!isBuiltIn && custom.some((c) => c.id === draft.id) && (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm(`Delete "${draft.title}"? This cannot be undone.`)) return;
                    await storage.deleteScenario(draft.id);
                    await refresh();
                    await loadLibrary();
                    setDraft(null);
                    setDirty(false);
                  }}
                >
                  Delete
                </Button>
              )}
            </div>
            {msg && <div className="border-b border-ink-700 bg-ink-800 px-3 py-1.5 text-xs text-ink-200">{msg}</div>}
            <ValidationBar v={validation} />
            <div className="scroll-thin flex gap-1 overflow-x-auto border-b border-ink-700 px-2" role="tablist">
              {TABS.map(([id, l]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`whitespace-nowrap px-3 py-2 text-sm ${tab === id ? 'border-b-2 border-signal-amber font-semibold' : 'text-ink-400 hover:text-ink-200'}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <fieldset className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
              <div className="mx-auto max-w-5xl space-y-4">
                {tab === 'basics' && <BasicsTab d={draft} upd={upd} />}
                {tab === 'dispatch' && <DispatchTab d={draft} upd={upd} />}
                {tab === 'conditions' && <ConditionsTab d={draft} upd={upd} plan={plan} />}
                {tab === 'findings' && <FindingsTab d={draft} upd={upd} />}
                {tab === 'events' && <EventsTab d={draft} upd={upd} />}
                {tab === 'expectations' && <ExpectationsTab d={draft} upd={upd} />}
                {tab === 'photos' && <PhotosTab d={draft} upd={upd} />}
                {tab === 'prompts' && <PromptsTab d={draft} plan={plan} />}
                {tab === 'json' && (
                  <JsonTab
                    d={draft}
                    readOnly={isBuiltIn}
                    onChange={(v) => {
                      setDraft(v);
                      setDirty(true);
                    }}
                  />
                )}
              </div>
            </fieldset>
          </>
        )}
      </section>
    </div>
  );
}

type TabProps = { d: Draft; upd: (fn: (d: Draft) => void) => void };

function ValidationBar({ v }: { v: ReturnType<typeof validateScenario> | null }) {
  const [open, setOpen] = useState(false);
  if (!v) return null;
  const n = v.errors.length + v.warnings.length;
  return (
    <div className={`border-b border-ink-700 px-3 py-1.5 text-xs ${v.ok ? 'bg-signal-green/10' : 'bg-signal-red/10'}`}>
      <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        {v.ok ? <span className="text-signal-green">✓ Valid</span> : <span className="text-signal-red">✕ {v.errors.length} error(s)</span>}
        {v.warnings.length > 0 && <span className="text-signal-amber">{v.warnings.length} warning(s)</span>}
        {n > 0 && <span className="ml-auto text-ink-400">{open ? 'hide' : 'show'}</span>}
      </button>
      {open && (
        <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
          {v.errors.map((e, i) => (
            <li key={`e${i}`} className="text-signal-red">
              ✕ {e}
            </li>
          ))}
          {v.warnings.map((w, i) => (
            <li key={`w${i}`} className="text-signal-amber">
              ! {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BasicsTab({ d, upd }: TabProps) {
  const b = d.building;
  return (
    <>
      <Card title="Scenario">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title (shown only in Practice and in the review)">
            <Text value={d.title} onChange={(v) => upd((x) => void (x.title = v))} />
          </Field>
          <Field label="Id" help="Lowercase letters, numbers and dashes.">
            <Text value={d.id} onChange={(v) => upd((x) => void (x.id = v.toLowerCase().replace(/[^a-z0-9-]/g, '-')))} />
          </Field>
          <Field label="Summary (instructor-facing)" className="sm:col-span-2">
            <Text area value={d.summary} onChange={(v) => upd((x) => void (x.summary = v))} />
          </Field>
          <Field label="Difficulty">
            <Select value={d.difficulty} options={['easy', 'intermediate', 'difficult'] as const} onChange={(v) => upd((x) => void (x.difficulty = v))} />
          </Field>
          <Field label="Tags">
            <List value={d.tags} onChange={(v) => upd((x) => void (x.tags = v))} placeholder="residential, working fire" />
          </Field>
        </div>
      </Card>
      <Card title="Building">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Building model" help="Drives the procedural views and the anchor points for effects.">
            <Select value={b.archetype} options={ARCHETYPES} onChange={(v) => upd((x) => void (x.building.archetype = v))} />
          </Field>
          <Field label="Occupancy">
            <Select value={b.occupancy} options={['residential', 'multifamily', 'commercial', 'hotel', 'mixed-use'] as const} onChange={(v) => upd((x) => void (x.building.occupancy = v))} />
          </Field>
          <Field label="Occupancy label">
            <Text value={b.occupancyLabel} onChange={(v) => upd((x) => void (x.building.occupancyLabel = v))} />
          </Field>
          <Field label="Acceptable occupancy terms" className="sm:col-span-3">
            <Multi value={b.acceptableOccupancies} options={['residential', 'multifamily', 'commercial', 'hotel', 'mixed-use'] as const} onChange={(v) => upd((x) => void (x.building.acceptableOccupancies = v))} />
          </Field>
          <Field label="Size">
            <Select value={b.size} options={['small', 'medium', 'large', 'mega'] as const} onChange={(v) => upd((x) => void (x.building.size = v))} />
          </Field>
          <Field label="Acceptable sizes" className="sm:col-span-2">
            <Multi value={b.acceptableSizes} options={['small', 'medium', 'large', 'mega'] as const} onChange={(v) => upd((x) => void (x.building.acceptableSizes = v))} />
          </Field>
          <Field label="Stories">
            <Num value={b.stories} min={1} max={40} onChange={(v) => upd((x) => void (x.building.stories = v))} />
          </Field>
          <Field label="Acceptable story counts" help="e.g. 1, 2 for an elevated house" className="sm:col-span-2">
            <input
              className={inputCls}
              value={b.acceptableStories.join(', ')}
              onChange={(e) => upd((x) => void (x.building.acceptableStories = e.target.value.split(',').map((s) => parseInt(s, 10)).filter((n) => n > 0)))}
            />
          </Field>
          <Field label="Construction" className="sm:col-span-3">
            <Text value={b.construction} onChange={(v) => upd((x) => void (x.building.construction = v))} />
          </Field>
          <Field label="Features" className="sm:col-span-3">
            <List value={b.features} onChange={(v) => upd((x) => void (x.building.features = v))} placeholder="attached garage, slab on grade" />
          </Field>
          <Check value={b.basement} onChange={(v) => upd((x) => void (x.building.basement = v))} label="Has a basement" />
          <Check value={b.basementRelevant} onChange={(v) => upd((x) => void (x.building.basementRelevant = v))} label="Basement statement expected in follow-up" />
        </div>
      </Card>
      <Card title="Setting">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Street type">
            <Select value={d.setting?.streetKind ?? 'residential'} options={['residential', 'beachfront', 'commercial'] as const} onChange={(v) => upd((x) => void (x.setting = { ...x.setting, streetKind: v }))} />
          </Field>
          <Field label="Business / complex name (optional)">
            <Text value={d.setting?.placeName} onChange={(v) => upd((x) => void (x.setting = { ...x.setting, placeName: v || undefined }))} />
          </Field>
          <Field label="Fixed visual variant (optional)" help="Blank = varies with the seed.">
            <input
              className={inputCls}
              value={d.setting?.variant ?? ''}
              onChange={(e) => upd((x) => void (x.setting = { ...x.setting, variant: e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value, 10) || 0) }))}
            />
          </Field>
        </div>
      </Card>
    </>
  );
}

function DispatchTab({ d, upd }: TabProps) {
  return (
    <>
      <Card title="Dispatch">
        <Field label="Nature">
          <Text value={d.dispatch.nature} onChange={(v) => upd((x) => void (x.dispatch.nature = v))} />
        </Field>
        <Field label="Caller report">
          <Text area value={d.dispatch.callerReport} onChange={(v) => upd((x) => void (x.dispatch.callerReport = v))} />
        </Field>
        <Field label="Additional dispatch notes (one per line)">
          <List lines value={d.dispatch.notes} onChange={(v) => upd((x) => void (x.dispatch.notes = v))} />
        </Field>
      </Card>
      <Card title="Occupants">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="What dispatch / the caller says" className="sm:col-span-3">
            <Text value={d.occupants.dispatchInfo} onChange={(v) => upd((x) => void (x.occupants.dispatchInfo = v))} />
          </Field>
          <Field label="Actual status (hidden)">
            <Select value={d.occupants.status} options={['all-out', 'trapped', 'unknown', 'none'] as const} onChange={(v) => upd((x) => void (x.occupants.status = v))} />
          </Field>
          <Field label="Victim location (hidden)" className="sm:col-span-2">
            <Text value={d.occupants.victimLocation} onChange={(v) => upd((x) => void (x.occupants.victimLocation = v || undefined))} />
          </Field>
        </div>
      </Card>
      <Card
        title="Responding units"
        right={
          <Button className="!min-h-8 text-xs" onClick={() => upd((x) => void x.units.push({ role: `U${x.units.length + 1}`, type: 'engine', arrival: 120 }))}>
            + Unit
          </Button>
        }
      >
        <p className="text-xs text-ink-400">
          Roles are placeholders (E2, L1, BC…). Call signs come from the response plan in Settings. Arrival is seconds after {`${useSettings.getState().plan.ownUnit}`} arrives (small random
          jitter is added per seed). Use {'{E2}'}, {'{BC}'} etc. in radio text.
        </p>
        {d.units.map((u, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
            <Field label="Role">
              <Text value={u.role} onChange={(v) => upd((x) => void (x.units[i].role = v.toUpperCase()))} />
            </Field>
            <Field label="Type">
              <Select value={u.type} options={UnitType.options} onChange={(v) => upd((x) => void (x.units[i].type = v))} />
            </Field>
            <Field label="Arrives (s)">
              <Num value={u.arrival} min={0} onChange={(v) => upd((x) => void (x.units[i].arrival = v))} />
            </Field>
            <RemoveBtn onClick={() => upd((x) => void x.units.splice(i, 1))} />
          </div>
        ))}
      </Card>
    </>
  );
}

function ConditionsTab({ d, upd, plan }: TabProps & { plan: ReturnType<typeof useSettings.getState>['plan'] }) {
  const [sel, setSel] = useState(0);
  const [view, setView] = useState<Side>('alpha');
  const c = d.conditionStates[Math.min(sel, d.conditionStates.length - 1)];
  const idx = d.conditionStates.indexOf(c);
  const inst = useMemo(() => {
    try {
      return createInstance({ ...d, initialCondition: c.id }, { seed: 1, plan });
    } catch {
      return null;
    }
  }, [d, c.id, plan]);
  const anchors = anchorIds(d.building.archetype, view, inst?.variant ?? 0);
  const emitters = (c.emitters ?? []) as Emitter[];
  const setC = (fn: (c: ConditionState & Record<string, unknown>) => void) => upd((x) => fn(x.conditionStates[idx] as ConditionState & Record<string, unknown>));
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {d.conditionStates.map((s, i) => (
          <button key={i} onClick={() => setSel(i)} className={`rounded px-3 py-1.5 text-sm ${i === idx ? 'bg-signal-amber text-ink-950' : 'bg-ink-700 text-ink-200'}`}>
            {s.id}
            {s.id === d.initialCondition ? ' (initial)' : ''}
          </button>
        ))}
        <Button
          className="!min-h-8 text-xs"
          onClick={() => {
            upd((x) => void x.conditionStates.push({ ...clone(c), id: `${c.id}-${x.conditionStates.length + 1}` }));
            setSel(d.conditionStates.length);
          }}
        >
          + Copy as new state
        </Button>
      </div>
      <Card title={`Condition: ${c.id}`} right={d.conditionStates.length > 1 && <RemoveBtn label="Delete this condition state" onClick={() => (upd((x) => void x.conditionStates.splice(idx, 1)), setSel(0))} />}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Id">
            <Text value={c.id} onChange={(v) => setC((s) => void (s.id = v))} />
          </Field>
          <Field label="Initial state?">
            <Check value={d.initialCondition === c.id} onChange={(v) => v && upd((x) => void (x.initialCondition = c.id))} label="Scenario starts here" />
          </Field>
          <div />
          <Field label="Description (hidden from the trainee until the review)" className="sm:col-span-3">
            <Text area rows={2} value={c.description} onChange={(v) => setC((s) => void (s.description = v))} />
          </Field>
          <Field label="Problem (true)">
            <Select value={c.problem} options={PROBLEMS} onChange={(v) => setC((s) => void (s.problem = v))} />
          </Field>
          <Field label="Acceptable problem descriptions" className="sm:col-span-2">
            <Multi value={c.acceptableProblems} options={PROBLEMS} onChange={(v) => setC((s) => void (s.acceptableProblems = v))} />
          </Field>
          <Field label="Acceptable strategies" className="sm:col-span-3" help="List every strategy that is operationally defensible for these conditions.">
            <Multi value={c.acceptableStrategies} options={['investigating', 'offensive', 'defensive'] as const} onChange={(v) => setC((s) => void (s.acceptableStrategies = v))} />
          </Field>
          <Field label="Problem side">
            <Select value={c.location?.side ?? ('' as Side)} options={[{ value: '' as Side, label: '— none —' }, ...SIDES.map((s) => ({ value: s, label: s }))]} onChange={(v) => setC((s) => void (s.location = { area: s.location?.area ?? '', areaTerms: s.location?.areaTerms ?? ['area'], ...s.location, side: v || undefined }))} />
          </Field>
          <Field label="Floor">
            <Num value={c.location?.floor} min={1} onChange={(v) => setC((s) => void (s.location = { area: '', areaTerms: ['area'], ...s.location, floor: v || undefined }))} />
          </Field>
          <Field label="Area">
            <Text value={c.location?.area} onChange={(v) => setC((s) => void (s.location = { areaTerms: [v || 'area'], ...s.location, area: v }))} />
          </Field>
          <Field label="Words for the area" className="sm:col-span-3">
            <List value={c.location?.areaTerms} onChange={(v) => setC((s) => void (s.location = { area: s.location?.area ?? '', ...s.location, areaTerms: v }))} placeholder="garage, carport" />
          </Field>
          <Field label="Phrases describing these conditions (for follow-up / transfer)" className="sm:col-span-3">
            <List value={c.conditionTerms} onChange={(v) => setC((s) => void (s.conditionTerms = v))} placeholder="knocked down, fire in the attic" />
          </Field>
        </div>
      </Card>
      <Card title="Smoke and fire effects">
        <div className="flex gap-1">
          {SIDES.map((s) => (
            <button key={s} onClick={() => setView(s)} className={`rounded px-2.5 py-1 text-xs font-semibold uppercase ${view === s ? 'bg-signal-amber text-ink-950' : 'bg-ink-700 text-ink-200'}`}>
              {s} ({emitters.filter((e) => e.view === s).length})
            </button>
          ))}
        </div>
        {inst && <Scene instance={inst} view={view} emitters={emitters} className="aspect-video w-full rounded" />}
        {emitters.map((e, i) =>
          e.view !== view ? null : (
            <div key={i} className="grid grid-cols-2 items-end gap-2 rounded border border-ink-700 p-2 sm:grid-cols-[1.4fr_0.8fr_1fr_0.9fr_0.9fr_0.8fr_auto]">
              <Field label="Anchor">
                <Select value={e.anchor} options={[...new Set([e.anchor, ...anchors])]} onChange={(v) => setC((s) => void ((s.emitters as Emitter[])[i].anchor = v))} />
              </Field>
              <Field label="Kind">
                <Select value={e.kind} options={['smoke', 'fire', 'glow', 'haze'] as const} onChange={(v) => setC((s) => void ((s.emitters as Emitter[])[i].kind = v))} />
              </Field>
              <Field label={`Intensity ${e.intensity.toFixed(2)}`}>
                <input type="range" min={0} max={1} step={0.05} value={e.intensity} className="w-full" onChange={(ev) => setC((s) => void ((s.emitters as Emitter[])[i].intensity = Number(ev.target.value)))} />
              </Field>
              <Field label="Color">
                <Select value={e.color} options={SmokeColor.options} onChange={(v) => setC((s) => void ((s.emitters as Emitter[])[i].color = v))} />
              </Field>
              <Field label="Pressure">
                <Select value={e.pressure} options={['lazy', 'moderate', 'pushing'] as const} onChange={(v) => setC((s) => void ((s.emitters as Emitter[])[i].pressure = v))} />
              </Field>
              <Field label="Spread">
                <Num value={e.spread} min={0.2} max={4} step={0.1} onChange={(v) => setC((s) => void ((s.emitters as Emitter[])[i].spread = v))} />
              </Field>
              <RemoveBtn onClick={() => setC((s) => void (s.emitters as Emitter[]).splice(i, 1))} />
            </div>
          ),
        )}
        <Button
          className="!min-h-8 text-xs"
          onClick={() => setC((s) => void ((s.emitters ??= []) as Emitter[]).push({ id: `e${Date.now().toString(36)}`, view, anchor: anchors[0], kind: 'smoke', intensity: 0.4, color: 'gray', pressure: 'moderate', spread: 1 }))}
        >
          + Add effect on {view}
        </Button>
        <p className="text-xs text-ink-500">Keep effects consistent with the condition description — the validator cannot see the picture, but the trainee can.</p>
      </Card>
    </>
  );
}

function FindingsTab({ d, upd }: TabProps) {
  return (
    <>
      <Card title="Recon">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Kind">
            <Select value={d.recon.kind ?? '360'} options={['360', 'interior', 'lobby'] as const} onChange={(v) => upd((x) => void (x.recon.kind = v))} />
          </Field>
          <Field label="Button label">
            <Text value={d.recon.label} onChange={(v) => upd((x) => void (x.recon.label = v))} />
          </Field>
          <Field label="Duration (s)">
            <Num value={d.recon.duration} min={10} max={180} onChange={(v) => upd((x) => void (x.recon.duration = v))} />
          </Field>
          <div className="self-end">
            <Check value={d.recon.full360Possible ?? true} onChange={(v) => upd((x) => void (x.recon.full360Possible = v))} label="Full 360 possible" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Investigation action (optional)" help="e.g. “Investigate interior with thermal imager”">
            <Text value={d.investigation?.label} onChange={(v) => upd((x) => void (x.investigation = v ? { label: v, duration: x.investigation?.duration ?? 60 } : undefined))} />
          </Field>
          {d.investigation && (
            <Field label="Investigation duration (s)">
              <Num value={d.investigation.duration} min={10} max={240} onChange={(v) => upd((x) => void (x.investigation!.duration = v))} />
            </Field>
          )}
        </div>
      </Card>
      <Card
        title="Findings"
        right={
          <Button
            className="!min-h-8 text-xs"
            onClick={() => upd((x) => void (x.findings ??= []).push({ id: `f${(x.findings?.length ?? 0) + 1}`, side: 'charlie', text: '', kind: 'conditions', safety: false, reportable: 'recommended', match: [['term']], revealedBy: 'recon' }))}
          >
            + Finding
          </Button>
        }
      >
        <p className="text-xs text-ink-400">
          What the officer observes. “Match” lists how the trainee might say it: one group per line, words in a group comma-separated (all words in a group must
          appear; any group counts). Use * for word endings.
        </p>
        {(d.findings ?? []).map((f, i) => (
          <div key={i} className="space-y-2 rounded border border-ink-700 p-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
              <Field label="Id">
                <Text value={f.id} onChange={(v) => upd((x) => void (x.findings![i].id = v))} />
              </Field>
              <Field label="Side">
                <Select value={f.side} options={['alpha', 'bravo', 'charlie', 'delta', 'interior', 'roof', 'general'] as const} onChange={(v) => upd((x) => void (x.findings![i].side = v))} />
              </Field>
              <Field label="Kind">
                <Select value={f.kind} options={['conditions', 'access', 'hazard', 'life-safety', 'basement', 'exposure', 'cause', 'utility'] as const} onChange={(v) => upd((x) => void (x.findings![i].kind = v))} />
              </Field>
              <Field label="Revealed by">
                <Select value={f.revealedBy ?? 'recon'} options={['recon', 'investigate', 'event', 'arrival'] as const} onChange={(v) => upd((x) => void (x.findings![i].revealedBy = v))} />
              </Field>
              <Field label="Reportable">
                <Select value={f.reportable ?? 'recommended'} options={['required', 'recommended', 'optional'] as const} onChange={(v) => upd((x) => void (x.findings![i].reportable = v))} />
              </Field>
              <RemoveBtn onClick={() => upd((x) => void x.findings!.splice(i, 1))} />
            </div>
            <Field label="Observation text">
              <Text value={f.text} onChange={(v) => upd((x) => void (x.findings![i].text = v))} />
            </Field>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Field label="Match groups">
                <textarea
                  className={inputCls}
                  rows={2}
                  value={f.match.map((g) => g.join(', ')).join('\n')}
                  onChange={(e) => upd((x) => void (x.findings![i].match = e.target.value.split('\n').map((l) => l.split(',').map((s) => s.trim()).filter(Boolean)).filter((g) => g.length)))}
                />
              </Field>
              <div className="self-end pb-2">
                <Check value={f.safety} onChange={(v) => upd((x) => void (x.findings![i].safety = v))} label="Safety concern" />
              </div>
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}

type Trig = Record<string, unknown>;
const TRIGGER_KINDS = [
  { value: 'at', label: 'At time (s)' },
  { value: 'after', label: 'After a checkpoint' },
  { value: 'task', label: 'When a task is assigned/complete' },
  { value: 'notTask', label: 'If task NOT assigned by (s)' },
  { value: 'notComplete', label: 'If task NOT complete by (s)' },
  { value: 'event', label: 'After another event' },
  { value: 'allOf', label: 'All of… (edit in JSON)' },
] as const;
type TrigKind = (typeof TRIGGER_KINDS)[number]['value'];

function trigKind(t: Trig): TrigKind {
  return (['allOf', 'notTask', 'notComplete', 'task', 'after', 'event', 'at'] as const).find((k) => k in t) ?? 'at';
}

function TriggerEditor({ t, onChange }: { t: Trig; onChange: (t: Trig) => void }) {
  const k = trigKind(t);
  const tasks = TASKS.map((x) => ({ value: x, label: TASK_INFO[x].label }));
  const fresh: Record<TrigKind, Trig> = {
    at: { at: 60 },
    after: { after: 'initialReport', delay: 0 },
    task: { task: 'fireControl', status: 'complete', delay: 0 },
    notTask: { notTask: 'waterSupply', by: 120 },
    notComplete: { notComplete: 'waterSupply', by: 150 },
    event: { event: '', delay: 0 },
    allOf: { allOf: [{ at: 60 }] },
  };
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Field label="Trigger">
        <Select value={k} options={TRIGGER_KINDS as unknown as { value: TrigKind; label: string }[]} onChange={(v) => onChange(fresh[v])} />
      </Field>
      {k === 'at' && (
        <Field label="Seconds after arrival">
          <Num value={t.at as number} min={0} onChange={(v) => onChange({ at: v })} />
        </Field>
      )}
      {k === 'after' && (
        <Field label="Checkpoint">
          <Select value={t.after as 'initialReport'} options={['initialReport', 'followUp', 'reconStarted', 'reconComplete', 'investigateComplete', 'transfer'] as const} onChange={(v) => onChange({ ...t, after: v })} />
        </Field>
      )}
      {(k === 'task' || k === 'notTask' || k === 'notComplete') && (
        <Field label="Task">
          <Select value={t[k] as string} options={tasks} onChange={(v) => onChange({ ...t, [k]: v })} />
        </Field>
      )}
      {k === 'task' && (
        <Field label="Status">
          <Select value={(t.status as 'assigned') ?? 'assigned'} options={['assigned', 'complete'] as const} onChange={(v) => onChange({ ...t, status: v })} />
        </Field>
      )}
      {(k === 'notTask' || k === 'notComplete') && (
        <Field label="By (s)">
          <Num value={t.by as number} min={0} onChange={(v) => onChange({ ...t, by: v })} />
        </Field>
      )}
      {k === 'event' && (
        <Field label="Event id">
          <Text value={t.event as string} onChange={(v) => onChange({ ...t, event: v })} />
        </Field>
      )}
      {(k === 'after' || k === 'task' || k === 'event') && (
        <Field label="Delay (s)">
          <Num value={(t.delay as number) ?? 0} min={0} onChange={(v) => onChange({ ...t, delay: v })} />
        </Field>
      )}
    </div>
  );
}

type Eff = Record<string, unknown>;

function EventsTab({ d, upd }: TabProps) {
  const events = (d.events ?? []) as { id: string; when: Trig; effects: Eff[]; explanation?: string }[];
  const roles = ['Dispatch', 'OWN', ...d.units.map((u) => u.role)];
  return (
    <Card
      title="Timed and conditional events"
      right={
        <Button className="!min-h-8 text-xs" onClick={() => upd((x) => void (x.events ??= []).push({ id: `ev${(x.events?.length ?? 0) + 1}`, when: { at: 90 }, effects: [{ radio: { from: 'Dispatch', text: '', requiresAck: false } }] }))}>
          + Event
        </Button>
      }
    >
      <p className="text-xs text-ink-400">
        Events change conditions, reveal findings, and generate radio traffic. They can depend on what the trainee did (or did not do), so the incident responds
        to their decisions. Task outcomes and branches are edited on the JSON tab.
      </p>
      {events.map((ev, i) => (
        <div key={i} className="space-y-2 rounded border border-ink-700 p-2">
          <div className="grid grid-cols-[1fr_2fr_auto] items-end gap-2">
            <Field label="Id">
              <Text value={ev.id} onChange={(v) => upd((x) => void (x.events![i].id = v))} />
            </Field>
            <Field label="Instructor explanation">
              <Text value={ev.explanation} onChange={(v) => upd((x) => void (x.events![i].explanation = v || undefined))} />
            </Field>
            <RemoveBtn onClick={() => upd((x) => void x.events!.splice(i, 1))} />
          </div>
          <TriggerEditor t={ev.when} onChange={(t) => upd((x) => void ((x.events![i] as { when: Trig }).when = t))} />
          <div className="space-y-1.5">
            {ev.effects.map((ef, j) => {
              const kind = 'radio' in ef ? 'radio' : 'setCondition' in ef ? 'setCondition' : 'reveal' in ef ? 'reveal' : 'note';
              const setEf = (v: Eff) => upd((x) => void ((x.events![i].effects as Eff[])[j] = v));
              return (
                <div key={j} className="grid grid-cols-[150px_1fr_auto] items-start gap-2">
                  <Select
                    value={kind}
                    options={[
                      { value: 'radio', label: 'Radio message' },
                      { value: 'setCondition', label: 'Change conditions' },
                      { value: 'reveal', label: 'Reveal finding' },
                      { value: 'note', label: 'Instructor note' },
                    ]}
                    onChange={(v) =>
                      setEf(v === 'radio' ? { radio: { from: 'Dispatch', text: '', requiresAck: false } } : v === 'setCondition' ? { setCondition: d.conditionStates[0].id } : v === 'reveal' ? { reveal: d.findings?.[0]?.id ?? '' } : { note: '' })
                    }
                  />
                  {kind === 'radio' && (
                    <div className="grid grid-cols-[120px_1fr_auto] gap-2">
                      <Select value={(ef.radio as { from: string }).from} options={roles} onChange={(v) => setEf({ radio: { ...(ef.radio as object), from: v } })} />
                      <Text value={(ef.radio as { text: string }).text} onChange={(v) => setEf({ radio: { ...(ef.radio as object), text: v } })} placeholder="{COMMAND}, {E2}, …" />
                      <Check value={(ef.radio as { requiresAck?: boolean }).requiresAck} onChange={(v) => setEf({ radio: { ...(ef.radio as object), requiresAck: v } })} label="needs ack" />
                    </div>
                  )}
                  {kind === 'setCondition' && <Select value={ef.setCondition as string} options={d.conditionStates.map((c) => c.id)} onChange={(v) => setEf({ setCondition: v })} />}
                  {kind === 'reveal' && <Select value={ef.reveal as string} options={(d.findings ?? []).map((f) => f.id)} onChange={(v) => setEf({ reveal: v })} />}
                  {kind === 'note' && <Text value={ef.note as string} onChange={(v) => setEf({ note: v })} />}
                  <RemoveBtn onClick={() => upd((x) => void (x.events![i].effects as Eff[]).splice(j, 1))} />
                </div>
              );
            })}
            <Button className="!min-h-8 text-xs" onClick={() => upd((x) => void (x.events![i].effects as Eff[]).push({ note: '' }))}>
              + Effect
            </Button>
          </div>
        </div>
      ))}
    </Card>
  );
}

function ExpectationsTab({ d, upd }: TabProps) {
  const e = d.expectations;
  const tasks = TASKS;
  const ex = d.examples ?? { initialReport: [], followUp: [], assignments: [], transfer: [] };
  const expl = d.explanations ?? { initialReport: '', followUp: '', assignments: '', transfer: '' };
  return (
    <>
      <Card title="Required checklist elements">
        <Field label="Acceptable initial actions">
          <Multi value={e.initialActions} options={InitialAction.options} onChange={(v) => upd((x) => void (x.expectations.initialActions = v))} />
        </Field>
        <Field label="Words for where the initial work happens">
          <List value={e.actionLocationTerms} onChange={(v) => upd((x) => void (x.expectations.actionLocationTerms = v))} placeholder="garage, alpha side, front door" />
        </Field>
        <Field label="Tactical objectives expected in the initial report">
          <Multi value={e.objectives} options={['fireControl', 'primarySearch', 'investigate', 'exposure'] as const} onChange={(v) => upd((x) => void (x.expectations.objectives = v))} />
        </Field>
        <Field label="Acceptable resource decisions">
          <Multi value={e.resourceDecisions} options={ResourceDecision.options} onChange={(v) => upd((x) => void (x.expectations.resourceDecisions = v))} />
        </Field>
        <Field label="Critical tasks (must be assigned)">
          <Multi value={e.criticalTasks} options={tasks} label={(t) => TASK_INFO[t].label} onChange={(v) => upd((x) => void (x.expectations.criticalTasks = v))} />
        </Field>
        <Field label="Expected tasks (good practice)">
          <Multi value={e.expectedTasks} options={tasks} label={(t) => TASK_INFO[t].label} onChange={(v) => upd((x) => void (x.expectations.expectedTasks = v))} />
        </Field>
        <div className="flex flex-wrap gap-4">
          <Check value={e.followUpExpected ?? true} onChange={(v) => upd((x) => void (x.expectations.followUpExpected = v))} label="Follow-up report expected" />
          <Check value={e.transferExpected ?? true} onChange={(v) => upd((x) => void (x.expectations.transferExpected = v))} label="Command transfer expected" />
          <Check value={e.accountabilityExpected ?? true} onChange={(v) => upd((x) => void (x.expectations.accountabilityExpected = v))} label="Accountability location expected" />
        </div>
        <Field label="Priorities a good transfer mentions">
          <List value={e.transferPriorities} onChange={(v) => upd((x) => void (x.expectations.transferPriorities = v))} placeholder="secondary search, check attic extension" />
        </Field>
        <Field label="Scenario ends when">
          <Select value={d.endWhen ?? 'transfer'} options={[{ value: 'transfer', label: 'Command is transferred' }, { value: 'followUp', label: 'Follow-up is given (no chief needed)' }]} onChange={(v) => upd((x) => void (x.endWhen = v))} />
        </Field>
      </Card>
      <Card title="Preferred radio wording">
        <p className="text-xs text-ink-400">Examples shown to the trainee as one good way to say it. Other wording that carries the same facts is accepted. Placeholders like {'{COMMAND}'} work.</p>
        <Field label="Initial report (one per line)">
          <List lines value={ex.initialReport} onChange={(v) => upd((x) => void (x.examples = { ...ex, initialReport: v }))} />
        </Field>
        <Field label="Follow-up (one per line)">
          <List lines value={ex.followUp} onChange={(v) => upd((x) => void (x.examples = { ...ex, followUp: v }))} />
        </Field>
        <Field label="Transfer (one per line)">
          <List lines value={ex.transfer} onChange={(v) => upd((x) => void (x.examples = { ...ex, transfer: v }))} />
        </Field>
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-ink-300">Assignments by role</div>
          {(ex.assignments ?? []).map((a, i) => (
            <div key={i} className="grid grid-cols-[100px_160px_1fr_auto] gap-2">
              <Select value={a.role} options={d.units.map((u) => u.role)} onChange={(v) => upd((x) => void (x.examples!.assignments![i].role = v))} />
              <Select value={a.task} options={TASKS.map((t) => ({ value: t, label: TASK_INFO[t].label }))} onChange={(v) => upd((x) => void (x.examples!.assignments![i].task = v))} />
              <Text value={a.text} onChange={(v) => upd((x) => void (x.examples!.assignments![i].text = v))} />
              <RemoveBtn onClick={() => upd((x) => void x.examples!.assignments!.splice(i, 1))} />
            </div>
          ))}
          <Button className="!min-h-8 text-xs" onClick={() => upd((x) => void (x.examples = { ...ex, assignments: [...(ex.assignments ?? []), { role: d.units[0]?.role ?? 'E2', task: 'waterSupply', text: '' }] }))}>
            + Assignment example
          </Button>
        </div>
      </Card>
      <Card title="Instructor explanations (shown after grading)">
        {(['initialReport', 'assignments', 'followUp', 'transfer'] as const).map((k) => (
          <Field key={k} label={k}>
            <Text area rows={2} value={expl[k]} onChange={(v) => upd((x) => void (x.explanations = { ...expl, [k]: v }))} />
          </Field>
        ))}
      </Card>
    </>
  );
}

function PhotosTab({ d, upd }: TabProps) {
  const [view, setView] = useState<Side>('alpha');
  const variant = d.setting?.variant ?? 0;
  const used = [...new Set(d.conditionStates.flatMap((c) => (c.emitters ?? []).filter((e) => e.view === view).map((e) => e.anchor)))];
  const asset = (d.images ?? []).find((i) => i.view === view) as ImageAsset | undefined;
  return (
    <Card title="Building photos">
      <p className="text-xs text-ink-400">
        Add a photo of the same building for any side. Without a photo, the procedural illustration is used. Never substitute a photo of a different
        building — continuity matters more than image count. {d.setting?.variant === undefined && 'Tip: set a fixed visual variant on the Building tab so anchors match one layout.'}
      </p>
      <div className="flex gap-1">
        {SIDES.map((s) => (
          <button key={s} onClick={() => setView(s)} className={`rounded px-2.5 py-1 text-xs font-semibold uppercase ${view === s ? 'bg-signal-amber text-ink-950' : 'bg-ink-700 text-ink-200'}`}>
            {s} {(d.images ?? []).some((i) => i.view === s) ? '📷' : ''}
          </button>
        ))}
      </div>
      <PhotoAnchors
        key={view}
        view={view}
        asset={asset}
        anchorIds={anchorIds(d.building.archetype, view, variant)}
        usedAnchors={used}
        onChange={(a) =>
          upd((x) => {
            const rest = (x.images ?? []).filter((i) => i.view !== view);
            x.images = a ? [...rest, a] : rest;
          })
        }
      />
    </Card>
  );
}

function PromptsTab({ d, plan }: { d: Draft; plan: ReturnType<typeof useSettings.getState>['plan'] }) {
  const prompts = useMemo(() => {
    try {
      const inst = createInstance(d, { seed: 1, plan });
      return buildImagePrompts(d, inst);
    } catch {
      return null;
    }
  }, [d, plan]);
  if (!prompts) return <p className="text-sm text-signal-amber">Fix validation errors to generate prompts.</p>;
  const text = promptsToText(d, prompts);
  return (
    <Card
      title="Image-generation prompts"
      right={
        <div className="flex gap-2">
          <Button className="!min-h-8 text-xs" onClick={() => void navigator.clipboard?.writeText(text)}>
            Copy all
          </Button>
          <Button
            className="!min-h-8 text-xs"
            onClick={() => {
              const a = document.createElement('a');
              a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
              a.download = `${d.id}-image-prompts.txt`;
              a.click();
            }}
          >
            Download .txt
          </Button>
        </div>
      }
    >
      <p className="text-xs text-ink-400">
        FIRST FIVE does not generate images. Use these prompts with any image tool you have rights to use (or as a shot list for your own photos), then add the
        results on the Photos tab and record their origin. The prompts describe this scenario's procedural building so all four images match it.
      </p>
      {prompts.map((p) => (
        <div key={p.view} className="rounded border border-ink-700 bg-ink-900 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-signal-amber">{p.view}</span>
            <span className="font-mono text-[11px] text-ink-400">{p.filename}</span>
          </div>
          <pre className="whitespace-pre-wrap font-mono text-xs text-ink-200">{p.prompt}</pre>
          <p className="mt-2 text-[11px] text-ink-400">Negative: {p.negative}</p>
        </div>
      ))}
    </Card>
  );
}

function JsonTab({ d, onChange, readOnly }: { d: Draft; onChange: (d: Draft) => void; readOnly: boolean }) {
  const [text, setText] = useState(() => JSON.stringify(d, null, 2));
  const [err, setErr] = useState('');
  return (
    <Card title="Scenario JSON">
      <p className="text-xs text-ink-400">Full scenario definition, including task outcomes and branches. Edits apply when the JSON is valid.</p>
      <textarea
        className={`${inputCls} min-h-[60vh] font-mono text-xs`}
        spellCheck={false}
        readOnly={readOnly}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setErr('');
          } catch (x) {
            setErr((x as Error).message);
          }
        }}
      />
      {err && <p className="text-xs text-signal-amber">{err}</p>}
    </Card>
  );
}
