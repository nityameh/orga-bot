// test/integration/jobs.test.js
// Real pg-boss on real Postgres: failed jobs are retried (state persisted in the
// database, so it survives restarts) and reminders are claimed exactly once.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const prisma = require('../../src/db');
const { createPgBossQueue } = require('../../src/jobs/queue');
const { pollDueReminders, deliverReminder } = require('../../src/scheduler');

let user;
const queue = createPgBossQueue({ connectionString: process.env.DATABASE_URL, schema: 'pgboss_test', pollingIntervalSeconds: 0.5 });

async function waitFor(fn, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

beforeAll(async () => {
  user = await prisma.user.upsert({ where: { phone: '910000000070' }, update: {}, create: { phone: '910000000070' } });
  await queue.start();
}, 30_000);

afterAll(async () => {
  await queue.stop();
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
});

describe('pg-boss job queue', () => {
  it('retries a failing job until it succeeds', async () => {
    let attempts = 0;
    await queue.define('test.flaky', async () => {
      attempts++;
      if (attempts < 3) throw new Error('transient failure');
    }, { retryLimit: 3, retryDelay: 1 });
    await queue.send('test.flaky', { n: 1 });
    expect(await waitFor(() => attempts >= 3)).toBe(true);
  }, 30_000);

  it('dead-letters a job that exhausts its retries', async () => {
    const dead = [];
    await queue.define('test.dead', async (data) => { dead.push(data); });
    await queue.define('test.always_fails', async () => { throw new Error('permanent'); }, { retryLimit: 1, retryDelay: 1, deadLetter: 'test.dead' });
    await queue.send('test.always_fails', { id: 'x' });
    expect(await waitFor(() => dead.length === 1)).toBe(true);
    expect(dead[0]).toEqual({ id: 'x' });
  }, 30_000);

  it('de-duplicates jobs with the same singleton key', async () => {
    await queue.define('test.single', async () => { await new Promise((r) => setTimeout(r, 5000)); });
    const a = await queue.send('test.single', {}, { singletonKey: 'rem-1' });
    const b = await queue.send('test.single', {}, { singletonKey: 'rem-1' });
    expect(a).toBeTruthy();
    expect(b).toBeNull();
  }, 30_000);
});

describe('reminder dispatch', () => {
  it('claims each due reminder exactly once even when polls overlap', async () => {
    const r = await prisma.reminder.create({ data: { userId: user.id, title: 'Pay GST', fireAt: new Date(Date.now() - 1000) } });
    const dispatched = [];
    const dispatch = async (rem) => { dispatched.push(rem.id); };
    await Promise.all([pollDueReminders(dispatch), pollDueReminders(dispatch), pollDueReminders(dispatch)]);
    expect(dispatched.filter((id) => id === r.id)).toHaveLength(1);
    expect((await prisma.reminder.findUnique({ where: { id: r.id } })).status).toBe('fired');
  });

  it('deliverReminder throws when it cannot deliver (so the queue retries) and skips cancelled ones', async () => {
    const r = await prisma.reminder.create({ data: { userId: user.id, title: 'No channel yet', fireAt: new Date(), status: 'fired' } });
    await expect(deliverReminder(r.id)).rejects.toThrow(/could not be delivered/); // user has no channel identity
    await prisma.reminder.update({ where: { id: r.id }, data: { status: 'done' } });
    await expect(deliverReminder(r.id)).resolves.toBeUndefined();
  });

  it('delivers to a user with a channel and records reminder.fired', async () => {
    await prisma.channelIdentity.create({ data: { userId: user.id, channel: 'whatsapp', externalId: '910000000070', lastInboundAt: new Date() } });
    const r = await prisma.reminder.create({ data: { userId: user.id, title: 'Call bank', fireAt: new Date(), status: 'fired' } });
    await deliverReminder(r.id);
    expect(await waitFor(() => prisma.interaction.count({ where: { userId: user.id, kind: 'reminder.fired' } }).then((c) => c === 1), 5000)).toBe(true);
  });
});
