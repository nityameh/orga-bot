// @ts-check
// src/jobs/index.js
// Registers all background work with the job queue (ADR-009):
//   reminder.poll     every minute — claim due reminders, enqueue reminder.send
//   reminder.send     deliver one reminder; retried with exponential backoff
//   reminder.failed   dead-letter: deliveries that exhausted their retries
//   digest.weekly     Sunday 18:00 IST
//   cleanup.daily     03:00 IST
//   proactive.<rule>  each proactive rule on its own schedule
// Falls back to node-cron when the queue is disabled (JOBS=cron, or tests).
// On serverless (Vercel) none of this starts: /internal/tick runs the same work (ADR-020).
// Docs: docs/modules/jobs.md

const { getConfig } = require('../config');
const { createPgBossQueue } = require('./queue');
const { pollDueReminders, deliverReminder, sendWeeklyDigests, runDailyCleanup, startScheduler } = require('../scheduler');
const { engine, rules, startProactiveJobs } = require('../proactive');
const { createSchedules } = require('./schedules');
const { log, error } = require('../logger');

/** Every cron job, shared with the serverless tick (src/jobs/tick.js). */
const schedules = createSchedules({ sendWeeklyDigests, runDailyCleanup, engine, rules });

/** @type {import('./queue').QueueOptions} */
const REMINDER_RETRY = {
  policy: 'exclusive',       // with singletonKey = reminderId: one send job per reminder
  retryLimit: 5, retryDelay: 30, retryBackoff: true, retryDelayMax: 30 * 60,
  deadLetter: 'reminder.failed',
};

/**
 * Wire every job onto a queue. Exported for tests (takes any JobQueue).
 * @param {import('./queue').JobQueue} queue
 */
async function registerJobs(queue) {
  await queue.define('reminder.failed', async (data) => {
    error('reminder.failed_all_retries', { reminderId: data.reminderId });
  });
  await queue.define('reminder.send', (data) => deliverReminder(data.reminderId), REMINDER_RETRY);
  await queue.every('reminder.poll', '* * * * *', async () => {
    // singletonKey: a reminder can only ever have one queued send job.
    await pollDueReminders((r) => queue.send('reminder.send', { reminderId: r.id }, { singletonKey: r.id }));
  });
  for (const job of schedules) await queue.every(job.name, job.cron, async () => { await job.run(); });
}

/** @type {import('./queue').JobQueue | null} */
let queue = null;

/** Start background processing: pg-boss when enabled, otherwise node-cron. */
async function startBackgroundJobs() {
  const config = getConfig();
  const mode = config.JOBS ?? (config.NODE_ENV === 'test' ? 'cron' : 'pgboss');
  if (mode === 'pgboss') {
    try {
      queue = createPgBossQueue({ connectionString: config.DATABASE_URL, max: config.DB_POOL_MAX });
      await queue.start();
      await registerJobs(queue);
      log('jobs.registered', { mode });
      return;
    } catch (err) {
      error('jobs.start_failed_falling_back_to_cron', { err: /** @type {Error} */ (err).message });
      queue = null;
    }
  }
  startScheduler();
  startProactiveJobs();
  log('jobs.registered', { mode: 'cron' });
}

async function stopBackgroundJobs() {
  await queue?.stop();
}

module.exports = { startBackgroundJobs, stopBackgroundJobs, registerJobs, REMINDER_RETRY, schedules };
