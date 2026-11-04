# Orga — Roadmap

> What we build, in what order, and how we know each step is done.
> Why: [ADR-002](adr/ADR-002-personal-ai-agent-pivot.md) · How: [HLD](architecture/HLD.md)

**Goal:** a personal AI agent (Instinct-level features) with an interaction
analytics dashboard, built to industry standard, used daily by real people.

Each phase ends with an **exit criterion** that can be demoed. Do not start a
phase until the previous exit criterion passes. Tick items in the PR that completes them.

---

## Phase 0: Engineering Foundation (do this first)
*Turns the codebase into a professional project before features pile on top.*

- [x] **P0 security:** magic-link dashboard auth replaces phone auth ([ADR-006](adr/ADR-006-dashboard-authentication.md))
- [x] Versioned Prisma migrations, baseline committed ([ADR-008](adr/ADR-008-versioned-migrations.md))
- [x] TypeScript checking (JSDoc) + ESLint; `typecheck` and `lint` scripts ([ADR-007](adr/ADR-007-typescript-migration.md))
- [x] Zod-validated config: app refuses to start with missing or invalid env
- [x] GitHub Actions CI: lint → typecheck → migrations → unit + integration (Postgres service) → coverage thresholds; dashboard typecheck + build
- [x] Security in CI: `npm audit`, gitleaks secret scan, CodeQL, Dependabot
- [x] Repo hygiene: PR template, issue templates, CODEOWNERS, Conventional Commits (commitlint hook + CI), CHANGELOG
- [ ] Branch protection on `main` (needs GitHub Pro for private repos; free via Student Pack)
- [x] `SECURITY.md` + STRIDE threat model (`docs/security/THREAT_MODEL.md`)
- [x] Module docs for every existing `src/` module (`docs/modules/`)
- [x] Remove dead dependencies (`@google/genai`, `@google/generative-ai`)
- [x] Found and fixed during Phase 0: IDOR on API update/delete routes, unauthenticated `/test-digest` route, hardcoded auto-login phone in dashboard, "delete my data" not deleting, critical/high dependency CVEs, internal error messages leaked in 500s

**Exit:** a PR with a failing test or lint error cannot merge; the dashboard cannot be read without logging in.

## Phase 1: Multi-Channel + Event Log
- [x] `ChannelAdapter` interface + registry; WhatsApp moved behind it ([ADR-003](adr/ADR-003-channel-adapter.md))
- [x] Telegram adapter (webhook secret header, inline keyboards, Markdown fallback)
- [x] `ChannelIdentity` table; existing users migrated
- [x] `/link` cross-channel account linking
- [x] Proactive `notifyUser()` with WhatsApp 24h-window template fallback
- [x] Event bus + `Interaction` log; every handler emits events ([ADR-005](adr/ADR-005-interaction-event-log.md))
- [x] Structured logging with `traceId` (AsyncLocalStorage) and PII redaction (pino deferred: no need yet)

**Exit:** the same conversation works on WhatsApp and Telegram, and each message appears in `Interaction` with a traceId.

## Phase 2: Agent Core
- [x] `LLMProvider` strategy (Claude + Groq), model ids in config ([ADR-004](adr/ADR-004-agent-loop-and-llm-providers.md))
- [x] Tool registry with Zod schemas and permission tiers; 9 tools (handlers kept as fallback path)
- [x] Agent loop with step, time and per-user daily token budgets; fail-closed gate for external-effect tools
- [x] Prompts in versioned files in `prompts/`; prompt caching for the static parts
- [x] Short-term conversation memory (last 10 turns, 24h; pruned after 7 days)
- [x] Eval harness + CI gate; 25 cases across 8 suites incl. Hinglish and prompt injection
- [ ] Grow the dataset to 100 cases from real (anonymised) usage
- [ ] Record the first baseline (needs a valid `ANTHROPIC_API_KEY` or `GROQ_API_KEY`) ([ADR-013](adr/ADR-013-evals-as-ci-gate.md))
- [x] Per-turn telemetry in the Interaction log (tokens, cache hits, cost, latency, tools, model, prompt version) under the message traceId
- [ ] OpenTelemetry export (ADR-012 still Proposed) ([ADR-012](adr/ADR-012-observability.md))

