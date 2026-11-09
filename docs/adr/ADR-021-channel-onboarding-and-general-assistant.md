# ADR-021: Join from chat apps with invite deep links; Orga is also a general assistant

**Status:** Accepted
**Date:** 2026-11-10
**Deciders:** Nitya
**Amends:** [ADR-018](ADR-018-invites-and-web-chat.md) (invites now also work from Telegram and WhatsApp), [ADR-003](ADR-003-channel-adapter.md) (channels declare a maximum message length)

## Context
1. **Invite bypass.** ADR-018 made Orga invite-only, but only on the web. Any
   Telegram or WhatsApp chat that messaged the bot got an account automatically
   (`resolveUser` created one). Anyone who found the bot could sign up and spend
   the shared LLM budget.
2. **People want to start in their chat app**, not in a browser. The first idea
   was "type your phone number and Orga texts you". That doesn't work:
   - Telegram bots **cannot** message a phone number; a user must start the chat first.
   - On WhatsApp, a business-initiated message needs an approved template, recorded
     opt-in, and costs money. Anyone could type someone else's number (spam), so
     the number would need a paid SMS one-time password. The free test number can only reach 5 verified recipients.
3. **Scope.** Users want to ask Orga anything (explanations, drafting, translation),
   not only organiser tasks. Prompt v1 limited replies to 4 lines and steered
   everything else back to notes and reminders.

## Decision
### 1. Unknown chats are invite-only (secure by default)
`resolveUser()` no longer creates accounts unless `SIGNUP_MODE=open` (local
development only; config refuses it in production). An unknown chat is handed
to `onboardUnknownChat()` (`src/invites/onboarding.js`), which accepts only:

| Message | Meaning |
|---|---|
| `/start ORGA-XXXX-XXXX` | Telegram deep link `t.me/<bot>?start=<code>` |
| `join ORGA-XXXX-XXXX` or the bare code | WhatsApp click-to-chat `wa.me/<number>?text=join <code>` |
| `/link XXXX-XXXX` | Attach this chat to an existing account (no throwaway account) |

Anything else gets a short "Orga is invite-only" reply: no account, no LLM call.
Code attempts are limited to 5 per chat per 10 minutes.

### 2. The invite page offers "Continue on Telegram / WhatsApp / web"
The page builds the deep links from public handles returned by
`GET /api/v1/auth/invite/channels` (`TELEGRAM_BOT_USERNAME`, `WHATSAPP_NUMBER`;
a channel is listed only when configured). **The user sends the first message**,
which proves they own that account or number for free, opens WhatsApp's free
24-hour service window, and means Orga never messages anyone who didn't ask.

`redeemInviteForChannel()` checks whether the chat already has an account
*before* claiming a use, so a duplicate webhook delivery doesn't burn a second
use. It then creates the user and identity in one nested write. A WhatsApp
sender's number is stored as `User.phone`, because the message itself verified it.

### 3. General-purpose assistant (prompt v2)
`prompts/agent.system.v2.md`: the agent decides between organiser work (tools)
and general answers (no tools). Rules: no invented facts, say when it can't
check live data (no web access), professional-help caveats for medical, legal and tax
questions, reply length scales with the request. Statements about the user's own
work are still saved as notes. New `general` eval suite (7 cases).

Long answers can exceed the 4096-character limit of Telegram and WhatsApp, so
channels declare `capabilities.maxTextLength` and `deliver()` splits replies at
paragraph, line or word boundaries (buttons go on the last part).

## Consequences
**Good**
- Closes the invite bypass. Every account traces back to an invite or an existing account.
- Two-tap onboarding from either chat app, with no phone number typed and no SMS or template costs.
- One assistant for everything, which makes daily use more likely.

**Trade-offs**
- General chat uses more tokens. The per-user daily budget (`AGENT_DAILY_TOKEN_BUDGET`)
  still caps it; over budget, Orga falls back to the keyword classifier, which
  cannot answer general questions.
- No web search, so answers about current events are explicitly declined. A
  search tool would need a provider and a new ADR.
- An invite code appears in the first chat message, so it reaches the server. That's
  harmless: it is single-use, stored hashed, and never logged.

## Alternatives considered
| Option | Why not |
|---|---|
| Phone number + Orga messages first | Impossible on Telegram; costs, opt-in and spam risk on WhatsApp (see Context) |
| SMS OTP to verify numbers | Paid, and still can't start a Telegram chat |
| Keep open signup, add rate limits | Limits cost per account, not the number of accounts |
| Separate "general chat" mode/command | Users shouldn't have to switch modes; the model routes reliably with tools available |
