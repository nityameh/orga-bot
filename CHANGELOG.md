# Changelog

All notable changes are recorded here, newest first.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Commits follow
[Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

### Phase 5.6: Demo-ready access
#### Added
- Web chat channel: third ChannelAdapter, browser chat with polling, approval/reminder buttons (ADR-018)
- Invite-only onboarding: hashed ORGA-XXXX-XXXX codes in the URL fragment, max uses, expiry, revocation, atomic redemption, per-IP rate limit; admin `/invite` command and `npm run invite:create` / `admin:grant`
- Invite landing page and Chat page in the dashboard; `docs/DEMO.md` runbook

### Phase 5.5: Platform upgrades (all free/open-source)
#### Added
- pgvector vector database: `vector(384)` column, HNSW index, cosine-distance search (ADR-016)
- LangGraph agent orchestration: state graph, Postgres checkpointer, durable approvals via `interrupt()`/resume (ADR-015)
- pg-boss durable job queue in-process: reminder retries with exponential backoff and dead-letter, cron schedules run once across instances (ADR-009)
- Eval harvesting from real messages: `/improve` consent, anonymiser, review queue, promote (ADR-017)
#### Fixed
- Undeliverable reminders were retried forever (attempt counter reset) and retries were lost on restart

### Phase 5: Interaction analytics dashboard
#### Added
- Insights page: activity over time, IST weekday × hour heatmap, reminder follow-through, agent latency/cost/cache rate, tool usage, approvals, proactive messages, people sorted by "gone quiet"
- Activity page: audit timeline of every AI action with tools, model, latency, cost and trace id; filters and keyset pagination
- Analytics API (`/api/v1/analytics/overview|people|timeline`) with Zod-validated queries, scoped per user

### Resilience + interview readiness
#### Added
- LLM fallback chain (Claude → Groq) with per-call timeout and circuit breaker
- `reschedule_reminder` tool for follow-ups ("move it to Monday", "make it 5pm instead")
- Metrics aggregation (`npm run metrics`): latency p50/p95, tokens/cost per turn, cache hit rate, failovers, tool error rate, active users
- Eval harness: conversation history in cases, latency and per-case cost in reports; new Hinglish-time and follow-up cases (32 total)
- `docs/INTERVIEW_GUIDE.md`: answers backed by code and tests
#### Changed
- Friendlier user message when every model is unavailable

### Phase 4: Memory + proactive (all free/open-source)
#### Added
- Semantic search with a free local multilingual embedding model (Transformers.js, multilingual-e5-small); English/Hindi/Hinglish
- Hybrid retrieval: Postgres full-text + vector similarity fused with Reciprocal Rank Fusion; keyword fallback
- Embeddings kept in sync by an event-bus subscriber; backfill and model-check scripts; CI job verifies the real model
- Agent receives the most relevant saved notes as context (retrieval-augmented)
- Proactive engine with pluggable rules (morning brief, meeting prep, stale tasks) and guards: opt-in, quiet hours, daily limit, dedupe; `/quiet` command
#### Fixed
- Reminders can no longer double-fire across overlapping ticks or instances (atomic claim)
#### Changed
- ADR-009 (pg-boss worker) deferred and ADR-011 accepted with free components, to avoid paid services

### Phase 3: Google integrations + approvals
#### Added
- Google OAuth with PKCE and encrypted, expiring state; dashboard Settings page to connect/disconnect
- AES-256-GCM token vault for OAuth tokens (versioned ciphertext for key rotation)
- Google client with proactive refresh, 401 retry, and expiry handling (user notified to reconnect)
- Agent tools: `list_calendar_events`, `create_calendar_event`, `search_email` (read-only, untrusted-flagged)
- Human-in-the-loop approvals for external actions: Approve/Cancel buttons on both channels, approve-once, audit events
- Eval cases: calendar approval, calendar listing, email prompt injection

### Phase 2: Agent core
#### Added
- Tool-use agent loop (ADR-004) with step/time limits, parallel tool calls, error-tolerant tool results, refusal handling
- `LLMProvider` strategy: Claude (`claude-opus-5-5`, effort `low`, prompt caching, server-side refusal fallback) and Groq
- Tool registry with Zod-validated, strict schemas and permission tiers; 9 tools over notes, tasks and reminders
- Deterministic command fast path (`routeCommand`); legacy classifier kept as fallback (strangler fig)
- Versioned system prompt (`prompts/agent.system.v1.md`) with injection-resistant tool-data wrapping
- Short-term conversation memory (`ConversationMessage`, pruned after 7 days)
- Per-user daily token budget; per-turn `agent.turn` telemetry (tokens, cache, cost, latency, tools, model)
- Eval harness: 25 cases / 8 suites, deterministic graders, baseline gate, CI workflow; grader unit tests
- `docs/METRICS.md` for measured project numbers

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
