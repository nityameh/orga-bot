// @ts-check
// src/llm/groqProvider.js
// LLMProvider backed by Groq (OpenAI-compatible chat completions). Free tier,
// used for local development and evals when no Anthropic key is configured.
// Translates the internal Anthropic-shaped messages to OpenAI format and back.
// Docs: docs/modules/agent.md

const Groq = require('groq-sdk').default;
const { costMicros } = require('./pricing');

/**
 * Internal messages → OpenAI chat messages. Pure; exported for tests.
 * @param {string} system
 * @param {import('./types').Message[]} messages
 */
function toOpenAIMessages(system, messages) {
  /** @type {any[]} */
  const out = [{ role: 'system', content: system }];

  for (const m of messages) {
    if (typeof m.content === 'string') {
      out.push({ role: m.role, content: m.content });
      continue;
    }

    if (m.role === 'user') {
      const text = [];
      for (const block of m.content) {
        if (block.type === 'tool_result') {
          out.push({ role: 'tool', tool_call_id: block.tool_use_id, content: String(block.content) });
        } else if (block.type === 'text') {
          text.push(block.text);
        }
      }
      if (text.length) out.push({ role: 'user', content: text.join('\n') });
      continue;
    }

    // assistant: text blocks → content; tool_use blocks → tool_calls; others (thinking) dropped
    /** @type {any[]} */
    const blocks = m.content;
    const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    const toolCalls = blocks
      .filter((b) => b.type === 'tool_use')
      .map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
    out.push({ role: 'assistant', content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
  }
  return out;
}

/**
 * OpenAI response message → internal content blocks. Pure; exported for tests.
 * Unparseable tool arguments become `{ __invalid_json: raw }` so the agent can
 * return a validation error to the model instead of crashing.
 * @param {any} message
 * @returns {import('./types').ContentBlock[]}
 */
function fromOpenAIMessage(message) {
  /** @type {import('./types').ContentBlock[]} */
  const blocks = [];
  if (message?.content) blocks.push({ type: 'text', text: message.content });
  for (const call of message?.tool_calls ?? []) {
    let input;
    try {
      input = JSON.parse(call.function.arguments || '{}');
    } catch {
      input = { __invalid_json: call.function.arguments };
    }
    blocks.push({ type: 'tool_use', id: call.id, name: call.function.name, input });
  }
  return blocks;
}

/**
 * Extra request parameters per Groq model family. Reasoning models (gpt-oss)
 * spend completion tokens on hidden reasoning before answering; low effort keeps
 * chat replies fast and leaves room for the answer. Other models take none.
 * @param {string} model
 * @returns {Record<string, string>}
 */
function groqModelParams(model) {
  return model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {};
}

/**
 * Groq validates tool calls against the schema on its side and fails the whole
 * request (400 tool_use_failed) on e.g. `person: ""` vs minLength 1. Drop
 * `minLength` there: the tool registry still validates every call with Zod and
 * returns a fixable error to the model instead of failing the turn.
 * @param {any} schema
 * @returns {any}
 */
function relaxForServerValidation(schema) {
  if (Array.isArray(schema)) return schema.map(relaxForServerValidation);
  if (!schema || typeof schema !== 'object') return schema;
  return Object.fromEntries(Object.entries(schema)
    .filter(([key]) => key !== 'minLength')
    .map(([key, value]) => [key, relaxForServerValidation(value)]));
}

/** @param {string | null | undefined} reason */
function normaliseFinish(reason) {
  if (reason === 'tool_calls') return 'tool_use';
  if (reason === 'stop') return 'end_turn';
  if (reason === 'length') return 'max_tokens';
  return 'other';
}

/**
 * @param {Object} cfg
 * @param {string} cfg.apiKey
 * @param {string} cfg.model
 * @param {{ chat: { completions: { create: (params: any) => Promise<any> } } }} [cfg.client]
 * @returns {import('./types').LLMProvider}
 */
function createGroqProvider({ apiKey, model, client }) {
  const groq = client ?? new Groq({ apiKey, maxRetries: 2, timeout: 60_000 });

  return {
    name: 'groq',
    model,

    async complete({ system, dynamicSystem, messages, tools }) {
      const response = await groq.chat.completions.create(/** @type {any} */ ({
        model,
        ...groqModelParams(model),
        max_tokens: 4096, // includes reasoning tokens on reasoning models
        temperature: 0,
        messages: toOpenAIMessages(dynamicSystem ? `${system}\n\n${dynamicSystem}` : system, messages),
        tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: relaxForServerValidation(t.input_schema) } })),
        tool_choice: 'auto',
      }));

      const choice = response.choices?.[0];
      const usage = { tokensIn: response.usage?.prompt_tokens ?? 0, tokensOut: response.usage?.completion_tokens ?? 0 };
      const content = fromOpenAIMessage(choice?.message);
      const hasToolUse = content.some((b) => b.type === 'tool_use');

      return {
        content,
        stopReason: hasToolUse ? 'tool_use' : normaliseFinish(choice?.finish_reason),
        model,
        usage,
        costMicros: costMicros(model, usage),
      };
    },
  };
}

module.exports = { createGroqProvider, toOpenAIMessages, fromOpenAIMessage, normaliseFinish, groqModelParams, relaxForServerValidation };
