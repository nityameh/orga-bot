'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Note, Reminder, Task } from '@/lib/types';
import { PageHeader, Section, StatCard, Tag, formatIST, timeAgo } from '@/components/ui';
import {
  ArrowRightIcon, BellIcon, ChatIcon, ClockIcon, NoteIcon, PeopleIcon, SparkIcon, TaskIcon,
} from '@/components/icons';

interface HomeData {
  notes: Note[];
  noteTotal: number;
  tasks: Task[];
  taskTotal: number;
  upcoming: Reminder[];
  pendingTotal: number;
  clients: number;
}

function greeting(now = new Date()) {
  const h = Number(now.toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function DashboardHome() {
  const [data, setData] = useState<HomeData | null>(null);

  useEffect(() => {
    async function load() {
      const [notes, tasks, reminders, clients] = await Promise.all([
        api.getNotes({ limit: '4' }),
        api.getTasks({ limit: '50' }),
        api.getReminders({ status: 'pending', limit: '50' }),
        api.getClients(),
      ]);
      const upcoming = [...(reminders.reminders as Reminder[])]
        .sort((a, b) => new Date(a.fireAt).getTime() - new Date(b.fireAt).getTime())
        .slice(0, 5);
      setData({
        notes: notes.notes,
        noteTotal: notes.total,
        tasks: tasks.tasks,
        taskTotal: tasks.total,
        upcoming,
        pendingTotal: reminders.total,
        clients: clients.clients.length,
      });
    }
    load();
  }, []);

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });

  if (!data) {
    return (
      <div aria-busy="true" aria-label="Loading">
        <div className="skeleton mb-3 h-4 w-40" />
        <div className="skeleton mb-10 h-8 w-72" />
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}
        </div>
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="skeleton h-72 rounded-2xl lg:col-span-3" />
          <div className="skeleton h-72 rounded-2xl lg:col-span-2" />
        </div>
      </div>
    );
  }

  const openItems = data.tasks.reduce((n, t) => n + t.items.filter((i) => !i.done).length, 0);
  const activeLists = data.tasks.filter((t) => t.items.some((i) => !i.done)).slice(0, 4);

  return (
    <div>
      <PageHeader
        eyebrow={today}
        title={`${greeting()} 👋`}
        subtitle="Here's what Orga is keeping track of for you."
        actions={
          <Link href="/dashboard/chat" className="btn btn-primary">
            <ChatIcon size={16} /> Message Orga
          </Link>
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4 animate-fade-up">
        <Link href="/dashboard/notes" className="card-hover rounded-2xl">
          <StatCard label="Notes" value={data.noteTotal} hint="saved from your chats" icon={<NoteIcon size={16} />} tone="brand" />
        </Link>
        <Link href="/dashboard/tasks" className="card-hover rounded-2xl">
          <StatCard label="Open to-dos" value={openItems} hint={`across ${data.taskTotal} lists`} icon={<TaskIcon size={16} />} tone="emerald" />
        </Link>
        <Link href="/dashboard/reminders" className="card-hover rounded-2xl">
          <StatCard label="Upcoming reminders" value={data.pendingTotal} hint="Orga will ping you" icon={<BellIcon size={16} />} tone="amber" />
        </Link>
        <Link href="/dashboard/clients" className="card-hover rounded-2xl">
          <StatCard label="Clients" value={data.clients} hint="auto-detected from notes" icon={<PeopleIcon size={16} />} tone="sky" />
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Section
          className="lg:col-span-3"
          title="Up next"
          description="Your next reminders, in IST"
          action={<Link href="/dashboard/reminders" className="btn btn-ghost btn-sm">View all <ArrowRightIcon size={14} /></Link>}
        >
          {data.upcoming.length === 0 ? (
            <p className="rounded-xl bg-ink-50 px-4 py-6 text-center text-sm text-ink-500">
              Nothing scheduled. Try &ldquo;remind me tomorrow 9am to call Ravi&rdquo;.
            </p>
          ) : (
            <ol className="relative space-y-1">
              {data.upcoming.map((r, i) => (
                <li key={r.id} className="flex items-center gap-4 rounded-xl px-3 py-3 transition hover:bg-ink-50">
                  <div className="flex flex-col items-center self-stretch">
                    <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${i === 0 ? 'bg-brand-500 ring-4 ring-brand-100' : 'bg-ink-300'}`} />
                    {i < data.upcoming.length - 1 && <span className="mt-1 w-px flex-1 bg-ink-200" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{r.title}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-400">
                      <ClockIcon size={12} /> {formatIST(r.fireAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <div className="card relative overflow-hidden p-6 lg:col-span-2">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-200/50 blur-3xl" />
          <div className="relative">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
              <SparkIcon size={18} />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-ink-900">Just text it</h2>
            <p className="mt-1 text-sm text-ink-500">
              Orga lives in WhatsApp, Telegram and here. Write like you would to a friend; English or Hinglish both work.
            </p>
            <div className="mt-5 space-y-2">
              {['note: logo concepts for acme, dark bg', 'kal shaam 5 baje Ravi ko call karna hai', 'what did Priya say about the budget?'].map((ex) => (
                <p key={ex} className="rounded-xl bg-ink-50 px-3 py-2 font-mono text-xs text-ink-600 ring-1 ring-ink-100">{ex}</p>
              ))}
            </div>
            <Link href="/dashboard/chat" className="btn btn-secondary mt-5 w-full">Open chat <ArrowRightIcon size={14} /></Link>
          </div>
        </div>

        <Section
          className="lg:col-span-3"
          title="Recent notes"
          action={<Link href="/dashboard/notes" className="btn btn-ghost btn-sm">All notes <ArrowRightIcon size={14} /></Link>}
        >
          {data.notes.length === 0 ? (
            <p className="rounded-xl bg-ink-50 px-4 py-6 text-center text-sm text-ink-500">No notes yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {data.notes.map((n) => (
                <Link key={n.id} href={`/dashboard/notes/${n.id}`}
                  className="rounded-xl p-4 ring-1 ring-ink-100 transition hover:bg-ink-50 hover:ring-ink-200">
                  <p className="line-clamp-1 text-sm font-medium text-ink-900">{n.title}</p>
                  {n.body && n.body !== n.title && <p className="mt-1 line-clamp-2 text-xs text-ink-500">{n.body}</p>}
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 gap-1 overflow-hidden">{n.tags.slice(0, 2).map((t) => <Tag key={t}>{t}</Tag>)}</div>
                    <span className="shrink-0 text-[11px] text-ink-400">{timeAgo(n.createdAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section
          className="lg:col-span-2"
          title="Task lists"
          action={<Link href="/dashboard/tasks" className="btn btn-ghost btn-sm">All tasks <ArrowRightIcon size={14} /></Link>}
        >
          {activeLists.length === 0 ? (
            <p className="rounded-xl bg-ink-50 px-4 py-6 text-center text-sm text-ink-500">All caught up. 🎉</p>
          ) : (
            <ul className="space-y-4">
              {activeLists.map((t) => {
                const done = t.items.filter((i) => i.done).length;
                const pct = t.items.length ? Math.round((done / t.items.length) * 100) : 0;
                return (
                  <li key={t.id}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-medium text-ink-900">{t.title}</p>
                      <span className="shrink-0 text-xs tabular-nums text-ink-400">{done}/{t.items.length}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
