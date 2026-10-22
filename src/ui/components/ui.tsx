// Small shared UI primitives.

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'go';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-signal-amber text-ink-950 hover:bg-[#f0b55a] font-semibold',
  secondary: 'bg-ink-700 text-ink-100 hover:bg-ink-600 border border-ink-600',
  ghost: 'text-ink-200 hover:bg-ink-700/60',
  danger: 'bg-signal-red/90 text-white hover:bg-signal-red font-semibold',
  go: 'bg-signal-green/90 text-ink-950 hover:bg-signal-green font-semibold',
};

export function Button({ variant = 'secondary', className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Panel({ title, right, children, className = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-ink-700 bg-ink-850 ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-2 border-b border-ink-700 px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-300">{title}</h2>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({ tone = 'neutral', children, className = '' }: { tone?: 'neutral' | 'red' | 'amber' | 'green' | 'blue'; children: ReactNode; className?: string }) {
  const t = {
    neutral: 'bg-ink-700 text-ink-200',
    red: 'bg-signal-red/15 text-signal-red border border-signal-red/40',
    amber: 'bg-signal-amber/15 text-signal-amber border border-signal-amber/40',
    green: 'bg-signal-green/15 text-signal-green border border-signal-green/40',
    blue: 'bg-signal-blue/15 text-signal-blue border border-signal-blue/40',
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${t} ${className}`}>{children}</span>;
}

export function scoreTone(score: number | null | undefined): 'red' | 'amber' | 'green' | 'neutral' {
  if (score === null || score === undefined) return 'neutral';
  return score >= 85 ? 'green' : score >= 65 ? 'amber' : 'red';
}

export function ScoreDial({ score, size = 72, label }: { score: number | null; size?: number; label?: string }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const pct = score === null ? 0 : score / 100;
  const color = { red: '#e0533d', amber: '#e8a33d', green: '#4fb07a', neutral: '#5d6b7c' }[scoreTone(score)];
  return (
    <div className="relative inline-flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e2631" strokeWidth={6} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeDasharray={`${c * pct} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center" style={{ height: size }}>
        <span className="tabular text-lg font-bold" style={{ fontSize: size * 0.3 }}>
          {score === null ? '—' : score}
        </span>
      </div>
      {label && <span className="mt-1 text-center text-[11px] leading-tight text-ink-300">{label}</span>}
    </div>
  );
}

export function fmtTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-ink-500 bg-ink-800 px-1.5 py-0.5 font-mono text-[11px] text-ink-200">{children}</kbd>;
}
