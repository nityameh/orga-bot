// test/unit/serverless.test.js
// Serverless mode (ADR-020): IST cron matching, the tick's once-per-occurrence
// scheduling and isolation, bearer auth, durable dedupe, background runner, config.

import { describe, it, expect, vi, afterEach } from 'vitest';
process.env.DATABASE_URL ||= 'postgresql://u:p@localhost:5432/db';
const { parseCron, matches, latestOccurrence } = require('../../src/jobs/cron');
const { runTick, isAuthorized, createTickRouter, CATCH_UP_MS } = require('../../src/jobs/tick');
const { createDeduper } = require('../../src/runtime/dedupe');
const background = require('../../src/runtime/background');
const { parseConfig, resolveRuntime } = require('../../src/config');
const { retryDelayMs, RETRY_LIMIT } = require('../../src/scheduler');

/** IST wall-clock time → Date. */
const ist = (iso) => new Date(`${iso}+05:30`);

describe('cron matcher (IST)', () => {
  it('matches in IST, not UTC', () => {
    const spec = parseCron('30 8 * * *');
    expect(matches(spec, ist('2026-11-09T08:30:00'))).toBe(true);
    expect(matches(spec, new Date('2026-11-09T08:30:00Z'))).toBe(false); // 14:00 IST
  });

  it('supports steps, ranges, lists and day-of-week', () => {
    expect(matches(parseCron('*/10 * * * *'), ist('2026-11-09T10:20:00'))).toBe(true);
    expect(matches(parseCron('*/10 * * * *'), ist('2026-11-09T10:25:00'))).toBe(false);
    expect(matches(parseCron('0 9-17/4 * * *'), ist('2026-11-09T13:00:00'))).toBe(true);
    expect(matches(parseCron('0 9,18 * * *'), ist('2026-11-09T18:00:00'))).toBe(true);
    // 2026-11-08 is a Sunday
    expect(matches(parseCron('0 18 * * 0'), ist('2026-11-08T18:00:00'))).toBe(true);
    expect(matches(parseCron('0 18 * * 0'), ist('2026-11-09T18:00:00'))).toBe(false);
  });

  it('ORs day-of-month and day-of-week when both are restricted (standard cron)', () => {
    const spec = parseCron('0 9 1 * 1'); // 1st of the month OR Mondays
    expect(matches(spec, ist('2026-11-09T09:00:00'))).toBe(true);  // Monday
    expect(matches(spec, ist('2026-11-01T09:00:00'))).toBe(true);  // the 1st (a Sunday)
    expect(matches(spec, ist('2026-11-10T09:00:00'))).toBe(false);
  });

  it('rejects malformed expressions', () => {
    expect(() => parseCron('* * * *')).toThrow(/5 fields/);
    expect(() => parseCron('60 * * * *')).toThrow(/Invalid/);
    expect(() => parseCron('*/0 * * * *')).toThrow(/Invalid/);
    expect(() => parseCron('MON * * * *')).toThrow(/Invalid/);
  });

  it('finds the latest occurrence within the lookback, else null', () => {
    const now = ist('2026-11-09T09:47:30');
    expect(latestOccurrence('30 8 * * *', now, CATCH_UP_MS)).toEqual(ist('2026-11-09T08:30:00'));
    expect(latestOccurrence('30 8 * * *', ist('2026-11-09T15:00:00'), CATCH_UP_MS)).toBeNull();
    expect(latestOccurrence('* * * * *', now, 0)).toEqual(ist('2026-11-09T09:47:00'));
  });
});

describe('runTick', () => {
  const now = ist('2026-11-09T08:31:00');

  function deps(overrides = {}) {
    const claimed = new Set();
    return {
      pollDueReminders: vi.fn(async () => 2),
      deliverWithRetry: vi.fn(),
      schedules: [
        { name: 'brief', cron: '30 8 * * *', run: vi.fn(async () => {}) },
        { name: 'weekly', cron: '0 18 * * 0', run: vi.fn(async () => {}) },
      ],
      // In-memory stand-in for the JobRun compare-and-set.
      claimRun: vi.fn(async (name, occ) => {
        const key = `${name}@${occ.toISOString()}`;
        if (claimed.has(key)) return false;
        claimed.add(key);
        return true;
      }),
      ...overrides,
    };
  }

  it('polls reminders with retrying delivery and runs only due jobs', async () => {
    const d = deps();
    const result = await runTick(d, now);
    expect(d.pollDueReminders).toHaveBeenCalledWith(d.deliverWithRetry);
    expect(result).toEqual({ reminders: 2, ran: ['brief'], failed: [] });
    expect(d.schedules[1].run).not.toHaveBeenCalled();
  });

  it('runs a job once per occurrence even when ticks repeat', async () => {
    const d = deps();
    await runTick(d, now);
    await runTick(d, new Date(now.getTime() + 60_000));
    expect(d.schedules[0].run).toHaveBeenCalledTimes(1);
  });

  it('isolates failures: a broken job or poll does not stop the others', async () => {
    const d = deps({ pollDueReminders: vi.fn(async () => { throw new Error('db down'); }) });
    d.schedules[0].run.mockRejectedValueOnce(new Error('boom'));
    d.schedules.push({ name: 'also-due', cron: '* * * * *', run: vi.fn(async () => {}) });
    const result = await runTick(d, now);
    expect(result.failed).toEqual(['reminder.poll', 'brief']);
    expect(result.ran).toEqual(['also-due']);
  });
});

