# Module: jobs (durable background work with pg-boss)

> **Path:** `src/jobs/`, `src/scheduler.js`  ·  **Status:** Stable (Phase 5.5)  ·  **Related ADRs:** [ADR-009](../adr/ADR-009-job-queue.md), [ADR-020](../adr/ADR-020-vercel-serverless.md)

## Summary (read this first)
Everything Orga does on a timer, such as sending reminders, the weekly digest,
nightly cleanup and proactive messages, runs through a **job queue stored in
our own Postgres** (pg-boss). If sending a reminder fails, the job is retried
with growing delays, and because the retry is saved in the database, a server
restart doesn't lose it. Nothing extra to host: it runs inside the API process.

On **Vercel** (serverless) there is no process between requests, so the same
work runs when an external cron calls `/internal/tick` every minute; retries
and "already ran" markers are kept in Postgres rows instead (see *Serverless tick*).

## Jobs
| Queue | Schedule | What it does | On failure |
|---|---|---|---|
| `reminder.poll` | every minute | Claims due reminders atomically (`pending → fired`) and enqueues `reminder.send` (singleton key = reminder id) | Next minute |
| `reminder.send` | on demand (`exclusive` policy + singleton key: one job per reminder) | Delivers one reminder via `notifyUser` | Retried 5× with exponential backoff (30 s → max 30 min), then → `reminder.failed` |
| `reminder.failed` | dead letter | Logs reminders that exhausted retries | — |
| `digest.weekly` | Sun 18:00 IST | Weekly summary | Next week |
| `cleanup.daily` | 03:00 IST | Expired pending actions, conversation memory > 7 days | Next day |
| `proactive.<rule>` | per rule | Morning brief, meeting prep, stale tasks (via the proactive engine) | Next run |

Cron schedules are owned by pg-boss, so with several instances each job still runs once.

## Files
| File | What it contains |
|---|---|
| `schedules.js` | The single list of cron jobs (`createSchedules`), used by both pg-boss and the tick. A new scheduled job = a new entry here |
| `tick.js` | `runTick()` and `POST/GET /internal/tick` (Bearer `CRON_SECRET`); `createRunClaimer()` = JobRun compare-and-set |
| `cron.js` | Pure 5-field cron matcher in IST: `parseCron`, `matches`, `latestOccurrence` |
| `queue.js` | `createPgBossQueue()`: `JobQueue` port (start/stop/define/send/every) over pg-boss, schema `pgboss` |
| `index.js` | `registerJobs(queue)` (all queues and schedules), `startBackgroundJobs()` with node-cron fallback |
| `../scheduler.js` | Job bodies: `pollDueReminders`, `deliverReminder`, `deliverWithRetry` (serverless retries), `sendWeeklyDigests`, `runDailyCleanup`; `startScheduler()` cron fallback |

## Design decisions
| Decision | Why |
|---|---|
| pg-boss in-process (no worker service) | Free: same Postgres, one Railway service. Split into a worker later if load needs it |
| Claim in the poller, deliver in a job | Claiming stays atomic (no double sends); delivery gets durable retries |
| `deliverReminder` throws on failure | Failure is the queue's retry signal; a cancelled reminder returns quietly instead of retrying |
| Dynamic `import('pg-boss')` | pg-boss v12 is ESM-only; the codebase is CommonJS |
| node-cron fallback (`JOBS=cron`, tests) | The app still works if the queue can't start |

**Bug this replaced:** the old retry used `setTimeout` to re-queue failed
reminders but always restarted the attempt counter at 1, so an undeliverable
reminder was retried forever, and any pending retry was lost on restart.

## Serverless tick (ADR-020)
```
cron-job.org ──POST /internal/tick (Bearer CRON_SECRET), every minute──► runTick(now)
  1. pollDueReminders(deliverWithRetry)
       claims  pending & fireAt ≤ now   or   retry & nextAttemptAt ≤ now   → fired
       failure → attempts+1 → retry (30 s, 60 s, … ≤ 30 min) → failed after 5
  2. for each schedule: occ = latest IST occurrence within the last 2 h
       claimRun(name, occ): INSERT … ON CONFLICT DO UPDATE WHERE lastRunAt < occ
       → exactly one tick runs each occurrence; a failed run is not retried until the next one
```

| Edge case | Behaviour |
|---|---|
| Ticks overlap (slow tick + next minute) | Reminder claims and JobRun claims are atomic: nothing runs twice |
| Cron service down for an hour | Missed occurrences within 2 h run on the next tick; older ones are skipped |
| First deploy | Each job's latest occurrence in the last 2 h runs once |
| User snoozes a reminder that is in `retry` | Snooze sets `pending`, which wins; the retry is dropped |
| Function killed mid-delivery | Reminder stays `fired` without being sent (rare); visible in the dashboard |

## Testing
`test/unit/jobs.test.js` (retry/backoff/dead-letter policy, every schedule registered),
`test/integration/jobs.test.js` (real pg-boss: retry until success, dead-lettering,
singleton dedupe; reminders claimed once under concurrent polls; delivery failure throws).
`test/unit/serverless.test.js` (cron matching in IST, tick scheduling/isolation, bearer auth),
`test/integration/serverless.test.js` (JobRun claim under concurrency, retry → failed state machine).
