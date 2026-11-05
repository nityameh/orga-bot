# ADR-018: Invite-only access and a web chat channel

**Status:** Accepted
**Date:** 2026-11-06
**Deciders:** Nitya

## Context
To use Orga, a person had to message a specific WhatsApp number (which needs a
Meta business setup) or a Telegram bot. That blocks the most important audience
right now: interviewers and friends who should be able to try it in seconds,
from a link, without installing anything or knowing a phone number.

## Decision
1. **Web chat as a third channel.** `src/channels/web.js` implements the same
   `ChannelAdapter` port. Inbound messages come from the session-authenticated
   API (`POST /api/v1/chat/messages`) instead of a webhook and go through the
   same pipeline; replies are written to a `WebMessage` outbox that the
   dashboard polls (`GET /api/v1/chat/messages?after=`). No agent, tool or
   handler code changed (Open/Closed in practice).
2. **Invite-only onboarding (Instinct-style).** Admins create invite links
   (`/invite` in chat, or `npm run invite:create`). Opening
   `/invite#code=ORGA-XXXX-XXXX` and accepting creates a user with a web
   identity, starts a session (HttpOnly cookie) and posts a welcome message.
   - Codes: 8 chars from an unambiguous alphabet, only SHA-256 stored, in the URL fragment (never sent to servers)
   - `maxUses`, `expiresAt`, `revokedAt`; uses claimed with a conditional `UPDATE … WHERE uses < maxUses`
   - Per-IP rate limit on redemption; `User.role = 'admin'` required for `/invite`
3. Web users can later connect WhatsApp/Telegram with the existing `/link` flow.

## Options Considered
| Option | Pros | Cons |
|---|---|---|
| Web channel + invites (chosen) | Zero-install demo; reuses the whole pipeline; controlled access | Polling adds up to ~1.5 s to reply display |
| Only Telegram for demos | Already built, free | Interviewer must install/open Telegram and find the bot |
| Open sign-up | Simplest | Uncontrolled LLM cost and abuse on a personal budget |
| WebSockets/SSE instead of polling | Instant updates | More moving parts (proxy timeouts, reconnects); polling is enough here |

## Consequences
- The demo path is: deploy → `npm run invite:create` → share link → chat in browser → Insights/Activity.
- Account creation is gated by invites, so cost and abuse stay bounded.

## Revisit When
Traffic makes polling expensive (switch to SSE), or invite admin needs a UI.
