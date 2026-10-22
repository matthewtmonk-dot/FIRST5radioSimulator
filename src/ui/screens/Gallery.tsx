import { useMemo, useState } from 'react';
import { BUILT_IN_SCENARIOS } from '../../content';
import { createInstance } from '../../domain/scenario/instance';
import { SIDES, type Side } from '../../domain/scenario/schema';
import { Scene } from '../components/Scene';

/** Renders every condition state and view of a scenario — used for authoring review. */
export function Gallery() {
  const params = new URLSearchParams(location.search);
  const [tid, setTid] = useState(params.get('t') ?? BUILT_IN_SCENARIOS[0].id);
  const [seed, setSeed] = useState(Number(params.get('seed') ?? 7));
  const [cond, setCond] = useState(params.get('c') ?? '');
  const [view, setView] = useState<Side>((params.get('v') as Side) ?? 'alpha');
  const inst = useMemo(() => createInstance(BUILT_IN_SCENARIOS.find((s) => s.id === tid)!, { seed, branchId: params.get('b') ?? undefined }), [tid, seed]);
  const c = inst.conditionStates.find((x) => x.id === cond) ?? inst.conditionStates.find((x) => x.id === inst.initialCondition)!;
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex flex-wrap gap-2 text-sm">
        <select className="bg-ink-800 p-1" value={tid} onChange={(e) => setTid(e.target.value)}>
          {BUILT_IN_SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
        </select>
        <select className="bg-ink-800 p-1" value={c.id} onChange={(e) => setCond(e.target.value)}>
          {inst.conditionStates.map((s) => <option key={s.id}>{s.id}</option>)}
        </select>
        {SIDES.map((s) => <button key={s} className={`px-2 ${s === view ? 'bg-signal-amber text-ink-900' : 'bg-ink-700'}`} onClick={() => setView(s)}>{s}</button>)}
        <button className="bg-ink-700 px-2" onClick={() => setSeed(seed + 1)}>seed {seed}</button>
        <span className="text-ink-300">{inst.environment.timeOfDay} · {inst.environment.weather} · wind {inst.environment.windFrom} {inst.environment.windMph}</span>
      </div>
      <Scene instance={inst} view={view} emitters={c.emitters} className="aspect-video w-full max-w-[1400px]" />
    </div>
  );
}
