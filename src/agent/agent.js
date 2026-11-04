// @ts-check
// src/agent/agent.js
// The agent loop (ADR-004): send the conversation and tool definitions to the
// model; run any tool calls it makes; feed results back; repeat until it
// answers in text or a budget is hit. Provider- and storage-agnostic, so it is
// unit-tested with a scripted fake provider.
// Docs: docs/modules/agent.md

const { error } = require('../logger');

/**
 * @typedef {Object} AgentDeps
 * @property {import('../llm/types').LLMProvider} provider
 * @property {import('./toolRegistry').ToolRegistry} tools
 * @property {string} systemPrompt
 * @property {number} [maxSteps]     Model calls per turn (default 6)
 * @property {number} [timeoutMs]    Wall-clock budget per turn (default 45s)
 */

/**
 * @typedef {Object} AgentTurnResult
 * @property {string} text                 Reply to send to the user
 * @property {'answered' | 'refused' | 'max_steps' | 'timeout' | 'truncated'} outcome
 * @property {number} steps                Model calls made
 * @property {Array<{ name: string, ok: boolean, error?: string }>} toolCalls
 * @property {{ tokensIn: number, tokensOut: number, cacheRead: number, cacheWrite: number }} usage
 * @property {number} costMicros
 * @property {string} model                Model that produced the final answer
 */

const FALLBACK_TEXT = {
  refused: "Sorry, I can't help with that one.",
  max_steps: "That took more steps than I'm allowed. Could you break it into smaller requests?",
  timeout: 'That took too long on my side. Please try again.',
  truncated: 'Sorry, my reply got cut off. Could you ask again?',
};

/**
 * Wrap a tool result for the model. Results contain user data (notes, titles)
 * that may include text resembling instructions; marking them as data is the
 * "spotlighting" defence against prompt injection (ADR-010).
 * @param {unknown} value
 */
function asToolData(value) {
  return `<tool_data>\n${JSON.stringify(value)}\n</tool_data>`;
}

/** @param {import('../llm/types').ContentBlock[]} content */
function textOf(content) {
  return content
    .filter((b) => b.type === 'text')
    .map((b) => /** @type {any} */ (b).text)
    .join('\n')
    .trim();
}

/**
 * Run one user turn.
 * @param {AgentDeps} deps
 * @param {Object} turn
 * @param {import('./toolRegistry').ToolContext} turn.ctx
 * @param {import('../llm/types').Message[]} turn.history   Earlier turns (plain text)
 * @param {string} turn.text                                 The user's new message
 * @param {string} [turn.dynamicSystem]
 * @param {() => number} [turn.clock]                        Injectable for tests
 * @returns {Promise<AgentTurnResult>}
 */
async function runAgentTurn(deps, { ctx, history, text, dynamicSystem, clock = Date.now }) {
  const { provider, tools, systemPrompt, maxSteps = 6, timeoutMs = 45_000 } = deps;
  const startedAt = clock();

  /** @type {import('../llm/types').Message[]} */
  const messages = [...history, { role: 'user', content: text }];
  /** @type {AgentTurnResult['toolCalls']} */
  const toolCalls = [];
  const usage = { tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0 };
  let costMicros = 0;
  let model = provider.model;

  /** @param {AgentTurnResult['outcome']} outcome @param {string} reply @param {number} steps */
  const finish = (outcome, reply, steps) => ({ text: reply, outcome, steps, toolCalls, usage, costMicros, model });

  for (let step = 1; step <= maxSteps; step++) {
    if (clock() - startedAt > timeoutMs) return finish('timeout', FALLBACK_TEXT.timeout, step - 1);

    let res;
    try {
      res = await provider.complete({ system: systemPrompt, dynamicSystem, messages, tools: tools.definitions });
    } catch (err) {
      // Tell the caller whether side effects already happened, so it knows if
      // retrying on another path could duplicate them.
      /** @type {any} */ (err).toolCallsMade = toolCalls.filter((t) => t.ok).length;
      throw err;
    }
    model = res.model;
    usage.tokensIn += res.usage.tokensIn;
    usage.tokensOut += res.usage.tokensOut;
    usage.cacheRead += res.usage.cacheRead ?? 0;
    usage.cacheWrite += res.usage.cacheWrite ?? 0;
    costMicros += res.costMicros ?? 0;

    if (res.stopReason === 'refusal') return finish('refused', FALLBACK_TEXT.refused, step);

    // Append the assistant turn exactly as returned (thinking blocks included):
    // the API requires them unchanged when the conversation continues.
    messages.push({ role: 'assistant', content: res.content });

    const toolUses = /** @type {import('../llm/types').ToolUseBlock[]} */ (res.content.filter((b) => b.type === 'tool_use'));

    if (res.stopReason === 'pause_turn') continue;

    if (toolUses.length === 0) {
      const reply = textOf(res.content);
      if (res.stopReason === 'max_tokens' && !reply) return finish('truncated', FALLBACK_TEXT.truncated, step);
      return finish('answered', reply || 'Done.', step);
    }

    // Run all calls of this step concurrently; return every result in ONE user
    // message (splitting them discourages parallel tool use).
    const results = await Promise.all(toolUses.map(async (use) => {
      let outcome;
      try {
        outcome = await tools.execute(use.name, use.input, ctx);
      } catch (err) {
        // A bug in one tool must not lose the whole turn: report it to the model as a failed call.
        error('agent.tool_crashed', { tool: use.name, err: /** @type {Error} */ (err).message });
        outcome = { ok: /** @type {const} */ (false), error: 'Internal error while running this tool.' };
      }
      toolCalls.push(outcome.ok ? { name: use.name, ok: true } : { name: use.name, ok: false, error: outcome.error });
      return outcome.ok
        ? { type: 'tool_result', tool_use_id: use.id, content: asToolData(outcome.result) }
        : { type: 'tool_result', tool_use_id: use.id, content: outcome.error, is_error: true };
    }));
    messages.push({ role: 'user', content: /** @type {any} */ (results) });
  }

  return finish('max_steps', FALLBACK_TEXT.max_steps, maxSteps);
}

module.exports = { runAgentTurn, asToolData, textOf };
