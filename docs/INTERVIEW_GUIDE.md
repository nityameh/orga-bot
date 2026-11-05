# Orga — Interview Guide

> How to talk about Orga in an interview: short spoken answers first, then the
> evidence in this repo to back each claim. **Rule: never claim more than the
> code and `docs/METRICS.md` show.** If a number shows "—", say "I'd have to
> measure that" or describe how you *would* measure it (the tooling exists).

**One-line pitch:** "Orga is a personal AI agent people use over WhatsApp and
Telegram. It keeps notes, tasks and reminders, connects to Google Calendar and
Gmail, messages you proactively, and logs every interaction so a dashboard can
show what it did and why. The agent runs on LangGraph with a Postgres
checkpointer for durable human approvals; retrieval uses pgvector; background
work runs on a durable Postgres job queue (pg-boss). I kept my own LLM provider
layer for exact cost tracking, caching and failover."

---

## 1. "How do you handle multi-tenancy and privacy?"

**Say:** "Isolation is enforced in the data layer, not trusted to the model.
Every query is scoped by the user id from the session or the verified chat
identity. The LLM never chooses whose data it sees: tools receive the user
from server context, and even if the model passes another user's id, the
query returns 'not found'. I found and fixed an IDOR bug where update routes
used only the record id, and I added regression tests that try cross-user
access on every route." *(Connect this to your cross-tenant fix at work.)*

**Evidence:**
- Tools take `ctx.user` from the server, never from model input: [src/agent/toolRegistry.js](../src/agent/toolRegistry.js), [src/agent/tools/](../src/agent/tools/)
- IDOR fix (`updateMany` with `{ id, userId }`, 404 cross-user): [src/api/notes.js](../src/api/notes.js) · tests: [test/integration/api.authorization.test.js](../test/integration/api.authorization.test.js)
- Cross-user tool tests: [test/integration/agent.tools.test.js](../test/integration/agent.tools.test.js)
- Retrieval scoped per user (vectors and full-text): [src/memory/service.js](../src/memory/service.js)
- Strict tool schemas reject extra arguments such as an injected `userId`: `z.strictObject`
- Dashboard auth: chat-delivered magic link, hashed single-use tokens, HttpOnly cookies ([ADR-006](adr/ADR-006-dashboard-authentication.md))
- Privacy: OAuth tokens AES-256-GCM encrypted; message bodies redacted from logs; "delete my data" is a real transactional delete; conversation memory pruned after 7 days
- Threat model: [docs/security/THREAT_MODEL.md](security/THREAT_MODEL.md) (T7, T19, T20)

## 1b. "Why LangGraph? Why not LangChain agents, or no framework?"

**Say:** "I started with a hand-written loop to understand the mechanics, then
moved orchestration to LangGraph when I needed durable human-in-the-loop. When
the agent wants to send a calendar invite, the graph calls `interrupt()` before
any tool runs. The state is checkpointed in Postgres, and when the user taps
Approve, `Command({ resume })` continues the same turn, so the agent performs
the action and replies about the result. The approval survives a restart. I
didn't use LangChain's chat-model wrappers: my provider layer does exact
per-call cost accounting, prompt caching and a fallback chain with a circuit
breaker, and the analytics depend on those details. The migration kept the same
function signatures, so my 26 existing agent tests verified it unchanged."

**Evidence:** [src/agent/agent.js](../src/agent/agent.js), [ADR-015](adr/ADR-015-langgraph-orchestration.md), tests [test/unit/agent.graph.test.js](../test/unit/agent.graph.test.js) (pause before any side effect, approve-once, reject, no double-counted usage).

**Gotcha worth mentioning:** LangGraph re-runs a node from the top on resume, so
side effects must come after `interrupt()`. There's a test for exactly that.

## 1c. "How does retrieval work? Do you use a vector database?"

