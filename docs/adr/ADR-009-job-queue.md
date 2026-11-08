# ADR-009: Use pg-boss for background jobs and scheduling

**Status:** Accepted (re-accepted 2026-11-06: in-process, no extra service)
**Date:** 2026-11-04
**Deciders:** Nitya

## Context
`src/scheduler.js` uses node-cron to poll the reminders table every 60s. New
work needs retries with backoff, delayed jobs (meeting prep 30 min before),
Gmail/Calendar sync, and nightly memory consolidation. node-cron runs in the
web process, so two instances fire every job twice.

## Decision
Use **pg-boss** (job queue stored in our existing Postgres):
- Delayed jobs replace polling for reminders.
- Retries with exponential backoff; dead-letter queue for failures.
- Singleton keys make jobs idempotent (no double reminders).
- Workers run in a separate process (`src/worker.ts`) from the web server.

## Options Considered
| Option | Pros | Cons |
|---|---|---|
| pg-boss (chosen) | No new infra; transactional with our data | Postgres load at very high volume |
| BullMQ + Redis | Industry favourite, fast | Another service to run and pay for |
| node-cron (current) | Simple | No retries, duplicates on scale-out |

## Consequences
- Two Railway services: `orga-api` and `orga-worker`.

## Amendment (2026-11-05, Phase 4): deferred for cost
A separate worker process means a second always-on Railway service. At current
scale the single process with `node-cron` suffices. The main correctness risk
(double-firing with two instances) is fixed cheaply: reminders are claimed with
a conditional `UPDATE … WHERE status = 'pending'`, and proactive nudges are
deduplicated by key. Adopt pg-boss when jobs need retries with backoff across
restarts or when the API is scaled to more than one instance.

## Amendment (2026-11-06): accepted, in-process
pg-boss runs inside the API process against the existing Postgres (schema
`pgboss`), so the cost objection no longer applies. Reminders: the poller claims
atomically and enqueues `reminder.send` (singleton key), which retries 5× with
exponential backoff and dead-letters to `reminder.failed`. All cron work moves to
pg-boss schedules (run once across instances). node-cron remains as a fallback.

## Revisit When
Over ~100 jobs/second, or Redis is needed for something else anyway.
