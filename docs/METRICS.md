# Project Metrics

> Real numbers for the resume and for tracking quality over time. Update in the
> PR that changes them. Never estimate: if a number hasn't been measured, leave "—".

| Metric | Value | Measured | How |
|---|---|---|---|
| Automated tests | 170 unit tests + 9 integration suites (real Postgres + pgvector + pg-boss) in CI | 2026-11-05 (Phase 2) | `npm test` |
| CI checks per PR | lint, typecheck, migrations, schema drift, tests + coverage gates, dashboard build, npm audit, gitleaks, CodeQL, commitlint, evals | 2026-11-05 | `.github/workflows/` |
| Embedding model check (real model, CI) | related 0.83 · Hinglish 0.81 · unrelated 0.73 (cosine, 384 dims) | 2026-11-05 | `npm run embeddings:check` |
| Agent eval cases | 32 across 10 suites (incl. follow-ups, Hinglish times, prompt injection) | 2026-11-05 | `evals/agent/cases.json` |
| Agent eval pass rate | — (needs a valid LLM API key) | — | `npm run evals` |
| p50 / p95 agent latency | — | — | `npm run metrics` (production) · `npm run evals` (per case) |
| Cost per agent turn · tokens per turn · cache hit rate | — | — | `npm run metrics` |
| Provider failovers | — | — | `npm run metrics` |
| Active users · messages per active day | — | — | `npm run metrics` |