**Say:** "Hybrid retrieval. Postgres full-text search for keywords, plus
pgvector for meaning: a `vector(384)` column with an HNSW index and the cosine
distance operator, embeddings from an open-source multilingual model running
locally (no API cost, works for Hinglish). I fuse the two ranked lists with
Reciprocal Rank Fusion. I chose pgvector over Pinecone or Qdrant because it's
free, it's the same database, so user scoping and transactions come for free,
and it's plenty at this scale. Per query I raise `hnsw.ef_search` so filtering
by user doesn't starve the approximate search."

**Evidence:** [src/memory/service.js](../src/memory/service.js), [ADR-016](adr/ADR-016-pgvector.md), [test/integration/memory.proactive.test.js](../test/integration/memory.proactive.test.js) (HNSW index present, user scoping), CI job that checks the real embedding model.

## 2. "What happens if the LLM (Groq/Claude) is down or slow?"

**Say:** "Every model call has a timeout. Providers sit behind a fallback
chain with a circuit breaker: if Claude errors or times out, the same turn
retries on Groq, and a provider that keeps failing is skipped for a cooldown
so users don't each wait for a timeout. If every model is down, exact
commands like `/today`, `done 2` and reminders still work without an LLM, and
free text falls back to a keyword classifier. The one thing I never do is
retry on a different path after a tool already ran, because that could save a
note twice. Then the user gets 'I'm having trouble, try again in a minute'."

**Evidence:**
- Fallback chain + timeout + circuit breaker: [src/llm/fallbackProvider.js](../src/llm/fallbackProvider.js) · tests: [test/unit/resilience.metrics.test.js](../test/unit/resilience.metrics.test.js)
- SDK-level retries with backoff (`maxRetries: 2`) in both providers
- Server-side refusal fallback on Claude: [src/llm/anthropicProvider.js](../src/llm/anthropicProvider.js)
- No-LLM command fast path: `routeCommand` in [src/router.js](../src/router.js)
- "Only fall back if no tool ran" (`err.toolCallsMade`): [src/pipeline.js](../src/pipeline.js), [src/agent/agent.js](../src/agent/agent.js)
- Failovers are counted in metrics (`npm run metrics` → "Failovers")

**Honest gap:** the circuit breaker's state lives in memory per process; with
several instances each would learn independently. That's fine for one
instance, and Redis or Postgres would be the shared store later.

## 3. "How do you parse dates like 'kal 5 baje'?"

**Say:** "The model resolves the relative time against the current IST time I
give it in the prompt, and outputs ISO 8601 with a +05:30 offset. The server
then validates it: it must parse, be in the future and be within a year. A
past time is rejected with the current time in the error, so the model can
correct itself or ask. The confirmation always shows the absolute resolved
time ('Fri, 6 Nov, 5:00 pm'), so the user catches mistakes. Ambiguous cases
like '5 baje' without morning or evening are an eval case, and the reply has
to state the time it chose."

