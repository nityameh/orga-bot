// test/integration/serverless.test.js
// Serverless mode on real Postgres (ADR-020): the JobRun once-per-occurrence
// claim, durable webhook dedupe across "instances", and reminder retries with
// backoff stored in the row (no job queue).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const prisma = require('../../src/db');
const { createRunClaimer, runTick } = require('../../src/jobs/tick');
const { createDeduper } = require('../../src/runtime/dedupe');
const { pollDueReminders, deliverWithRetry, RETRY_LIMIT } = require('../../src/scheduler');

let user;
const JOB = `test.job.${Date.now()}`;

beforeAll(async () => {
  // No channel identity: every delivery attempt fails, which is what we want here.
  user = await prisma.user.create({ data: { phone: '910000000080' } });
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: user.id } }); // cascades reminders
  await prisma.jobRun.deleteMany({ where: { name: JOB } });
  await prisma.processedMessage.deleteMany({ where: { key: { startsWith: 'itest:' } } });
  await prisma.$disconnect();
});

describe('JobRun claim', () => {
  it('lets exactly one of several concurrent ticks run an occurrence', async () => {
    const claimRun = createRunClaimer(prisma);
    const occ = new Date('2026-11-09T03:00:00Z');
    const results = await Promise.all([1, 2, 3, 4].map(() => claimRun(JOB, occ)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await claimRun(JOB, occ)).toBe(false);                                  // same occurrence again
    expect(await claimRun(JOB, new Date('2026-11-10T03:00:00Z'))).toBe(true);    // the next one
    expect(await claimRun(JOB, occ)).toBe(false);                                  // never goes backwards
  });

  it('runs a due schedule once across overlapping ticks', async () => {
    let runs = 0;
    const deps = {
      pollDueReminders: async () => 0,
      deliverWithRetry: async () => {},
      schedules: [{ name: `${JOB}.tick`, cron: '* * * * *', run: async () => { runs++; } }],
      claimRun: createRunClaimer(prisma),
    };
    const now = new Date();
    await Promise.all([runTick(deps, now), runTick(deps, now), runTick(deps, now)]);
    expect(runs).toBe(1);
    await prisma.jobRun.deleteMany({ where: { name: `${JOB}.tick` } });
  });
});

describe('durable dedupe', () => {
  it('rejects a retry that reaches a different instance', async () => {
    const key = `itest:telegram:1:tg_${Date.now()}`;
    expect(await createDeduper({ prisma }).claim(key)).toBe(true);
    expect(await createDeduper({ prisma }).claim(key)).toBe(false);
  });
});

describe('reminder retries without a job queue', () => {
  it('backs off on failure, retries when due, and gives up after the limit', async () => {
    const r = await prisma.reminder.create({ data: { userId: user.id, title: 'Retry me', fireAt: new Date(Date.now() - 1000) } });
    const only = (fn) => async (rem) => { if (rem.id === r.id) await fn(rem); };

    await pollDueReminders(only(deliverWithRetry));
    let row = await prisma.reminder.findUnique({ where: { id: r.id } });
    expect(row.status).toBe('retry');
    expect(row.attempts).toBe(1);
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    // Not due yet: the next poll leaves it alone.
    await pollDueReminders(only(deliverWithRetry));
    expect((await prisma.reminder.findUnique({ where: { id: r.id } })).attempts).toBe(1);

    // Fast-forward each backoff until the limit.
    for (let i = 2; i <= RETRY_LIMIT; i++) {
      await prisma.reminder.update({ where: { id: r.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
      await pollDueReminders(only(deliverWithRetry));
    }
    row = await prisma.reminder.findUnique({ where: { id: r.id } });
    expect(row.status).toBe('failed');
    expect(row.attempts).toBe(RETRY_LIMIT);
    expect(row.nextAttemptAt).toBeNull();
  });

  it('a user snooze overrides a pending retry', async () => {
    const r = await prisma.reminder.create({ data: { userId: user.id, title: 'Snoozed', fireAt: new Date(), status: 'retry', nextAttemptAt: new Date(Date.now() + 60_000) } });
    const later = new Date(Date.now() + 3_600_000);
    await prisma.reminder.update({ where: { id: r.id }, data: { status: 'pending', fireAt: later, snoozeUntil: later } });
    const claimed = [];
    await pollDueReminders(async (rem) => { claimed.push(rem.id); });
    expect(claimed).not.toContain(r.id);
  });
});
