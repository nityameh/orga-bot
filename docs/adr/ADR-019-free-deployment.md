# ADR-019: Completely free deployment (Vercel + Render + Supabase, or one free VM)

**Status:** Accepted
**Date:** 2026-11-06
**Deciders:** Nitya

## Context
Orga must run publicly for demos at $0/month (project rule: prefer free options).
The API is a long-running process: webhooks reply then process asynchronously,
pg-boss workers and cron schedules run continuously, and an in-process
embedding model needs memory. Serverless platforms (e.g. Vercel Functions)
stop work after the response and can't host always-on workers.

Free-tier facts checked on 2026-11-06:
- **Neon** free: 100 CU-hours/month, scale to zero after 5 min. pg-boss polling keeps compute awake, so hours run out mid-month. ✗
- **Supabase** free: 500 MB, pgvector, no compute-hour cap; pauses after 7 days of inactivity (Orga is always active). ✓
- **Render** free web service: 750 instance hours/month, sleeps after 15 min without inbound traffic, ~512 MB RAM. ✓ with a pinger
- **Hugging Face Spaces**: unclear free Docker eligibility and recent quota reports. ✗ (too uncertain)
- **Vercel** Hobby: Next.js dashboard, free for non-commercial use. ✓

## Decision
- **Option A (default):** dashboard on Vercel; API on Render free (Blueprint
  `render.yaml`) kept awake by a free external pinger every 10 min; Postgres +
  pgvector on Supabase free (session pooler). `EMBEDDINGS=off` on Render (RAM),
  so retrieval falls back to Postgres full-text search, which the code already supports.
- **Option B (full features):** `docker-compose.yml` on a free VM (Oracle Cloud
  Always Free ARM): API (model preloaded), Postgres + pgvector, Caddy for HTTPS.
- Code changes for free tiers: WhatsApp is optional in production (all-or-nothing);
  connection pools capped (`DB_POOL_MAX`, Prisma `connection_limit`); Node heap
  capped for 512 MB; Prisma CLI is a runtime dependency (migrations at start).
- CI builds the Docker image and validates the compose and Render files.

## Consequences
- $0/month. Option A loses semantic search and depends on the pinger; Option B costs setup time.
- Re-check free-tier terms periodically; the architecture doesn't depend on any one vendor (plain Postgres, Docker).

## Revisit When
Real usage needs more RAM/CPU than free instances give, or a free tier changes.