**Evidence:**
- Prompt rules (IST, defaults like morning = 9:00, ask if there's no time): [prompts/agent.system.v1.md](../prompts/agent.system.v1.md)
- Validation: `create_reminder` / `reschedule_reminder` in [src/agent/tools/reminders.js](../src/agent/tools/reminders.js); IST helpers in [src/agent/time.js](../src/agent/time.js)
- Evals: `time` and `hinglish` suites incl. `hinglish-kal-shaam-5-baje`, `hinglish-kal-5-baje-ambiguous`, `past-time-recovery` in [evals/agent/cases.json](../evals/agent/cases.json)

## 4. "How would you evaluate it?"

**Say:** "I have an eval suite that runs the real model against fake tools.
The tools have the real names and schemas but record calls and return
fixtures, so I grade the model's decisions in isolation: which tool, which
arguments, what reply. Graders are deterministic (expected tools, argument
matchers like 'starts with 2026-11-06T17:00', forbidden tools, reply regex),
with no LLM-as-judge where a rule works. Suites cover core intents, relative
times, Hinglish, multi-step requests, follow-ups, clarification, Google, and
prompt injection. It runs in CI whenever the prompt, tools or model change,
and fails the PR if the pass rate drops more than 2 points below the baseline.
I unit-tested the grader itself, because a buggy grader inflates scores."

**Evidence:** [evals/run-agent-evals.js](../evals/run-agent-evals.js), [evals/agent/cases.json](../evals/agent/cases.json), [.github/workflows/evals.yml](../.github/workflows/evals.yml), [test/unit/evals.grader.test.js](../test/unit/evals.grader.test.js), [ADR-013](adr/ADR-013-evals-as-ci-gate.md)

**Growing it from real usage:** "Users opt in with `/improve`. Messages are
anonymised (emails, phones, URLs, IDs masked; known names become Person1,
Person2), and drafts go to a review queue. A person writes the correct
expectation before a case joins the suite, so current mistakes never become
'expected'." Evidence: [ADR-017](adr/ADR-017-eval-set-from-real-messages.md), [src/evals/](../src/evals/).

**Next step to mention:** groundedness checks for answers (every claim must cite a returned note).

**Honest status:** see `docs/METRICS.md`. If the pass rate is "—", say "the
harness and CI gate are built; I'm establishing the baseline."

## 5. "What are your cost and latency?"

**Say (only with measured numbers):** "p50/p95 latency per turn is X/Y ms,
about N input and M output tokens per turn, roughly $Z per turn, with a
prompt-cache hit rate of C%." These come from telemetry logged on every turn.

**How the numbers are produced:**
- Every agent turn logs tokens (incl. cache reads), cost in micro-USD, latency, model and tools: `agent.turn` events ([src/agent/index.js](../src/agent/index.js))
- `npm run metrics` prints p50/p95, tokens per turn, cache hit rate, cost per turn, failovers, tool error rate, active users ([scripts/report-metrics.js](../scripts/report-metrics.js), [src/interactions/metrics.js](../src/interactions/metrics.js))
- `npm run evals` prints latency p50/p95 and cost per case
- Prices: [src/llm/pricing.js](../src/llm/pricing.js)

**Cost levers you can explain:** prompt caching (static prompt and tools
first, time after the breakpoint), low effort for chat, a per-user daily token
budget that falls back to the free classifier, no LLM for exact commands,
free local embeddings (no embedding API), rule-based proactive relevance (no
LLM per nudge), a single process instead of a separate worker service.

## 6. "How does conversation context work?"

**Say:** "Three layers. Short-term: the last 10 messages from the past 24 hours
go to the model, so 'move it to Monday' knows what 'it' is, and a
`reschedule_reminder` tool performs the change. Pending state: confirmations,
numbered lists and approvals live in a `PendingAction` row with a TTL, so a
reply like '2' or tapping Approve maps to the right action. Long-term: hybrid
retrieval over saved notes injects the few most relevant notes into the
prompt, marked as data and not instructions."

**Evidence:** history in [src/agent/index.js](../src/agent/index.js) (`ConversationMessage`), [src/pending.js](../src/pending.js), [src/agent/approvals.js](../src/agent/approvals.js), [src/memory/](../src/memory/); evals `followup-move-to-monday`, `followup-make-it-5pm`.

## 7. "What was your biggest challenge?" (pick one, use problem → tried → worked → result)

| Story | Problem | What worked | Evidence |
|---|---|---|---|
| **Security audit of my own code** | Dashboard auth trusted a phone number; update routes had IDOR | Magic-link sessions; `{id, userId}`-scoped mutations; cross-user regression tests | ADR-006, `api.authorization.test.js` |
| **Duplicate webhook deliveries** | WhatsApp/Telegram retry webhooks → double notes | 200 immediately, dedupe by `channel:messageId`; reminders claimed with a conditional update so two instances can't double-send | `src/pipeline.js`, `src/scheduler.js` |
| **Reliable reminders** | A failed send retried forever (attempt counter reset) and retries were lost on restart | Durable pg-boss queue: exponential backoff, dead-letter, `exclusive` policy for one job per reminder. The integration test caught that `singletonKey` alone doesn't dedupe in pg-boss v10+ | `src/jobs/`, ADR-009 |
| **Relative dates in Hinglish** | "kal shaam 5 baje", past times, ambiguity | Model resolves against the given IST time, server validates, confirmation shows the absolute time, eval cases pin behaviour | `reminders.js`, `time` and `hinglish` evals |
| **Prompt injection** | Notes and emails can contain "ignore your instructions" | Tool results wrapped as data, external actions need a human tap, strict schemas, injection eval cases | ADR-010, `safety` evals |
| **A CI-caught bug** | My CSRF guard used `req.is()`, which returns null for bodiless DELETEs | Check the `Content-Type` header instead; regression test | commit `fix(auth)…` |

## 8. The Python angle

"If I rebuilt Orga in Python, I'd keep the architecture and swap the tools":

| Orga (Node) | Python equivalent |
|---|---|
| Express | FastAPI (async handlers) |
| Zod (+ `z.toJSONSchema` for tool schemas) | Pydantic models (`model_json_schema()`) |
| `Promise.all` (parallel tool calls) | `asyncio.gather` |
| Prisma + versioned migrations | SQLAlchemy 2.0 / asyncpg + Alembic |
| node-cron / pg-boss (durable queue) | APScheduler / Celery + Redis, or Procrastinate (Postgres-based) |
| LangGraph (JS) | LangGraph (Python): same concepts, `interrupt()`, `PostgresSaver` |
| pgvector via raw SQL | pgvector-python + SQLAlchemy |
| AsyncLocalStorage (traceId) | `contextvars` |
| Transformers.js (local embeddings) | sentence-transformers |
| `@anthropic-ai/sdk` | `anthropic` Python SDK |
| Vitest | pytest (+ pytest-asyncio) |
| ESLint + tsc type-checking | ruff + mypy/pyright |
| In-process event bus | blinker or a small observer class |

## 8b. "Can I try it?" (live demo)
**Say:** "Sure, here's an invite link." They open it, tap Accept, and chat in the
browser with no phone number needed. Follow [DEMO.md](DEMO.md). Point out that web chat
is a third channel adapter: adding it touched no agent, tool or handler code.
The invite redemption is a compare-and-set update, so a 2-use link can't
admit 3 people even when they click at the same moment (there's a test).

## 9. "What makes it different?"
**Say:** "Agents like Instinct act for you but are a black box. Orga logs every
event to an append-only log and builds an insights dashboard on it: who
you've gone quiet on, how reliably you act on reminders, when you're active,
and an audit trail of every AI action with its tools, model, latency and cost."
**Evidence:** [docs/modules/analytics.md](modules/analytics.md), [src/analytics/](../src/analytics/)

## 10. "What would you improve next?" (real roadmap, see [ROADMAP.md](ROADMAP.md))
- Voice notes → speech-to-text (Whisper via Groq's free tier); very common with Indian users
- Gmail commitment extraction → proactive "you promised X to Y"
- Shared circuit-breaker and rate-limit state (Postgres/Redis) for multiple instances; a separate worker process when job load grows
- MCP server so other AI clients can use Orga's tools (ADR-014)

## 11. Traps to avoid
- **Be precise about frameworks.** "LangGraph for orchestration and durable approvals; my own provider layer instead of LangChain model wrappers, for cost and caching control." Don't say you use "LangChain agents".
- **Never "the AI decides"** without saying where validation sits: Zod schemas, server-side scoping, time validation, approval gates, evals.
- **Numbers:** only from `npm run metrics` / `npm run evals` / `docs/METRICS.md`. Otherwise say "roughly" and explain how you'd measure.
- **Scale:** it's a personal project for friends and colleagues; talk about what changes at 1k or 100k users (shared rate-limit and circuit-breaker state, a separate worker process, partitioning the Interaction log, SSE instead of polling) rather than claiming you've run it at that scale.
