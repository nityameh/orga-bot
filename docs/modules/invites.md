# Module: invites (invite-only onboarding)

> **Path:** `src/invites/`, `scripts/create-invite.js`, `scripts/make-admin.js`, `dashboard/src/app/invite/`
> **Status:** Stable  ·  **Related ADRs:** [ADR-018](../adr/ADR-018-invites-and-web-chat.md), [ADR-021](../adr/ADR-021-channel-onboarding-and-general-assistant.md), [ADR-006](../adr/ADR-006-dashboard-authentication.md)

## Summary (read this first)
New people join Orga through an **invite link**. The link opens a page with up
to three choices: **Continue on Telegram**, **Continue on WhatsApp**, or **use
it on the web**. In a chat app, the person taps Start (Telegram) or Send
(WhatsApp); that first message carries the invite code, and Orga creates their
account linked to that chat. On the web, tapping the button creates the account and
opens web chat. Only admins can create invites.

A chat Orga has never seen **cannot** get an account any other way: without an
invite code (or a `/link` code from an existing account) it just gets an
"Orga is invite-only" reply.

## Flows
```
admin: /invite 3 2  (or npm run invite:create)
  → createInvite(): code ORGA-K7PM-Q2XD, SHA-256 stored, 3 uses, 2 days
  → link <dashboard>/invite#code=ORGA-K7PM-Q2XD

guest opens link → page reads #code, clears it from the URL
                 → GET /api/v1/auth/invite/channels  → { telegram: "OrgaBot", whatsapp: "9198…" }

 Telegram: t.me/OrgaBot?start=ORGA-K7PM-Q2XD  → user taps Start → bot gets "/start ORGA-K7PM-Q2XD"
 WhatsApp: wa.me/9198…?text=join ORGA-K7PM-Q2XD → user taps Send
     → pipeline: resolveUser() finds no identity → onboardUnknownChat()
     → parseOnboarding() → redeemInviteForChannel(): chat already joined? → claimUse() (atomic)
                                                    → User + ChannelIdentity in one write
     → welcome message in that chat

 Web: Accept → POST /api/v1/auth/invite { code } (rate limited per IP)
     → redeemInvite(): claimUse() → User + ChannelIdentity(web, externalId = userId)
     → session cookie + welcome in web chat → /dashboard/chat
```

## Public interface
| Export | Purpose |
|---|---|
| `invites.createInvite({ label, maxUses, days, createdById })` | → `{ code, url, expiresAt, maxUses }` |
| `invites.redeemInvite(code)` | Web: → `{ ok: true, userId }` or `{ ok: false, reason: 'invalid' \| 'expired' \| 'used_up' }` |
| `invites.redeemInviteForChannel(code, { channel, externalId, name })` | Chat app: same, plus `'already_joined'` |
| `invites.revokeInvite(code)` | Disable a link |
| `redeemAndWelcome(code)` | Web redeem + `user.created` event + welcome message |
| `onboardUnknownChat(message)` | First message from an unknown chat → `'joined' \| 'linked' \| 'rejected' \| 'ignored'` |
| `inviteChannels()` | Public bot username / WhatsApp number for the invite page (only configured channels) |
| `parseOnboarding(text)` (onboarding.js) | Pure: `/start CODE`, `join CODE`, bare code, `/link CODE`, or nothing |

## Configuration
| Variable | Purpose |
|---|---|
| `SIGNUP_MODE` | `invite` (default). `open` gives every chat an account; local dev only, refused in production |
| `TELEGRAM_BOT_USERNAME` | Shows "Continue on Telegram" (also needs `TELEGRAM_BOT_TOKEN`). `scripts/setup-telegram.js` prints it |
| `WHATSAPP_NUMBER` | Shows "Continue on WhatsApp" (also needs `WHATSAPP_TOKEN`). Digits with country code |

## Security
| Concern | Mitigation |
|---|---|
| Signing up without an invite (invite bypass) | Unknown chats get no account without a valid code (ADR-021) |
| Guessing codes | ~8.5×10¹¹ combinations; 10 attempts/min/IP (web), 5 per chat per 10 min (chat apps) |
| Code leaking via logs/Referer | Code in the URL fragment on the web; only the hash is stored; message text is never logged |
| Over-redemption under concurrency | Conditional UPDATE (compare-and-set); tested with 3 parallel redemptions of a 2-use invite |
| A duplicate webhook burning a second use | "Already joined?" check before claiming; unique (channel, externalId) as backstop |
| Orga messaging people who didn't ask | Never: the person always sends the first message |
| Anyone creating invites | `User.role = 'admin'` required; first admin via `npm run admin:grant` (needs DB access) |

## Testing
`test/unit/onboarding.test.js`, `test/unit/invites.webchat.test.js`,
`test/integration/pipeline.test.js` (deep-link join, WhatsApp join, used-up
invite, `/link` from an unknown chat), `test/integration/invites.webchat.test.js`.
