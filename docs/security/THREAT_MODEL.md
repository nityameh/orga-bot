# Threat Model

> **Summary:** what can go wrong security-wise, how likely it is, and what
> protects against it. Method: STRIDE per trust boundary. Review this whenever a
> new data source, channel, tool with external effects, or public endpoint is added.

**Last reviewed:** 2026-11-05 (Phase 2)

## 1. Assets
| Asset | Why it matters |
|---|---|
| Users' notes, tasks, reminders, message text | Personal and client-confidential |
| Dashboard sessions | Full read/write access to one user's data |
| WhatsApp/Telegram bot credentials | Impersonate Orga to every user |
| Google OAuth tokens (Phase 3) | Read users' email and calendar |
| LLM API keys | Cost abuse |

## 2. Trust boundaries
```
 Chat platform ──(1) webhook──► orga-api ──(3)──► Postgres
 Browser ───────(2) HTTPS────► dashboard ─proxy─► orga-api
 orga-api ──────(4)──────────► LLM providers, Google APIs
```

## 3. Threats and mitigations

| # | Boundary | STRIDE | Threat | Mitigation | Status |
|---|---|---|---|---|---|
| T1 | (1) | Spoofing | Forged webhook pretends to be a user | WhatsApp HMAC `X-Hub-Signature-256`; Telegram `X-Telegram-Bot-Api-Secret-Token`; both via `timingSafeEqual`; production refuses to boot without the secrets | ✅ |
| T2 | (1) | Spoofing | Signature check skipped by misconfiguration | Check bypass only when `NODE_ENV=development` **and** no secret; production config refuses to boot without `APP_SECRET` | ✅ |
| T3 | (2) | Spoofing | Dashboard login with someone else's phone number | Replaced by chat-delivered magic link + server session (ADR-006) | ✅ Phase 0 |
| T4 | (2) | Info disclosure | Login token leaked via logs/Referer | Token in URL fragment (never sent to servers); single-use; 10-min expiry; only hash stored | ✅ |
| T5 | (2) | Info disclosure | Session cookie stolen via XSS | `HttpOnly`, `Secure` (prod), never in localStorage | ✅ |
| T6 | (2) | Tampering | CSRF on dashboard mutations | `SameSite=Lax` + JSON-only mutations (forces CORS preflight) + CORS allowlist | ✅ |
| T7 | (2) | Elevation | Access another user's rows by id (IDOR) | Every API query filters by `req.user.id` from the session | ✅ (verify per new route) |
| T8 | (2) | DoS | Brute-force token exchange | Per-IP rate limit (10/min); 256-bit tokens make guessing infeasible | ✅ |
| T9 | (1) | DoS | Message flood → LLM cost spike | Per-user rate limit (20/min); per-user daily token budget → free fallback path; step and time limits per turn | ✅ Phase 2 |
| T10 | (3) | Info disclosure | DB dump exposes usable tokens | Only SHA-256 hashes of login/session tokens stored; OAuth tokens AES-256-GCM (Phase 3) | ✅ / Phase 3 |
| T11 | (4) | Tampering | Prompt injection via note (later email) content makes agent act | Tool results wrapped as `<tool_data>` + prompt rule; external tools fail closed; strict tool schemas reject extra args; `safety` eval suite | ✅ notes (Phase 2), email in Phase 3 |
| T19 | (4) | Elevation | Model passes another user's ids to a tool | Tools scope every query by the session user, never by model input; integration tests | ✅ Phase 2 |
| T12 | all | Repudiation | Can't tell what the agent did or who logged in | Interaction log records logins, messages and every state change with traceId | ✅ Phase 1 |
| T17 | (1) | Spoofing | Hijack an account by guessing a `/link` code | 8-char codes (~8.5×10¹¹), hashed, 10-min expiry, 5 attempts/10 min per chat; merging never deletes data | ✅ Phase 1 |
| T18 | (1) | Tampering | Forged Telegram button callback injects a command | Only whitelisted callback ids map to text | ✅ Phase 1 |
| T13 | all | Info disclosure | Secrets committed to git | `.env` gitignored; gitleaks in CI | ✅ |
| T14 | all | Tampering | Vulnerable dependency | `npm audit` gate (high+), Dependabot, CodeQL | ✅ |
| T15 | (1) | Info disclosure | Unauthenticated debug route triggers mass messages | `/test-digest` route removed | ✅ Phase 0 |
| T16 | all | Info disclosure | "Delete my data" doesn't delete | Confirmed, transactional hard delete of all user rows | ✅ Phase 0 |

## 4. Accepted risks
| Risk | Why accepted | Revisit |
|---|---|---|
| iCal links (`/ical/:id.ics`) are unauthenticated | Opened from chat apps without cookies; ids are unguessable cuids; content is one reminder title | If reminder content becomes sensitive |
| In-memory rate limits reset on restart and aren't shared across instances | Single instance at current scale | Before running >1 API instance |
