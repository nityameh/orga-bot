# ADR-023: 5 database connections per Vercel instance, not 1

**Status:** Accepted
**Date:** 2026-11-10
**Deciders:** Nitya
**Supersedes:** the `connection_limit=1` part of [ADR-020](ADR-020-vercel-serverless.md) §Decision

## Context
ADR-020 set `DATABASE_URL=…:6543/postgres?pgbouncer=true&connection_limit=1`
and `DB_POOL_MAX=1`. The reasoning came from the classic serverless model
(AWS Lambda style), which Prisma's serverless guide was written for:

- **One request per instance at a time.** A function instance handles a single
  invocation, then freezes; a second concurrent request starts a second instance.
  So one connection per instance is all an instance can ever use.
- **Instances multiply under load.** 50 concurrent requests → 50 instances →
  50 × `connection_limit` connections. With a higher limit, a traffic spike
  could exhaust the database's connection slots ("too many clients").
- **Free tiers have few connections.** So 1 per instance was the safe choice.

That model no longer matches Vercel. **Fluid compute** (the default for new
projects) runs **many requests concurrently inside one instance** and keeps
instances warm, much like a server. On 2026-11-10, with one user, production failed:

- The web chat polls every ~1 s; Telegram webhooks and background replies
  (`waitUntil`) ran in the same instance at the same time.
- All of them queued for the single Prisma connection; after Prisma's default
  10 s `pool_timeout`, queries failed with "Timed out fetching a new connection
  from the connection pool", and users saw "I'm having trouble on my side".
- Reproduced: 5 concurrent `/health/ready` requests → 3 slow 200s and 2 503s at 10 s.

Supabase's **transaction pooler** (Supavisor, port 6543) is designed for many
short-lived client connections and multiplexes them onto a small set of real
Postgres connections, so client-side connections are cheap. The real database
connections are capped by the pooler, not by our client count.

## Decision
- `DATABASE_URL`: `?pgbouncer=true&connection_limit=5&pool_timeout=20`.
- `DB_POOL_MAX` default on Vercel: 3 (LangGraph checkpointer's `pg` pool).
- `npm run vercel:env` refuses `connection_limit` below 3.

## Consequences
- Verified after the change: 10 concurrent requests → 10 × 200 (before: 2 of 5 failed).
- Worst case connections to the pooler ≈ instances × (5 + 3). Vercel keeps few
  instances under Fluid compute at our scale, and the free pooler accepts far
  more clients than that. Revisit if instances × 8 approaches the pooler's
  client limit on the Supabase plan.
- The 1 s web-chat polling is the main load. Longer polling intervals or
  server-sent events would cut it (future work).

## Lesson
A best practice is only true under its assumptions. "One connection per
serverless instance" assumes one request per instance; when the platform
changed that assumption, the practice became the bug. Record the *why* next to
settings like this, as this ADR does.

## Also: run functions next to the database
Checking the project settings showed functions running in `iad1` (Washington,
USA) while Supabase is in `ap-southeast-1` (Singapore): ~220 ms per query
round trip, many queries per message, and ~1.5–4.7 s for a trivial health
check. `vercel.json` now pins `"regions": ["sin1"]` (Singapore; Hobby allows
one region). Users are in India, so Singapore is also close to them.
