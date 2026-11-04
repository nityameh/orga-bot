# Orga — High-Level Design

> **Living document.** Update it in the same PR as any change that adds a
> component, a data store, an external integration or a new data flow.
> Low-level details (functions, routes, schema) are auto-generated in
> [`../LLD.md`](../LLD.md). Decisions and their reasoning live in [`../adr/`](../adr/README.md).

**Last updated:** 2026-11-04 · **Version:** 2.0 (target architecture after ADR-002)

---

## 1. Context

Orga is a personal AI agent that users reach over WhatsApp and Telegram. It reads
their Google Calendar and Gmail, keeps notes, tasks, reminders and memories,
acts through tools (with approval for risky actions), messages users
proactively, and shows every interaction in an analytics dashboard.

**Users:** the owner, friends and colleagues (target < 50, design for 1,000).
**Quality goals, in priority order:**
1. **Security and privacy:** users' email lives here.
2. **Correctness:** the agent does what was asked; evals prove it.
3. **Transparency:** every agent action can be traced and audited.
4. **Extensibility:** a new channel, tool or rule means new files, not edits.
5. **Cost:** under ₹100 per active user per month.

## 2. System Context (C4 level 1)

```
            ┌───────────┐   ┌───────────┐
            │ WhatsApp  │   │ Telegram  │      Users chat here
            └─────┬─────┘   └─────┬─────┘
                  │ webhooks      │
                  ▼               ▼
            ┌───────────────────────────┐       ┌──────────────────┐
 Browser ──►│          ORGA             │──────►│ Anthropic / Groq │ LLMs
 (dashboard)│                           │──────►│ Google APIs      │ Calendar, Gmail
            └───────────────────────────┘──────►│ OTel backend     │ traces
```

## 3. Containers (C4 level 2)

| Container | Tech | Responsibility |
|---|---|---|
| **orga-api** | Node.js 20, Express | Webhooks, REST API for the dashboard, auth, agent turns for inbound messages |
| **orga-worker** | Node.js 20, pg-boss | Reminders, proactive rules, Google sync, memory consolidation, evals schedule |
| **dashboard** | Next.js (App Router) | Organise and analyse interactions; manage integrations and memories |
| **postgres** | PostgreSQL 16 + pgvector | All state: users, content, Interaction log, jobs (pg-boss), embeddings |

All four are deployed on Railway. API and worker share one codebase with different entry points.

## 4. Components inside orga-api / orga-worker

```
src/
├── channels/      ChannelAdapter per channel (whatsapp, telegram) + registry   [ADR-003]
├── agent/         Agent loop, context builder, budgets, approval gates          [ADR-004]
├── llm/           LLMProvider strategy (claude, groq) + EmbeddingProvider      [ADR-004, 011]
├── tools/         One file per tool; self-registering tool registry           [ADR-004]
├── integrations/  Google OAuth, Calendar and Gmail clients, token vault         [ADR-010]
├── memory/        Hybrid retrieval, memory extraction and consolidation        [ADR-011]
├── interactions/  Event bus + Interaction log writer + analytics queries      [ADR-005]
├── proactive/     Rule engine: triggers → relevance check → notify            [ADR-009]
├── jobs/          pg-boss job definitions (worker entry)                      [ADR-009]
├── api/           Dashboard REST API (session-authenticated)                  [ADR-006]
├── auth/          Magic-link login, sessions                                  [ADR-006]
├── domain/        Notes, tasks, reminders: repositories scoped by userId
└── platform/      Config (Zod-validated env), logger, tracing, errors          [ADR-012]
```

**Dependency rule:** arrows point inward. `channels`, `api`, `jobs` →
`agent` → `tools` → `domain`/`integrations`. `domain` imports nothing above it.
No module imports a concrete channel or provider. They depend on interfaces.

## 5. Key Flows

### 5.1 Inbound message
```
Channel webhook → adapter.verify() → 200 OK immediately
  → adapter.parse() → InboundMessage → dedupe (message id)
  → resolve user via ChannelIdentity → emit message.received
  → agent.run(): build context (recent turns + retrieved memories + calendar today)
       loop: LLM → tool calls → (approval needed? ask user, pause) → results → LLM
  → adapter.send(reply) → emit agent.replied (tokens, cost, traceId)
```

### 5.2 Proactive nudge
```
pg-boss cron / event trigger → rule.matches(user, data)
  → relevance check (cheap LLM: "worth interrupting?") + daily nudge budget
  → choose channel by capabilities (WhatsApp outside 24h → template)
  → send → emit nudge.sent
```

### 5.3 Gmail ingestion
```
Sync job (incremental history id) → for each new email from a known person:
  wrap as untrusted data → extract commitments (cheap model, Zod-validated)
  → store Commitment(status=proposed) → ask user to approve → emit commitment.*
```

## 6. Data Model (target, high level)

| Entity | Purpose |
|---|---|
| User | Account |
| ChannelIdentity | (channel, externalId) → user. One user, many channels (✅ Phase 1) |
| LinkCode | Short-lived code to join another channel to an account (✅ Phase 1) |
| Session / LoginToken | Dashboard auth |
| Person | Clients, colleagues, contacts merged across sources |
| Note, Task, Reminder | User content (existing) |
| Commitment | Promises extracted from chat or email, with due date and status |
| Memory | Consolidated facts about people and preferences |
| Embedding | pgvector chunks over notes, emails, memories |
| Integration | Encrypted OAuth tokens per provider |
| Interaction | Append-only event log: the backbone for analytics, audit and proactive work (✅ Phase 1) |

## 7. Cross-Cutting Concerns

| Concern | Approach | ADR |
|---|---|---|
| AuthN/AuthZ | Magic link → server session; every query scoped by userId | 006 |
| Secrets | Env vars only; OAuth tokens AES-256-GCM encrypted | 010 |
| Untrusted input | Zod at every boundary; email/web text spotlighted as data | 007, 010 |
| Observability | pino logs + OTel GenAI traces + Sentry | 012 |
| Quality | Unit + integration (real Postgres) + evals in CI | 013 |
| Schema changes | Versioned Prisma migrations | 008 |
| Cost control | Per-user daily token budget; model routing | 004 |

## 8. Current State vs Target

| Area | Today | Target |
|---|---|---|
| Channels | ✅ Adapter registry: WhatsApp + Telegram (Phase 1) | Adapter registry: WhatsApp + Telegram |
| Brain | One-shot classifier (Groq Llama 3.3) | Tool-use agent loop (Claude + Groq) |
| Dashboard auth | ✅ Magic link + sessions (Phase 0) | Magic link + sessions |
| Jobs | node-cron polling in web process | pg-boss in worker process |
| Retrieval | Keyword | Hybrid pgvector + full text |
| Language | JavaScript, TS-checked via JSDoc for new modules | TS-checked everywhere (ADR-007) |
| Schema changes | ✅ Versioned migrations (Phase 0) | Versioned migrations |
