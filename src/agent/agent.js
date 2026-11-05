// @ts-check
// src/agent/agent.js
// The agent as a LangGraph state graph (ADR-004, ADR-015):
//
//   START → callModel ──(tool calls?)──► runTools ──► callModel … ──(answer / budget)──► END
//                                      │
//                                      └─ external tool → interrupt() → [user taps Approve/Cancel]
//                                                          → Command({ resume }) → same turn continues
//
// - `model` calls our LLMProvider (fallback chain, caching, cost tracking stay ours).
// - `tools` validates and runs tool calls concurrently; results go back as ONE message.
// - With a checkpointer, external-effect tools pause the graph with interrupt();
//   the paused state is persisted, so approval survives restarts and the agent
//   writes its reply after the action. Without one, external tools fail closed.
// Provider, tools and checkpointer are injected, so it is unit-tested with fakes.
// Docs: docs/modules/agent.md

const { StateGraph, Annotation, START, END, interrupt, Command } = require('@langchain/langgraph');
const { error } = require('../logger');

/**
 * @typedef {Object} AgentDeps
 * @property {import('../llm/types').LLMProvider} provider
 * @property {import('./toolRegistry').ToolRegistry} tools
 * @property {string} systemPrompt
 * @property {number} [maxSteps]     Model calls per turn (default 6)
 * @property {number} [timeoutMs]    Wall-clock budget per invocation (default 45s)
 * @property {import('@langchain/langgraph').BaseCheckpointSaver} [checkpointer]  enables approvals via interrupt()
 */

/**
 * @typedef {Object} ApprovalRequest
 * @property {string} toolName
 * @property {unknown} input      validated input
 * @property {string} summary     human-readable action
 */

/**
 * @typedef {Object} AgentTurnResult
 * @property {string} text
 * @property {'answered' | 'refused' | 'max_steps' | 'timeout' | 'truncated' | 'awaiting_approval'} outcome
 * @property {number} steps
 * @property {Array<{ name: string, ok: boolean, error?: string }>} toolCalls
 * @property {{ tokensIn: number, tokensOut: number, cacheRead: number, cacheWrite: number }} usage
 * @property {number} costMicros
 * @property {string} model
 * @property {{ threadId: string, requests: ApprovalRequest[] }} [pendingApproval]
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

/** @type {(a: any[], b: any[]) => any[]} */
const concat = (a, b) => a.concat(b);
/** @typedef {{ tokensIn: number, tokensOut: number, cacheRead: number, cacheWrite: number }} Usage */
/** @type {(a: Usage, b: Usage) => Usage} */
const addUsage = (a, b) => ({ tokensIn: a.tokensIn + b.tokensIn, tokensOut: a.tokensOut + b.tokensOut, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite });
const sum = (/** @type {number} */ a, /** @type {number} */ b) => a + b;
const last = (/** @type {any} */ _a, /** @type {any} */ b) => b;
const ZERO_USAGE = () => ({ tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0 });

/** Graph state. Reducers say how each node's partial update merges in. */
const AgentState = Annotation.Root({
  messages: Annotation({ reducer: concat, default: () => [] }),
  toolCalls: Annotation({ reducer: concat, default: () => [] }),
  usage: Annotation({ reducer: addUsage, default: ZERO_USAGE }),
  costMicros: Annotation({ reducer: sum, default: () => 0 }),
  steps: Annotation({ reducer: sum, default: () => 0 }),
  model: Annotation({ reducer: last, default: () => '' }),
  outcome: Annotation({ reducer: last, default: () => /** @type {string | null} */ (null) }),
  text: Annotation({ reducer: last, default: () => '' }),
});

/**
 * Build the compiled graph for these dependencies.
 * Per-invocation values (user, time, deadline, dynamic prompt) arrive through
 * `config.configurable`, so one compiled graph serves every user.
 * @param {AgentDeps} deps
 */
