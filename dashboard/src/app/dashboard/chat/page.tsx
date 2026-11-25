'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { WebMessage } from '@/lib/types';
import { SendIcon, SparkIcon } from '@/components/icons';

const POLL_MS = 1500;
// Button ids map to the same commands as WhatsApp/Telegram buttons.
const BUTTON_TEXT: Record<string, string> = {
  approval_yes: 'APPROVE', approval_no: 'REJECT', reminder_done: 'DONE', reminder_snooze: 'SNOOZE',
};
const SUGGESTIONS = [
  'remind me tomorrow 9am to call Ravi',
  'note: Acme wants the logo in dark mode',
  'what do I have today?',
];

/** Render *bold* the way chat apps do; everything else as plain text. */
function Formatted({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*[^*\n]+\*)/g).map((part, i) =>
        part.startsWith('*') && part.endsWith('*') && part.length > 2
          ? <strong key={i} className="font-semibold">{part.slice(1, -1)}</strong>
          : <span key={i}>{part}</span>)}
    </>
  );
}

function OrgaAvatar() {
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white shadow-sm">O</span>
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
    <div className="mx-auto flex h-[calc(100vh-5rem)] max-w-3xl flex-col">
      <div className="card flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-ink-100 px-5 py-4">
          <OrgaAvatar />
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink-900">Orga</p>
            <p className="flex items-center gap-1.5 text-xs text-ink-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Same assistant as on WhatsApp and Telegram
            </p>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-ink-50/50 px-5 py-6">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100"><SparkIcon size={22} /></span>
              <p className="mt-4 font-medium text-ink-900">Say hi to Orga</p>
              <p className="mt-1 text-sm text-ink-500">Try one of these, in English or Hinglish:</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="btn btn-secondary btn-sm rounded-full">{s}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`flex items-end gap-2 animate-fade-up ${m.direction === 'in' ? 'justify-end' : 'justify-start'}`}>
              {m.direction === 'out' && <OrgaAvatar />}
              <div className={`max-w-[78%] whitespace-pre-wrap break-words px-4 py-2.5 text-sm leading-relaxed shadow-sm ${m.direction === 'in'
                ? 'rounded-2xl rounded-br-md bg-brand-600 text-white'
                : 'rounded-2xl rounded-bl-md bg-white text-ink-800 ring-1 ring-ink-200/80'}`}>
                <Formatted text={m.text} />
                {m.buttons && m.buttons.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.buttons.map((b) => (
                      <button key={b.id} onClick={() => send(BUTTON_TEXT[b.id] ?? b.title)}
                        className="btn btn-sm rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100">
                        {b.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {waiting && (
            <div className="flex items-end gap-2">
              <OrgaAvatar />
              <div className="flex gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3.5 ring-1 ring-ink-200/80" aria-label="Orga is thinking">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottom} />
        </div>

        <form className="flex gap-2 border-t border-ink-100 bg-white p-3" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000}
            placeholder="Message Orga…" aria-label="Message" className="input flex-1 bg-ink-50 ring-transparent focus:bg-white" />
          <button type="submit" disabled={sending || !draft.trim()} className="btn btn-primary px-3.5" aria-label="Send">
            <SendIcon size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