**Exit:** eval pass rate ≥ 90%, p95 reply latency < 6s, cost per turn visible in traces.

## Phase 3: Google Integrations
- [x] Google OAuth (PKCE, encrypted state) from dashboard Settings; token vault with AES-256-GCM ([ADR-010](adr/ADR-010-security-baseline-third-party-data.md))
- [x] Expired-token detection (`invalid_grant`) → integration marked expired, user notified to reconnect
- [x] Calendar tools: list, create with **human approval** (Approve/Cancel buttons, approve-once)
- [x] Gmail read-only search tool, results flagged as untrusted
- [ ] Find free slots
- [ ] Gmail incremental sync → `Person` resolution → `Commitment` extraction → approve via buttons (moved to Phase 4: it is a proactive job)
- [x] Untrusted-content spotlighting; email prompt-injection eval case
- [ ] Injection eval cases pass 100% (needs a valid LLM key to measure)

**Exit:** "what's my day?" lists real meetings, and a client email creates a proposed commitment that the user approves in chat.

## Phase 4: Memory + Proactive Agent
- [x] Hybrid retrieval (Postgres full-text + free local multilingual embeddings) with Reciprocal Rank Fusion; relevant notes injected into agent context ([ADR-011](adr/ADR-011-memory-and-hybrid-retrieval.md))
- [ ] Nightly memory consolidation job (extract → merge → expire facts) (future: needs a working LLM key)
- [x] Double-fire-safe reminders via conditional claim (pg-boss deferred to save a second service, ADR-009) ([ADR-009](adr/ADR-009-job-queue.md))
- [x] Proactive rules: morning brief, meeting prep (T-30 min, only with related notes), stale tasks
- [ ] Overdue commitments and "not replied in N days" (need Gmail commitment extraction)
- [x] Rule-based relevance (free), daily nudge limit, quiet hours, dedupe, `/quiet` opt-out

**Exit:** Orga sends the user a useful message they did not ask for, and the dashboard shows why it was sent.

## Phase 5: Interaction Analytics Dashboard (the differentiator)
- [ ] Timeline of all interactions, filterable by person, channel, kind
- [ ] Person view: history, open commitments, memories, last contact
- [ ] Analytics: commitments kept vs missed, response gaps, activity heatmap, top people
- [ ] Agent transparency: every action with its trace, cost and approval
- [ ] Weekly AI insights: an LLM summary over aggregated analytics (aggregates only, never raw rows)
- [ ] "Ask your data": natural language → SQL over read-only, user-scoped views

**Exit:** a friend opens the dashboard and answers "who did I neglect this month, and what did I promise them?" in under a minute.

## Phase 6: Stretch (pick one or two)
- [ ] MCP server exposing Orga tools to Claude Desktop / IDEs ([ADR-014](adr/ADR-014-mcp-server.md))
- [ ] Voice notes → speech-to-text → agent (very common usage in India)
- [ ] Gmail draft replies (requires `gmail.compose` scope, approval)
- [ ] Browser worker (Playwright) for web tasks with approval and screenshots in the audit trail

---

## Resume Outcomes to Capture as You Go
Record real numbers in `docs/METRICS.md` as each phase ships:
- eval pass rate over time, number of eval cases
- p50/p95 latency and cost per agent turn
- test coverage, number of CI checks
- daily active users and weeks in use

Target bullet:
> Built Orga, a multi-channel (WhatsApp/Telegram) personal AI agent in TypeScript
> with a tool-use agent loop, Google Calendar/Gmail integration, hybrid
> pgvector retrieval and proactive nudges; added an interaction-analytics
> dashboard (Next.js), OpenTelemetry tracing and a CI-gated eval suite
> (N cases, X% pass rate); used daily by N people.
