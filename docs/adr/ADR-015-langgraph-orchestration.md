# ADR-015: LangGraph for agent orchestration; keep our own LLM provider layer

**Status:** Accepted
**Date:** 2026-11-06
**Deciders:** Nitya
**Amends:** [ADR-004](ADR-004-agent-loop-and-llm-providers.md) (the hand-written loop becomes a LangGraph graph)

## Context
The Phase 2 agent was a hand-written `while` loop. It worked and was fully
tested, but two needs pointed at a graph runtime with persistence:
1. **Durable human-in-the-loop.** Approvals were parked as rows and executed
   outside the agent, so the agent couldn't write a reply about the result, and
   a paused turn's context was lost.
2. **Multi-step workflows** (Gmail commitment extraction, proactive pipelines)
   that are naturally graphs of steps with branching and retries.

LangChain/LangGraph are also common in industry job descriptions.

## Decision
- The agent is a **LangGraph `StateGraph`**: `callModel` → (tool calls?) →
  `runTools` → `callModel` …, with typed state channels (messages, tool calls,
  usage, cost, steps, outcome).
- External-effect tools call **`interrupt()`** *before* any tool in that step
  runs. The state is saved by a **Postgres checkpointer** (separate `langgraph`
  schema), and the user's tap resumes the same turn via `Command({ resume })`.
  The agent then performs or skips the action and writes the reply.
- **Keep our `LLMProvider` layer** as the model-call node instead of LangChain
  chat-model wrappers: it does exact per-call cost accounting, Anthropic prompt
  caching with a static/dynamic split, server-side refusal fallback, and the
  fallback chain with circuit breaker. Wrapping these in LangChain abstractions
  would hide the details the analytics depend on.
- Same public functions (`runAgentTurn`, new `resumeAgentTurn`), so the 26
  existing agent tests verified the migration unchanged.

## Options Considered
| Option | Pros | Cons |
|---|---|---|
| LangGraph graph + our providers (chosen) | Durable interrupts/checkpoints; graph for future workflows; keeps cost/caching control | Two layers to understand; LangGraph version churn |
| Full LangChain (`createReactAgent` + ChatAnthropic/ChatGroq) | Least code | Loses exact cost/caching control; harder to unit test with our fakes |
| Keep the hand-written loop | Simplest, already tested | Rebuild persistence/interrupts ourselves for each workflow |

## Consequences
- Approvals now survive restarts (checkpoint in Postgres) and the reply reflects the outcome.
- Node names must not collide with state channels (`callModel`, `runTools`).
- Nodes re-execute from the top on resume, so side effects must come after `interrupt()`. This is enforced in `runTools` and covered by tests.
- Finished turns delete their checkpoint thread; abandoned approvals expire after 30 min.

## Revisit When
LangGraph's JS API makes a breaking change, or a workflow needs LangGraph features we've skipped (streaming, subgraphs).
