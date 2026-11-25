'use client';

import { useEffect, useState } from 'react';
import Sidebar, { Logo, MobileNav } from '@/components/Sidebar';
import { api } from '@/lib/api';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  // Verify the session before rendering; apiFetch redirects to /login on 401.
  useEffect(() => {
    api.me().then(() => setReady(true)).catch(() => {});
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-50">
        <div className="animate-pulse"><Logo compact /></div>
        <p className="text-sm text-ink-400">Loading your workspace…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-ink-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
