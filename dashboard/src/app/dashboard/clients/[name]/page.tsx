'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Note, Task, Reminder } from '@/lib/types';
import Link from 'next/link';
import { Avatar, Section, formatIST, timeAgo } from '@/components/ui';
import { ArrowLeftIcon, BellIcon, CheckIcon, ClockIcon, NoteIcon, TaskIcon } from '@/components/icons';

interface ClientData {
  name: string;
  notes: Note[];
  tasks: Task[];
  reminders: Reminder[];
}

export default function ClientDetailPage() {
  const params = useParams();
  const name = decodeURIComponent(params.name as string);
  const [data, setData] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const result = await api.getClient(name);
      setData(result);
      setLoading(false);
    }
    load();
  }, [name]);

  if (loading) {
    return (
      <div aria-busy="true" aria-label="Loading">
        <div className="skeleton mb-8 h-16 w-72 rounded-2xl" />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="skeleton h-64 rounded-2xl" />
          <div className="skeleton h-64 rounded-2xl" />
        </div>
      </div>
    );
  }
  if (!data) return <p className="text-sm text-ink-400">Not found</p>;

  return (
    <div>
      <Link href="/dashboard/clients" className="btn btn-ghost btn-sm mb-6 -ml-3">
        <ArrowLeftIcon size={14} /> Clients
      </Link>

      <div className="mb-8 flex items-center gap-4 animate-fade-up">
        <Avatar name={data.name} size="lg" />
        <div>
          <h1 className="text-2xl font-semibold capitalize tracking-tight text-ink-900">{data.name}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {data.notes.length} notes · {data.tasks.length} task lists · {data.reminders.length} reminders
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 animate-fade-up">
        <Section title="Notes" className="lg:row-span-2" action={<span className="chip">{data.notes.length}</span>}>
          {data.notes.length === 0 ? (
            <p className="text-sm text-ink-400">No notes for {data.name}</p>
          ) : (
            <div className="space-y-2">
              {data.notes.map(note => (
                <Link key={note.id} href={`/dashboard/notes/${note.id}`}
                  className="flex gap-3 rounded-xl p-3 ring-1 ring-ink-100 transition hover:bg-ink-50 hover:ring-ink-200">
                  <span className="mt-0.5 text-sky-500"><NoteIcon size={16} /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900">{note.title}</p>
                    {note.body && note.body !== note.title && <p className="mt-1 line-clamp-2 text-xs text-ink-500">{note.body}</p>}
                    <p className="mt-1.5 text-[11px] text-ink-400">{timeAgo(note.createdAt)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section title="Tasks" action={<span className="chip">{data.tasks.length}</span>}>
          {data.tasks.length === 0 ? (
            <p className="text-sm text-ink-400">No tasks for {data.name}</p>
          ) : (
            <div className="space-y-4">
              {data.tasks.map(task => (
                <div key={task.id}>
                  <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-900"><span className="text-emerald-500"><TaskIcon size={16} /></span>{task.title}</p>
                  <ul className="space-y-1.5 pl-6">
                    {task.items.map(item => (
                      <li key={item.id} className={`flex items-center gap-2 text-sm ${item.done ? 'text-ink-400 line-through' : 'text-ink-600'}`}>
                        <span className={`flex h-4 w-4 items-center justify-center rounded ring-1 ${item.done ? 'bg-brand-600 text-white ring-brand-600' : 'ring-ink-300'}`}>
                          {item.done && <CheckIcon size={11} strokeWidth={2.5} />}
                        </span>
                        {item.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Reminders" action={<span className="chip">{data.reminders.length}</span>}>
          {data.reminders.length === 0 ? (
            <p className="text-sm text-ink-400">No reminders for {data.name}</p>
          ) : (
            <div className="space-y-2">
              {data.reminders.map(reminder => (
                <div key={reminder.id} className="flex items-center gap-3 rounded-xl p-3 ring-1 ring-ink-100">
                  <span className="text-amber-500"><BellIcon size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{reminder.title}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-400"><ClockIcon size={11} /> {formatIST(reminder.fireAt)}</p>
                  </div>
                  <span className="chip capitalize">{reminder.status}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
