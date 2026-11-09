// test/unit/agent.test.js
// Agent loop (src/agent/agent.js) against a scripted fake provider, plus the
// tool registry, provider message translation, pricing and IST helpers.
// Deterministic: no network, no database.

import { describe, it, expect, vi } from 'vitest';
const { z } = require('zod');
const { runAgentTurn, asToolData } = require('../../src/agent/agent');
const { createToolRegistry, ToolInputError } = require('../../src/agent/toolRegistry');
const { toOpenAIMessages, fromOpenAIMessage, normaliseFinish, createGroqProvider, groqModelParams, relaxForServerValidation } = require('../../src/llm/groqProvider');
const { createAnthropicProvider, normaliseStop } = require('../../src/llm/anthropicProvider');
const { costMicros } = require('../../src/llm/pricing');
const { startOfDayIST, toISTISOString } = require('../../src/agent/time');

const ctx = { user: { id: 'u1' }, now: new Date('2026-11-05T08:00:00Z') };

/** Fake provider that replays a script of responses and records requests. */
function scriptedProvider(script) {
  const requests = [];
  return {
    name: 'fake',
    model: 'fake-model',
    requests,
    async complete(req) {
      requests.push(JSON.parse(JSON.stringify(req)));
      const next = script.shift();
      if (!next) throw new Error('script exhausted');
      if (next instanceof Error) throw next;
      return { model: 'fake-model', usage: { tokensIn: 10, tokensOut: 5 }, costMicros: 3, ...next };
    },
  };
}

const toolUse = (id, name, input) => ({ type: 'tool_use', id, name, input });
const text = (t) => ({ type: 'text', text: t });

function registry(overrides = {}) {
  return createToolRegistry([
    {
      name: 'save_note', description: 'save', permission: 'write',
      inputSchema: z.strictObject({ title: z.string().min(1) }),
      execute: overrides.save_note ?? (async ({ title }) => ({ noteId: 'n1', title })),
    },
    {
      name: 'get_today', description: 'today', permission: 'read',
      inputSchema: z.strictObject({}),
      execute: overrides.get_today ?? (async () => ({ remindersToday: [] })),
    },
    {
      name: 'send_email', description: 'email', permission: 'external',
      inputSchema: z.strictObject({ to: z.string() }),
      execute: vi.fn(),
    },
  ]);
}

const run = (provider, tools = registry(), extra = {}) =>
  runAgentTurn({ provider, tools, systemPrompt: 'SYS', ...extra.deps }, { ctx, history: [], text: 'hi', ...extra.turn });

