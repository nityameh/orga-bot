// @ts-check
// src/llm/fallbackProvider.js
// Resilience wrapper (Composite + Circuit Breaker) around several LLMProviders:
//   - each call has a hard timeout, so a slow provider can't stall the chat
//   - on error/timeout the next provider is tried (e.g. Claude → Groq)
//   - a provider that fails repeatedly is skipped for a cooldown ("circuit
//     open"), so users don't each wait for a timeout while it is down
// The agent loop sees a single LLMProvider and never knows a failover happened;
// the answering model is reported in the result (and in agent.turn telemetry).
// Docs: docs/modules/agent.md → Resilience

const { warn } = require('../logger');

class LLMTimeoutError extends Error {}
class AllProvidersFailedError extends Error {}

/**
 * @template T
 * @param {Promise<T>} promise @param {number} ms @param {string} name
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms, name) {
  /** @type {NodeJS.Timeout | undefined} */
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new LLMTimeoutError(`${name} timed out after ${ms} ms`)), ms);
  });
  return /** @type {Promise<T>} */ (Promise.race([promise, timeout])).finally(() => clearTimeout(timer));
}

/**
 * @param {import('./types').LLMProvider[]} providers  in priority order
 * @param {Object} [opts]
 * @param {number} [opts.timeoutMs]          per-call timeout (default 25 s)
 * @param {number} [opts.failureThreshold]   consecutive failures that open the circuit (default 3)
 * @param {number} [opts.cooldownMs]         how long an open circuit skips the provider (default 60 s)
 * @param {() => number} [opts.clock]
 * @returns {import('./types').LLMProvider & { health: () => Array<{ name: string, failures: number, open: boolean }> }}
 */
function createFallbackProvider(providers, { timeoutMs = 25_000, failureThreshold = 3, cooldownMs = 60_000, clock = Date.now } = {}) {
  if (!providers.length) throw new Error('createFallbackProvider needs at least one provider');
  const state = providers.map(() => ({ failures: 0, openUntil: 0 }));

  return {
    name: providers.map((p) => p.name).join('>'),
    model: providers[0].model,

    async complete(req) {
      /** @type {unknown[]} */
      const errors = [];
      const now = clock();
      // Try providers whose circuit is closed; if all are open, try them anyway
      // (better a slow answer than none).
      const order = providers.map((p, i) => i).filter((i) => state[i].openUntil <= now);
      const candidates = order.length ? order : providers.map((p, i) => i);

      for (const i of candidates) {
        const provider = providers[i];
        try {
          const result = await withTimeout(provider.complete(req), timeoutMs, provider.name);
          state[i].failures = 0;
          return result;
        } catch (err) {
          errors.push(err);
          state[i].failures += 1;
          if (state[i].failures >= failureThreshold) state[i].openUntil = clock() + cooldownMs;
          warn('llm.provider_failed', {
            provider: provider.name,
            err: /** @type {Error} */ (err).message,
            circuitOpen: state[i].openUntil > clock(),
          });
        }
      }
      const error = new AllProvidersFailedError(`All LLM providers failed: ${errors.map((e) => /** @type {Error} */ (e).message).join(' | ')}`);
      throw error;
    },

    health: () => providers.map((p, i) => ({ name: p.name, failures: state[i].failures, open: state[i].openUntil > clock() })),
  };
}

module.exports = { createFallbackProvider, withTimeout, LLMTimeoutError, AllProvidersFailedError };
