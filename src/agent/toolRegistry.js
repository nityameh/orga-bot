// @ts-check
// src/agent/toolRegistry.js
// Registry of agent tools (Registry + Command patterns, ADR-004). Each tool is a
// self-contained module; adding one never changes the agent loop.
// The registry also owns input validation: model-produced arguments are
// untrusted and are parsed with the tool's Zod schema before execute() runs.
// Docs: docs/modules/agent.md

const { z } = require('zod');

/**
 * Permission tiers (ADR-010):
 *   read      — reads the user's own data; runs automatically
 *   write     — changes the user's own data; runs automatically, recorded in the Interaction log
 *   external  — affects the outside world (send email, invite people); requires user approval
 * @typedef {'read' | 'write' | 'external'} Permission
 */

/**
 * @typedef {Object} ToolContext
 * @property {{ id: string }} user
 * @property {Date} now
 * @property {(req: { toolName: string, input: unknown, summary: string }) => void} [requestApproval]
 *   Provided by the composition root; absent → external tools fail closed
 */

/**
 * @template {z.ZodType} S
 * @typedef {Object} Tool
 * @property {string} name
 * @property {string} description   Written for the model: what it does, when to use it, what it returns
 * @property {S} inputSchema
 * @property {Permission} permission
 * @property {(input: z.infer<S>, ctx: ToolContext) => Promise<unknown>} execute
 * @property {(input: z.infer<S>) => string} [describe]  External tools: one-line summary shown on the approval prompt
 */

/**
 * Thrown by tools for expected, user-correctable problems (e.g. "time is in the
 * past"). The message is shown to the model so it can fix its call or explain.
 */
class ToolInputError extends Error {}

/** @param {Tool<any>[]} tools */
function createToolRegistry(tools) {
  /** @type {Map<string, Tool<any>>} */
  const byName = new Map();
  for (const tool of tools) {
    if (byName.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`);
    byName.set(tool.name, tool);
  }

  /** Tool definitions in the provider format, in a stable order (stable prompt-cache prefix). */
  const definitions = [...byName.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => {
      const { $schema: _ignored, ...schema } = /** @type {any} */ (z.toJSONSchema(t.inputSchema, { io: 'input' })); // input shape: defaulted fields stay optional
      return { name: t.name, description: t.description, input_schema: schema };
    });

  /**
   * Validate and run a tool call. Never throws for model mistakes; returns
   * `{ ok: false, error }` so the model can recover.
   * @param {string} name
   * @param {unknown} rawInput
   * @param {ToolContext} ctx
   * @returns {Promise<{ ok: true, result: unknown } | { ok: false, error: string, needsApproval?: boolean }>}
   */
  /**
   * Models often "omit" an optional field by sending "" (e.g. person: "").
   * Treat a top-level empty string as absent, so optional fields stay optional
   * and required ones still fail validation with a clear message.
   * @param {unknown} input
   */
  function dropEmptyStrings(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
    return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== ''));
  }

  /** @param {string} name @param {unknown} rawInput */
  function validate(name, rawInput) {
    const tool = byName.get(name);
    if (!tool) return /** @type {const} */ ({ error: `Unknown tool "${name}".` });
    const parsed = tool.inputSchema.safeParse(dropEmptyStrings(rawInput));
    if (!parsed.success) {
      const issues = parsed.error.issues.map((/** @type {any} */ i) => `${i.path.join('.') || '(input)'}: ${i.message}`).join('; ');
      return /** @type {const} */ ({ error: `Invalid arguments — ${issues}` });
    }
    return { tool, input: parsed.data };
  }

  /** @param {Tool<any>} tool @param {unknown} input @param {ToolContext} ctx */
  async function run(tool, input, ctx) {
    try {
      return /** @type {const} */ ({ ok: true, result: await tool.execute(input, ctx) });
    } catch (err) {
      if (err instanceof ToolInputError) return /** @type {const} */ ({ ok: false, error: err.message });
      throw err; // unexpected failures are bugs: let the caller log and surface them
    }
  }

  /** @param {string} name @param {unknown} rawInput @param {ToolContext} ctx */
  async function execute(name, rawInput, ctx) {
    const v = validate(name, rawInput);
    if ('error' in v) return { ok: false, error: /** @type {string} */ (v.error) };

    if (v.tool.permission === 'external') {
      // External effects never run inside the agent loop. They are parked for
      // the user's explicit approval; without an approval channel, fail closed.
      if (!ctx.requestApproval) return { ok: false, error: "This action needs the user's approval, which isn't available here.", needsApproval: true };
      const summary = v.tool.describe ? v.tool.describe(v.input) : name;
      ctx.requestApproval({ toolName: name, input: v.input, summary });
      return { ok: true, result: { status: 'awaiting_user_approval', action: summary, instruction: 'Not done yet. Tell the user what will happen and that they need to tap Approve.' } };
    }

    return run(v.tool, v.input, ctx);
  }

  /**
   * Run an external tool after the user approved it. Re-validates the stored
   * input (defence in depth) and bypasses the approval gate.
   * @param {string} name @param {unknown} rawInput @param {ToolContext} ctx
   * @returns {Promise<{ ok: true, result: unknown } | { ok: false, error: string }>}
   */
  async function executeApproved(name, rawInput, ctx) {
    const v = validate(name, rawInput);
    if ('error' in v) return { ok: false, error: /** @type {string} */ (v.error) };
    return run(v.tool, v.input, ctx);
  }

  return { definitions, validate, execute, executeApproved, has: (/** @type {string} */ name) => byName.has(name), get: (/** @type {string} */ name) => byName.get(name) };
}

/** @typedef {ReturnType<typeof createToolRegistry>} ToolRegistry */

module.exports = { createToolRegistry, ToolInputError };
