'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <p className={`text-sm ${error ? 'text-red-600' : 'text-gray-400'}`}>{error || 'Signing you in…'}</p>
    </div>
  );
}
