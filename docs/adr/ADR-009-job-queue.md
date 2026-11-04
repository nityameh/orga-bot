# ADR-009: Use pg-boss for background jobs and scheduling

**Status:** Accepted
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

## Revisit When
Over ~100 jobs/second, or Redis is needed for something else anyway.
