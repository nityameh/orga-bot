# Demo Runbook: showing Orga live in an interview

> Goal: the interviewer opens one link and is chatting with Orga within 30
> seconds, with no phone number or app install. Then you show the architecture
> through the dashboard. Total: ~5 minutes.

## Before the interview (one-time setup)
1. **Deploy for free** following [DEPLOY.md](DEPLOY.md): Vercel (API + dashboard) + Supabase
   (Postgres + pgvector) + cron-job.org calling `/internal/tick`, with a free Groq key.
2. **Smoke test:** open `<api>/health/ready` → `{"status":"ready"}`.
3. **Make yourself admin:** redeem an invite yourself, then `npm run admin:grant -- <yourUserId>`.
4. **Warm up:** send one message a few minutes before, so the function is warm (no cold start).
5. **Check numbers:** `npm run metrics` and `npm run evals`, and put real figures in `docs/METRICS.md`.

## Right before the call
```bash
npm run invite:create -- --uses 3 --days 2 --label "Interview: <company>"
```
Or, in your own Orga chat: `/invite 3 2`. Paste the link into the meeting chat.

## The 5-minute script
| Step | Interviewer does / you show | What it proves |
|---|---|---|
| 1 | Opens the link → "You're invited to Orga" → Accept | Invite-only onboarding, magic session (ADR-018, ADR-006) |
| 2 | Types: `remind me kal shaam 5 baje to call Ravi` | Hinglish + IST time resolution, server-side validation, absolute time in the reply |
| 3 | Types: `actually make it 6` | Conversation memory + `reschedule_reminder` |
| 4 | Types: `note: Acme wants the logo in blue, budget 50k` then `what did acme want?` | Tools + hybrid retrieval (pgvector + full-text) |
| 5 | (If your Google is connected, on your screen) `set up a call with ravi@acme.com Monday 3pm` → **Approve** | LangGraph `interrupt()` → human approval → same turn resumes |
| 6 | Open **Insights** | Activity, heatmap, reminder follow-through, agent latency/cost |
| 7 | Open **Activity** | Every AI action with tools, model, latency, cost, trace id: the transparency story |
| 8 | (Optional) show GitHub Actions + `docs/adr/` | CI gates, evals, decision records |

## If something goes wrong live
| Symptom | Say / do |
|---|---|
| Model slow or down | "There's a fallback chain with a circuit breaker; if all models are down, commands still work without AI." Try `/today`. |
| Invite says used up | Create another: `/invite` in your chat |
| No reply in web chat | Check `<api>/health/ready`; replies are polled every 1.5 s |

## After the interview
Revoke the link: `npm run invite:create -- --revoke ORGA-XXXX-XXXX`.