describe('runAgentTurn', () => {
  it('returns the text answer when the model needs no tools', async () => {
    const p = scriptedProvider([{ content: [text('Hello!')], stopReason: 'end_turn' }]);
    const r = await run(p);
    expect(r).toMatchObject({ text: 'Hello!', outcome: 'answered', steps: 1, toolCalls: [] });
  });

  it('runs a tool, feeds back the result as data, and returns the final answer', async () => {
    const p = scriptedProvider([
      { content: [toolUse('t1', 'save_note', { title: 'Logo for Acme' })], stopReason: 'tool_use' },
      { content: [text('Saved *Logo for Acme*')], stopReason: 'end_turn' },
    ]);
    const r = await run(p);
    expect(r.outcome).toBe('answered');
    expect(r.toolCalls).toEqual([{ name: 'save_note', ok: true }]);
    const toolResultMsg = p.requests[1].messages.at(-1);
    expect(toolResultMsg.role).toBe('user');
    expect(toolResultMsg.content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 't1' });
    expect(toolResultMsg.content[0].content).toBe(asToolData({ noteId: 'n1', title: 'Logo for Acme' }));
  });

  it('returns all parallel tool results in a single user message', async () => {
    const p = scriptedProvider([
      { content: [toolUse('a', 'save_note', { title: 'x' }), toolUse('b', 'get_today', {})], stopReason: 'tool_use' },
      { content: [text('ok')], stopReason: 'end_turn' },
    ]);
    await run(p);
    const results = p.requests[1].messages.at(-1).content;
    expect(results.map((b) => b.tool_use_id)).toEqual(['a', 'b']);
  });

  it('passes assistant content back unchanged (including thinking blocks)', async () => {
    const thinking = { type: 'thinking', thinking: '', signature: 'sig' };
    const p = scriptedProvider([
      { content: [thinking, toolUse('t1', 'get_today', {})], stopReason: 'tool_use' },
      { content: [text('done')], stopReason: 'end_turn' },
    ]);
    await run(p);
    expect(p.requests[1].messages[1]).toEqual({ role: 'assistant', content: [thinking, toolUse('t1', 'get_today', {})] });
  });

  it('reports invalid arguments to the model as an error result so it can retry', async () => {
    const p = scriptedProvider([
      { content: [toolUse('t1', 'save_note', { title: '' })], stopReason: 'tool_use' },
      { content: [toolUse('t2', 'save_note', { title: 'fixed' })], stopReason: 'tool_use' },
      { content: [text('Saved')], stopReason: 'end_turn' },
    ]);
    const r = await run(p);
    const firstResult = p.requests[1].messages.at(-1).content[0];
    expect(firstResult.is_error).toBe(true);
    expect(firstResult.content).toMatch(/Invalid arguments — title/);
    expect(r.toolCalls.map((t) => t.ok)).toEqual([false, true]);
  });

  it('turns unknown tools and ToolInputErrors into error results', async () => {
    const tools = registry({ save_note: async () => { throw new ToolInputError('time is in the past'); } });
    const p = scriptedProvider([
      { content: [toolUse('a', 'nope', {}), toolUse('b', 'save_note', { title: 'x' })], stopReason: 'tool_use' },
      { content: [text('sorry')], stopReason: 'end_turn' },
    ]);
    await run(p, tools);
    const [a, b] = p.requests[1].messages.at(-1).content;
    expect(a).toMatchObject({ is_error: true, content: 'Unknown tool "nope".' });
    expect(b).toMatchObject({ is_error: true, content: 'time is in the past' });
  });

  it('a crashing tool becomes an error result instead of failing the turn', async () => {
    const tools = registry({ get_today: async () => { throw new Error('db down'); } });
    const p = scriptedProvider([
      { content: [toolUse('a', 'get_today', {})], stopReason: 'tool_use' },
      { content: [text('I could not check your day')], stopReason: 'end_turn' },
    ]);
    const r = await run(p, tools);
    expect(r.outcome).toBe('answered');
    expect(p.requests[1].messages.at(-1).content[0]).toMatchObject({ is_error: true, content: 'Internal error while running this tool.' });
  });

  it('never executes external-effect tools without approval (fails closed)', async () => {
    const tools = registry();
    const p = scriptedProvider([
      { content: [toolUse('a', 'send_email', { to: 'x@y.z' })], stopReason: 'tool_use' },
      { content: [text('I need your approval')], stopReason: 'end_turn' },
    ]);
    await run(p, tools);
    expect(tools.get('send_email').execute).not.toHaveBeenCalled();
    expect(p.requests[1].messages.at(-1).content[0].is_error).toBe(true);
  });

  it('stops after maxSteps with a helpful message', async () => {
    const loop = () => ({ content: [toolUse(String(Math.random()), 'get_today', {})], stopReason: 'tool_use' });
    const p = scriptedProvider([loop(), loop(), loop()]);
    const r = await run(p, registry(), { deps: { maxSteps: 3 } });
    expect(r).toMatchObject({ outcome: 'max_steps', steps: 3 });
    expect(r.text).toMatch(/more steps/);
  });

  it('stops on wall-clock timeout before calling the model again', async () => {
    let t = 0;
    const p = scriptedProvider([{ content: [toolUse('a', 'get_today', {})], stopReason: 'tool_use' }]);
    const r = await run(p, registry(), { deps: { timeoutMs: 100 }, turn: { clock: () => (t += 80) } });
    expect(r.outcome).toBe('timeout');
    expect(p.requests).toHaveLength(1);
  });

  it('handles refusals without exposing internals', async () => {
    const r = await run(scriptedProvider([{ content: [], stopReason: 'refusal' }]));
    expect(r).toMatchObject({ outcome: 'refused', text: "Sorry, I can't help with that one." });
  });

  it('reports truncation when max_tokens leaves no text', async () => {
    const r = await run(scriptedProvider([{ content: [], stopReason: 'max_tokens' }]));
    expect(r.outcome).toBe('truncated');
  });

  it('accumulates usage and cost across steps and records the answering model', async () => {
    const p = scriptedProvider([
      { content: [toolUse('a', 'get_today', {})], stopReason: 'tool_use', usage: { tokensIn: 100, tokensOut: 20, cacheRead: 900 } },
      { content: [text('ok')], stopReason: 'end_turn', usage: { tokensIn: 50, tokensOut: 10 }, model: 'fallback-model' },
    ]);
    const r = await run(p);
    expect(r.usage).toEqual({ tokensIn: 150, tokensOut: 30, cacheRead: 900, cacheWrite: 0 });
    expect(r.costMicros).toBe(6);
    expect(r.model).toBe('fallback-model');
  });

  it('marks provider errors with how many tools already ran (for safe fallback)', async () => {
    const p = scriptedProvider([
      { content: [toolUse('a', 'save_note', { title: 'x' })], stopReason: 'tool_use' },
      new Error('overloaded'),
    ]);
    await expect(run(p)).rejects.toMatchObject({ message: 'overloaded', toolCallsMade: 1 });
  });

  it('sends history before the new message and keeps the system prompt static', async () => {
    const p = scriptedProvider([{ content: [text('ok')], stopReason: 'end_turn' }]);
    await run(p, registry(), { turn: { history: [{ role: 'user', content: 'earlier' }, { role: 'assistant', content: 'reply' }], text: 'now', dynamicSystem: 'time' } });
    expect(p.requests[0].messages.map((m) => m.content)).toEqual(['earlier', 'reply', 'now']);
    expect(p.requests[0]).toMatchObject({ system: 'SYS', dynamicSystem: 'time' });
  });
});

