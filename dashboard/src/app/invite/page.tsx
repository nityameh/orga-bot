'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

// Invite landing page (ADR-018). The code is in the URL fragment (#code=…),
// which browsers never send to servers; it is cleared from the address bar.
export default function InvitePage() {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const c = new URLSearchParams(window.location.hash.slice(1)).get('code');
    window.history.replaceState(null, '', window.location.pathname);
    if (c) setCode(c);
    else setError('This invite link is missing its code.');
  }, []);

  const accept = async () => {
    if (!code) return;
    setBusy(true);
    setError('');
    try {
      await api.redeemInvite(code);
      router.replace('/dashboard/chat');
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      try {
        setError(JSON.parse(message).error ?? 'This invite could not be used.');
      } catch {
        setError('This invite could not be used.');
      }
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-sm text-center">
        <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">Invitation</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">You&apos;re invited to Orga</h1>
        <p className="text-sm text-gray-500 mb-6">
          A personal AI assistant for notes, tasks, reminders, your calendar and email.
          Chat with it right here, no phone number needed.
        </p>
        {code && !error && (
          <button onClick={accept} disabled={busy}
            className="w-full py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50">
            {busy ? 'Setting things up…' : 'Accept invite'}
          </button>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <p className="text-xs text-gray-400 mt-6">Already use Orga on WhatsApp or Telegram? Send /login there.</p>
      </div>
    </div>
  );
}
