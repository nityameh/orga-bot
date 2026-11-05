// test/unit/resilience.metrics.test.js
// Fallback provider chain + circuit breaker, metrics aggregation, eval latency stats.

import { describe, it, expect, vi } from 'vitest';
const { createFallbackProvider, LLMTimeoutError, AllProvidersFailedError } = require('../../src/llm/fallbackProvider');
const { summarise, percentile } = require('../../src/interactions/metrics');
const { latencyStats } = require('../../evals/run-agent-evals');

const ok = (model) => ({ content: [{ type: 'text', text: 'hi' }], stopReason: 'end_turn', model, usage: { tokensIn: 1, tokensOut: 1 }, costMicros: 1 });
const req = { system: 's', messages: [], tools: [] };

function provider(name, impl) {
  return { name, model: `${name}-model`, complete: vi.fn(impl) };
}

describe('fallback provider chain', () => {
  it('uses the primary when it works', async () => {
    const a = provider('anthropic', async () => ok('claude'));
    const b = provider('groq', async () => ok('llama'));
    const chain = createFallbackProvider([a, b]);
    expect((await chain.complete(req)).model).toBe('claude');
    expect(b.complete).not.toHaveBeenCalled();
  });

  it('fails over to the next provider on error', async () => {
    const a = provider('anthropic', async () => { throw new Error('529 overloaded'); });
    const b = provider('groq', async () => ok('llama'));
    expect((await createFallbackProvider([a, b]).complete(req)).model).toBe('llama');
  });

  it('times out a slow provider and fails over', async () => {
    const a = provider('anthropic', () => new Promise(() => {})); // never resolves
    const b = provider('groq', async () => ok('llama'));
    const res = await createFallbackProvider([a, b], { timeoutMs: 20 }).complete(req);
    expect(res.model).toBe('llama');
  });

  it('opens the circuit after repeated failures and skips the provider during cooldown', async () => {
    let t = 0;
    const a = provider('anthropic', async () => { throw new Error('down'); });
    const b = provider('groq', async () => ok('llama'));
    const chain = createFallbackProvider([a, b], { failureThreshold: 2, cooldownMs: 1000, clock: () => t });
    await chain.complete(req);
    await chain.complete(req);
    expect(chain.health()[0]).toMatchObject({ failures: 2, open: true });
    await chain.complete(req);
    expect(a.complete).toHaveBeenCalledTimes(2); // skipped while open
    t = 2000;
    await chain.complete(req);
    expect(a.complete).toHaveBeenCalledTimes(3); // retried after cooldown (half-open)
  });

  it('resets the failure count after a success', async () => {
    let fail = true;
    const a = provider('anthropic', async () => { if (fail) throw new Error('blip'); return ok('claude'); });
    const chain = createFallbackProvider([a, provider('groq', async () => ok('llama'))], { failureThreshold: 2 });
    await chain.complete(req);
    fail = false;
    await chain.complete(req);
    expect(chain.health()[0]).toMatchObject({ failures: 0, open: false });
  });

  it('throws AllProvidersFailedError when everything fails (caller falls back / apologises)', async () => {
    const chain = createFallbackProvider([
      provider('anthropic', async () => { throw new Error('a'); }),
      provider('groq', () => new Promise(() => {})),
    ], { timeoutMs: 10 });
    const err = await chain.complete(req).catch((e) => e);
    expect(err).toBeInstanceOf(AllProvidersFailedError);
    expect(err.message).toMatch(/a \| groq timed out/);
    expect(LLMTimeoutError).toBeDefined();
  });
});

describe('metrics', () => {
  const at = new Date('2026-11-05T10:00:00Z');
  const turn = (latencyMs, extra = {}) => ({
    kind: 'agent.turn', userId: 'u1', tokensIn: 1000, tokensOut: 100, costMicros: 4000, createdAt: at,
    payload: { latencyMs, outcome: 'answered', model: 'claude-opus-5-5', cacheRead: 800, tools: [{ name: 'save_note', ok: true }] },
    ...extra,
  });

  it('computes latency percentiles, tokens, cost, cache hit rate and failovers', () => {
    const rows = [
      turn(1000), turn(2000), turn(3000),
      turn(9000, { payload: { latencyMs: 9000, outcome: 'answered', model: 'llama-3.3-70b-versatile', cacheRead: 0, tools: [{ name: 'create_reminder', ok: false }] } }),
      { kind: 'message.received', userId: 'u1', tokensIn: null, tokensOut: null, costMicros: null, payload: {}, createdAt: at },
      { kind: 'message.received', userId: 'u2', tokensIn: null, tokensOut: null, costMicros: null, payload: {}, createdAt: at },
      { kind: 'nudge.sent', userId: 'u1', tokensIn: null, tokensOut: null, costMicros: null, payload: { rule: 'morning_brief' }, createdAt: at },
    ];
    const m = summarise(rows, { primaryModel: 'claude-opus-5-5' });
    expect(m.agent.latencyMs).toEqual({ p50: 2000, p95: 9000 });
    expect(m.agent.avgTokensIn).toBe(1000);
    expect(m.agent.cacheHitRate).toBe(0.6); // 2400 / 4000
    expect(m.agent.costUSD.perTurn).toBeCloseTo(0.004);
    expect(m.agent.failovers).toBe(1);
    expect(m.agent.toolErrorRate).toBe(0.25);
    expect(m.users).toMatchObject({ active: 2, messages: 2 });
    expect(m.nudges.byRule).toEqual({ morning_brief: 1 });
  });

  it('reports nulls (not zeros) when nothing was measured', () => {
    const m = summarise([]);
    expect(m.agent.latencyMs).toEqual({ p50: null, p95: null });
    expect(m.agent.cacheHitRate).toBeNull();
    expect(percentile([], 50)).toBeNull();
  });

  it('eval latency stats use nearest rank', () => {
    expect(latencyStats([300, 100, 200, 400])).toEqual({ p50: 200, p95: 400 });
    expect(latencyStats([])).toEqual({ p50: 0, p95: 0 });
  });
});