describe('tool registry', () => {
  it('exposes JSON-schema definitions in stable name order, with defaults optional', () => {
    const r = createToolRegistry([
      { name: 'z_tool', description: 'z', permission: 'read', inputSchema: z.strictObject({ n: z.number().default(1) }), execute: async () => ({}) },
      { name: 'a_tool', description: 'a', permission: 'read', inputSchema: z.strictObject({ q: z.string() }), execute: async () => ({}) },
    ]);
    expect(r.definitions.map((d) => d.name)).toEqual(['a_tool', 'z_tool']);
    expect(r.definitions[0].input_schema).toMatchObject({ type: 'object', required: ['q'], additionalProperties: false });
    expect(r.definitions[1].input_schema.required ?? []).not.toContain('n');
    expect(r.definitions[0].input_schema.$schema).toBeUndefined();
  });

  it('rejects duplicate tool names', () => {
    const t = { name: 'x', description: '', permission: 'read', inputSchema: z.strictObject({}), execute: async () => ({}) };
    expect(() => createToolRegistry([t, t])).toThrow(/Duplicate/);
  });

  it('rejects unexpected extra arguments (strict objects)', async () => {
    const r = registry();
    expect(await r.execute('save_note', { title: 'x', userId: 'someone-else' }, ctx)).toMatchObject({ ok: false });
  });

  it('treats an empty string as an omitted optional field, but not as a valid required one', async () => {
    const r = createToolRegistry([{
      name: 'search', description: 's', permission: 'read',
      inputSchema: z.strictObject({ query: z.string().min(1), person: z.string().min(1).optional() }),
      execute: async (input) => input,
    }]);
    expect(await r.execute('search', { query: 'contract', person: '' }, ctx)).toEqual({ ok: true, result: { query: 'contract' } });
    expect(await r.execute('search', { query: '' }, ctx)).toMatchObject({ ok: false });
  });
});

describe('dynamic context calendar', () => {
  const { upcomingDays } = require('../../src/agent/prompt');
  it('lists today, tomorrow and the following days with IST weekdays', () => {
    // Thu 5 Nov 2026, 23:30 IST (18:00 UTC): still Thursday in India.
    const days = upcomingDays(new Date('2026-11-05T18:00:00Z')).split(' · ');
    expect(days).toHaveLength(8);
    expect(days[0]).toBe('today Thu 2026-11-05');
    expect(days[1]).toBe('tomorrow Fri 2026-11-06');
    expect(days[4]).toBe('Mon 2026-11-09');
  });

  it('rolls over at IST midnight, not UTC midnight', () => {
    // 00:30 IST on Fri 6 Nov = 19:00 UTC on Thu 5 Nov.
    expect(upcomingDays(new Date('2026-11-05T19:00:00Z')).startsWith('today Fri 2026-11-06')).toBe(true);
  });
});

describe('Groq schema relaxing', () => {
  it('drops minLength at any depth and keeps everything else', () => {
    const schema = { type: 'object', properties: { p: { type: 'string', minLength: 1, maxLength: 60 }, tags: { type: 'array', items: { type: 'string', minLength: 2 } } }, required: ['p'] };
    expect(relaxForServerValidation(schema)).toEqual({ type: 'object', properties: { p: { type: 'string', maxLength: 60 }, tags: { type: 'array', items: { type: 'string' } } }, required: ['p'] });
  });
});