function buildAgentGraph({ provider, tools, systemPrompt, maxSteps = 6, checkpointer }) {
  /** @param {any} state @param {any} config */
  async function modelNode(state, config) {
    const { deadline, clock, dynamicSystem } = config.configurable;
    if (state.steps >= maxSteps) return { outcome: 'max_steps', text: FALLBACK_TEXT.max_steps };
    if (clock() > deadline) return { outcome: 'timeout', text: FALLBACK_TEXT.timeout };

    let res;
    try {
      res = await provider.complete({ system: systemPrompt, dynamicSystem, messages: state.messages, tools: tools.definitions });
    } catch (err) {
      // Tell the caller whether side effects already happened, so it knows if
      // retrying on another path could duplicate them.
      /** @type {any} */ (err).toolCallsMade = state.toolCalls.filter((/** @type {any} */ t) => t.ok).length;
      throw err;
    }

    const update = {
      steps: 1,
      model: res.model,
      costMicros: res.costMicros ?? 0,
      usage: { tokensIn: res.usage.tokensIn, tokensOut: res.usage.tokensOut, cacheRead: res.usage.cacheRead ?? 0, cacheWrite: res.usage.cacheWrite ?? 0 },
    };
    if (res.stopReason === 'refusal') return { ...update, outcome: 'refused', text: FALLBACK_TEXT.refused };

    // Assistant content goes back exactly as returned (thinking blocks included).
    const messages = [{ role: 'assistant', content: res.content }];
    const hasToolUse = res.content.some((b) => b.type === 'tool_use');
    if (res.stopReason === 'pause_turn' || hasToolUse) return { ...update, messages };

    const reply = textOf(res.content);
    if (res.stopReason === 'max_tokens' && !reply) return { ...update, messages, outcome: 'truncated', text: FALLBACK_TEXT.truncated };
    return { ...update, messages, outcome: 'answered', text: reply || 'Done.' };
  }

  /** @param {any} state @param {any} config */
  async function toolsNode(state, config) {
    const { ctx, approvals } = config.configurable;
    const lastMessage = state.messages[state.messages.length - 1];
    /** @type {import('../llm/types').ToolUseBlock[]} */
    const uses = lastMessage.content.filter((/** @type {any} */ b) => b.type === 'tool_use');

    // External-effect calls: ask the human BEFORE running anything in this node,
    // because LangGraph re-executes the node from the top on resume.
    /** @type {Map<string, ApprovalRequest>} */
    const external = new Map();
    if (approvals) {
      for (const use of uses) {
        const v = tools.validate(use.name, use.input);
        if (!('error' in v) && v.tool.permission === 'external') {
          external.set(use.id, { toolName: use.name, input: v.input, summary: v.tool.describe ? v.tool.describe(v.input) : use.name });
        }
      }
    }
    /** @type {'APPROVE' | 'REJECT' | null} */
    const decision = external.size ? interrupt({ approvals: [...external.values()] }) : null;

    const results = await Promise.all(uses.map(async (use) => {
      let outcome;
      try {
        if (external.has(use.id)) {
          outcome = decision === 'APPROVE'
            ? await tools.executeApproved(use.name, use.input, ctx)
            : { ok: /** @type {const} */ (false), error: 'The user declined this action. Do not retry it; acknowledge briefly.' };
        } else {
          outcome = await tools.execute(use.name, use.input, ctx);
        }
      } catch (err) {
        // A bug in one tool must not lose the whole turn: report it as a failed call.
        error('agent.tool_crashed', { tool: use.name, err: /** @type {Error} */ (err).message });
        outcome = { ok: /** @type {const} */ (false), error: 'Internal error while running this tool.' };
      }
      return {
        call: outcome.ok ? { name: use.name, ok: true } : { name: use.name, ok: false, error: outcome.error },
        block: outcome.ok
          ? { type: 'tool_result', tool_use_id: use.id, content: asToolData(outcome.result) }
          : { type: 'tool_result', tool_use_id: use.id, content: outcome.error, is_error: true },
      };
    }));

    // Every result of this step in ONE user message (splitting discourages parallel tool use).
    return { toolCalls: results.map((r) => r.call), messages: [{ role: 'user', content: results.map((r) => r.block) }] };
  }

  return new StateGraph(AgentState)
    .addNode('callModel', modelNode)
    .addNode('runTools', toolsNode)
    .addEdge(START, 'callModel')
    .addConditionalEdges('callModel', (/** @type {any} */ s) => (s.outcome ? END : (s.messages.at(-1)?.content.some((/** @type {any} */ b) => b.type === 'tool_use') ? 'runTools' : 'callModel')), ['runTools', 'callModel', END])
    .addEdge('runTools', 'callModel')
    .compile(checkpointer ? { checkpointer } : {});
}

