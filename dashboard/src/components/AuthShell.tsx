// Centered card on a soft gradient, shared by the login, invite and callback pages.
import type { ReactNode } from 'react';

export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-50 px-4">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-200/60 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-emerald-100/70 blur-3xl" />
      <div className="relative w-full max-w-sm animate-fade-up">
        <div className="mb-6 flex justify-center">
          <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg font-bold text-white shadow-lg shadow-brand-600/30">
            O
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-ink-50" />
          </span>
        </div>
        <div className="card p-8">{children}</div>
      </div>
    </div>
  );
}
