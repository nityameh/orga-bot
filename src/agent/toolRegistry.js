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
 */

/**
 * @template {z.ZodType} S
 * @typedef {Object} Tool
 * @property {string} name
 * @property {string} description   Written for the model: what it does, when to use it, what it returns
 * @property {S} inputSchema
 * @property {Permission} permission
 * @property {(input: z.infer<S>, ctx: ToolContext) => Promise<unknown>} execute
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
  async function execute(name, rawInput, ctx) {
    const tool = byName.get(name);
    if (!tool) return { ok: false, error: `Unknown tool "${name}".` };

    const parsed = tool.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((/** @type {any} */ i) => `${i.path.join('.') || '(input)'}: ${i.message}`).join('; ');
      return { ok: false, error: `Invalid arguments — ${issues}` };
    }

    if (tool.permission === 'external') {
      // Approval flow arrives with the first external tool (Phase 3). Until then
      // the gate fails closed: external effects never run without a human.
      return { ok: false, error: 'This action needs the user\'s approval, which is not available yet.', needsApproval: true };
    }

    try {
      return { ok: true, result: await tool.execute(parsed.data, ctx) };
    } catch (err) {
      if (err instanceof ToolInputError) return { ok: false, error: err.message };
      throw err; // unexpected failures are bugs: let the agent log and surface them
    }
  }

  return { definitions, execute, has: (/** @type {string} */ name) => byName.has(name), get: (/** @type {string} */ name) => byName.get(name) };
}

/** @typedef {ReturnType<typeof createToolRegistry>} ToolRegistry */

module.exports = { createToolRegistry, ToolInputError };
