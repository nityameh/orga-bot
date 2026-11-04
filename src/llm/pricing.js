// @ts-check
// src/llm/pricing.js
// Per-model prices (USD per million tokens) → cost of a call in micro-USD.
// $/MTok is numerically equal to micro-USD per token, which keeps the math exact.
// Update when prices change; unknown models cost 0 and log a warning upstream.
// Docs: docs/modules/agent.md

/** @type {Record<string, {input: number, output: number, cacheRead: number, cacheWrite: number}>} */
const PRICES = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79, cacheRead: 0.59, cacheWrite: 0.59 },
};

/**
 * @typedef {Object} TokenUsage
 * @property {number} tokensIn       uncached input tokens
 * @property {number} tokensOut
 * @property {number} [cacheRead]
 * @property {number} [cacheWrite]
 */

/**
 * @param {string} model
 * @param {TokenUsage} usage
 * @returns {number | null} integer micro-USD, or null if the model has no price
 */
function costMicros(model, usage) {
  const p = PRICES[model];
  if (!p) return null;
  return Math.round(
    usage.tokensIn * p.input +
    usage.tokensOut * p.output +
    (usage.cacheRead ?? 0) * p.cacheRead +
    (usage.cacheWrite ?? 0) * p.cacheWrite,
  );
}

module.exports = { costMicros, PRICES };
