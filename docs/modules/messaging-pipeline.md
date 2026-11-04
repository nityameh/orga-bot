# Module: messaging pipeline

> **Path:** `src/webhook.js`, `src/sender.js`, `src/classifier.js`, `src/router.js`, `src/pending.js`
> **Status:** Stable; refactored in Phase 1 (channels) and Phase 2 (agent)
> **Related ADRs:** [ADR-003](../adr/ADR-003-channel-adapter.md), [ADR-004](../adr/ADR-004-agent-loop-and-llm-providers.md)

## Summary (read this first)
This is the path a chat message takes: WhatsApp calls our webhook, we check the
message really came from Meta, work out what the user wants (a note? a
reminder? a question?), hand it to the right handler, and send the reply back.

## Files
| File | What it contains |
|---|---|
| `webhook.js` | `GET /webhook` Meta verification; `POST /webhook`: HMAC check → 200 immediately → dedupe → rate limit → upsert user → classify → route |
| `sender.js` | `sendMessage(to, text)`, `sendButtons(to, text, buttons)` via Meta Graph API. Without `WHATSAPP_TOKEN`, prints to console (dev mode) |
| `classifier.js` | `classify(text)` → intent JSON via Groq Llama 3.3 (temperature 0). Falls back to keyword rules if the API fails or returns invalid JSON |
| `router.js` | `route(user, intent, message)`: command interceptors first (numbers, done, edit, delete, cancel, undo, slash commands, `/login`, account deletion), then switch on `intent.type` |
| `pending.js` | Short-lived conversational state in `PendingAction` (numbered lists, edit-in-progress, confirmations), 10-minute TTL |

## How It Works
```
Meta ──POST /webhook──► verifySignature (HMAC-SHA256 of raw body, timing-safe)
                         │ invalid → 403
                         ▼
                       res 200 (Meta retries if no 200 within ~3s; everything after is async)
                         ▼
                       extractMessage → text or button reply only
                         ▼
                       isDuplicate(wamid)  (in-memory, last 100 ids)
                         ▼
                       isRateLimited(phone)  (20/min, silent drop)
                         ▼
                       upsertUser → new user? send welcome and stop
                         ▼
                       classify(text) ──► route(user, intent, message) ──► handler ──► sendMessage
```

## Intent types
`NOTE, TASK, REMINDER, SEARCH, QUERY, TODAY, LIST, SCHEDULE, HELP, UNKNOWN`.
The keyword fallback never returns `UNKNOWN`; it defaults to `NOTE` (save rather than lose).

## Known limitations (addressed by the roadmap)
| Limitation | Fix |
|---|---|
| WhatsApp-only; handlers call `sendMessage(message.from, …)` | Phase 1: `ChannelAdapter` + Telegram |
| Commands like `/login` still pay for an LLM classification | Phase 2: agent loop with deterministic command fast-path |
| Dedupe and rate limits are in-memory (lost on restart, per instance) | Accepted at current scale (threat model) |
| One intent per message | Phase 2: multi-step tool use |

## Testing
Classifier behaviour lives in `evals/` (calls the live LLM; `npm run evals:legacy`).
Handlers reached through the router are covered in `test/integration/handlers.test.js`.
