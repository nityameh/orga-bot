// test/unit/memory.proactive.test.js
// Ranking maths for hybrid retrieval, and the proactive engine's guards.

import { describe, it, expect, vi } from 'vitest';
const { dot, topK, reciprocalRankFusion } = require('../../src/memory/ranking');
const { createProactiveEngine, isQuietHours, istDayStart } = require('../../src/proactive/engine');

describe('ranking', () => {
  it('dot product of normalised vectors is cosine similarity', () => {
    expect(dot([1, 0], [1, 0])).toBe(1);
    expect(dot([1, 0], [0, 1])).toBe(0);
  });

  it('topK sorts by similarity and drops weak matches', () => {
    const items = [{ id: 'a', vector: [1, 0] }, { id: 'b', vector: [0.8, 0.6] }, { id: 'c', vector: [0, 1] }];
    expect(topK([1, 0], items, 5).map((x) => x.id)).toEqual(['a', 'b']);
    expect(topK([1, 0], items, 1).map((x) => x.id)).toEqual(['a']);
  });

  it('RRF rewards documents ranked well by both retrievers', () => {
    const fused = reciprocalRankFusion([['x', 'y', 'z'], ['y', 'w']]);
    expect(fused[0].id).toBe('y'); // 2nd + 1st beats 1st alone
    expect(fused.map((f) => f.id)).toEqual(expect.arrayContaining(['x', 'y', 'z', 'w']));
    expect(fused[0].score).toBeCloseTo(1 / 62 + 1 / 61);
  });

  it('RRF handles empty lists', () => {
    expect(reciprocalRankFusion([[], []])).toEqual([]);
    expect(reciprocalRankFusion([['a'], []]).map((f) => f.id)).toEqual(['a']);
  });
});

describe('proactive engine', () => {
  // 2026-11-05 10:00 IST = 04:30 UTC (not quiet); 23:00 IST = 17:30 UTC (quiet)
  const day = new Date('2026-11-05T04:30:00Z');
  const night = new Date('2026-11-05T17:30:00Z');

  function setup({ sent = 0, dup = false, notifyOk = true } = {}) {
    const store = { countSentSince: vi.fn().mockResolvedValue(sent), wasSent: vi.fn().mockResolvedValue(dup) };
    const notify = vi.fn().mockResolvedValue(notifyOk);
    const onSent = vi.fn();
    const engine = createProactiveEngine({ store, notify, onSent, dailyLimit: 3 });
    const candidate = (user = { id: 'u1', proactive: true }) => ({ user, message: { text: 'hi' }, reason: 'r', dedupeKey: 'k' });
    const rule = (cands) => ({ name: 'test_rule', schedule: '* * * * *', findCandidates: async () => cands });
    return { engine, store, notify, onSent, candidate, rule };
  }

  it('sends and records the reason when every guard passes', async () => {
    const { engine, notify, onSent, candidate, rule } = setup();
    expect(await engine.run(rule([candidate()]), day)).toEqual({ send: 1 });
    expect(notify).toHaveBeenCalledOnce();
    expect(onSent).toHaveBeenCalledWith({ rule: 'test_rule', userId: 'u1', reason: 'r', dedupeKey: 'k' });
  });

  it.each([
    ['opted_out', {}, { id: 'u1', proactive: false }, day],
    ['quiet_hours', {}, undefined, night],
    ['duplicate', { dup: true }, undefined, day],
    ['daily_limit', { sent: 3 }, undefined, day],
  ])('skips with %s', async (outcome, opts, user, now) => {
    const { engine, notify, candidate } = setup(opts);
    expect(await engine.decide(candidate(user), now)).toBe(outcome);
    await engine.run({ name: 'r', schedule: '', findCandidates: async () => [candidate(user)] }, now);
    expect(notify).not.toHaveBeenCalled();
  });

  it('does not record a nudge that failed to deliver', async () => {
    const { engine, onSent, candidate, rule } = setup({ notifyOk: false });
    expect(await engine.run(rule([candidate()]), day)).toEqual({ failed: 1 });
    expect(onSent).not.toHaveBeenCalled();
  });

  it('quiet hours are 22:00–08:00 IST and the IST day starts at 18:30 UTC', () => {
    expect(isQuietHours(new Date('2026-11-05T16:29:00Z'))).toBe(false); // 21:59 IST
    expect(isQuietHours(new Date('2026-11-05T16:30:00Z'))).toBe(true);  // 22:00 IST
    expect(isQuietHours(new Date('2026-11-05T02:30:00Z'))).toBe(false); // 08:00 IST
    expect(istDayStart(day).toISOString()).toBe('2026-11-04T18:30:00.000Z');
  });
});
