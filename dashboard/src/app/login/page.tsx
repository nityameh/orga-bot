export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm p-8 bg-white rounded-xl shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Orga</h1>
        <p className="text-gray-500 text-sm mb-6">Sign in from your chat. No password needed.</p>

        <ol className="space-y-3 text-sm text-gray-700 list-decimal list-inside">
          <li>Open your chat with Orga on WhatsApp or Telegram.</li>
          <li>
            Send <code className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-900">/login</code>
          </li>
          <li>Tap the link Orga sends back. It works once and expires in 10 minutes.</li>
        </ol>

        <p className="text-xs text-gray-400 mt-8">
          Only someone with access to your chat can sign in to your dashboard.
        </p>
        <p className="text-xs text-gray-500 mt-3">
          New to Orga? Open the invite link you were sent. No phone number needed.
        </p>
      </div>
    </div>
  );
}
