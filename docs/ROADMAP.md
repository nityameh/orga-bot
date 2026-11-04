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

- [ ] **P0 security:** magic-link dashboard auth replaces phone auth ([ADR-006](adr/ADR-006-dashboard-authentication.md))
- [ ] Versioned Prisma migrations, baseline committed ([ADR-008](adr/ADR-008-versioned-migrations.md))
- [ ] TypeScript + ESLint + Prettier set up; `typecheck` and `lint` scripts ([ADR-007](adr/ADR-007-typescript-migration.md))
- [ ] Zod-validated config: app refuses to start with missing or invalid env
- [ ] GitHub Actions CI: lint → typecheck → unit → integration (Postgres service) → coverage ≥ 70% on new code
- [ ] Security in CI: `npm audit`, gitleaks secret scan, CodeQL, Dependabot
- [ ] Repo hygiene: branch protection on `main`, PR template, CODEOWNERS, Conventional Commits (commitlint), CHANGELOG via release-please
- [ ] `SECURITY.md` + STRIDE threat model (`docs/security/THREAT_MODEL.md`)
- [ ] Module docs for every existing `src/` module (`docs/modules/`)
- [ ] Remove dead dependencies (`@google/genai`, `@google/generative-ai`)

**Exit:** a PR with a failing test or lint error cannot merge; the dashboard cannot be read without logging in.

## Phase 1: Multi-Channel + Event Log
- [ ] `ChannelAdapter` interface + registry; WhatsApp moved behind it ([ADR-003](adr/ADR-003-channel-adapter.md))
- [ ] Telegram adapter (webhook secret header, inline keyboards)
- [ ] `ChannelIdentity` table; existing users migrated
- [ ] Event bus + `Interaction` log; every handler emits events ([ADR-005](adr/ADR-005-interaction-event-log.md))
- [ ] Structured logging with `traceId` (pino)

**Exit:** the same conversation works on WhatsApp and Telegram, and each message appears in `Interaction` with a traceId.

## Phase 2: Agent Core
- [ ] `LLMProvider` strategy (Claude + Groq), model ids in config ([ADR-004](adr/ADR-004-agent-loop-and-llm-providers.md))
- [ ] Tool registry; existing handlers become tools with Zod schemas and permission tiers
- [ ] Agent loop with step, time and token budgets; approval gate for external-effect tools
- [ ] Prompts moved to versioned files in `prompts/`; prompt caching for the static parts
- [ ] Eval harness + 100-case dataset incl. Hinglish and prompt-injection cases; CI gate ([ADR-013](adr/ADR-013-evals-as-ci-gate.md))
- [ ] OpenTelemetry GenAI traces for every LLM and tool call ([ADR-012](adr/ADR-012-observability.md))

**Exit:** eval pass rate ≥ 90%, p95 reply latency < 6s, cost per turn visible in traces.

## Phase 3: Google Integrations
- [ ] Google OAuth (Testing mode, ≤ 100 users) on the dashboard; token vault with AES-256-GCM ([ADR-010](adr/ADR-010-security-baseline-third-party-data.md))
- [ ] Expired-token detection (`invalid_grant`) → reconnect link in chat
- [ ] Calendar tools: list, create (approval), find free slots
- [ ] Gmail incremental sync → `Person` resolution → `Commitment` extraction → approve via buttons
- [ ] Untrusted-content spotlighting; injection eval cases pass 100%

**Exit:** "what's my day?" lists real meetings, and a client email creates a proposed commitment that the user approves in chat.

## Phase 4: Memory + Proactive Agent
- [ ] pgvector hybrid retrieval with Reciprocal Rank Fusion and cited answers ([ADR-011](adr/ADR-011-memory-and-hybrid-retrieval.md))
- [ ] Nightly memory consolidation job (extract → merge → expire facts)
- [ ] pg-boss worker process; reminders become delayed jobs ([ADR-009](adr/ADR-009-job-queue.md))
- [ ] Proactive rules: morning brief, meeting prep (T-30 min), overdue commitments, "not replied in N days"
- [ ] Relevance check + daily nudge budget (≤ 3/day by default, user-configurable)

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
