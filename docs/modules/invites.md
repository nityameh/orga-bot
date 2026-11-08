# Module: invites (invite-only onboarding)

> **Path:** `src/invites/`, `scripts/create-invite.js`, `scripts/make-admin.js`, `dashboard/src/app/invite/`
> **Status:** Stable  ·  **Related ADRs:** [ADR-018](../adr/ADR-018-invites-and-web-chat.md), [ADR-006](../adr/ADR-006-dashboard-authentication.md)

## Summary (read this first)
New people join Orga through an **invite link**, like Instinct. Opening the link
and tapping **Accept** creates their account, signs them in, and opens a web
chat with Orga. No phone number or app is needed. Only admins can create invites.

## Flow
```
admin: /invite 3 2  (or npm run invite:create)
  → createInvite(): code ORGA-K7PM-Q2XD, SHA-256 stored, 3 uses, 2 days
  → link <dashboard>/invite#code=ORGA-K7PM-Q2XD
guest opens link → dashboard reads #code, clears it from the URL → Accept
  → POST /api/v1/auth/invite { code }   (rate limited per IP)
  → redeemInvite(): normalise → lookup by hash → not revoked/expired
                     → UPDATE … SET uses = uses + 1 WHERE uses < maxUses   (atomic claim)
                     → create User + ChannelIdentity(web, externalId = userId)
  → session cookie + welcome message in web chat → /dashboard/chat
```

## Public interface
| Export | Purpose |
|---|---|
| `invites.createInvite({ label, maxUses, days, createdById })` | → `{ code, url, expiresAt, maxUses }` |
| `invites.redeemInvite(code)` | → `{ ok: true, userId }` or `{ ok: false, reason: 'invalid' \| 'expired' \| 'used_up' }` |
| `invites.revokeInvite(code)` | Disable a link |
| `redeemAndWelcome(code)` | Redeem + `user.created` event + welcome message |

## Security
| Concern | Mitigation |
|---|---|
| Guessing codes | ~8.5×10¹¹ combinations; 10 attempts/min/IP |
| Code leaking via logs/Referer | Code in URL fragment; only the hash is stored |
| Over-redemption under concurrency | Conditional UPDATE (compare-and-set); tested with 3 parallel redemptions of a 2-use invite |
| Anyone creating invites | `User.role = 'admin'` required; first admin via `npm run admin:grant` (needs DB access) |

## Testing
`test/unit/invites.webchat.test.js`, `test/integration/invites.webchat.test.js`.
