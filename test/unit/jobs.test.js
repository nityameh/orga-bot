// test/unit/jobs.test.js
// Job registration against a fake JobQueue: retry policy, dead-lettering,
// de-duplication and schedules (ADR-009).

import { describe, it, expect } from 'vitest';
process.env.DATABASE_URL ||= 'postgresql://u:p@localhost:5432/db';
const { registerJobs, REMINDER_RETRY } = require('../../src/jobs');
const { rules } = require('../../src/proactive');

function fakeQueue() {
  const defined = new Map();
  const schedules = new Map();
  return {
    defined, schedules,
    start: async () => {}, stop: async () => {},
    define: async (name, handler, options) => { defined.set(name, { handler, options }); },
    send: async () => 'job-id',
    every: async (name, cron, handler) => { schedules.set(name, { cron, handler }); },
  };
}

describe('registerJobs', () => {
  it('delivers reminders through a retried queue with exponential backoff and a dead letter', async () => {
    const q = fakeQueue();
    await registerJobs(q);
    expect(q.defined.get('reminder.send').options).toEqual(REMINDER_RETRY);
    expect(REMINDER_RETRY).toMatchObject({ retryBackoff: true, deadLetter: 'reminder.failed' });
    expect(REMINDER_RETRY.retryLimit).toBeGreaterThanOrEqual(3);
    expect(q.defined.has('reminder.failed')).toBe(true);
  });

  it('schedules polling, digest, cleanup and every proactive rule', async () => {
    const q = fakeQueue();
    await registerJobs(q);
    expect(q.schedules.get('reminder.poll').cron).toBe('* * * * *');
    expect(q.schedules.get('digest.weekly').cron).toBe('0 18 * * 0');
    expect(q.schedules.get('cleanup.daily').cron).toBe('0 3 * * *');
    for (const rule of rules) expect(q.schedules.get(`proactive.${rule.name}`).cron).toBe(rule.schedule);
  });
});
