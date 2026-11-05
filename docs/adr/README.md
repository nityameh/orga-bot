# Architecture Decision Records

Every significant technical decision is recorded here, so anyone (human or AI)
can see **what** was decided, **why**, and **what was rejected**.

## Rules
1. A decision that changes architecture, a dependency, a data model, security
   posture or an external integration needs an ADR **before** the code is merged.
2. Copy [`../templates/ADR_TEMPLATE.md`](../templates/ADR_TEMPLATE.md), take the next number, add a row below.
3. ADRs are never deleted. To change a decision, write a new ADR and mark the
   old one `Superseded by ADR-XXX`.
4. `Proposed` = agreed direction, not built. `Accepted` = binding.

## Index

| # | Title | Status |
|---|---|---|
| [001](ADR-001-architecture-evaluation.md) | Evaluation of current architecture vs documented design | Superseded by 002 |
| [002](ADR-002-personal-ai-agent-pivot.md) | Reposition Orga as a personal AI agent with interaction analytics | Accepted |
| [003](ADR-003-channel-adapter.md) | WhatsApp + Telegram through a ChannelAdapter interface | Accepted |
| [004](ADR-004-agent-loop-and-llm-providers.md) | Tool-use agent loop, tool registry, LLM provider strategy (amended: Opus 5.5 @ low effort) | Accepted |
| [005](ADR-005-interaction-event-log.md) | Append-only Interaction log as system backbone | Accepted |
| [006](ADR-006-dashboard-authentication.md) | Chat-delivered magic-link auth for the dashboard (P0) | Accepted |
| [007](ADR-007-typescript-migration.md) | TypeScript-checked JavaScript (JSDoc) + Zod at boundaries | Accepted |
| [008](ADR-008-versioned-migrations.md) | Versioned Prisma migrations instead of `db push` | Accepted |
| [009](ADR-009-job-queue.md) | pg-boss for background jobs; separate worker process | Deferred (cost) |
| [010](ADR-010-security-baseline-third-party-data.md) | Security baseline for third-party data and agent actions | Accepted |
| [011](ADR-011-memory-and-hybrid-retrieval.md) | Hybrid retrieval with free local embeddings (pgvector deferred) | Accepted |
| [012](ADR-012-observability.md) | Structured logs + OpenTelemetry GenAI traces | Proposed |
| [013](ADR-013-evals-as-ci-gate.md) | Evals as a required CI gate | Accepted |
| [014](ADR-014-mcp-server.md) | Expose Orga's tools as an MCP server | Proposed |
| [015](ADR-015-langgraph-orchestration.md) | LangGraph orchestration with durable interrupts; keep our LLM provider layer | Accepted |
| [016](ADR-016-pgvector.md) | pgvector (HNSW, cosine) as the vector database | Accepted |
