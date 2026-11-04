# Module: messaging pipeline

> **Path:** `src/pipeline.js`, `src/classifier.js`, `src/router.js`, `src/pending.js`
> **Status:** Stable (channel-agnostic since Phase 1); agent loop replaces classifier + router in Phase 2
> **Related ADRs:** [ADR-003](../adr/ADR-003-channel-adapter.md), [ADR-004](../adr/ADR-004-agent-loop-and-llm-providers.md), [ADR-005](../adr/ADR-005-interaction-event-log.md)

## Summary (read this first)
This is the path every chat message takes, whichever app it came from: check
it really came from WhatsApp/Telegram, work out who sent it, work out what they
want (a note? a reminder? a question?), hand it to the right handler, and reply
on the same app. Channel details live in [channels.md](channels.md).

## Files
| File | What it contains |
|---|---|
| `pipeline.js` | `createWebhookRouter()` mounts each adapter's webhook; `processInbound(message)` runs rate limit → `resolveUser` → welcome or classify → route, inside a per-message trace context |
| `classifier.js` | `classify(text)` → intent JSON via Groq Llama 3.3 (temperature 0). Falls back to keyword rules if the API fails, returns invalid JSON, or has no key |
| `router.js` | `route(user, intent, message)`: interceptors first (numbers, done, edit, delete, cancel, undo, slash commands, `/login`, `/link`, account deletion), then switch on `intent.type` |
| `pending.js` | Short-lived conversational state in `PendingAction` (numbered lists, edit-in-progress, confirmations), 10-minute TTL |

## How It Works
```
POST <adapter.webhookPath> ─► adapter.verifyRequest   (invalid → 403)
                            ─► 200 immediately        (platforms retry slow webhooks)
                            ─► adapter.parseInbound → InboundMessage[]
                            ─► dedupe "<channel>:<messageId>" (in-memory, last 1000)
                            ─► runWithContext({ traceId, channel })
                                  adapter.acknowledge (Telegram button spinner)
                                  rate limit "<channel>:<externalId>" (20/min)
                                  resolveUser → emit message.received
                                  new user? → welcome, stop
                                  classify → route → handler → reply()
                            ─► on error: log + "Something went wrong" reply
```

## Intent types
`NOTE, TASK, REMINDER, SEARCH, QUERY, TODAY, LIST, SCHEDULE, HELP, UNKNOWN`.
The keyword fallback never returns `UNKNOWN`; it defaults to `NOTE` (save rather than lose).

## Known limitations (addressed by the roadmap)
| Limitation | Fix |
|---|---|
| Commands like `/login` still pay for an LLM classification | Phase 2: agent loop with deterministic command fast-path |
| Dedupe and rate limits are in-memory (lost on restart, per instance) | Accepted at current scale (threat model) |
| One intent per message | Phase 2: multi-step tool use |

## Testing
Classifier behaviour lives in `evals/` (calls the live LLM; `npm run evals:legacy`).
Handlers: `test/integration/handlers.test.js`. Full pipeline (webhook → DB → Interactions): `test/integration/pipeline.test.js`.
