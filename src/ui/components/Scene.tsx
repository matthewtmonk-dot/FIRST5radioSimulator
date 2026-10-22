import { useEffect, useRef, useState } from 'react';
import type { ScenarioInstance } from '../../domain/scenario/instance';
import type { Emitter, Side } from '../../domain/scenario/schema';
import { SceneRenderer } from '../../render/SceneRenderer';

interface Props {
  instance: ScenarioInstance;
  view: Side;
  emitters: Emitter[];
  reducedMotion?: boolean;
  className?: string;
  /** Shown to screen readers and as an optional caption. */
  onDescribe?: (text: string) => void;
  children?: React.ReactNode;
}

export function Scene({ instance, view, emitters, reducedMotion, className, onDescribe, children }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<SceneRenderer | null>(null);
  const [desc, setDesc] = useState('');
  const [source, setSource] = useState<'photo' | 'procedural'>('procedural');
  const [photoError, setPhotoError] = useState<Side | null>(null);

  useEffect(() => {
    if (!canvas.current || !wrap.current) return;
    const r = new SceneRenderer(canvas.current, instance);
    r.onPhotoError = (v) => setPhotoError(v);
    renderer.current = r;
    const ro = new ResizeObserver(() => {
      const rect = wrap.current!.getBoundingClientRect();
      r.resize(rect.width, rect.height);
    });
    ro.observe(wrap.current);
    const rect = wrap.current.getBoundingClientRect();
    r.resize(rect.width, rect.height);
    r.start();
    return () => {
      ro.disconnect();
      r.stop();
      renderer.current = null;
    };
  }, [instance]);

  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    r.reducedMotion = !!reducedMotion;
    r.setState({ view, emitters });
    const d = r.describe();
    setDesc(d);
    setSource(r.source);
    onDescribe?.(d);
  }, [view, emitters, reducedMotion, instance, onDescribe]);

  return (
    <div ref={wrap} className={`overflow-hidden bg-black ${/\babsolute\b/.test(className ?? '') ? '' : 'relative'} ${className ?? ''}`}>
      <canvas ref={canvas} role="img" aria-label={desc} className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/55 px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-300">
        {source === 'photo' ? 'Photo + simulated effects' : 'Procedural illustration · not a photograph'}
      </div>
      {photoError === view && (
        <div className="absolute left-2 top-2 rounded bg-signal-amber/90 px-2 py-1 text-xs text-ink-950">
          Photo for this view could not be loaded — showing the procedural illustration.
        </div>
      )}
      {children}
    </div>
  );
}
