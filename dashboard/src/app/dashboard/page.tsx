'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';

interface Stats {
  notes: number;
  tasks: number;
  pendingReminders: number;
  clients: number;
}

export default function DashboardHome() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    async function load() {
      const [notes, tasks, reminders, clients] = await Promise.all([
        api.getNotes({ limit: '1' }),
        api.getTasks({ limit: '1' }),
        api.getReminders({ status: 'pending', limit: '1' }),
        api.getClients(),
      ]);
      setStats({
        notes: notes.total,
        tasks: tasks.total,
        pendingReminders: reminders.total,
        clients: clients.clients.length,
      });
    }
    load();
  }, []);

  if (!stats) {
    return <p className="text-gray-400 text-sm">Loading...</p>;
  }

  const cards = [
    { label: 'Notes', value: stats.notes, href: '/dashboard/notes', color: 'bg-blue-50 text-blue-700' },
    { label: 'Task Lists', value: stats.tasks, href: '/dashboard/tasks', color: 'bg-green-50 text-green-700' },
    { label: 'Pending Reminders', value: stats.pendingReminders, href: '/dashboard/reminders', color: 'bg-amber-50 text-amber-700' },
    { label: 'Clients', value: stats.clients, href: '/dashboard/clients', color: 'bg-purple-50 text-purple-700' },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <Link key={card.label} href={card.href}>
            <div className={`p-5 rounded-xl ${card.color} hover:opacity-80 transition-opacity`}>
              <p className="text-3xl font-bold">{card.value}</p>
              <p className="text-sm mt-1 opacity-75">{card.label}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
