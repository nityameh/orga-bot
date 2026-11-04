// @ts-check
// src/llm/types.js
// The LLMProvider port (Strategy pattern, ADR-004). Messages and content blocks
// use the Anthropic Messages shape as the internal lingua franca; other
// providers translate to and from it inside their adapter.
// Docs: docs/modules/agent.md

/**
 * @typedef {{ type: 'text', text: string }} TextBlock
 * @typedef {{ type: 'tool_use', id: string, name: string, input: any }} ToolUseBlock
 * @typedef {{ type: 'tool_result', tool_use_id: string, content: string, is_error?: boolean }} ToolResultBlock
 * @typedef {TextBlock | ToolUseBlock | ToolResultBlock | { type: string, [k: string]: any }} ContentBlock
 *   Other block types (e.g. thinking) are opaque and must be passed back unchanged.
 */

/**
 * @typedef {Object} Message
 * @property {'user' | 'assistant'} role
 * @property {string | ContentBlock[]} content
 */

/**
 * @typedef {Object} ToolDefinition
 * @property {string} name
 * @property {string} description
 * @property {object} input_schema  JSON Schema
 */

/**
 * @typedef {Object} CompletionRequest
 * @property {string} system          Static instructions (cacheable: identical on every call)
 * @property {string} [dynamicSystem] Per-request context such as the current time (after the cache breakpoint)
 * @property {Message[]} messages
 * @property {ToolDefinition[]} tools
 */

/**
 * @typedef {Object} CompletionResult
 * @property {ContentBlock[]} content
 * @property {'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'pause_turn' | 'other'} stopReason
 * @property {string} model           Model that actually answered (may differ after a fallback)
 * @property {import('./pricing').TokenUsage} usage
 * @property {number | null} costMicros
 */

/**
 * @typedef {Object} LLMProvider
 * @property {string} name
 * @property {string} model
 * @property {(req: CompletionRequest) => Promise<CompletionResult>} complete
 */

module.exports = {};
