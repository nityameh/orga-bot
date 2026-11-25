'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui';
import { GoogleIcon, ShieldIcon } from '@/components/icons';

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
  const flashKey = params.get('google') ?? '';
  const flash = FLASH[flashKey];

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
    <div className="max-w-3xl">
      <PageHeader title="Settings" subtitle="Connected accounts and how Orga handles your data." />

      {flash && (
        <p className={`mb-6 rounded-xl px-4 py-3 text-sm ring-1 animate-fade-up ${flashKey === 'connected'
          ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
          : 'bg-amber-50 text-amber-800 ring-amber-200'}`}>{flash}</p>
      )}

      <section className="card p-6">
        <p className="eyebrow mb-4">Integrations</p>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white ring-1 ring-ink-200"><GoogleIcon size={22} /></span>
          <div className="flex-1">
            <h2 className="text-[15px] font-semibold text-ink-900">Google Calendar &amp; Gmail</h2>
            <p className="mt-1 text-sm text-ink-500">
              Lets Orga read your calendar, add events you approve, and search your email (read-only).
            </p>

            <div className="mt-5">
              {!status ? (
                <div className="skeleton h-10 w-48" />
              ) : !status.available.google ? (
                <p className="text-sm text-ink-500">Google is not configured on this server yet.</p>
              ) : google ? (
                <div className="flex flex-col gap-4 rounded-xl bg-ink-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm">
                    <p className="font-medium text-ink-900">{google.accountEmail ?? 'Connected account'}</p>
                    <p className={`mt-0.5 flex items-center gap-1.5 text-xs ${google.status === 'active' ? 'text-emerald-600' : 'text-amber-600'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${google.status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      {google.status === 'active' ? 'Connected' : 'Expired: reconnect to continue'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {google.status !== 'active' && (
                      <button onClick={connect} disabled={busy} className="btn btn-primary btn-sm">Reconnect</button>
                    )}
                    <button onClick={disconnect} disabled={busy} className="btn btn-secondary btn-sm">Disconnect</button>
                  </div>
                </div>
              ) : (
                <button onClick={connect} disabled={busy} className="btn btn-primary"><GoogleIcon size={16} /> Connect Google</button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="card mt-6 flex gap-4 p-6">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100"><ShieldIcon size={18} /></span>
        <div className="text-sm text-ink-500">
          <p className="font-medium text-ink-900">Your data stays yours</p>
          <p className="mt-1">Tokens are stored encrypted and you can disconnect at any time. Orga asks for your approval before any action that changes something outside the app.</p>
        </div>
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