describe('Groq message translation', () => {
  it('maps internal messages to OpenAI format, dropping thinking blocks', () => {
    const out = toOpenAIMessages('SYS', [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: [{ type: 'thinking', thinking: '' }, text('let me check'), toolUse('c1', 'get_today', {})] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: '{"a":1}' }] },
    ]);
    expect(out).toEqual([
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'let me check', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_today', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: '{"a":1}' },
    ]);
  });

  it('maps responses back, surviving malformed tool arguments', () => {
    expect(fromOpenAIMessage({ content: 'hey', tool_calls: [{ id: 'c', function: { name: 'x', arguments: '{bad' } }] })).toEqual([
      text('hey'), toolUse('c', 'x', { __invalid_json: '{bad' }),
    ]);
    expect(normaliseFinish('tool_calls')).toBe('tool_use');
    expect(normaliseFinish('length')).toBe('max_tokens');
  });
});

describe('Groq provider', () => {
  it('sends tools as functions with the dynamic context appended, and maps the reply back', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: 'c1', function: { name: 'get_today', arguments: '{}' } }] } }],
      usage: { prompt_tokens: 1000, completion_tokens: 100 },
    });
    const p = createGroqProvider({ apiKey: 'k', model: 'openai/gpt-oss-120b', client: { chat: { completions: { create } } } });
    const res = await p.complete({ system: 'S', dynamicSystem: 'now', messages: [{ role: 'user', content: 'hi' }], tools: [{ name: 'get_today', description: 'd', input_schema: { type: 'object' } }] });

    const params = create.mock.calls[0][0];
    expect(params.messages[0]).toEqual({ role: 'system', content: 'S\n\nnow' });
    expect(params.tools).toEqual([{ type: 'function', function: { name: 'get_today', description: 'd', parameters: { type: 'object' } } }]);
    expect(params.reasoning_effort).toBe('low'); // reasoning model: keep it fast
    expect(res).toMatchObject({ stopReason: 'tool_use', content: [toolUse('c1', 'get_today', {})], usage: { tokensIn: 1000, tokensOut: 100 } });
    expect(res.costMicros).toBe(Math.round(1000 * 0.15 + 100 * 0.75));
  });

  it('sends reasoning parameters only to reasoning models', () => {
    expect(groqModelParams('openai/gpt-oss-20b')).toEqual({ reasoning_effort: 'low' });
    expect(groqModelParams('qwen/qwen3.8-27b')).toEqual({});
  });

  it('treats a plain answer as end_turn', async () => {
    const create = vi.fn().mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: 'hello' } }], usage: {} });
    const p = createGroqProvider({ apiKey: 'k', model: 'm', client: { chat: { completions: { create } } } });
    expect(await p.complete({ system: 'S', messages: [], tools: [] })).toMatchObject({ stopReason: 'end_turn', content: [text('hello')], costMicros: null });
  });
});

describe('Anthropic provider', () => {
  it('sends a cached static system block, dynamic context after it, effort and refusal fallback', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [text('hi')], stop_reason: 'end_turn', model: 'claude-opus-5-5',
      usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0 },
    });
    const p = createAnthropicProvider({ apiKey: 'k', model: 'claude-opus-5-5', effort: 'low', client: { beta: { messages: { create } } } });
    const res = await p.complete({ system: 'STATIC', dynamicSystem: 'now', messages: [{ role: 'user', content: 'hi' }], tools: [] });

    const params = create.mock.calls[0][0];
    expect(params.system).toEqual([{ type: 'text', text: 'STATIC', cache_control: { type: 'ephemeral' } }, { type: 'text', text: 'now' }]);
    expect(params).toMatchObject({ output_config: { effort: 'low' }, fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] });
    expect(params.tool_choice).toBeUndefined(); // forced tool choice is rejected on current models
    expect(res.usage).toEqual({ tokensIn: 100, tokensOut: 10, cacheRead: 2000, cacheWrite: 0 });
    expect(res.costMicros).toBe(100 * 4 + 10 * 20 + 2000 * 0.2);
  });

  it('normalises stop reasons', () => {
    expect(normaliseStop('refusal')).toBe('refusal');
    expect(normaliseStop('stop_sequence')).toBe('other');
  });
});

describe('pricing and time helpers', () => {
  it('computes micro-USD cost and returns null for unknown models', () => {
    expect(costMicros('claude-haiku-5-5', { tokensIn: 1000, tokensOut: 1000 })).toBe(600);
    expect(costMicros('mystery', { tokensIn: 1, tokensOut: 1 })).toBeNull();
  });

  it('computes the IST day start and IST ISO strings', () => {
    // 2026-11-05 01:00 IST is 2026-11-04 19:30 UTC → IST day starts 2026-11-04 18:30 UTC
    expect(startOfDayIST(new Date('2026-11-04T19:30:00Z')).toISOString()).toBe('2026-11-04T18:30:00.000Z');
    expect(toISTISOString(new Date('2026-11-05T03:30:00Z'))).toBe('2026-11-05T09:00:00+05:30');
  });
});
