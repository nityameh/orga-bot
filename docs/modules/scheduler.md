# Module: scheduler

> **Path:** `src/scheduler.js`  ·  **Status:** Stable; replaced by pg-boss jobs in Phase 4 ([ADR-009](../adr/ADR-009-job-queue.md))

## Summary (read this first)
Everything Orga does on a clock rather than in reply to a message: firing
reminders when they're due, sending the Sunday weekly summary, and cleaning up
expired conversational state at night.

## Jobs
| Job | Schedule | What it does |
|---|---|---|
| Reminder poller | every minute | Finds up to 50 `pending` reminders with `fireAt ≤ now`, marks each `fired`, sends it with Done/Snooze buttons. Retries a failed send up to 3 times (30s, 60s) |
| Weekly digest | Sunday 18:00 IST | For users active in the last 7 days: notes saved, tasks completed, next 3 reminders |
| Cleanup | daily 03:00 IST | Deletes expired `PendingAction` rows |

Also exports `handleReminderReply(user, text)` for `DONE` / `SNOOZE` replies
(acts on the most recently fired reminder).

## Edge Cases & Known Limitations
| Situation | Behaviour / limitation |
|---|---|
| Server restarts | No reminder is lost; the next tick re-reads the DB |
| Two app instances | Both poll, so a reminder can fire twice → fixed by pg-boss singleton jobs (Phase 4) |
| Retry timer pending during restart | The `setTimeout` retry is lost; reminder stays `fired` |
| WhatsApp user outside the 24h window | Plain message fails; needs the `reminder_fire` template (Phase 1 channel capabilities) |
| `DONE` with several fired reminders | Applies to the most recent one only |
