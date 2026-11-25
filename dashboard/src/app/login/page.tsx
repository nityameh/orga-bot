import AuthShell from '@/components/AuthShell';

const STEPS = [
  <>Open your chat with Orga on WhatsApp or Telegram.</>,
  <>Send <code className="rounded-md bg-brand-50 px-1.5 py-0.5 font-mono text-brand-700">/login</code></>,
  <>Tap the link Orga sends back. It works once and expires in 10 minutes.</>,
];

export default function LoginPage() {
  return (
    <AuthShell>
      <h1 className="text-center text-2xl font-semibold tracking-tight text-ink-900">Sign in to Orga</h1>
      <p className="mb-7 mt-1.5 text-center text-sm text-ink-500">From your chat. No password needed.</p>

      <ol className="space-y-4">
        {STEPS.map((step, i) => (
          <li key={i} className="flex gap-3 text-sm text-ink-700">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">{i + 1}</span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>

      <div className="mt-8 space-y-2 border-t border-ink-100 pt-5 text-center text-xs">
        <p className="text-ink-400">Only someone with access to your chat can sign in to your dashboard.</p>
        <p className="text-ink-500">New to Orga? Open the invite link you were sent. No phone number needed.</p>
      </div>
    </AuthShell>
  );
}