describe('tick authorization', () => {
  it('accepts only the exact bearer secret', () => {
    const secret = 'a'.repeat(32);
    expect(isAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(isAuthorized(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isAuthorized(undefined, secret)).toBe(false);
    expect(isAuthorized(`Bearer ${secret}`, undefined)).toBe(false);
  });

  it('serves 404 without a secret, 401 with a wrong one, 200 with the right one', async () => {
    const express = require('express');
    const secret = 's'.repeat(24);
    const tickDeps = () => ({ pollDueReminders: async () => 0, deliverWithRetry: async () => {}, schedules: [], claimRun: async () => false });
    const app = express();
    app.use('/off', createTickRouter({ secret: undefined, deps: tickDeps }));
    app.use(createTickRouter({ secret, deps: tickDeps }));
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    const base = `http://localhost:${server.address().port}`;
    try {
      expect((await fetch(`${base}/off/internal/tick`, { method: 'POST' })).status).toBe(404);
      expect((await fetch(`${base}/internal/tick`, { method: 'POST', headers: { Authorization: 'Bearer nope' } })).status).toBe(401);
      const ok = await fetch(`${base}/internal/tick`, { headers: { Authorization: `Bearer ${secret}` } });
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ reminders: 0, ran: [], failed: [] });
    } finally {
      server.close();
    }
  });
});

describe('durable dedupe', () => {
  it('lets the first claim through and rejects repeats via the unique key', async () => {
    const keys = new Set();
    const prisma = { processedMessage: { create: vi.fn(async ({ data }) => {
      if (keys.has(data.key)) throw Object.assign(new Error('unique'), { code: 'P2002' });
      keys.add(data.key);
    }) } };
    const a = createDeduper({ prisma });
    const b = createDeduper({ prisma }); // a second "instance"
    expect(await a.claim('telegram:1:tg_5')).toBe(true);
    expect(await a.claim('telegram:1:tg_5')).toBe(false); // local cache, no DB call
    expect(await b.claim('telegram:1:tg_5')).toBe(false); // other instance: DB says duplicate
    expect(prisma.processedMessage.create).toHaveBeenCalledTimes(2);
  });

  it('fails open when the store is unavailable (never drops a message)', async () => {
    const prisma = { processedMessage: { create: vi.fn(async () => { throw new Error('timeout'); }) } };
    expect(await createDeduper({ prisma }).claim('whatsapp:9:w1')).toBe(true);
  });
});

describe('runInBackground', () => {
  afterEach(() => {
    delete process.env.RUNTIME;
    background._resetForTests();
  });

  it('runs the task and swallows (logs) its rejection', async () => {
    let ran = false;
    await background.runInBackground(async () => { ran = true; });
    expect(ran).toBe(true);
    await expect(background.runInBackground(async () => { throw new Error('x'); })).resolves.toBeUndefined();
  });

  it('detects the runtime', () => {
    process.env.RUNTIME = 'serverless';
    expect(background.isServerless()).toBe(true);
    process.env.RUNTIME = 'server';
    expect(background.isServerless()).toBe(false);
  });
});

describe('serverless config', () => {
  const prod = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db', NODE_ENV: 'production', DASHBOARD_URL: 'https://d.example.com' };

  it('defaults to serverless on Vercel, server elsewhere, explicit RUNTIME wins', () => {
    expect(resolveRuntime({ VERCEL: '1' })).toBe('serverless');
    expect(resolveRuntime({})).toBe('server');
    expect(resolveRuntime({ VERCEL: '1', RUNTIME: 'server' })).toBe('server');
  });

  it('requires a strong CRON_SECRET in production on serverless only', () => {
    expect(() => parseConfig({ ...prod, VERCEL: '1' })).toThrow(/CRON_SECRET/);
    expect(() => parseConfig({ ...prod, VERCEL: '1', CRON_SECRET: 'short' })).toThrow(/16 characters/);
    expect(parseConfig({ ...prod, VERCEL: '1', CRON_SECRET: 'x'.repeat(24) }).CRON_SECRET).toHaveLength(24);
    expect(() => parseConfig(prod)).not.toThrow();
    expect(parseConfig({ ...prod, CRON_SECRET: '' }).CRON_SECRET).toBeUndefined();
  });
});

describe('reminder retry backoff', () => {
  it('doubles from 30s and caps at 30 minutes', () => {
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(60_000);
    expect(retryDelayMs(20)).toBe(30 * 60_000);
    expect(RETRY_LIMIT).toBe(5);
  });
});
