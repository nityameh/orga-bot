# ADR-020: Run the API on Vercel Functions too (serverless mode)

**Status:** Accepted
**Date:** 2026-11-09
**Deciders:** Nitya
**Amends:** [ADR-019](ADR-019-free-deployment.md). Option A becomes "all on Vercel"; Render and the VM stay supported.

## Context
ADR-019 kept the API off Vercel because it assumed a long-running process:
replies were processed after the response with a floating promise, pg-boss
workers and cron timers ran forever, and webhook de-duplication was an
in-memory `Set`. On a serverless function none of these hold:

| Server assumption | What happens on Vercel |
|---|---|
| Work continues after `res.send()` | The instance can freeze once the response ends, unless the promise is passed to `waitUntil` |
| Timers (pg-boss, node-cron) | No process runs between requests; Hobby cron jobs run at most **once per day** |
| In-memory dedupe | Each retry may hit a different instance |
| A pool of DB connections | Many short-lived instances; a free pooler allows few connections |

Facts checked on 2026-11-09: Vercel Functions with Fluid compute allow up to
300 s on Hobby; Express apps run as a single function; `waitUntil` comes from
`@vercel/functions`. Supabase offers a transaction pooler (port 6543, built for
serverless) and a session pooler (5432, needed by migrations).

## Decision
Add a **serverless runtime mode**, chosen by `RUNTIME` (defaults to
`serverless` when Vercel sets `VERCEL`), without forking the codebase:

1. **Background work:** `runInBackground()` (`src/runtime/background.js`) wraps
   post-response work and hands it to `waitUntil` on Vercel. Used by channel webhooks and web chat.
2. **Durable dedupe:** a primary-key insert into `ProcessedMessage`
   (`src/runtime/dedupe.js`); a unique violation means "already processed".
   Local cache first, fails open, keys pruned after 3 days.
3. **Scheduling via `/internal/tick`:** a free external cron (cron-job.org)
   calls it every minute with `Authorization: Bearer $CRON_SECRET`. A tick:
   - claims due reminders (same compare-and-set as before) and delivers them.
     Failures move the row to `retry` with `attempts` and `nextAttemptAt`
     (30 s doubling, capped at 30 min, `failed` after 5). This is the same policy
     pg-boss applies on the server, stored in the reminder row instead of a queue.
   - runs each schedule from one shared list (`src/jobs/schedules.js`, also used
     by pg-boss) whose latest IST occurrence hasn't run yet. "Once per
     occurrence" is an atomic `INSERT … ON CONFLICT … WHERE lastRunAt < occurrence`
     on `JobRun`. Missed ticks are caught up for 2 hours; older occurrences are skipped.
4. **Connections:** Prisma uses Supabase's transaction pooler
   (`?pgbouncer=true&connection_limit=1`); migrations use the session pooler via
   `directUrl` (`DIRECT_URL`). Other pools default to 1 (`DB_POOL_MAX`).
5. **Packaging:** `api/index.js` exports the Express app. `vercel.json` rewrites
   all paths to it, includes `prompts/**`, excludes the local embedding model
   (`EMBEDDINGS=off`, so full-text search is used), and runs `prisma migrate deploy` at build time.

## Alternatives considered
- **Vercel Cron:** Hobby allows only daily jobs, which is too coarse for reminders. Kept as an option on Pro.
- **Upstash QStash (free tier) for retries and schedules:** a good fit, but it adds
  a vendor and a second source of truth. Postgres already gives us claims and retry state.
- **A separate worker host for pg-boss:** brings back the always-on process we are removing.
- **Rewrite the backend as Next.js route handlers:** large churn for no capability gain.

## Consequences
- **Good:** $0, one platform for both dashboard and API, no sleeping instance, and no pinger
  for wake-ups (the cron tick is the pinger). The code remains runnable as a
  normal server (Render, VM, local) with pg-boss.
- **Bad:** reminder precision depends on the external cron (±1 min).
  - Cold starts add latency to the first message.
  - Semantic search is off on Vercel.
  - A tick that outlives the cron service's HTTP timeout keeps running, but the service reports it as failed.
  - A function killed mid-delivery can leave a reminder in `fired` without it being sent (rare; visible in the dashboard).
- **Interview angle:** the same domain logic runs under two runtime models.
  Scheduling becomes an idempotent, claim-based state machine in Postgres, which
  is the "transactional outbox / at-least-once with dedupe" pattern.

## Revisit When
Ticks regularly exceed the time limit, reminders need sub-minute precision, or
semantic search is needed in production (move embeddings to a hosted free model or to the VM option).
