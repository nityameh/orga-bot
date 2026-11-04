'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Note, Task, Reminder } from '@/lib/types';
import Link from 'next/link';

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

  if (loading) return <p className="text-gray-400 text-sm">Loading...</p>;
  if (!data) return <p className="text-gray-400 text-sm">Not found</p>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/clients" className="text-gray-400 hover:text-gray-600 text-sm">
          ← Clients
        </Link>
        <h1 className="text-xl font-bold text-gray-900 capitalize">{data.name}</h1>
      </div>

      {/* Notes */}
      <Section title={`Notes (${data.notes.length})`}>
        {data.notes.length === 0 ? (
          <p className="text-sm text-gray-400">No notes for {data.name}</p>
        ) : (
          data.notes.map(note => (
            <div key={note.id} className="bg-white border border-gray-200 rounded-lg p-3 mb-2">
              <p className="text-sm font-medium text-gray-900">{note.title}</p>
              {note.body && note.body !== note.title && (
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{note.body}</p>
              )}
              <p className="text-xs text-gray-400 mt-2">{timeAgo(note.createdAt)}</p>
            </div>
          ))
        )}
      </Section>

      {/* Tasks */}
      <Section title={`Tasks (${data.tasks.length})`}>
        {data.tasks.length === 0 ? (
          <p className="text-sm text-gray-400">No tasks for {data.name}</p>
        ) : (
          data.tasks.map(task => (
            <div key={task.id} className="bg-white border border-gray-200 rounded-lg p-3 mb-2">
              <p className="text-sm font-medium text-gray-900">{task.title}</p>
              <div className="mt-2 space-y-1">
                {task.items.map(item => (
                  <p key={item.id} className={`text-xs ${item.done ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
                    {item.done ? '✓' : '○'} {item.text}
                  </p>
                ))}
              </div>
            </div>
          ))
        )}
      </Section>

      {/* Reminders */}
      <Section title={`Reminders (${data.reminders.length})`}>
        {data.reminders.length === 0 ? (
          <p className="text-sm text-gray-400">No reminders for {data.name}</p>
        ) : (
          data.reminders.map(reminder => (
            <div key={reminder.id} className="bg-white border border-gray-200 rounded-lg p-3 mb-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{reminder.title}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(reminder.fireAt).toLocaleString('en-IN', {
                    weekday: 'short', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                    timeZone: 'Asia/Kolkata', hour12: true,
                  })}
                </p>
              </div>
              <span className="text-xs text-gray-400">{reminder.status}</span>
            </div>
          ))
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-sm font-medium text-gray-500 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-IN');
}