/**
 * Turn a graph result into an AgentTurnResult. `before` holds totals that were
 * already reported (when resuming), so telemetry counts each token once.
 * @param {any} state @param {string} fallbackModel @param {string} threadId
 * @param {{ usage: any, costMicros: number, steps: number, toolCalls: number }} [before]
 * @returns {AgentTurnResult}
 */
function toResult(state, fallbackModel, threadId, before) {
  const b = before ?? { usage: ZERO_USAGE(), costMicros: 0, steps: 0, toolCalls: 0 };
  const base = {
    steps: state.steps - b.steps,
    toolCalls: state.toolCalls.slice(b.toolCalls),
    usage: {
      tokensIn: state.usage.tokensIn - b.usage.tokensIn,
      tokensOut: state.usage.tokensOut - b.usage.tokensOut,
      cacheRead: state.usage.cacheRead - b.usage.cacheRead,
      cacheWrite: state.usage.cacheWrite - b.usage.cacheWrite,
    },
    costMicros: state.costMicros - b.costMicros,
    model: state.model || fallbackModel,
  };

  const interrupted = state.__interrupt__?.[0]?.value;
  if (interrupted) {
    /** @type {ApprovalRequest[]} */
    const requests = interrupted.approvals;
    const said = textOf(state.messages.at(-1)?.content ?? []);
    const text = [said || 'Before I do this, please confirm:', '', ...requests.map((r) => `• ${r.summary}`)].join('\n');
    return { ...base, outcome: 'awaiting_approval', text, pendingApproval: { threadId, requests } };
  }
  return { ...base, outcome: state.outcome ?? 'answered', text: state.text || 'Done.' };
}

/**
 * Run one user turn.
 * @param {AgentDeps} deps
 * @param {Object} turn
 * @param {import('./toolRegistry').ToolContext} turn.ctx
 * @param {import('../llm/types').Message[]} turn.history   Earlier turns (plain text)
 * @param {string} turn.text                                 The user's new message
 * @param {string} [turn.dynamicSystem]
 * @param {string} [turn.threadId]                           Checkpoint thread (required for approvals)
 * @param {() => number} [turn.clock]
 * @returns {Promise<AgentTurnResult>}
 */
async function runAgentTurn(deps, { ctx, history, text, dynamicSystem, threadId = 'ephemeral', clock = Date.now }) {
  const graph = buildAgentGraph(deps);
  const config = {
    recursionLimit: (deps.maxSteps ?? 6) * 3 + 5,
    configurable: {
      thread_id: threadId,
      ctx,
      dynamicSystem,
      clock,
      deadline: clock() + (deps.timeoutMs ?? 45_000),
      approvals: Boolean(deps.checkpointer),
    },
  };
  const state = await graph.invoke({ messages: [...history, { role: 'user', content: text }] }, config);
  return toResult(state, deps.provider.model, threadId);
}

/**
 * Continue a turn that paused for approval. The graph resumes inside the tools
 * node with the user's decision and then lets the model write the reply.
 * @param {AgentDeps} deps
 * @param {{ threadId: string, decision: 'APPROVE' | 'REJECT', ctx: import('./toolRegistry').ToolContext, dynamicSystem?: string, clock?: () => number }} args
 * @returns {Promise<AgentTurnResult>}
 */
async function resumeAgentTurn(deps, { threadId, decision, ctx, dynamicSystem, clock = Date.now }) {
  if (!deps.checkpointer) throw new Error('resumeAgentTurn requires a checkpointer');
  const graph = buildAgentGraph(deps);
  const config = {
    recursionLimit: (deps.maxSteps ?? 6) * 3 + 5,
    configurable: { thread_id: threadId, ctx, dynamicSystem, clock, deadline: clock() + (deps.timeoutMs ?? 45_000), approvals: true },
  };
  const prior = (await graph.getState(config)).values;
  const before = { usage: prior.usage ?? ZERO_USAGE(), costMicros: prior.costMicros ?? 0, steps: prior.steps ?? 0, toolCalls: (prior.toolCalls ?? []).length };
  const state = await graph.invoke(new Command({ resume: decision }), config);
  return toResult(state, deps.provider.model, threadId, before);
}

module.exports = { runAgentTurn, resumeAgentTurn, buildAgentGraph, asToolData, textOf };
