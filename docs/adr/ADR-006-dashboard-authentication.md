# ADR-006: Replace phone-number dashboard auth with chat-delivered magic links

**Status:** Accepted — **P0, blocks all integration work**
**Date:** 2026-11-04
**Deciders:** Nitya

## Context
`src/api/middleware.js` authenticates with `?phone=` or `X-User-Phone`. Anyone
who knows a user's phone number can read all of their data. This is Broken
Authentication (OWASP A07) and becomes critical once Gmail/Calendar data exists.

## Decision
Magic-link login delivered over the user's own chat:
1. User sends `/login` on WhatsApp or Telegram (owning the chat account proves identity).
2. Bot replies with a link containing a 32-byte random token. Only its SHA-256
   hash is stored, with a 10-minute expiry, single use.
3. Dashboard exchanges the token for a session: `HttpOnly; Secure; SameSite=Lax`
   cookie holding an opaque session id (server-side `Session` table, revocable).
4. All `/api/v1/*` routes require a valid session; `userId` comes from the
   session, never from the request.
5. Rate-limit `/login` and token exchange; log every login as an Interaction.

## Options Considered
| Option | Pros | Cons |
|---|---|---|
| Chat magic link (chosen) | No passwords, no SMS cost, reuses verified channel | Needs chat access to log in |
| SMS OTP | Familiar | Costs money; SIM-swap risk |
| Google Sign-In | Also needed for Gmail later | Not every chat user links Google |
| Stateless JWT | No session table | Hard to revoke |

## Consequences
- Breaking change for the dashboard login page.
- Tests: token reuse, expiry, wrong user, session revocation, CSRF on mutations.

## Revisit When
A native mobile app is added (consider OAuth2 PKCE).
