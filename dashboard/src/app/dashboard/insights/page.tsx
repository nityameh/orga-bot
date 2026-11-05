'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Overview, PersonInsight } from '@/lib/types';

const RANGES = [7, 30, 90];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="p-4 rounded-xl bg-white border border-gray-200">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function DailyBars({ series }: { series: Overview['series'] }) {
  const max = Math.max(1, ...series.map((d) => Math.max(d.messages, d.actions)));
  return (
    <div>
      <div className="flex items-end gap-[2px] h-32" role="img" aria-label="Messages and actions per day">
        {series.map((d) => (
          <div key={d.date} className="flex-1 flex items-end gap-[1px] h-full" title={`${d.date}: ${d.messages} messages, ${d.actions} actions`}>
            <div className="flex-1 bg-gray-300 rounded-t" style={{ height: `${(d.messages / max) * 100}%` }} />
            <div className="flex-1 bg-gray-900 rounded-t" style={{ height: `${(d.actions / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-2 text-xs text-gray-500">
        <span><span className="inline-block w-2 h-2 bg-gray-300 mr-1" />Messages</span>
        <span><span className="inline-block w-2 h-2 bg-gray-900 mr-1" />Actions taken</span>
      </div>
    </div>
  );
}

function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="overflow-x-auto">
      <table className="text-[10px] text-gray-400 border-separate border-spacing-[2px]">
        <tbody>
          {grid.map((row, d) => (
            <tr key={WEEKDAYS[d]}>
              <th className="pr-2 font-normal text-right">{WEEKDAYS[d]}</th>
              {row.map((v, h) => (
                <td
                  key={h}
                  title={`${WEEKDAYS[d]} ${h}:00 IST: ${v} messages`}
                  className="w-4 h-4 rounded-sm"
                  style={{ background: v ? `rgba(17,24,39,${0.15 + 0.85 * (v / max)})` : '#f3f4f6' }}
                />
              ))}
            </tr>
          ))}
          <tr>
            <th />
            {Array.from({ length: 24 }, (_, h) => <td key={h} className="text-center">{h % 6 === 0 ? h : ''}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function daysAgo(n: number) {
  return n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`;
}

export default function InsightsPage() {
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [people, setPeople] = useState<PersonInsight[] | null>(null);

  useEffect(() => {
    setOverview(null);
    api.getAnalyticsOverview(days).then(setOverview).catch(() => setOverview(null));
  }, [days]);

  useEffect(() => {
    api.getAnalyticsPeople().then((r) => setPeople(r.people)).catch(() => setPeople([]));
  }, []);

  const ms = (v: number | null) => (v === null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`);

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Insights</h1>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button key={r} onClick={() => setDays(r)}
              className={`px-3 py-1 text-sm rounded-lg ${r === days ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
              {r}d
            </button>
          ))}
        </div>
      </div>

      {!overview ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Kpi label="Messages to Orga" value={String(overview.messages)} hint={`last ${days} days`} />
            <Kpi label="Reminder follow-through"
              value={overview.reminders.completionRate === null ? '—' : `${Math.round(overview.reminders.completionRate * 100)}%`}
              hint={`${overview.reminders.done} done · ${overview.reminders.missed} missed`} />
            <Kpi label="Agent reply time (p50 / p95)" value={`${ms(overview.agent.latencyMs.p50)} / ${ms(overview.agent.latencyMs.p95)}`}
              hint={`${overview.agent.turns} agent turns`} />
            <Kpi label="AI cost" value={`$${overview.agent.costUSD.total.toFixed(3)}`}
              hint={overview.agent.cacheHitRate === null ? undefined : `${Math.round(overview.agent.cacheHitRate * 100)}% served from cache`} />
          </div>

          <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="font-semibold text-gray-900 mb-4">Activity</h2>
            <DailyBars series={overview.series} />
          </section>

          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <section className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-1">When you message Orga</h2>
              <p className="text-xs text-gray-400 mb-4">IST, by weekday and hour</p>
              <Heatmap grid={overview.heatmap} />
            </section>
            <section className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">What Orga did for you</h2>
              <ul className="text-sm text-gray-700 space-y-2">
                {Object.entries(overview.agent.toolUse).sort((a, b) => b[1] - a[1]).map(([tool, n]) => (
                  <li key={tool} className="flex justify-between"><span>{tool.replace(/_/g, ' ')}</span><span className="text-gray-400">{n}</span></li>
                ))}
                <li className="flex justify-between"><span>Actions you approved</span><span className="text-gray-400">{overview.approvals.granted} / {overview.approvals.requested}</span></li>
                <li className="flex justify-between"><span>Proactive messages</span><span className="text-gray-400">{overview.nudges.sent}</span></li>
              </ul>
              <Link href="/dashboard/activity" className="inline-block mt-4 text-sm text-gray-900 underline">See every action and why →</Link>
            </section>
          </div>
        </>
      )}

      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-1">People &amp; clients</h2>
        <p className="text-xs text-gray-400 mb-4">Who you&apos;ve gone quiet on (14+ days) comes first.</p>
        {!people ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : people.length === 0 ? (
          <p className="text-gray-400 text-sm">No people yet. Mention clients in your notes and reminders.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-gray-400 text-xs">
              <tr><th className="pb-2">Person</th><th className="pb-2">Last interaction</th><th className="pb-2">Interactions</th><th className="pb-2">Open tasks</th></tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.person} className="border-t border-gray-100">
                  <td className="py-2 capitalize">
                    <Link href={`/dashboard/clients/${encodeURIComponent(p.person)}`} className="hover:underline">{p.person}</Link>
                    {p.goneQuiet && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">gone quiet</span>}
                  </td>
                  <td className="py-2 text-gray-500">{daysAgo(p.daysSinceLast)}</td>
                  <td className="py-2 text-gray-500">{p.interactions}</td>
                  <td className="py-2 text-gray-500">{p.openTasks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
