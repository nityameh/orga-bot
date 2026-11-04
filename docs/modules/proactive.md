# Module: proactive (Orga messages you first)

> **Path:** `src/proactive/`  ·  **Status:** Stable (Phase 4)  ·  **Related ADRs:** [ADR-009](../adr/ADR-009-job-queue.md)

## Summary (read this first)
Orga sometimes messages the user without being asked: a morning brief, notes
before a meeting, a nudge about tasks left open. Guardrails stop it from
becoming spam: users can turn it off with `/quiet`, it never messages at night,
it sends at most a few a day, and it never sends the same thing twice. Every
nudge is logged with *why* it was sent.

## Rules
| Rule | When (IST) | Sends only if |
|---|---|---|
| `morning_brief` | 08:30 daily | There are reminders, meetings or open tasks today |
| `meeting_prep` | every 10 min | A calendar event starts in 20–40 min **and** saved notes relate to it |
| `stale_tasks` | Monday 10:00 | Task items have been open for more than 7 days |

## Guards (applied by the engine to every rule)
1. User opted in (`User.proactive`, toggled by `/quiet`)
2. Not quiet hours (22:00–08:00 IST)
3. Not already sent (`dedupeKey` stored on the `nudge.sent` Interaction)
4. Under `PROACTIVE_DAILY_LIMIT` per user per IST day (default 3)

Delivery uses `notifyUser()`: most recent channel, and the approved WhatsApp
template outside the 24-hour window.

## Files
| File | What it contains |
|---|---|
| `engine.js` | `createProactiveEngine()`: guards, run loop, outcome counts (pure apart from injected store) |
| `rules.js` | The three built-in rules |
| `index.js` | Wiring + `node-cron` schedules (`startProactiveJobs`, called at boot) |

## Adding a rule
Write `{ name, schedule, findCandidates(now) }` in `rules.js` returning
`{ user, message, reason, dedupeKey }[]`, and add it to the returned list. The
engine's guards apply automatically (Open/Closed Principle).

## Design decisions
| Decision | Why |
|---|---|
| Rule-based relevance, no LLM per nudge | Free and predictable; LLM summaries can be added per rule later |
| Same process, `node-cron` (no separate worker) | One Railway service instead of two; reminders are claimed with a conditional update so two instances can't double-send |
| Every nudge is an Interaction with `reason` | Transparency: the analytics dashboard can explain each message |

## Testing
`test/unit/memory.proactive.test.js` (every guard, failed delivery, IST quiet-hour edges),
`test/integration/memory.proactive.test.js` (rules on real data, opt-out).
