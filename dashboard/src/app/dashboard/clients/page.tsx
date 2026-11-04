'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Client } from '@/lib/types';
import Link from 'next/link';

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

  if (loading) return <p className="text-gray-400 text-sm">Loading...</p>;

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-6">Clients ({clients.length})</h1>

      {clients.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">No clients yet</p>
          <p className="text-sm">Client names are extracted automatically when you save notes on WhatsApp.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map(client => (
            <Link key={client.name} href={`/dashboard/clients/${encodeURIComponent(client.name)}`}>
              <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-sm transition-shadow">
                <h3 className="font-medium text-gray-900 capitalize mb-3">{client.name}</h3>
                <div className="flex gap-4 text-xs text-gray-400">
                  <span>{client.noteCount} notes</span>
                  <span>{client.taskCount} tasks</span>
                  <span>{client.reminderCount} reminders</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
