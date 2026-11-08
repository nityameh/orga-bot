# Deploying Orga for free

> Three completely free options. **Option A (recommended)** runs everything on
> Vercel with Supabase for Postgres ([ADR-020](adr/ADR-020-vercel-serverless.md)).
> **Option B** puts the API on Render as a normal server ([ADR-019](adr/ADR-019-free-deployment.md)).
> **Option C** runs every feature on one free VM.
> Free-tier limits change: re-check the providers' pricing pages before relying on them.

```
Option A:  Vercel "orga-dashboard" ──proxy /api/v1──► Vercel "orga-api" (serverless) ──► Supabase
                                                      ▲ cron-job.org: POST /internal/tick every minute
Option B:  Vercel (dashboard) ──proxy──► Render free (API, pg-boss) ──► Supabase   (+ pinger every 10 min)
Option C:  Vercel (dashboard) ──proxy──► Oracle Cloud Always Free VM: API + Postgres + Caddy (HTTPS)
All:       Groq (free LLM key) · Telegram bot (free) · web chat + invites (no phone needed)
```

| | A: all Vercel | B: Render | C: free VM |
|---|---|---|---|
| Setup effort | ~20 min, web UIs | ~30 min, web UIs | ~1–2 h, Linux |
| Semantic search (local embeddings) | Off (full-text search) | Off (512 MB RAM) | On |
| Idle behaviour | Cold start of ~1–2 s on the first request | Sleeps if the pinger lapses (~1 min to wake) | Always on |
| Scheduler | `/internal/tick` called by an external cron | pg-boss in-process | pg-boss in-process |

---

## Option A: all on Vercel + Supabase (recommended)

> **Fast path with the Vercel CLI** (projects `orga-api` at the repo root and
> `orga-dashboard` with root `dashboard` are already linked):
> 1. `cp .env.vercel.example .env.vercel` and fill it in (steps 1–3 below explain each value).
> 2. `npm run vercel:env` validates the file and pushes it to `orga-api` → Production, without printing values.
> 3. `npx vercel deploy --prod` from the repo root deploys the API.
> 4. Dashboard (run from the repo root; it uses `dashboard/vercel.json`):
>    `VERCEL_ORG_ID=… VERCEL_PROJECT_ID=<from dashboard/.vercel/project.json> npx vercel deploy --prod --local-config dashboard/vercel.json`
> 5. cron-job.org as in step 7.
>
> The web UI steps below do the same thing by hand.

### 1. Database: Supabase connection strings
Open your Supabase project → **Connect** (top bar) → connection strings. You need
two URLs with the same host and password:

| Env var | Which pooler | Port | Append |
|---|---|---|---|
| `DATABASE_URL` | **Transaction** pooler (made for serverless) | 6543 | `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | **Session** pooler (migrations need it) | 5432 | nothing |

They look like
`postgresql://postgres.<project-ref>:<password>@aws-<n>-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`.
If your password contains `@ : / ? #`, URL-encode those characters. pgvector is
available on Supabase, and the first migration enables it.

### 2. LLM: Groq (free)
console.groq.com → API Keys → create → `GROQ_API_KEY`.

### 3. A cron secret
`openssl rand -hex 24` (or any random string of 16+ characters) → `CRON_SECRET`.

### 4. API project on Vercel
1. vercel.com → **Add New → Project** → import `orga-bot` → **Root Directory: `./`** (repo root).
   Framework preset: **Other**. Leave the build settings alone: `vercel.json` sets them.
2. Environment variables. Set them for the **Production** environment only, so
   preview deployments of branches never touch your real database:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | transaction pooler URL (step 1) |
   | `DIRECT_URL` | session pooler URL (step 1) |
   | `NODE_ENV` | `production` |
   | `CRON_SECRET` | from step 3 |
   | `GROQ_API_KEY` | from step 2 |
   | `DASHBOARD_URL` | `https://placeholder.vercel.app` for now (fixed in step 6) |
   | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | optional |

3. Deploy. The build runs `prisma migrate deploy` (production builds only) through `DIRECT_URL`.
4. Check `https://<api-project>.vercel.app/health/ready` → `{"status":"ready"}`.

### 5. Dashboard project on Vercel
1. **Add New → Project** → import `orga-bot` **a second time** → **Root Directory: `dashboard`** (preset: Next.js).
2. Env var `API_ORIGIN = https://<api-project>.vercel.app` → Deploy.

