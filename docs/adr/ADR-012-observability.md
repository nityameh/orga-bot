# ADR-012: Observability with structured logs and OpenTelemetry traces

**Status:** Proposed
**Date:** 2026-11-04
**Deciders:** Nitya

## Context
An agent turn may call the LLM several times and run several tools. When a
reply is wrong or slow, we need to see every step, its latency, tokens and cost.
`src/logger.js` prints text logs only.

## Decision
- **Logs:** structured JSON (pino) with `traceId`, `userId` (hashed) and redaction.
- **Traces:** OpenTelemetry SDK; one trace per inbound message; spans for each
  LLM call and tool call, following the OpenTelemetry **GenAI semantic
  conventions** (`gen_ai.request.model`, `gen_ai.usage.input_tokens`, ...).
- **Export:** OTLP to a free-tier backend (Grafana Cloud or Langfuse), switchable
  by environment variable.
- **Errors:** Sentry (free tier) for exceptions with release tagging.
- **Product metrics:** cost and latency per turn also written to the Interaction
  log so the dashboard can show them (ADR-005).

## Consequences
- `traceId` links a chat message, its agent steps and its dashboard entry.
- Small runtime overhead; sampling can be enabled later.

## Revisit When
Trace volume exceeds the free tier.
