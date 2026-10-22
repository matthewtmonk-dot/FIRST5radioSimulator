// Small form controls for the scenario builder.

import type { ReactNode } from 'react';

export const inputCls = 'w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm text-ink-100 focus:border-signal-amber focus:outline-none';

export function Field({ label, help, children, className = '' }: { label: string; help?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="block text-xs font-medium text-ink-300">{label}</span>
      {children}
      {help && <span className="block text-[11px] text-ink-500">{help}</span>}
    </label>
  );
}

export function Text({ value, onChange, placeholder, area, rows = 3 }: { value: string | undefined; onChange: (v: string) => void; placeholder?: string; area?: boolean; rows?: number }) {
  return area ? (
    <textarea className={inputCls} rows={rows} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  ) : (
    <input className={inputCls} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  );
}

export function Num({ value, onChange, min, max, step = 1 }: { value: number | undefined; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return <input type="number" className={inputCls} value={value ?? ''} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />;
}

export function Select<T extends string>({ value, options, onChange }: { value: T | undefined; options: readonly T[] | { value: T; label: string }[]; onChange: (v: T) => void }) {
  const opts = (options as readonly (T | { value: T; label: string })[]).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return (
    <select className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value as T)}>
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Multi<T extends string | number>({ value, options, onChange, label = (x: T) => String(x) }: { value: T[] | undefined; options: readonly T[]; onChange: (v: T[]) => void; label?: (x: T) => string }) {
  const v = value ?? [];
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => {
        const on = v.includes(o);
        return (
          <button
            key={String(o)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? v.filter((x) => x !== o) : [...v, o])}
            className={`rounded border px-2 py-1 text-xs ${on ? 'border-signal-amber bg-signal-amber/15 text-signal-amber' : 'border-ink-600 text-ink-300 hover:text-ink-100'}`}
          >
            {label(o)}
          </button>
        );
      })}
    </div>
  );
}

export function Check({ value, onChange, label }: { value: boolean | undefined; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-signal-amber" />
      {label}
    </label>
  );
}

/** Comma- or line-separated list of strings. */
export function List({ value, onChange, lines, placeholder }: { value: string[] | undefined; onChange: (v: string[]) => void; lines?: boolean; placeholder?: string }) {
  const sep = lines ? '\n' : ', ';
  return lines ? (
    <textarea
      className={inputCls}
      rows={3}
      placeholder={placeholder}
      value={(value ?? []).join(sep)}
      onChange={(e) => onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
    />
  ) : (
    <input
      className={inputCls}
      placeholder={placeholder}
      value={(value ?? []).join(sep)}
      onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
    />
  );
}

export function Card({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-850">
      <div className="flex items-center justify-between border-b border-ink-700 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-300">{title}</h3>
        {right}
      </div>
      <div className="space-y-3 p-3">{children}</div>
    </div>
  );
}

export function RemoveBtn({ onClick, label = 'Remove' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="rounded px-2 text-ink-400 hover:text-signal-red" aria-label={label} title={label}>
      ✕
    </button>
  );
}
