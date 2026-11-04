'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

type Integration = { provider: string; status: string; accountEmail: string | null; scopes: string[]; createdAt: string };
type Status = { available: { google: boolean }; integrations: Integration[] };

const FLASH: Record<string, string> = {
  connected: 'Google connected.',
  denied: 'Google access was not granted.',
  error: 'Could not connect Google. Please try again.',
};

function SettingsContent() {
  const params = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const flash = FLASH[params.get('google') ?? ''];

  const load = useCallback(() => api.getIntegrations().then(setStatus).catch(() => setStatus(null)), []);
  useEffect(() => { load(); }, [load]);

  const google = status?.integrations.find((i) => i.provider === 'google');

  const connect = async () => {
    setBusy(true);
    try {
      const { url } = await api.startGoogleConnect();
      window.location.href = url; // Google consent screen
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect Google? Orga will stop reading your calendar and email.')) return;
    setBusy(true);
    try {
      await api.disconnectGoogle();
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>
      {flash && <p className="mb-4 text-sm text-gray-700 bg-gray-100 rounded-lg px-4 py-2">{flash}</p>}

      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900">Google Calendar &amp; Gmail</h2>
        <p className="text-sm text-gray-500 mt-1 mb-4">
          Lets Orga read your calendar, add events you approve, and search your email (read-only).
          Tokens are stored encrypted and you can disconnect at any time.
        </p>

        {!status ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : !status.available.google ? (
          <p className="text-sm text-gray-500">Google is not configured on this server yet.</p>
        ) : google ? (
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm">
              <p className="text-gray-900">{google.accountEmail ?? 'Connected account'}</p>
              <p className={google.status === 'active' ? 'text-green-600' : 'text-amber-600'}>
                {google.status === 'active' ? 'Connected' : 'Expired: reconnect to continue'}
              </p>
            </div>
            <div className="flex gap-2">
              {google.status !== 'active' && (
                <button onClick={connect} disabled={busy} className="px-3 py-2 text-sm rounded-lg bg-gray-900 text-white disabled:opacity-50">Reconnect</button>
              )}
              <button onClick={disconnect} disabled={busy} className="px-3 py-2 text-sm rounded-lg border border-gray-300 disabled:opacity-50">Disconnect</button>
            </div>
          </div>
        ) : (
          <button onClick={connect} disabled={busy} className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white disabled:opacity-50">
            Connect Google
          </button>
        )}
      </section>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsContent />
    </Suspense>
  );
}
