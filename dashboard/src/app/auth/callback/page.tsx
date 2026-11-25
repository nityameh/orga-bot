'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import AuthShell from '@/components/AuthShell';

// Receives the magic link. The token is in the URL fragment (#token=...), which
// browsers never send to servers, and is removed from the address bar at once.
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const started = useRef(false); // React strict mode runs effects twice; tokens are single-use

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    window.history.replaceState(null, '', window.location.pathname);

    if (!token) {
      setError('This link is missing its login token. Send /login again.');
      return;
    }

    api
      .exchangeLoginToken(token)
      .then(() => router.replace('/dashboard'))
      .catch(() => setError('This login link is invalid or has expired. Send /login again.'));
  }, [router]);

  return (
    <AuthShell>
      <div className="flex flex-col items-center gap-3 text-center">
        {!error && <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />}
        <p className={`text-sm ${error ? 'text-rose-600' : 'text-ink-500'}`}>{error || 'Signing you in…'}</p>
      </div>
    </AuthShell>
  );
}
