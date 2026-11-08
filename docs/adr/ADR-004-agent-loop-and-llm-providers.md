# ADR-004: Replace the one-shot classifier with a tool-use agent loop

**Status:** Accepted (amended 2026-11-05 at implementation, see below)
**Date:** 2026-11-04
**Deciders:** Nitya

## Context
`src/classifier.js` maps a message to one intent (NOTE, TASK, ...) and a router
calls one handler. That cannot handle multi-step requests ("check my calendar
and remind me 30 min before the Acme call") or use external data.

## Decision
1. **Agent loop:** the model receives the conversation plus tool schemas, calls
   tools, sees results, and repeats until it produces a final reply
   (max N steps, time budget, token budget).
2. **Tool Registry (Registry + Command patterns):** each tool is one module
   exporting `{ name, description, inputSchema (Zod), permission, execute }`.
   Adding a tool never edits the loop (Open/Closed).
3. **Permission tiers** on every tool: `read` (auto), `write-own-data` (auto),
   `external-effect` (send email, create calendar invite → needs user approval).
4. **LLMProvider interface (Strategy pattern):** `ClaudeProvider` for agent turns,
   `GroqProvider` (existing) for cheap extraction and as a fallback.
   Model ids live in config, never in code.
5. Existing handlers (note, task, reminder, query, delete) become the first tools.

## Options Considered
| Option | Pros | Cons |
|---|---|---|
| Native tool-use loop (chosen) | Industry standard; full control; teaches fundamentals | We own retries, budgets, tracing |
| Agent framework (LangGraph, etc.) | Faster start | Hides the concepts this project should demonstrate; heavier deps |
| Keep classifier + more intents | Cheap | Doesn't scale to multi-step or integrations |

## Consequences
- Higher cost per message → per-user daily token budget (enforced in the loop).
- Classifier eval suite is replaced by agent evals (ADR-013).
- Keyword fallback stays as the last resort when all providers fail.

## Amendment (2026-11-05, Phase 2 implementation)
- **Model:** default `claude-opus-5-5` at `effort: low` (not Sonnet). Current guidance
  is to default to the strongest model and trade cost with effort, not model
  tier; low effort keeps chat latency and cost down. Override with `AGENT_MODEL`.
- **No forced `tool_choice`:** current Claude models reject `any`/`tool`; tool use is steered by the prompt.
- **Thinking blocks round-trip:** thinking can't be disabled on the default model, so the
  loop appends assistant content unchanged within a turn. Cross-turn history is stored as plain text.
- **Refusal fallback:** requests opt into server-side `fallbacks: "default"`.
- **Strangler-fig migration:** handlers + classifier remain as the fallback path; commands
  that need no LLM go through a deterministic fast path (`routeCommand`).
- **Approval gate:** implemented as fail-closed for `external` tools; the interactive
  approval flow ships with the first external tool (Phase 3).

## Revisit When
Tool count passes ~30 (consider tool search / routing), or cost per active user
exceeds the budget in `docs/architecture/HLD.md`.
