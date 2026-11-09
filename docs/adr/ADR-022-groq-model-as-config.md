# ADR-022: Groq model comes from config; default `openai/gpt-oss-120b`

**Status:** Accepted
**Date:** 2026-11-10
**Deciders:** Nitya
**Amends:** [ADR-004](ADR-004-agent-loop-and-llm-providers.md) (default Groq model)

## Context
On 2026-11-10 an eval run failed every case with `404 model_not_found`: Groq had
retired `llama-3.3-70b-versatile`. That model name was hardcoded in four places
(agent default, classifier, two note Q&A paths). In production, every agent call
had been failing and Orga had been silently falling back to the keyword
classifier. CLAUDE.md §0.4 already says "no hardcoded ids, models or URLs"; this
was a violation that turned a provider change into an outage.

Models available on the free key that day included `openai/gpt-oss-120b`,
`openai/gpt-oss-20b` and `qwen/qwen3.8-27b`.

## Decision
- New config `GROQ_MODEL` (default `openai/gpt-oss-120b`), used by the agent
  (unless `AGENT_MODEL` overrides it), the legacy classifier and note Q&A.
- `groqModelParams(model)` adds `reasoning_effort: 'low'` for gpt-oss (a reasoning
  model). Token limits are raised (agent 4096, classifier/Q&A 1024) because
  reasoning tokens count toward the completion limit.
- `gpt-oss-120b`: open-weight (Apache-2.0), strong at tool use, 131k context, on Groq's free tier.
- `GROQ_FALLBACK_MODELS` (default `openai/gpt-oss-20b`): extra Groq models in the
  fallback chain. The free tier allows **200k tokens per day per model** (measured
  2026-11-10; one agent turn uses ~3k, so ~65 turns/day). Limits are per model, so
  each fallback model adds its own daily allowance; after that, the keyword classifier.
- Evals should use a **separate Groq account/key** from production: one full eval
  run (39 cases) uses most of a model's daily allowance.

## Consequences
- Swapping models is a config change (`GROQ_MODEL=…` + redeploy), not a code change.
- Slightly higher latency than Llama 3.3 because of reasoning; low effort keeps it small.
- The eval baseline is keyed by provider/model, so this model gets its own baseline.
- Follow-up: alert when the agent's fallback rate spikes, so a retired model
  shows up as an alert instead of silent degradation (ADR-012 observability).

## Alternatives
| Option | Why not |
|---|---|
| `qwen/qwen3.8-27b` | Smaller; kept as a documented fallback via `GROQ_MODEL` |
| `openai/gpt-oss-20b` | Faster but weaker at multi-tool turns |
| Only Anthropic | Paid; project prefers free options (Anthropic stays an optional upgrade) |
