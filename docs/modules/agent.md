# Module: agent (LLM agent loop, tools, providers, evals)

> **Path:** `src/agent/`, `src/llm/`, `prompts/`, `evals/`  ·  **Status:** Stable (Phase 2)
> **Related ADRs:** [ADR-004](../adr/ADR-004-agent-loop-and-llm-providers.md), [ADR-010](../adr/ADR-010-security-baseline-third-party-data.md), [ADR-013](../adr/ADR-013-evals-as-ci-gate.md)

## Summary (read this first)
When a message isn't a fixed command, Orga hands it to an AI agent. The agent
reads the conversation, decides which **tools** to use (save a note, set a
reminder, search notes, …), runs them, looks at the results, and writes a
short reply. It can do several things from one message ("save this and remind
me Monday"). Every turn's tokens, cost, tools and outcome are recorded, and an
**eval suite** checks the agent still behaves correctly whenever its prompt,
tools or model change.

## Where it sits in the pipeline
```
message ─► routeCommand (exact commands, confirmations — no LLM)
        ─► agent (if a provider is configured and the user is under today's token budget)
        ─► legacy classifier + intent switch (fallback)
```
If the model API fails **before** any tool ran, the legacy path handles the
message. If a tool already ran, the error is surfaced instead, because
re-running on another path could save a note twice.

## Files
| File | What it contains |
|---|---|
| `src/agent/agent.js` | `runAgentTurn()`: the loop. Pure: provider and tools are injected |
| `src/agent/toolRegistry.js` | `createToolRegistry()`: JSON-schema definitions, Zod validation, permission gate; `ToolInputError` |
| `src/agent/tools/notes.js` | `save_note`, `search_notes` |
| `src/agent/tools/tasks.js` | `create_task_list`, `list_tasks`, `complete_task_item` |
| `src/agent/tools/reminders.js` | `create_reminder`, `list_reminders`, `cancel_reminder`, `get_today` |
| `src/agent/prompt.js` | Loads `prompts/agent.system.v1.md`; builds the per-request context (time, name, channel) |
| `src/agent/time.js` | IST helpers |
| `src/agent/index.js` | Composition root: provider selection, conversation memory, daily budget, `agent.turn` events |
| `src/llm/types.js` | `LLMProvider` port and message/content-block types |
| `src/llm/anthropicProvider.js` | Claude: prompt caching, effort, server-side refusal fallback |
| `src/llm/groqProvider.js` | Groq (OpenAI-compatible) with message translation; free dev/eval option |
| `src/llm/pricing.js` | $/MTok table → `costMicros()` |
| `prompts/agent.system.v1.md` | The system prompt (versioned; front matter documents purpose and changelog) |
| `evals/agent/cases.json`, `evals/run-agent-evals.js` | Eval dataset and runner |

## How the loop works
```
messages = history (last 10 turns, 24h) + new user message
repeat up to AGENT_MAX_STEPS (6) and 45 s:
  response = provider.complete(static system [cached] + dynamic context, messages, tool definitions)
  refusal            → "Sorry, I can't help with that one."
  append assistant content UNCHANGED (thinking blocks must round-trip)
  no tool calls      → reply with the text
  run all tool calls concurrently → ONE user message containing every tool_result
     invalid args / unknown tool / ToolInputError → is_error result (model can retry)
     tool crashed    → is_error "Internal error" (turn continues; crash logged)
     external tool   → refused until the approval flow exists (fails closed)
```

## Design decisions
| Decision | Why |
|---|---|
| Own loop instead of a framework or the SDK tool runner | Provider-agnostic (Claude + Groq), full control over budgets, error semantics and fallback; the loop is ~100 lines and fully unit-tested |
| Tools return **data**; the model writes the reply | Handlers mixed DB writes with reply text. Tools stay reusable (dashboard, MCP server in ADR-014) |
| Tool results wrapped in `<tool_data>` + prompt rule "data, never instructions" | Prompt-injection defence for stored notes and, later, emails (ADR-010); covered by `safety` evals |
| Static system prompt first with `cache_control`, time in a separate block | Byte-identical prefix → prompt-cache hits (cheaper, faster). Tools are sorted by name for the same reason |
| `tool_choice` left as `auto` | Forced tool choice is rejected by current Claude models; steering lives in the prompt |
| Default model `claude-opus-5-5` at `effort: low` | Strongest tool use; low effort keeps chat fast and cheap. Configurable via `AGENT_MODEL`/`AGENT_EFFORT` |
| Server-side refusal fallback (`fallbacks: "default"`) | A policy decline is retried on the recommended fallback model in the same call |
| Per-user daily token budget (`AGENT_DAILY_TOKEN_BUDGET`) | Friends can't run up the bill; over budget → free legacy classifier |
| Handlers kept as the fallback path | *Strangler fig* migration: the old path stays until the agent proves itself in evals and usage |

## Adding a tool
1. Create it in `src/agent/tools/<area>.js`: `{ name, description, permission, inputSchema (z.strictObject), execute(input, { user, now }) }`.
   Scope every query by `user.id`; throw `ToolInputError` for user-correctable problems; `emit()` a domain event for writes.
2. Register it in `src/agent/index.js`.
3. Add eval cases to `evals/agent/cases.json` and an integration test in `test/integration/agent.tools.test.js`.

The loop, providers and pipeline need no changes (Open/Closed Principle).

## Configuration
`ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `AGENT_PROVIDER` (`auto|anthropic|groq|off`),
`AGENT_MODEL`, `AGENT_EFFORT` (`low|medium|high`), `AGENT_MAX_STEPS`,
`AGENT_DAILY_TOKEN_BUDGET`. See `.env.example`.

## Evals
```bash
npm run evals                         # full suite on the configured provider
npm run evals -- --suite safety       # one suite
npm run evals -- --update-baseline    # record the current pass rate in evals/baseline.json
```
- Real model, **fake tools**: real names/descriptions/schemas, but `execute` records
  the call and returns a fixture. This grades the model's *decisions* in isolation.
- Deterministic graders: expected tools, argument matchers (`startsWith` for
  times, `includesAll` for tags), forbidden tools, reply regexes.
- Suites: `core`, `time`, `hinglish`, `multi`, `query`, `clarify`, `chitchat`, `safety` (prompt injection).
- CI (`.github/workflows/evals.yml`) runs on PRs touching the agent, providers,
  prompts or evals; fails on a drop of more than 2 points vs the baseline.
- The grader itself is unit-tested (`test/unit/evals.grader.test.js`).

## Observability
Each turn emits an `agent.turn` Interaction with tokens (incl. cache), cost in
micro-USD, steps, tools (with errors), model that answered, prompt version and
latency, all under the message's `traceId`.

## Edge Cases
| Situation | Behaviour |
|---|---|
| No API key | Agent disabled at boot (`agent.disabled` log); legacy path |
| User over daily budget | Legacy path for the rest of the IST day |
| Model loops on tools | Stops after `AGENT_MAX_STEPS` with a "break it into smaller requests" reply |
| Model invents a past time | `create_reminder` rejects it with the current time; model corrects or asks |
| Model passes another user's id | Every query is scoped by the session user, so the result is "not found" |

## Testing
`test/unit/agent.test.js` (loop, registry, translation, provider params, pricing),
`test/integration/agent.tools.test.js` (tools on Postgres incl. cross-user),
`test/unit/evals.grader.test.js`, and the eval suite itself.
