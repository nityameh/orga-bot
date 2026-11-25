// Shared presentational components for the dashboard (no data fetching here).
import type { ReactNode } from 'react';

/** Page title block with optional subtitle and right-aligned actions. */
export function PageHeader({ title, subtitle, actions, eyebrow }: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    // Side-by-side only from lg: below that the sidebar leaves too little room for title + actions.
    <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between animate-fade-up">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TONES = {
  brand: 'bg-brand-50 text-brand-600 ring-brand-100',
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  amber: 'bg-amber-50 text-amber-600 ring-amber-100',
  sky: 'bg-sky-50 text-sky-600 ring-sky-100',
  rose: 'bg-rose-50 text-rose-600 ring-rose-100',
  ink: 'bg-ink-100 text-ink-600 ring-ink-200',
} as const;
export type Tone = keyof typeof TONES;

/** Rounded square holding an icon, tinted by tone. */
export function IconBadge({ tone = 'brand', children, size = 'md' }: { tone?: Tone; children: ReactNode; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-8 w-8 rounded-lg' : 'h-10 w-10 rounded-xl';
  return <span className={`inline-flex shrink-0 items-center justify-center ring-1 ${box} ${TONES[tone]}`}>{children}</span>;
}

/** Headline number with label, icon and optional hint. */
export function StatCard({ label, value, hint, icon, tone = 'brand' }: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-500">{label}</p>
        {icon && <IconBadge tone={tone} size="sm">{icon}</IconBadge>}
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}

/** Titled card section. */
export function Section({ title, description, action, children, className = '' }: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-6 ${className}`}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
          {description && <p className="mt-1 text-xs text-ink-400">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Friendly empty state with icon, message and optional hint (e.g. what to send on WhatsApp). */
export function EmptyState({ icon, title, hint, action }: {
  icon: ReactNode;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-16 text-center">
      <IconBadge tone="brand">{icon}</IconBadge>
      <p className="mt-4 font-medium text-ink-900">{title}</p>
      {hint && <p className="mt-1.5 max-w-sm text-sm text-ink-500">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Pill-shaped tab switcher. */
export function Segmented<T extends string | number>({ options, value, onChange, label }: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl bg-white p-1 ring-1 ring-ink-200">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={String(o.value)} role="tab" aria-selected={active} onClick={() => onChange(o.value)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${active
              ? 'bg-ink-900 text-white shadow-sm'
              : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900'}`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Grid of shimmering cards while data loads. */
export function SkeletonCards({ count = 3, height = 'h-32', cols = 'md:grid-cols-2 lg:grid-cols-3' }: {
  count?: number;
  height?: string;
  cols?: string;
}) {
  return (
    <div className={`grid grid-cols-1 gap-4 ${cols}`} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => <div key={i} className={`skeleton ${height} rounded-2xl`} />)}
    </div>
  );
}

/** Lowercase tag such as "#acme". */
export function Tag({ children }: { children: ReactNode }) {
  return <span className="chip bg-brand-50 text-brand-700">{children}</span>;
}

/** Circle with the first letter of a name, coloured from the name so it stays stable. */
export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const palette = ['bg-brand-100 text-brand-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700',
    'bg-sky-100 text-sky-700', 'bg-rose-100 text-rose-700', 'bg-teal-100 text-teal-700'];
  const hash = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
  const dim = size === 'sm' ? 'h-7 w-7 text-xs' : size === 'lg' ? 'h-12 w-12 text-lg' : 'h-9 w-9 text-sm';
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold uppercase ${dim} ${palette[hash % palette.length]}`}>
      {name.trim().charAt(0) || '?'}
    </span>
  );
}

/** "1 note", "3 notes". */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** "5m ago", "3d ago", or a date for older items. */
export function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Date and time in IST, e.g. "Thu, 27 Nov, 9:00 am". */
export function formatIST(dateStr: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Date(dateStr).toLocaleString('en-IN', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'Asia/Kolkata', hour12: true, ...opts,
  });
}
