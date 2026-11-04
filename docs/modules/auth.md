# Module: auth

> **Path:** `src/auth/`  ·  **Status:** Stable (Phase 0)  ·  **Related ADRs:** [ADR-006](../adr/ADR-006-dashboard-authentication.md)

## Summary (read this first)
Lets a user sign in to the dashboard without a password. They send `/login` in
their chat; Orga replies with a one-time link; opening it creates a secure
session cookie. Because only the owner of the chat account receives the link,
possessing the chat **is** the proof of identity.

## Responsibilities
- Issue single-use, 10-minute magic links (`issueLoginLink`)
- Exchange a link token for a 30-day server-side session (`exchangeLoginToken`)
- Resolve the session cookie on every dashboard API request (`requireSession`)
- Revoke sessions (logout)
- CSRF protection for mutations (`requireJsonForMutations`)

**Not responsible for:** deciding *what* a user may access. Every API query must
still filter by `req.user.id` (see [api.md](api.md)).

## Public Interface
Import only from `src/auth/index.js`:

| Export | Purpose |
|---|---|
| `authService.issueLoginLink(userId)` | → `{ url, expiresAt }`. Used by `/login` chat command |
| `authService.exchangeLoginToken(token, userAgent?)` | → `{ sessionToken, userId, expiresAt }` or `null` |
| `authService.resolveSession(sessionToken)` | → `userId` or `null` |
| `authService.revokeSession(sessionToken)` | Idempotent logout |
| `authHttp.router` | `POST /exchange`, `POST /logout`, `GET /me` (mounted at `/api/v1/auth`) |
| `authHttp.requireSession` | Express middleware; sets `req.user` or responds 401 |
| `authHttp.requireJsonForMutations` | Express middleware; 415 for non-JSON POST/PUT/DELETE |

## Files
| File | What it contains |
|---|---|
| `index.js` | Composition root: wires service + Prisma repository + config |
| `authService.js` | Pure business logic; depends on the `AuthRepository` interface |
| `prismaAuthRepository.js` | Postgres implementation of `AuthRepository` |
| `http.js` | Express middleware and routes |
| `tokens.js` | Random token generation, SHA-256 hashing, format validation |

## How It Works
```
User sends "/login" ──► handlers/account.js ──► issueLoginLink(userId)
                                                  ├─ token = 32 random bytes (base64url)
                                                  ├─ store sha256(token), expires +10 min
                                                  └─ reply: DASHBOARD_URL/auth/callback#token=…

Browser opens link ──► dashboard /auth/callback reads #token, clears it from the URL
                   ──► POST /api/v1/auth/exchange {token}   (proxied by Next.js)
                         ├─ rate limit 10/min per IP
                         ├─ consumeLoginToken: atomic UPDATE … WHERE usedAt IS NULL AND not expired
                         ├─ create Session (sha256 of new random session token)
                         └─ Set-Cookie: orga_session=…; HttpOnly; SameSite=Lax; Secure(prod)

Every API call ──► requireSession ──► resolveSession(cookie) ──► req.user
```

### Design choices worth knowing
- **Token in the URL fragment (`#`)**: browsers never send fragments to servers,
  so the token does not appear in access logs, proxies or `Referer` headers.
- **Only hashes stored**: a database leak does not yield usable tokens. SHA-256
  is sufficient because tokens are 256-bit random (no brute-force dictionary exists).
- **Atomic consume**: `updateMany … where usedAt = null` means two parallel
  exchanges of the same token cannot both succeed (no race condition).
- **Server-side sessions, not JWT**: sessions can be revoked instantly.
- **Throttled `lastSeenAt`**: written at most every 5 minutes to avoid a DB write per request.

## Extension Points
- New storage (e.g. Redis sessions): implement `AuthRepository`, change `index.js` only.
- New login method (e.g. Google Sign-In in Phase 3): add a function that ends in
  `repo.createSession(...)`; session handling stays unchanged.

## Edge Cases & Failure Modes
| Situation | Behaviour |
|---|---|
| Link opened twice (or React strict mode double effect) | Second exchange → 401; callback page guards with a ref |
| Link opened after 10 min | 401 "invalid or expired, send /login again" |
| Malformed/oversized token | Rejected before any DB query |
| Session expired or revoked | 401 → dashboard redirects to `/login` |
| User deleted (`confirm delete`) | Sessions and tokens deleted in the same transaction |

## Testing
- `test/unit/auth.service.test.js`: all service logic with an in-memory repository and fake clock
- `test/integration/api.test.js` (`Auth` block): real HTTP flow, cookie flags, reuse, logout, CSRF
- `test/integration/api.authorization.test.js`: cross-user access returns 404
