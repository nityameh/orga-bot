# Module: scheduler

> **Path:** `src/scheduler.js`  ·  **Status:** Stable; replaced by pg-boss jobs in Phase 4 ([ADR-009](../adr/ADR-009-job-queue.md))

## Summary (read this first)
Everything Orga does on a clock rather than in reply to a message: firing
reminders when they're due, sending the Sunday weekly summary, and cleaning up
expired conversational state at night.

## Jobs
| Job | Schedule | What it does |
|---|---|---|
| Reminder poller | every minute | Finds up to 50 `pending` reminders with `fireAt ≤ now`, marks each `fired`, sends via `notifyUser` with Done/Snooze buttons (or the `reminder_fire` template outside WhatsApp's 24h window). Retries a failed send up to 3 times (30s, 60s) |
| Weekly digest | Sunday 18:00 IST | For users active in the last 7 days: notes saved, tasks completed, next 3 reminders (`weekly_digest` template fallback) |
| Cleanup | daily 03:00 IST | Deletes expired `PendingAction` rows |

Also exports `handleReminderReply(user, message)` for `DONE` / `SNOOZE` replies
(acts on the most recently fired reminder).

## Edge Cases & Known Limitations
| Situation | Behaviour / limitation |
|---|---|
| Server restarts | No reminder is lost; the next tick re-reads the DB |
| Two app instances | Safe: each reminder is claimed with a conditional update; only the claimant sends it |
| Retry timer pending during restart | The `setTimeout` retry is lost; reminder stays `fired` |
| WhatsApp user outside the 24h window | Sent as the approved `reminder_fire` / `weekly_digest` template (see [channels.md](channels.md)) |
| `DONE` with several fired reminders | Applies to the most recent one only |