### 6. Connect them
On the **API** project, set `DASHBOARD_URL` to the dashboard's URL (exact, `https://`,
no trailing slash) → **Deployments → Redeploy**. It is used for invite and login links and for CORS.

### 7. Scheduler: cron-job.org (free)
cron-job.org → **Create cronjob**:
- URL `https://<api-project>.vercel.app/internal/tick`, schedule **every 1 minute**
- Advanced → request method **POST**, header `Authorization: Bearer <CRON_SECRET>`

Check the job's history: it should show **200** with a body like
`{"reminders":0,"ran":[],"failed":[]}`. A `401` means the header doesn't match; a
`404` means `CRON_SECRET` isn't set on the API.

### 8. First invite and admin
On your machine, temporarily set `DATABASE_URL` in `.env` to the production
**session** pooler URL, then:
```bash
npm run invite:create -- --uses 1 --days 1 --label "me"
```
Open the link → Accept → you're in the web chat. Make yourself admin so `/invite`
works from chat: `npm run admin:grant -- <your user id>` (your id is shown at
`https://<dashboard>/api/v1/auth/me`). Then restore your local `.env`.

### 9. Telegram (optional)
`node scripts/setup-telegram.js https://<api-project>.vercel.app` (with the two Telegram variables in your local env).

---

## Option B: Vercel (dashboard) + Render (API) + Supabase
The API runs as a normal server: pg-boss schedules jobs in-process and `/internal/tick` stays disabled.

1. **Database:** Supabase → **Connect** → **Session pooler** URL (pg-boss needs session mode).
   Append `?connection_limit=5` → `DATABASE_URL`; the same URL without the suffix → `DIRECT_URL`.
2. **LLM:** a Groq key as in Option A.
3. **API:** render.com → **New → Blueprint** → select `orga-bot` (uses `render.yaml`). Fill in
   `DATABASE_URL`, `DIRECT_URL`, `DASHBOARD_URL` (placeholder at first), `GROQ_API_KEY` and
   optionally Telegram. The start command runs `prisma migrate deploy` first. Check
   `https://<service>.onrender.com/health/ready`.
4. **Dashboard:** as in Option A step 5, with `API_ORIGIN = https://<service>.onrender.com`;
   then set `DASHBOARD_URL` on Render and redeploy.
5. **Keep it awake:** cron-job.org → GET `https://<service>.onrender.com/` every **10 minutes**.
   Without it, Render sleeps after 15 min idle and reminders pause.
6. **First invite / Telegram:** as in Option A steps 8–9 with the Render URL.

---

## Option C: one free VM (all features)
1. Oracle Cloud → Always Free **Ampere A1** VM (e.g. 2 OCPU, 12 GB RAM), Ubuntu; open ports 80/443 in the security list and the VM firewall.
2. Install Docker + the Compose plugin, clone the repo, `cp .env.example .env`, fill in secrets.
3. `POSTGRES_PASSWORD=<strong> API_DOMAIN=<ip-with-dashes>.sslip.io docker compose up -d --build`
   (sslip.io gives a free hostname; Caddy gets a Let's Encrypt certificate automatically).
4. Dashboard on Vercel as in Option A step 5 with `API_ORIGIN=https://<ip-with-dashes>.sslip.io`.
5. `docker compose exec api npm run embeddings:backfill` after you have data.

---

## Troubleshooting
| Symptom | Fix |
|---|---|
| "Invalid environment configuration" (boot or function logs) | The message lists each missing or invalid variable. On Vercel, variables must be set for **Production** |
| `prepared statement "s0" already exists` (Vercel) | `DATABASE_URL` uses the transaction pooler (6543) without `?pgbouncer=true` |
| Vercel build fails at `prisma migrate deploy` | `DIRECT_URL` is missing or points at 6543; it must be the session pooler (5432) |
| Reminders never fire (Vercel) | cron-job.org history: 401 = wrong header, 404 = `CRON_SECRET` unset on the API, or the job is disabled |
| Too many connections (Render/VM) | Session pooler (5432), `connection_limit=5`, `DB_POOL_MAX=3` |
| Dashboard redirects to /login after accepting an invite | `API_ORIGIN` on the dashboard must point at the API; `DASHBOARD_URL` on the API must be the exact dashboard URL |
| Replies arrive late in the morning (Render) | The pinger lapsed and the API slept; check cron-job.org history |
| Supabase project paused | Free projects pause after 7 days with no activity; restore from the Supabase dashboard |
