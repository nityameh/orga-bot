# ADR-013: Evals are a required CI gate for prompt, model and tool changes

**Status:** Accepted
**Date:** 2026-11-04
**Deciders:** Nitya

## Context
LLM behaviour changes when a prompt, model, tool description or retrieval step
changes. Unit tests cannot catch "the agent now forgets to set reminders in IST".
Most code will be AI-written, so regressions must be caught automatically.

## Decision
- `evals/` holds versioned datasets: input conversation, available fixtures,
  expected tool calls and/or a grading rubric.
- **Graders:** deterministic checks first (right tool, right arguments, valid
  datetime); LLM-as-judge with a written rubric only for free-text replies.
- **Suites:** core intents, multi-step, Hindi/Hinglish, time parsing,
  prompt-injection attacks, refusal of unapproved external actions, retrieval recall.
- CI runs the suite when files under `src/agent/`, `src/tools/`, `prompts/` or
  model config change. A merge is blocked if the pass rate drops more than
  2 points below `evals/baseline.json`.
- Results (pass rate, cost, latency) are committed as a report per run so
  progress is visible over time.

## Consequences
- Eval runs cost money; the CI suite is a sampled subset, full suite nightly.
- Prompts move out of code into `prompts/` as versioned files.

## Revisit When
Suite runtime passes 10 minutes.
