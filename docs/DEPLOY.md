# Deploying Orga for free

> Two completely free options (ADR-019). **Option A** is quickest and fully managed;
> **Option B** has every feature (local embeddings, no sleeping) on a free VM.
> Free-tier limits change: re-check the providers' pricing pages before relying on them.

```
Option A:  Vercel (dashboard) ──proxy──► Render free (API) ──► Supabase free (Postgres + pgvector)
                                          ▲  kept awake by cron-job.org (every 10 min)
Option B:  Vercel (dashboard) ──proxy──► Oracle Cloud Always Free VM: API + Postgres + Caddy (HTTPS)
Both:      Groq (free LLM key) · Telegram bot (free) · web chat + invites (no phone needed)
```

| Feature | Option A | Option B |
|---|---|---|
| Cost | $0 | $0 (card needed for identity check) |
| Setup effort | ~30 min, all web UIs | ~1–2 h, a Linux VM |
| Semantic search (local embeddings) | Off (keyword search only; 512 MB RAM) | On |
| Cold starts | None while the pinger runs; ~1 min if it lapses | None |
| Limits | 750 Render hours/month (one service 24/7), Supabase 500 MB | VM resources |

---

## Option A — Vercel + Render + Supabase

### 1. Database: Supabase (free)
1. supabase.com → New project → region **Mumbai (ap-south-1)** → set a strong DB password.
2. Project → **Connect** → **Session pooler** connection string (IPv4-compatible, works with Prisma, pg-boss and LangGraph).
3. Append `?connection_limit=5` → this is your `DATABASE_URL`.
   pgvector is available on Supabase; the first migration enables it.

### 2. LLM: Groq (free)
console.groq.com → API Keys → create → `GROQ_API_KEY`.

### 3. API: Render (free)
1. render.com → **New → Blueprint** → select the `orga-bot` repo (uses `render.yaml`).
2. Fill the secret env vars it asks for: `DATABASE_URL`, `DASHBOARD_URL` (fill in after step 4; use a placeholder like `https://example.vercel.app` for now), `GROQ_API_KEY`, and optionally Telegram's two.
3. Deploy. The start command runs `prisma migrate deploy` first. Check `https://<service>.onrender.com/health/ready` → `{"status":"ready"}`.

### 4. Dashboard: Vercel (free)
1. vercel.com → **Add New → Project** → import `orga-bot` → **Root Directory: `dashboard`**.
2. Env var `API_ORIGIN = https://<service>.onrender.com` → Deploy.
3. Copy the Vercel URL and set it as `DASHBOARD_URL` on Render → redeploy the API
   (it is used for invite/login links and CORS).

### 5. Keep the API awake: cron-job.org (free)
cron-job.org → Create cronjob → URL `https://<service>.onrender.com/` → every **10 minutes**.
Without this, Render sleeps after 15 min idle and reminders/proactive jobs pause.

### 6. Telegram (optional, free)
1. @BotFather → `/newbot` → token → `TELEGRAM_BOT_TOKEN`; generate `TELEGRAM_WEBHOOK_SECRET` (`openssl rand -hex 24`). Set both on Render.
2. Register the webhook (locally, with those env vars): `node scripts/setup-telegram.js https://<service>.onrender.com`.

### 7. First invite
Run locally with the production `DATABASE_URL` in `.env`:
```bash
npm run invite:create -- --uses 1 --days 1 --label "me"
```
Open the link → Accept → you're in the web chat. Then make yourself admin:
`npm run admin:grant -- <your user id>` (shown in the dashboard via `/api/v1/auth/me`), so `/invite` works from chat.

---

## Option B — one free VM (all features)
1. Oracle Cloud → Always Free **Ampere A1** VM (e.g. 2 OCPU, 12 GB RAM), Ubuntu; open ports 80/443 in the security list and the VM firewall.
2. Install Docker + Compose plugin, clone the repo, `cp .env.example .env`, fill in secrets.
3. `POSTGRES_PASSWORD=<strong> API_DOMAIN=<ip-with-dashes>.sslip.io docker compose up -d --build`
   (sslip.io gives a free hostname; Caddy gets a Let's Encrypt certificate automatically).
4. Dashboard on Vercel as in Option A step 4 with `API_ORIGIN=https://<ip-with-dashes>.sslip.io`.
5. `docker compose exec api npm run embeddings:backfill` after you have data.

---

## Troubleshooting
| Symptom | Fix |
|---|---|
| Boot fails with "Invalid environment configuration" | The log lists each missing/invalid variable |
| `prepared statement already exists` / too many connections | Use the **session** pooler (port 5432), keep `connection_limit=5`, `DB_POOL_MAX=3` |
| Dashboard redirects to /login after accepting an invite | `API_ORIGIN` on Vercel must point at the API; `DASHBOARD_URL` on the API must be the exact Vercel URL |
| Replies arrive late in the morning | The pinger lapsed and the API slept; check cron-job.org history |
| Supabase project paused | Free projects pause after 7 days with no activity; restore from the dashboard |
