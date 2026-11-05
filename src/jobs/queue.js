// @ts-check
// src/jobs/queue.js
// Thin adapter over pg-boss (ADR-009): a durable job queue stored in our own
// Postgres (schema `pgboss`), running inside the API process — no extra
// service. Gives us retries with exponential backoff that survive restarts,
// dead-letter queues, de-duplication via singleton keys, and cron schedules
// that run once across instances.
// Docs: docs/modules/jobs.md

const { log, error } = require('../logger');

/**
 * Port the rest of the app uses (so tests can substitute a fake).
 * @typedef {Object} JobQueue
 * @property {() => Promise<void>} start
 * @property {() => Promise<void>} stop
 * @property {(name: string, handler: (data: any) => Promise<void>, options?: QueueOptions) => Promise<void>} define
 * @property {(name: string, data: object, options?: { singletonKey?: string, startAfter?: Date }) => Promise<string | null>} send
 * @property {(name: string, cron: string, handler: () => Promise<void>) => Promise<void>} every
 */

/**
 * @typedef {Object} QueueOptions
 * @property {number} [retryLimit]
 * @property {number} [retryDelay]      seconds
 * @property {boolean} [retryBackoff]   exponential: retryDelay * 2^retryCount (with jitter)
 * @property {number} [retryDelayMax]   seconds
 * @property {string} [deadLetter]      queue that receives jobs after the last failed retry
 */

/**
 * @param {{ connectionString: string, schema?: string, timezone?: string, pollingIntervalSeconds?: number }} cfg
 * @returns {JobQueue}
 */
function createPgBossQueue({ connectionString, schema = 'pgboss', timezone = 'Asia/Kolkata', pollingIntervalSeconds = 2 }) {
  /** @type {any} */
  let boss = null;
  const ready = () => {
    if (!boss) throw new Error('Job queue not started');
    return boss;
  };

  return {
    async start() {
      // pg-boss v12 is ESM-only; a dynamic import loads it from our CommonJS code.
      const { PgBoss } = await import('pg-boss');
      boss = new PgBoss({ connectionString, schema });
      boss.on('error', (/** @type {Error} */ err) => error('jobs.error', { err: err.message }));
      await boss.start();
      log('jobs.started', { schema });
    },

    async stop() {
      await boss?.stop({ graceful: true, timeout: 10_000 });
    },

    async define(name, handler, options = {}) {
      await ready().createQueue(name, options);
      // Throwing fails the job; pg-boss then schedules the retry (or dead-letters it).
      await ready().work(name, { pollingIntervalSeconds }, async (/** @type {any[]} */ jobs) => {
        for (const job of jobs) await handler(job.data);
      });
    },

    send(name, data, options = {}) {
      return ready().send(name, data, options);
    },

    async every(name, cron, handler) {
      await ready().createQueue(name);
      await ready().schedule(name, cron, null, { tz: timezone });
      await ready().work(name, { pollingIntervalSeconds }, async () => handler());
    },
  };
}

module.exports = { createPgBossQueue };
