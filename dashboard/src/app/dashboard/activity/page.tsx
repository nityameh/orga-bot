'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { TimelineItem } from '@/lib/types';
import { EmptyState, PageHeader, Segmented } from '@/components/ui';
import {
  ActivityIcon, BellIcon, ChatIcon, CheckIcon, LinkIcon, NoteIcon, ShieldIcon, SparkIcon,
} from '@/components/icons';

const FILTERS: { label: string; kind?: string }[] = [
  { label: 'Everything' },
  { label: 'AI actions', kind: 'agent.turn' },
  { label: 'Proactive', kind: 'nudge.sent' },
  { label: 'Approvals', kind: 'approval.*' },
  { label: 'Reminders', kind: 'reminder.*' },
  { label: 'Notes', kind: 'note.*' },
  { label: 'Logins', kind: 'auth.login' },
];

const LABELS: Record<string, string> = {
  'message.received': 'You messaged Orga',
  'message.sent': 'Orga replied',
  'agent.turn': 'AI handled a message',
  'nudge.sent': 'Proactive message',
  'approval.requested': 'Asked for your approval',
  'approval.granted': 'You approved',
  'approval.rejected': 'You declined',
  'auth.login': 'Dashboard login',
};

function label(kind: string) {
  return LABELS[kind] ?? kind.replace('.', ' ').replace(/_/g, ' ');
}

/** Icon and colour for each kind of event. */
function kindStyle(kind: string): { icon: React.ReactNode; cls: string } {
  if (kind === 'agent.turn') return { icon: <SparkIcon size={15} />, cls: 'bg-brand-50 text-brand-600 ring-brand-100' };
  if (kind.startsWith('approval')) return { icon: <ShieldIcon size={15} />, cls: 'bg-emerald-50 text-emerald-600 ring-emerald-100' };
  if (kind.startsWith('reminder')) return { icon: <BellIcon size={15} />, cls: 'bg-amber-50 text-amber-600 ring-amber-100' };
  if (kind.startsWith('note')) return { icon: <NoteIcon size={15} />, cls: 'bg-sky-50 text-sky-600 ring-sky-100' };
  if (kind.startsWith('message') || kind.startsWith('nudge')) return { icon: <ChatIcon size={15} />, cls: 'bg-teal-50 text-teal-600 ring-teal-100' };
  if (kind.startsWith('auth')) return { icon: <LinkIcon size={15} />, cls: 'bg-ink-100 text-ink-600 ring-ink-200' };
  return { icon: <ActivityIcon size={15} />, cls: 'bg-ink-100 text-ink-600 ring-ink-200' };
}

function Details({ item }: { item: TimelineItem }) {
  const d = item.details;
  if (!d) return null;
  if (item.kind === 'agent.turn') {
    const tools = (d.tools ?? []) as { name: string; ok: boolean; error?: string }[];
    return (
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {tools.length ? tools.map((t, i) => (
          <span key={`${t.name}-${i}`} title={t.error}
            className={`chip ring-1 ${t.ok ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-rose-50 text-rose-700 ring-rose-100'}`}>
            {t.ok ? <CheckIcon size={11} /> : '✗'} {t.name.replace(/_/g, ' ')}
          </span>
        )) : <span className="chip">reply only</span>}
        {d.model ? <span className="chip font-mono text-[11px]">{String(d.model)}</span> : null}
        {d.latencyMs ? <span className="chip tabular-nums">{(Number(d.latencyMs) / 1000).toFixed(1)}s</span> : null}
        {item.costMicros ? <span className="chip tabular-nums">${(item.costMicros / 1e6).toFixed(4)}</span> : null}
      </div>
    );
  }
  if (item.kind === 'nudge.sent') {
    return <p className="mt-1.5 text-xs text-ink-500">Rule: <span className="font-medium capitalize text-ink-700">{String(d.rule).replace(/_/g, ' ')}</span></p>;
  }
  return null;
}

export default function ActivityPage() {
  const [kind, setKind] = useState<string | undefined>(undefined);
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (before?: string) => {
    setLoading(true);
    try {
      const page = await api.getTimeline({ ...(kind ? { kind } : {}), ...(before ? { before } : {}) });
      setItems((prev) => (before && prev ? [...prev, ...page.items] : page.items));
      setNext(page.nextBefore);
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => { setItems(null); load(); }, [load]);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Activity"
        subtitle="Everything Orga did on your behalf, and why. Message text is never stored here."
      />

      <div className="mb-6">
        <Segmented label="Filter activity" value={kind ?? ''} onChange={(v) => setKind(v || undefined)}
          options={FILTERS.map((f) => ({ value: f.kind ?? '', label: f.label }))} />
      </div>

      {!items ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<ActivityIcon size={18} />} title="Nothing here yet"
          hint="Actions appear here as soon as you message Orga." />
      ) : (
        <ol className="relative space-y-3 animate-fade-up">
          <span className="absolute bottom-4 left-[19px] top-4 w-px bg-ink-200" aria-hidden="true" />
          {items.map((item) => {
            const s = kindStyle(item.kind);
            return (
              <li key={item.id} className="relative flex gap-4">
                <span className={`relative z-[1] mt-3 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${s.cls}`}>
                  {s.icon}
                </span>
                <div className="card flex-1 px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm text-ink-900">
                      <span className="font-medium">{label(item.kind)}</span>
                      {item.summary && <span className="text-ink-500">: {item.summary}</span>}
                      {item.person && <span className="chip ml-2 capitalize">{item.person}</span>}
                    </p>
                    <time className="shrink-0 text-xs text-ink-400" dateTime={item.createdAt}>
                      {new Date(item.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                    </time>
                  </div>
                  <Details item={item} />
                  {item.channel && (
                    <p className="mt-2 text-[11px] text-ink-400">
                      via <span className="capitalize">{item.channel}</span>
                      {item.traceId && <> · trace <span className="font-mono">{item.traceId}</span></>}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {next && (
        <div className="mt-6 flex justify-center">
          <button onClick={() => load(next)} disabled={loading} className="btn btn-secondary">
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
