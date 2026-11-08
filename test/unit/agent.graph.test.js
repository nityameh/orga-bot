// test/unit/agent.graph.test.js
// LangGraph-specific behaviour: approvals pause the graph with interrupt(),
// state is checkpointed, and Command({ resume }) continues the SAME turn.

import { describe, it, expect, vi } from 'vitest';
const { z } = require('zod');
const { MemorySaver } = require('@langchain/langgraph');
const { runAgentTurn, resumeAgentTurn } = require('../../src/agent/agent');
const { createToolRegistry } = require('../../src/agent/toolRegistry');

const ctx = { user: { id: 'u1' }, now: new Date('2026-11-06T04:30:00Z') };
const toolUse = (id, name, input) => ({ type: 'tool_use', id, name, input });
const text = (t) => ({ type: 'text', text: t });

function scripted(script) {
  const requests = [];
  return {
    name: 'fake', model: 'fake-model', requests,
    async complete(req) {
      requests.push(JSON.parse(JSON.stringify(req)));
      const next = script.shift();
      if (!next) throw new Error('script exhausted');
      return { model: 'fake-model', usage: { tokensIn: 10, tokensOut: 5 }, costMicros: 3, ...next };
    },
  };
}

function setup(script) {
  const invite = vi.fn(async ({ email }) => ({ invited: email }));
  const note = vi.fn(async ({ title }) => ({ noteId: 'n1', title }));
  const tools = createToolRegistry([
    { name: 'invite', description: 'd', permission: 'external', inputSchema: z.strictObject({ email: z.string().email() }), describe: ({ email }) => `Invite ${email}`, execute: invite },
    { name: 'save_note', description: 'd', permission: 'write', inputSchema: z.strictObject({ title: z.string() }), execute: note },
  ]);
  const provider = scripted(script);
  const deps = { provider, tools, systemPrompt: 'SYS', checkpointer: new MemorySaver() };
  return { deps, provider, invite, note };
}

const step1 = { content: [text('I can invite them.'), toolUse('a', 'invite', { email: 'r@acme.com' }), toolUse('b', 'save_note', { title: 'Acme call' })], stopReason: 'tool_use' };

describe('approvals with LangGraph interrupt()', () => {
  it('pauses before running ANY tool in the step and asks for approval', async () => {
    const { deps, invite, note } = setup([step1]);
    const r = await runAgentTurn(deps, { ctx, history: [], text: 'invite ravi and note it', threadId: 't1' });
    expect(r.outcome).toBe('awaiting_approval');
    expect(r.pendingApproval).toEqual({ threadId: 't1', requests: [{ toolName: 'invite', input: { email: 'r@acme.com' }, summary: 'Invite r@acme.com' }] });
    expect(r.text).toMatch(/I can invite them\.\n\n• Invite r@acme\.com/);
    expect(invite).not.toHaveBeenCalled();
    expect(note).not.toHaveBeenCalled();
  });

  it('APPROVE resumes the same turn: tools run once and the model writes the reply', async () => {
    const { deps, provider, invite, note } = setup([step1, { content: [text('Done — invited Ravi and saved the note.')], stopReason: 'end_turn' }]);
    await runAgentTurn(deps, { ctx, history: [], text: 'invite ravi and note it', threadId: 't2' });
    const r = await resumeAgentTurn(deps, { threadId: 't2', decision: 'APPROVE', ctx });

    expect(r).toMatchObject({ outcome: 'answered', text: 'Done — invited Ravi and saved the note.' });
    expect(invite).toHaveBeenCalledTimes(1);
    expect(note).toHaveBeenCalledTimes(1); // not re-run when the node replays on resume
    expect(r.toolCalls).toEqual([{ name: 'invite', ok: true }, { name: 'save_note', ok: true }]);
    // The model saw the original conversation, restored from the checkpoint.
    expect(provider.requests[1].messages[0]).toEqual({ role: 'user', content: 'invite ravi and note it' });
  });

  it('REJECT never runs the external tool and tells the model the user declined', async () => {
    const { deps, provider, invite } = setup([step1, { content: [text('Okay, I won’t invite them.')], stopReason: 'end_turn' }]);
    await runAgentTurn(deps, { ctx, history: [], text: 'invite ravi', threadId: 't3' });
    const r = await resumeAgentTurn(deps, { threadId: 't3', decision: 'REJECT', ctx });

    expect(invite).not.toHaveBeenCalled();
    expect(r.outcome).toBe('answered');
    const declined = provider.requests[1].messages.at(-1).content.find((b) => b.tool_use_id === 'a');
    expect(declined).toMatchObject({ is_error: true });
    expect(declined.content).toMatch(/declined/);
  });

  it('reports usage per invocation (no double counting across the pause)', async () => {
    const { deps } = setup([step1, { content: [text('ok')], stopReason: 'end_turn', usage: { tokensIn: 100, tokensOut: 7 } }]);
    const first = await runAgentTurn(deps, { ctx, history: [], text: 'x', threadId: 't4' });
    const second = await resumeAgentTurn(deps, { threadId: 't4', decision: 'APPROVE', ctx });
    expect(first.usage.tokensIn).toBe(10);
    expect(second.usage).toMatchObject({ tokensIn: 100, tokensOut: 7 });
    expect(second.steps).toBe(1);
    expect(second.costMicros).toBe(3);
  });

  it('without a checkpointer, external tools fail closed (no pause, no execution)', async () => {
    const { deps, invite } = setup([step1, { content: [text('I need approval for that')], stopReason: 'end_turn' }]);
    const r = await runAgentTurn({ ...deps, checkpointer: undefined }, { ctx, history: [], text: 'x' });
    expect(r.outcome).toBe('answered');
    expect(invite).not.toHaveBeenCalled();
  });
});
