// @ts-check
// src/jobs/tick.js
// Serverless scheduler (ADR-020). Vercel functions can't run timers, so a free
// external cron (cron-job.org) calls POST /internal/tick every minute. Each tick:
//   1. claims due reminders and delivers them (retries with backoff live in the row)
//   2. runs every schedule (src/jobs/schedules.js) whose latest IST occurrence
//      hasn't run yet, at most once per occurrence, even if ticks overlap
// Missed ticks are caught up for CATCH_UP_MS; older occurrences are skipped (a
// "morning brief" at 3 pm is worse than none).
// Exports: runTick, createTickRouter
// Docs: docs/modules/jobs.md → Serverless tick

const crypto = require('crypto');
const express = require('express');
const { latestOccurrence } = require('./cron');
const { log, error } = require('../logger');

const CATCH_UP_MS = 2 * 60 * 60 * 1000;

/**
 * @typedef {{
 *   pollDueReminders: (dispatch: (r: { id: string }) => Promise<unknown>) => Promise<number>,
 *   deliverWithRetry: (r: { id: string }) => Promise<unknown>,
 *   schedules: import('./schedules').Schedule[],
 *   claimRun: (name: string, occurrence: Date) => Promise<boolean>,
 * }} TickDeps
 */

/**
 * Atomic "run once per occurrence" claim on the JobRun table: insert, or move
 * lastRunAt forward only if it is older than this occurrence. Exactly one of
 * several overlapping ticks gets a row back.
 * @param {{ $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]> }} prisma
 * @returns {TickDeps['claimRun']}
 */
function createRunClaimer(prisma) {
  return async (name, occurrence) => {
    const rows = await prisma.$queryRaw`
      INSERT INTO "JobRun" ("name", "lastRunAt") VALUES (${name}, ${occurrence})
      ON CONFLICT ("name") DO UPDATE SET "lastRunAt" = EXCLUDED."lastRunAt"
      WHERE "JobRun"."lastRunAt" < EXCLUDED."lastRunAt"
      RETURNING "name"`;
    return rows.length > 0;
  };
}

/**
 * One scheduler tick. Each job is isolated: one failure doesn't stop the rest.
 * @param {TickDeps} deps
 * @param {Date} [now]
 * @returns {Promise<{ reminders: number, ran: string[], failed: string[] }>}
 */
async function runTick({ pollDueReminders, deliverWithRetry, schedules, claimRun }, now = new Date()) {
  /** @type {{ reminders: number, ran: string[], failed: string[] }} */
  const result = { reminders: 0, ran: [], failed: [] };

  try {
    result.reminders = await pollDueReminders(deliverWithRetry);
  } catch (err) {
    result.failed.push('reminder.poll');
    error('tick.reminders_failed', { err: /** @type {Error} */ (err).message });
  }

  for (const job of schedules) {
    try {
      const occurrence = latestOccurrence(job.cron, now, CATCH_UP_MS);
      if (!occurrence || !(await claimRun(job.name, occurrence))) continue;
      await job.run();
      result.ran.push(job.name);
    } catch (err) {
      // The occurrence stays claimed: a failing job isn't hammered every minute.
      result.failed.push(job.name);
      error('tick.job_failed', { job: job.name, err: /** @type {Error} */ (err).message });
    }
  }

  if (result.reminders || result.ran.length || result.failed.length) log('tick.done', { ...result, ran: result.ran.join(','), failed: result.failed.join(',') });
  return result;
}

/**
 * Constant-time bearer check. False when no secret is configured.
 * @param {string | undefined} header  Authorization header
 * @param {string | undefined} secret
 */
function isAuthorized(header, secret) {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/**
 * POST (or GET, for cron services that only do GET) /internal/tick.
 * 404 when CRON_SECRET is unset, so the route doesn't exist on servers that
 * use pg-boss instead.
 * @param {{ secret: string | undefined, deps: () => TickDeps }} options  deps is lazy: loaded on first tick
 */
function createTickRouter({ secret, deps }) {
  const router = express.Router();
  /** @param {express.Request} req @param {express.Response} res */
  const handler = async (req, res) => {
    if (!secret) { res.sendStatus(404); return; }
    if (!isAuthorized(req.get('authorization'), secret)) { res.sendStatus(401); return; }
    try {
      // Awaited, not backgrounded: the cron service waits, and the function stays alive.
      const result = await runTick(deps());
      res.json(result);
    } catch (err) {
      error('tick.failed', { err: /** @type {Error} */ (err).message });
      res.status(500).json({ error: 'tick failed' });
    }
  };
  router.post('/internal/tick', handler);
  router.get('/internal/tick', handler);
  return router;
}

module.exports = { runTick, createTickRouter, createRunClaimer, isAuthorized, CATCH_UP_MS };
