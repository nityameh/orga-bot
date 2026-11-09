# Module: users (identity and channel linking)

> **Path:** `src/users/identity.js`  ·  **Status:** Stable (Phase 1)  ·  **Related ADRs:** [ADR-003](../adr/ADR-003-channel-adapter.md)

## Summary (read this first)
Works out which Orga user a chat message belongs to. A person can talk to Orga
from WhatsApp and Telegram. Linking the two with a short code makes both
chats share one account: the same notes, reminders and dashboard.

## Public Interface
| Export | Purpose |
|---|---|
| `resolveUser(inbound, { create })` | → `{ user, isNew }`. Finds the user by `(channel, externalId)` and updates `lastInboundAt`. Unknown chats: creates user + identity only when `create` (SIGNUP_MODE=open); otherwise `{ user: null }` and the pipeline hands over to invite onboarding (ADR-021) |
| `linkNewIdentity(code, inbound)` | An unknown chat sent `/link CODE`: attach it to the code's account (single use, transactional) |
| `createLinkCode(userId)` | → `{ code: "K7PM-Q2XD", ttlMinutes: 10 }` (one active code per user) |
| `consumeLinkCode(input, currentUser, inbound)` | → `'linked' \| 'invalid' \| 'same_account' \| 'has_data'` |
| `normaliseLinkCode`, `generateLinkCode` | Pure helpers (tested) |

## Linking flow
```
WhatsApp: "/link"           → Orga: "Send /link K7PM-Q2XD on your other app"
Telegram: "/link k7pm q2xd" → identity (telegram, chatId) moves to the WhatsApp user;
                              the empty Telegram-only user is deleted
```

## Design decisions
| Decision | Why |
|---|---|
| Identity table instead of `User.phone` | Telegram users have no phone; one user can have many identities |
| Codes hashed (SHA-256), 10-min expiry, one per user | Same reasoning as login tokens |
| 31-symbol alphabet without 0/O/1/I/L | Users type it on a phone; ~8.5×10¹¹ combinations |
| 5 attempts per chat per 10 min | Makes guessing infeasible |
| Refuse to merge if the joining chat already has data | Linking must never silently delete notes; user is told how to proceed |
| Unique `(channel, externalId)` + catch `P2002` on create | Two simultaneous first messages can't create two users |

## Edge Cases
| Situation | Behaviour |
|---|---|
| Code expired / mistyped | `invalid`, nothing changes |
| `/link CODE` sent from the account that issued it | `same_account` |
| Existing WhatsApp users before Phase 1 | Migration backfilled one `ChannelIdentity` per user |

## Testing
`test/unit/delivery.test.js` (code helpers), `test/integration/pipeline.test.js`
(link, refuse-with-data, invalid code).
