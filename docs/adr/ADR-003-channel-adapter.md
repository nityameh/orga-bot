# ADR-003: Support WhatsApp and Telegram through a ChannelAdapter interface

**Status:** Accepted
**Date:** 2026-11-04
**Deciders:** Nitya

## Context
Orga keeps WhatsApp and adds Telegram. Today `webhook.js` and `sender.js` are
WhatsApp-specific and handlers call `sendMessage()` directly, so adding a channel
would mean editing every handler (violates the Open/Closed Principle).

Channel differences that must be hidden from the core:
| | WhatsApp (Meta Cloud API) | Telegram Bot API |
|---|---|---|
| Identity | phone number | numeric chat id |
| Auth on webhook | `X-Hub-Signature-256` HMAC | `X-Telegram-Bot-Api-Secret-Token` header |
| Bot-initiated messages | Only templates outside the 24h window | Always allowed |
| Buttons | Interactive reply buttons (max 3) | Inline keyboards |

## Decision
Use the **Ports and Adapters (Hexagonal)** pattern:
- `ChannelAdapter` interface: `verify(req)`, `parse(req) → InboundMessage[]`,
  `send(OutboundMessage)`, `capabilities()`.
- One adapter per channel in `src/channels/<name>/`, registered in a
  `ChannelRegistry` (Registry pattern). The core only sees `InboundMessage` /
  `OutboundMessage`.
- A user can link several channel identities: new `ChannelIdentity` table
  (`userId, channel, externalId`). `User.phone` stops being the only identity.
- Outbound routing uses `capabilities()`; e.g. proactive messages to a WhatsApp
  user outside the 24h window fall back to an approved template.

## Options Considered
| Option | Pros | Cons |
|---|---|---|
| Adapter interface + registry (chosen) | New channel = new folder, zero core edits | Upfront refactor of webhook/sender |
| `if (channel === ...)` branches | Fast | Grows in every handler; untestable |
| Third-party aggregator (Twilio Conversations) | One API | Cost, lock-in, less to learn |

## Consequences
- Handlers become channel-agnostic and unit-testable with a fake adapter.
- Migration: existing users get a `ChannelIdentity(channel="whatsapp")` row.

## Revisit When
A channel needs streaming or voice (may need a richer interface).
