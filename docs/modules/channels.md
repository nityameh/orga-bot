# Module: channels

> **Path:** `src/channels/`  ·  **Status:** Stable (Phase 1)  ·  **Related ADRs:** [ADR-003](../adr/ADR-003-channel-adapter.md)

## Summary (read this first)
Orga can be reached on WhatsApp and Telegram. This module hides the
differences between them. Every incoming message, whichever app it came
from, is turned into the same simple shape, and the rest of the app replies
with `reply(message, text)` without knowing which app it is talking to.

## Responsibilities
- One **adapter** per chat app: check that a webhook really came from the
  platform, turn its payload into `InboundMessage`s, and send messages back
- `reply()` for answering a message on the channel it came from
- `notifyUser()` for messages Orga starts itself (reminders, digests): picks the
  channel and switches to an approved template when WhatsApp requires it

**Not responsible for:** deciding what to say (handlers), or who the user is (`src/users/`).

## Public Interface (`src/channels/index.js`)
| Export | Purpose |
|---|---|
| `reply(message, text, buttons?)` | Answer an inbound message on its own channel; emits `message.sent` |
| `notifyUser(user, { text, buttons?, template? })` | Proactive message; returns `false` if it couldn't be delivered |
| `planDelivery(identities, capabilitiesOf, now)` | Pure decision used by `notifyUser` (exported for tests) |
| `splitText(text, max)` | Splits replies longer than `capabilities.maxTextLength` (4096 on Telegram and WhatsApp, none on web) at paragraph/line/word boundaries; buttons go on the last part (ADR-021) |
| `registry` | The `ChannelRegistry`; used by `src/pipeline.js` to mount webhooks |

## Files
| File | What it contains |
|---|---|
| `types.js` | `InboundMessage`, `OutboundMessage`, `ChannelAdapter`, `ChannelCapabilities` typedefs |
| `registry.js` | Register/look up adapters by name |
| `whatsapp.js` | Meta Cloud API: verify handshake, HMAC-SHA256 signature, text/button parsing, text/buttons/template sending |
| `telegram.js` | Bot API: secret-token header check, message + inline-button parsing, Markdown sending with plain-text fallback |
| `index.js` | Composition root: builds adapters from config; `reply`, `notifyUser` |

## Web chat (ADR-018)
A third adapter, `web.js`, for using Orga in the browser (invited users,
interview demos). It has no webhook: `POST /api/v1/chat/messages` stores the
message and runs the normal pipeline asynchronously (202 Accepted); `send()`
writes replies to the `WebMessage` outbox, which the dashboard polls every
1.5 s. Buttons (Approve/Cancel, Done/Snooze) map to the same commands as on
WhatsApp/Telegram. Adding it changed no agent, tool or handler code.

## Channel differences the adapters absorb
| | WhatsApp | Telegram |
|---|---|---|
| Webhook path | `/webhook` (GET handshake + POST) | `/webhooks/telegram` |
| Authenticity | `X-Hub-Signature-256` HMAC of raw body | `X-Telegram-Bot-Api-Secret-Token` header |
| User id | phone number | chat id |
| Buttons | max 3, 20-char titles | inline keyboard |
| Bot-initiated messages | free-form only within 24h of the user's last message; otherwise approved template | always allowed |
| Button tap ack | not needed | `answerCallbackQuery` |

Both compare secrets with `crypto.timingSafeEqual` to prevent timing attacks.

## How proactive delivery works
```
notifyUser(user, outbound)
  → load user's ChannelIdentities
  → planDelivery: most recent lastInboundAt wins
       channel has freeformWindowHours = null  → free-form
       within the window                       → free-form
       outside the window                      → template (outbound.template)
  → send; emit message.sent
```
Templates used: `reminder_fire` (`{{1}}` = reminder title) and `weekly_digest`
(`{{1}}` notes, `{{2}}` tasks completed, `{{3}}` next reminder).

## Extension Points: adding a channel (e.g. SMS)
1. Create `src/channels/sms.js` implementing `ChannelAdapter` (see `types.js`).
2. Register it in `src/channels/index.js` and add its config to `src/config.js`.
3. Add unit tests in `test/unit/channels.test.js`.

No handler, router or pipeline code changes (Open/Closed Principle).

## Edge Cases & Failure Modes
| Situation | Behaviour |
|---|---|
| No token configured (dev) | Adapter prints the outgoing message to the console and reports success |
| Platform rejects a send | Logged with the platform error code; `send` returns `false` (never throws) |
| Telegram rejects Markdown (e.g. `_` in a URL) | Automatically resent as plain text |
| Group chats on Telegram | Ignored (Orga is personal) |
| Unknown button ids | Ignored, so forged callbacks can't inject commands |
| WhatsApp user silent for > 24h and no template given | `notifyUser` returns `false` and logs `notify.outside_window_no_template` |

## Telegram setup
1. Create a bot with [@BotFather](https://t.me/BotFather) → copy the token.
2. Set `TELEGRAM_BOT_TOKEN` and a random `TELEGRAM_WEBHOOK_SECRET` (16+ chars) in `.env` / Railway.
3. Deploy, then run `node scripts/setup-telegram.js https://<your-api-domain>`.
4. Check with `node scripts/setup-telegram.js --info`.

## Testing
`test/unit/channels.test.js` (adapters, registry), `test/unit/delivery.test.js`
(`planDelivery`), `test/integration/pipeline.test.js` (real webhook → DB).
