'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { WebMessage } from '@/lib/types';

const POLL_MS = 1500;
// Button ids map to the same commands as WhatsApp/Telegram buttons.
const BUTTON_TEXT: Record<string, string> = {
  approval_yes: 'APPROVE', approval_no: 'REJECT', reminder_done: 'DONE', reminder_snooze: 'SNOOZE',
};

/** Render *bold* the way chat apps do; everything else as plain text. */
function Formatted({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*[^*\n]+\*)/g).map((part, i) =>
        part.startsWith('*') && part.endsWith('*') && part.length > 2
          ? <strong key={i}>{part.slice(1, -1)}</strong>
          : <span key={i}>{part}</span>)}
    </>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<WebMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const lastSeen = useRef<string | undefined>(undefined);
  const bottom = useRef<HTMLDivElement>(null);

  const merge = useCallback((incoming: WebMessage[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id));
      return [...prev, ...incoming.filter((m) => !ids.has(m.id))];
    });
    lastSeen.current = incoming[incoming.length - 1].createdAt;
    if (incoming.some((m) => m.direction === 'out')) setWaiting(false);
  }, []);

  // Initial load, then poll for Orga's replies (and proactive messages).
  useEffect(() => {
    let stop = false;
    api.getChatMessages().then((r) => merge(r.messages)).catch(() => {});
    const timer = setInterval(() => {
      if (stop) return;
      api.getChatMessages(lastSeen.current).then((r) => merge(r.messages)).catch(() => {});
    }, POLL_MS);
    return () => { stop = true; clearInterval(timer); };
  }, [merge]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, waiting]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      await api.sendChatMessage(t);
      setDraft('');
      setWaiting(true);
      const r = await api.getChatMessages(lastSeen.current);
      merge(r.messages);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-2xl h-[calc(100vh-4rem)] flex flex-col">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Chat with Orga</h1>
      <p className="text-sm text-gray-500 mb-4">Same assistant as on WhatsApp and Telegram.</p>

      <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        {messages.length === 0 && <p className="text-sm text-gray-400">Say hi, or try “remind me tomorrow 9am to call Ravi”.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.direction === 'in' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap break-words ${m.direction === 'in' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
              <Formatted text={m.text} />
              {m.buttons && m.buttons.length > 0 && (
                <div className="flex gap-2 mt-2">
                  {m.buttons.map((b) => (
                    <button key={b.id} onClick={() => send(BUTTON_TEXT[b.id] ?? b.title)}
                      className="px-3 py-1 rounded-lg bg-white border border-gray-300 text-gray-900 text-xs hover:bg-gray-50">
                      {b.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {waiting && <p className="text-xs text-gray-400">Orga is thinking…</p>}
        <div ref={bottom} />
      </div>

      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000}
          placeholder="Message Orga…" aria-label="Message"
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        <button type="submit" disabled={sending || !draft.trim()}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg disabled:opacity-50">Send</button>
      </form>
    </div>
  );
}
