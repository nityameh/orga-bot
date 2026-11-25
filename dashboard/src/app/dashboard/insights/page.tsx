'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Overview, PersonInsight } from '@/lib/types';
import { Avatar, PageHeader, Section, Segmented, StatCard } from '@/components/ui';
import { ArrowRightIcon, BellIcon, BoltIcon, ChatIcon, CoinIcon } from '@/components/icons';

const RANGES = [7, 30, 90];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Smooth path through points (monotone-ish cubic) for a friendlier line. */
function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

function ActivityChart({ series }: { series: Overview['series'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 200;
  const PAD = 8;
  const max = Math.max(1, ...series.map((d) => Math.max(d.messages, d.actions)));
  const x = (i: number) => (series.length <= 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (series.length - 1));
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);

  const msgPts = series.map((d, i) => [x(i), y(d.messages)] as [number, number]);
  const actPts = series.map((d, i) => [x(i), y(d.actions)] as [number, number]);
  const area = (pts: [number, number][]) =>
    pts.length ? `${smoothPath(pts)} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z` : '';
  const h = hover === null ? null : series[hover];

  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full overflow-visible" preserveAspectRatio="none"
          role="img" aria-label="Messages and actions per day"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const i = Math.round(((e.clientX - r.left) / r.width) * (series.length - 1));
            setHover(Math.max(0, Math.min(series.length - 1, i)));
          }}>
          <defs>
            <linearGradient id="gMsg" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand-300)" stopOpacity="0.45" />
              <stop offset="100%" stopColor="var(--color-brand-300)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="gAct" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand-600)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--color-brand-600)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke="var(--color-ink-100)" strokeDasharray="4 6" />
          ))}
          <path d={area(msgPts)} fill="url(#gMsg)" />
          <path d={smoothPath(msgPts)} fill="none" stroke="var(--color-brand-300)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          <path d={area(actPts)} fill="url(#gAct)" />
          <path d={smoothPath(actPts)} fill="none" stroke="var(--color-brand-600)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="var(--color-ink-300)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {h && hover !== null && (
          <div className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-xl bg-ink-900 px-3 py-2 text-xs text-white shadow-lg"
            style={{ left: `${(x(hover) / W) * 100}%` }}>
            <p className="font-medium">{new Date(h.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
            <p className="text-ink-300">{h.messages} messages · {h.actions} actions</p>
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-ink-400">
        <span>{series[0] && new Date(series[0].date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
        <div className="flex gap-4">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-300" />Messages</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-600" />Actions taken</span>
        </div>
        <span>{series.length > 0 && new Date(series[series.length - 1].date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
      </div>
    </div>
  );
}

function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-[3px] text-[10px] text-ink-400">
        <tbody>
          {grid.map((row, d) => (
            <tr key={WEEKDAYS[d]}>
              <th className="pr-2 text-right font-medium">{WEEKDAYS[d]}</th>
              {row.map((v, hr) => (
                <td key={hr} title={`${WEEKDAYS[d]} ${hr}:00 IST: ${v} messages`}
                  className="h-4 w-4 rounded-[4px]"
                  style={{ background: v ? `color-mix(in oklab, var(--color-brand-600) ${18 + 82 * (v / max)}%, white)` : 'var(--color-ink-100)' }} />
              ))}
            </tr>
          ))}
          <tr>
            <th />
            {Array.from({ length: 24 }, (_, hr) => <td key={hr} className="text-center">{hr % 6 === 0 ? hr : ''}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ToolBars({ toolUse }: { toolUse: Record<string, number> }) {
  const entries = Object.entries(toolUse).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  if (!entries.length) return <p className="text-sm text-ink-400">No tool calls in this period.</p>;
  return (
    <ul className="space-y-3">
      {entries.map(([tool, n]) => (
        <li key={tool}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="capitalize text-ink-700">{tool.replace(/_/g, ' ')}</span>
            <span className="tabular-nums text-ink-400">{n}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400" style={{ width: `${(n / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
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
  const approvalRate = useMemo(() => {
    if (!overview || !overview.approvals.requested) return null;
    return Math.round((overview.approvals.granted / overview.approvals.requested) * 100);
  }, [overview]);

  return (
    <div>
      <PageHeader
        title="Insights"
        subtitle="How you use Orga, and how the AI is performing."
        actions={<Segmented label="Time range" value={days} onChange={setDays} options={RANGES.map((r) => ({ value: r, label: `${r} days` }))} />}
      />

      {!overview ? (
        <div aria-busy="true" aria-label="Loading">
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}
          </div>
          <div className="skeleton mb-6 h-80 rounded-2xl" />
        </div>
      ) : (
        <div className="animate-fade-up">
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Messages to Orga" value={overview.messages} hint={`last ${days} days`} icon={<ChatIcon size={16} />} tone="brand" />
            <StatCard label="Reminder follow-through" tone="emerald" icon={<BellIcon size={16} />}
              value={overview.reminders.completionRate === null ? '—' : `${Math.round(overview.reminders.completionRate * 100)}%`}
              hint={`${overview.reminders.done} done · ${overview.reminders.missed} missed`} />
            <StatCard label="Reply time (p50 / p95)" tone="sky" icon={<BoltIcon size={16} />}
              value={<span className="text-2xl">{ms(overview.agent.latencyMs.p50)} <span className="text-ink-300">/</span> {ms(overview.agent.latencyMs.p95)}</span>}
              hint={`${overview.agent.turns} agent turns`} />
            <StatCard label="AI cost" tone="amber" icon={<CoinIcon size={16} />}
              value={`$${overview.agent.costUSD.total.toFixed(3)}`}
              hint={overview.agent.cacheHitRate === null ? undefined : `${Math.round(overview.agent.cacheHitRate * 100)}% served from prompt cache`} />
          </div>

          <Section className="mb-6" title="Activity" description="Messages you sent and actions Orga took, per day">
            <ActivityChart series={overview.series} />
          </Section>

          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <Section title="When you message Orga" description="IST, by weekday and hour">
              <Heatmap grid={overview.heatmap} />
            </Section>
            <Section title="What Orga did for you" description="Tool calls made by the agent"
              action={<Link href="/dashboard/activity" className="btn btn-ghost btn-sm">Every action <ArrowRightIcon size={14} /></Link>}>
              <ToolBars toolUse={overview.agent.toolUse} />
              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-ink-100 pt-5">
                <div className="rounded-xl bg-ink-50 p-3">
                  <p className="text-xs text-ink-400">Approvals granted</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-ink-900">
                    {overview.approvals.granted}<span className="text-sm font-normal text-ink-400"> / {overview.approvals.requested}</span>
                    {approvalRate !== null && <span className="ml-2 text-xs font-medium text-emerald-600">{approvalRate}%</span>}
                  </p>
                </div>
                <div className="rounded-xl bg-ink-50 p-3">
                  <p className="text-xs text-ink-400">Proactive messages</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-ink-900">{overview.nudges.sent}</p>
                </div>
              </div>
            </Section>
          </div>
        </div>
      )}

      <Section title="People & clients" description="Who you've gone quiet on (14+ days) comes first.">
        {!people ? (
          <div className="space-y-3">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-10" />)}</div>
        ) : people.length === 0 ? (
          <p className="text-sm text-ink-400">No people yet. Mention clients in your notes and reminders.</p>
        ) : (
          <div className="-mx-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-400">
                  <th className="px-6 pb-3 font-medium">Person</th>
                  <th className="px-6 pb-3 font-medium">Last interaction</th>
                  <th className="px-6 pb-3 text-right font-medium">Interactions</th>
                  <th className="px-6 pb-3 text-right font-medium">Open tasks</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.person} className="border-t border-ink-100 transition hover:bg-ink-50">
                    <td className="px-6 py-3">
                      <Link href={`/dashboard/clients/${encodeURIComponent(p.person)}`} className="flex items-center gap-3">
                        <Avatar name={p.person} size="sm" />
                        <span className="font-medium capitalize text-ink-900 hover:text-brand-700">{p.person}</span>
                        {p.goneQuiet && <span className="chip bg-amber-50 text-amber-700 ring-1 ring-amber-200">gone quiet</span>}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-ink-500">{daysAgo(p.daysSinceLast)}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-ink-500">{p.interactions}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-ink-500">{p.openTasks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
