# Changelog

All notable changes are recorded here, newest first.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Commits follow
[Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

### Phase 1: Multi-channel + Interaction log
#### Added
- Telegram channel alongside WhatsApp via `ChannelAdapter` interface and registry (ADR-003)
- `ChannelIdentity` model (one user, many chat accounts) with backfill migration for existing users
- `/link` command to join WhatsApp and Telegram chats into one account
- `notifyUser()` for proactive messages: most-recent channel, WhatsApp 24h-window template fallback
- Append-only `Interaction` log fed by an in-process event bus (ADR-005); 16 event kinds
- Per-message `traceId` via AsyncLocalStorage, included in logs and Interaction rows
- `scripts/setup-telegram.js` to register the Telegram webhook
#### Changed
- Handlers reply through channel-agnostic `reply(message, …)`; `webhook.js`/`sender.js` replaced by `pipeline.js` + adapters
- Logger redacts user content (`text`, `title`, `token`, …)
- `User.phone` is optional (Telegram users have none)
#### Fixed
- Handlers' local `reply` variables shadowed the reply function (caught by ESLint during refactor)

### Phase 0: Engineering foundation
#### Security
- Dashboard login replaced: phone-number auth → chat-delivered magic link + server-side sessions (ADR-006)
- Fixed IDOR: API update/delete routes now scoped by `userId`; cross-user access returns 404
- Removed unauthenticated `/test-digest` route that could message every user
- Removed hardcoded auto-login phone number from the dashboard
- "delete my data" now actually deletes (confirmation + transactional hard delete)
- 500 responses no longer leak internal error messages
- Upgraded vulnerable dependencies (express/proxy-addr critical, axios, zod, next)
- Security headers, CSRF guard (JSON-only mutations), login rate limiting
#### Added
- Versioned Prisma migrations with baseline (ADR-008)
- Zod-validated configuration; app exits on invalid env
- `/health/ready` readiness endpoint; graceful shutdown on SIGTERM
- CI: lint, typecheck, migrations, unit + integration tests with coverage thresholds, dashboard build, npm audit, gitleaks, CodeQL, commitlint; Dependabot
- Docs: HLD, 14 ADRs, threat model, module docs, AI workflow guide, roadmap
#### Changed
- Tests split into `test/unit`, `test/integration`; live-LLM checks moved to `evals/`
- `src/app.js` builds the app; `src/index.js` only starts it
#### Removed
- Unused `@google/genai`, `@google/generative-ai`
