'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

type Channels = { telegram: string | null; whatsapp: string | null };

// Invite landing page (ADR-018, ADR-021). The code is in the URL fragment
// (#code=…), which browsers never send to servers; it is cleared from the
// address bar. The person picks where to use Orga:
//   Telegram  → t.me/<bot>?start=<code>   (bot receives "/start <code>")
//   WhatsApp  → wa.me/<number>?text=join <code>   (pre-filled; they tap send)
//   Web       → redeem here, then web chat
// The chat apps verify the person by the message itself, so no phone number
// is typed and Orga never messages anyone first.
export default function InvitePage() {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channels>({ telegram: null, whatsapp: null });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const c = new URLSearchParams(window.location.hash.slice(1)).get('code');
    window.history.replaceState(null, '', window.location.pathname);
    if (c) setCode(c);
    else setError('This invite link is missing its code.');
    api.inviteChannels().then(setChannels).catch(() => { /* web-only fallback */ });
  }, []);

  const acceptOnWeb = async () => {
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

  const telegramUrl = code && channels.telegram
    ? `https://t.me/${channels.telegram}?start=${encodeURIComponent(code)}` : null;
  const whatsappUrl = code && channels.whatsapp
    ? `https://wa.me/${channels.whatsapp}?text=${encodeURIComponent(`join ${code}`)}` : null;
  const hasChatApps = Boolean(telegramUrl || whatsappUrl);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-sm text-center">
        <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">Invitation</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">You&apos;re invited to Orga</h1>
        <p className="text-sm text-gray-500 mb-6">
          A personal AI assistant for notes, tasks, reminders, your calendar and email,
          and for anything else you want to ask.
          {hasChatApps ? ' Pick where you want to chat with it.' : ' Chat with it right here.'}
        </p>

        {code && !error && (
          <div className="space-y-3">
            {telegramUrl && (
              <a href={telegramUrl}
                className="block w-full py-2.5 bg-[#229ED9] text-white text-sm font-medium rounded-lg hover:opacity-90">
                Continue on Telegram
              </a>
            )}
            {whatsappUrl && (
              <a href={whatsappUrl}
                className="block w-full py-2.5 bg-[#25D366] text-white text-sm font-medium rounded-lg hover:opacity-90">
                Continue on WhatsApp
              </a>
            )}
            <button onClick={acceptOnWeb} disabled={busy}
              className={`w-full py-2.5 text-sm font-medium rounded-lg disabled:opacity-50 ${hasChatApps
                ? 'border border-gray-300 text-gray-800 hover:bg-gray-50'
                : 'bg-gray-900 text-white hover:bg-gray-800'}`}>
              {busy ? 'Setting things up…' : hasChatApps ? 'Use on the web instead' : 'Accept invite'}
            </button>
            {hasChatApps && (
              <p className="text-xs text-gray-400 pt-1">
                In Telegram tap <b>Start</b>; in WhatsApp just tap <b>send</b>. The invite works once.
              </p>
            )}
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <p className="text-xs text-gray-400 mt-6">Already use Orga? Send /login in your Orga chat.</p>
      </div>
    </div>
  );
}
