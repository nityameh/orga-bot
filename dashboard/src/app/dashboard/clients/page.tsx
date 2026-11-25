'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Client } from '@/lib/types';
import Link from 'next/link';
import { Avatar, EmptyState, PageHeader, SkeletonCards } from '@/components/ui';
import { ArrowRightIcon, PeopleIcon } from '@/components/icons';

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const data = await api.getClients();
      setClients(data.clients);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle={loading ? ' ' : `${clients.length} ${clients.length === 1 ? 'client' : 'clients'}, detected automatically from your notes`}
      />

      {loading ? (
        <SkeletonCards count={6} height="h-36" />
      ) : clients.length === 0 ? (
        <EmptyState icon={<PeopleIcon size={18} />} title="No clients yet"
          hint="Client names are extracted automatically when you save notes on WhatsApp." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 animate-fade-up">
          {clients.map(client => (
            <Link key={client.name} href={`/dashboard/clients/${encodeURIComponent(client.name)}`} className="card card-hover group block p-5">
              <div className="flex items-center gap-3">
                <Avatar name={client.name} />
                <h3 className="flex-1 truncate text-[15px] font-semibold capitalize text-ink-900">{client.name}</h3>
                <span className="text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600"><ArrowRightIcon size={16} /></span>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                {[['Notes', client.noteCount], ['Tasks', client.taskCount], ['Reminders', client.reminderCount]].map(([label, n]) => (
                  <div key={label} className="rounded-xl bg-ink-50 px-3 py-2">
                    <p className="text-lg font-semibold tabular-nums text-ink-900">{n}</p>
                    <p className="text-[11px] text-ink-400">{label}</p>
                  </div>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
