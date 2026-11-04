// test/unit/interactions.test.js
// Event bus isolation, Interaction row mapping, trace context, log redaction,
// link-code helpers, and proactive delivery planning.

import { describe, it, expect, vi } from 'vitest';
const { createEventBus } = require('../../src/interactions/eventBus');
const { createInteractionRecorder, toRow } = require('../../src/interactions/recorder');
const { KINDS } = require('../../src/interactions/kinds');
const { runWithContext, getContext, setContext } = require('../../src/context');
const { redact } = require('../../src/logger');

describe('event bus', () => {
  it('delivers to every subscriber', async () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe(a);
    bus.subscribe(b);
    await bus.emit({ kind: KINDS.NOTE_CREATED, userId: 'u' });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('isolates a failing subscriber: emit never rejects and others still run', async () => {
    const bus = createEventBus();
    const ok = vi.fn();
    bus.subscribe(() => { throw new Error('db down'); });
    bus.subscribe(ok);
    await expect(bus.emit({ kind: KINDS.NOTE_CREATED, userId: 'u' })).resolves.toBeUndefined();
    expect(ok).toHaveBeenCalledOnce();
  });

  it('unsubscribe stops delivery', async () => {
    const bus = createEventBus();
    const fn = vi.fn();
    const off = bus.subscribe(fn);
    off();
    await bus.emit({ kind: KINDS.NOTE_CREATED, userId: 'u' });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('interaction recorder', () => {
  it('maps an event to a row with trace id, normalised person and truncated summary', () => {
    const row = toRow({
      kind: KINDS.REMINDER_CREATED, userId: 'u1', channel: 'telegram', person: 'Ravi',
      summary: 'x'.repeat(500), usage: { tokensIn: 10, tokensOut: 5, costMicros: 42 },
    }, 'trace1');
    expect(row).toMatchObject({ userId: 'u1', kind: 'reminder.created', channel: 'telegram', person: 'ravi', traceId: 'trace1', tokensIn: 10, costMicros: 42 });
    expect(row.summary).toHaveLength(200);
  });

  it('rejects unknown kinds and missing users instead of writing junk', () => {
    expect(toRow({ kind: 'made.up', userId: 'u' }, undefined)).toBeNull();
    expect(toRow({ kind: KINDS.NOTE_CREATED }, undefined)).toBeNull();
  });

  it('writes rows with the current trace id', async () => {
    const create = vi.fn().mockResolvedValue({});
    const record = createInteractionRecorder({ create });
    await runWithContext({ traceId: 'abc' }, () => record({ kind: KINDS.NOTE_CREATED, userId: 'u' }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ traceId: 'abc', kind: 'note.created' }));
  });

  it('skips invalid events without calling the store', async () => {
    const create = vi.fn();
    await createInteractionRecorder({ create })({ kind: 'nope', userId: 'u' });
    expect(create).not.toHaveBeenCalled();
  });
});

describe('request context', () => {
  it('propagates through awaits and isolates concurrent requests', async () => {
    const seen = await Promise.all(['a', 'b'].map((id) =>
      runWithContext({ traceId: id }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        setContext({ userId: `user_${id}` });
        await Promise.resolve();
        return getContext();
      }),
    ));
    expect(seen).toEqual([{ traceId: 'a', userId: 'user_a' }, { traceId: 'b', userId: 'user_b' }]);
  });

  it('generates a trace id when none is given', () => {
    runWithContext({}, () => expect(getContext().traceId).toMatch(/^[0-9a-f]{16}$/));
  });

  it('has no context outside a run', () => {
    expect(getContext()).toBeUndefined();
  });
});

describe('log redaction', () => {
  it('replaces user content and secrets with their length', () => {
    expect(redact({ text: 'my secret note', token: 'abc', userId: 'u1', count: 3 }))
      .toEqual({ text: '[redacted:14]', token: '[redacted:3]', userId: 'u1', count: 3 });
  });
});
