// @ts-check
// src/llm/anthropicProvider.js
// LLMProvider backed by Claude (Messages API) — the primary agent model.
//  - Prompt caching: tools + static system prompt form a stable, cached prefix;
//    per-request context (current time) goes after the breakpoint.
//  - Server-side refusal fallback ("default" routing): a policy decline is
//    retried on Anthropic's recommended fallback model inside the same call.
//  - Effort controls thinking depth/cost; thinking cannot be disabled on
//    current Opus, so callers must pass assistant content back unchanged.
// Docs: docs/modules/agent.md

const Anthropic = require('@anthropic-ai/sdk').default;
const { costMicros } = require('./pricing');

const MAX_TOKENS = 16000; // includes thinking; generous so short replies are never truncated

/**
 * @param {Object} cfg
 * @param {string} cfg.apiKey
 * @param {string} cfg.model
 * @param {'low' | 'medium' | 'high'} cfg.effort
 * @param {{ beta: { messages: { create: (params: any) => Promise<any> } } }} [cfg.client]  Injectable for tests
 * @returns {import('./types').LLMProvider}
 */
function createAnthropicProvider({ apiKey, model, effort, client }) {
  const anthropic = client ?? new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });

  return {
    name: 'anthropic',
    model,

    async complete({ system, dynamicSystem, messages, tools }) {
      /** @type {any[]} */
      const systemBlocks = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
      if (dynamicSystem) systemBlocks.push({ type: 'text', text: dynamicSystem });

      const response = await anthropic.beta.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort },
        system: systemBlocks,
        // Internal types mirror the Messages API shapes; cast at this boundary.
        tools: /** @type {any} */ (tools),
        messages: /** @type {any} */ (messages),
      });

      const usage = {
        tokensIn: response.usage?.input_tokens ?? 0,
        tokensOut: response.usage?.output_tokens ?? 0,
        cacheRead: response.usage?.cache_read_input_tokens ?? 0,
        cacheWrite: response.usage?.cache_creation_input_tokens ?? 0,
      };
      const answeredBy = response.model || model;

      return {
        content: response.content,
        stopReason: normaliseStop(response.stop_reason),
        model: answeredBy,
        usage,
        costMicros: costMicros(answeredBy, usage),
      };
    },
  };
}

/** @param {string | null | undefined} reason */
function normaliseStop(reason) {
  switch (reason) {
    case 'end_turn':
    case 'tool_use':
    case 'max_tokens':
    case 'refusal':
    case 'pause_turn':
      return reason;
    default:
      return 'other';
  }
}

module.exports = { createAnthropicProvider, normaliseStop };
