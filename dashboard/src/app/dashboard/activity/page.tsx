'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { TimelineItem } from '@/lib/types';

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

function Details({ item }: { item: TimelineItem }) {
  const d = item.details;
  if (!d) return null;
  if (item.kind === 'agent.turn') {
    const tools = (d.tools ?? []) as { name: string; ok: boolean; error?: string }[];
    return (
      <p className="text-xs text-gray-400 mt-1">
        {tools.length ? tools.map((t) => `${t.ok ? '✓' : '✗'} ${t.name.replace(/_/g, ' ')}`).join(' · ') : 'reply only'}
        {' · '}{String(d.model ?? '')}
        {d.latencyMs ? ` · ${(Number(d.latencyMs) / 1000).toFixed(1)}s` : ''}
        {item.costMicros ? ` · $${(item.costMicros / 1e6).toFixed(4)}` : ''}
      </p>
    );
  }
  if (item.kind === 'nudge.sent') return <p className="text-xs text-gray-400 mt-1">Rule: {String(d.rule).replace(/_/g, ' ')}</p>;
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
      <h1 className="text-xl font-bold text-gray-900 mb-1">Activity</h1>
      <p className="text-sm text-gray-500 mb-6">Everything Orga did on your behalf, and why. Message text is never stored here.</p>

      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map((f) => (
          <button key={f.label} onClick={() => setKind(f.kind)}
            className={`px-3 py-1 text-sm rounded-lg ${f.kind === kind ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {!items ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-gray-400 text-sm">Nothing here yet.</p>
      ) : (
        <ol className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <div className="flex justify-between gap-4">
                <p className="text-sm text-gray-900">
                  {label(item.kind)}
                  {item.summary && <span className="text-gray-500">: {item.summary}</span>}
                  {item.person && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 capitalize">{item.person}</span>}
                </p>
                <time className="text-xs text-gray-400 shrink-0" dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                </time>
              </div>
              <Details item={item} />
              {item.channel && <p className="text-[10px] text-gray-300 mt-1">{item.channel}{item.traceId ? ` · trace ${item.traceId}` : ''}</p>}
            </li>
          ))}
        </ol>
      )}

      {next && (
        <button onClick={() => load(next)} disabled={loading} className="mt-4 px-4 py-2 text-sm rounded-lg border border-gray-300 disabled:opacity-50">
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
