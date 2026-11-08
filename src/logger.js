// src/logger.js
// Structured JSON logger: one line per event, { ts, level, event, traceId, ...data }.
// traceId comes from the request context automatically (src/context.js).
// Message bodies are redacted: personal content belongs in the Interaction
// table (access-controlled), never in application logs.
// Docs: docs/modules/platform.md

const { getContext } = require('./context');

// Keys whose values are user content or secrets. Values are replaced by their length.
const REDACT_KEYS = new Set(['text', 'body', 'message', 'token', 'title', 'question', 'answer']);

function redact(data) {
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = REDACT_KEYS.has(key) && typeof value === 'string' ? `[redacted:${value.length}]` : value;
  }
  return out;
}

function emit(stream, level, event, data) {
  const ctx = getContext();
  stream(JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...(ctx?.traceId ? { traceId: ctx.traceId } : {}),
    ...redact(data),
  }));
}

const log = (event, data = {}) => emit(console.log, 'info', event, data);
const warn = (event, data = {}) => emit(console.warn, 'warn', event, data);
const error = (event, data = {}) => emit(console.error, 'error', event, data);

module.exports = { log, warn, error, redact };
