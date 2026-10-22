// Photo upload and anchor placement for one side of the building. Anchors
// are the same named points the procedural model uses, so every condition
// state's smoke and fire land on the photo without re-authoring effects.

import { useRef, useState } from 'react';
import type { ImageAsset, Side } from '../../../domain/scenario/schema';
import { Button } from '../../components/ui';
import { Field, Select, Text, inputCls } from './fields';

const MAX_W = 2400;

/** Read an image file, downscaling very large photos to keep scenario packs portable. */
export async function readImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error('Not an image the browser can read.'));
      img.src = url;
    });
    const scale = Math.min(1, MAX_W / img.naturalWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface Props {
  view: Side;
  asset: ImageAsset | undefined;
  anchorIds: string[];
  /** Anchors that the scenario's effects use on this view (must be placed). */
  usedAnchors: string[];
  onChange: (a: ImageAsset | undefined) => void;
}

export function PhotoAnchors({ view, asset, anchorIds, usedAnchors, onChange }: Props) {
  const [selected, setSelected] = useState<string>(usedAnchors[0] ?? anchorIds[0] ?? '');
  const [err, setErr] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const img = useRef<HTMLImageElement>(null);

  const upload = async (f: File) => {
    try {
      setErr('');
      const src = await readImage(f);
      onChange({ view, src, origin: asset?.origin ?? 'own-photo', license: asset?.license ?? '', credit: asset?.credit ?? '', anchors: asset?.anchors ?? {} });
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const place = (ev: React.MouseEvent) => {
    if (!asset || !selected || !img.current) return;
    const r = img.current.getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width;
    const y = (ev.clientY - r.top) / r.height;
    const prev = asset.anchors[selected];
    onChange({ ...asset, anchors: { ...asset.anchors, [selected]: { x: round(x), y: round(y), w: prev?.w ?? 0.08 } } });
    const next = [...usedAnchors, ...anchorIds].find((id) => id !== selected && !asset.anchors[id]);
    if (next && usedAnchors.includes(next)) setSelected(next);
  };

  const missing = usedAnchors.filter((a) => !asset?.anchors[a]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        <Button onClick={() => file.current?.click()}>{asset ? 'Replace photo' : `Add ${view} photo`}</Button>
        {asset && (
          <Button variant="ghost" onClick={() => confirm('Remove this photo? The procedural illustration will be used.') && onChange(undefined)}>
            Remove photo
          </Button>
        )}
        {err && <span className="text-xs text-signal-red">{err}</span>}
      </div>
      {!asset && <p className="text-sm text-ink-400">No photo for this side — the procedural illustration is used. Only add a photo of this same building.</p>}
      {asset && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Origin">
              <Select
                value={asset.origin}
                options={[
                  { value: 'own-photo', label: 'My own photograph' },
                  { value: 'licensed', label: 'Licensed photograph' },
                  { value: 'ai-generated', label: 'AI-generated (made separately)' },
                  { value: 'user-supplied', label: 'Supplied by someone else' },
                ]}
                onChange={(v) => onChange({ ...asset, origin: v })}
              />
            </Field>
            <Field label="License / permission">
              <Text value={asset.license} onChange={(v) => onChange({ ...asset, license: v })} placeholder="e.g. CC BY 4.0, own work" />
            </Field>
            <Field label="Credit">
              <Text value={asset.credit} onChange={(v) => onChange({ ...asset, credit: v })} placeholder="Photographer / source" />
            </Field>
          </div>
          <div className="grid gap-3 lg:grid-cols-[1fr_240px]">
            <div className="relative select-none overflow-hidden rounded border border-ink-600 bg-black">
              <img ref={img} src={asset.src} alt={`${view} side photo`} className="block w-full cursor-crosshair" onClick={place} draggable={false} />
              {Object.entries(asset.anchors).map(([id, a]) => (
                <div
                  key={id}
                  className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded border-2 ${id === selected ? 'border-signal-amber' : usedAnchors.includes(id) ? 'border-signal-green' : 'border-ink-300/70'}`}
                  style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: `${a.w * 100}%`, height: 14 }}
                >
                  <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-black/70 px-1 text-[10px] text-ink-100">{id}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2 text-sm">
              <p className="text-xs text-ink-400">Pick an anchor, then click the photo where that opening or roof area is. Width sets how wide the smoke source is.</p>
              {missing.length > 0 && <p className="text-xs text-signal-amber">Effects use these anchors but they are not placed yet: {missing.join(', ')}</p>}
              <select className={inputCls} size={10} value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Anchor to place">
                {[...new Set([...usedAnchors, ...anchorIds])].map((id) => (
                  <option key={id} value={id}>
                    {asset.anchors[id] ? '● ' : '○ '}
                    {id}
                    {usedAnchors.includes(id) ? ' (used)' : ''}
                  </option>
                ))}
              </select>
              {selected && asset.anchors[selected] && (
                <div className="space-y-1">
                  <label className="block text-xs text-ink-300">
                    Width {Math.round(asset.anchors[selected].w * 100)}%
                    <input
                      type="range"
                      min={0.01}
                      max={0.6}
                      step={0.005}
                      className="w-full"
                      value={asset.anchors[selected].w}
                      onChange={(e) => onChange({ ...asset, anchors: { ...asset.anchors, [selected]: { ...asset.anchors[selected], w: Number(e.target.value) } } })}
                    />
                  </label>
                  <Button
                    variant="ghost"
                    className="!min-h-8 text-xs"
                    onClick={() => {
                      const rest = { ...asset.anchors };
                      delete rest[selected];
                      onChange({ ...asset, anchors: rest });
                    }}
                  >
                    Clear this anchor
                  </Button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const round = (n: number) => Math.round(n * 1000) / 1000;
