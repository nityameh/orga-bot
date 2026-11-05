# Module: analytics (interaction insights dashboard)

> **Path:** `src/analytics/`, `src/api/analytics.js`, `dashboard/src/app/dashboard/{insights,activity}/`
> **Status:** Stable (Phase 5)  ·  **Related ADRs:** [ADR-005](../adr/ADR-005-interaction-event-log.md)

## Summary (read this first)
The part of Orga no competitor has: a dashboard that shows **how you work
with the people in your life and what the AI did for you**. It covers activity
over time, when you're most active, which clients you've gone quiet on, how
reliably you act on reminders, and an audit trail of every AI action with its
reason, cost and speed.

## Pages
| Page | Shows |
|---|---|
| **Insights** (`/dashboard/insights`) | KPIs (messages, reminder follow-through, agent p50/p95, AI cost and cache rate), daily messages vs actions, IST weekday × hour heatmap, what Orga did (tool usage, approvals, proactive messages), people sorted by "gone quiet" |
| **Activity** (`/dashboard/activity`) | Filterable timeline (AI actions, proactive, approvals, reminders, notes, logins) with tools, model, latency, cost and trace id; "load more" pagination |

## API (`/api/v1/analytics`, session required)
| Route | Returns |
|---|---|
| `GET /overview?days=30` | `series`, `heatmap` (7×24), `reminders` follow-through, `agent` metrics, `approvals`, `nudges`, `messages` |
| `GET /people` | People/clients: interactions, last interaction, days since, open tasks, `goneQuiet` (≥ 14 days) |
| `GET /timeline?kind=&person=&before=&limit=` | Newest-first events; `kind` supports prefixes (`reminder.*`); keyset pagination via `nextBefore` |

Query params are validated with Zod (400 on bad input). Every query filters by the session user.

## Files
| File | What it contains |
|---|---|
| `src/analytics/insights.js` | Pure aggregations: `dailySeries`, `activityHeatmap`, `peopleInsights`, `reminderFollowThrough` |
| `src/analytics/service.js` | Read models over the Interaction log (`overview`, `people`, `timeline`) |
| `src/interactions/metrics.js` | Shared agent metrics (also used by `npm run metrics`) |
| `src/api/analytics.js` | Routes + query validation |

## Design decisions
| Decision | Why |
|---|---|
| Read models over the append-only Interaction log (CQRS-lite) | One write path; analytics never touches the hot path |
| Keyset pagination (`before` timestamp) | Stable under inserts; no `OFFSET` scans |
| Raw payloads never returned; only whitelisted details for agent turns and nudges | Payloads may grow; the API exposes only what the UI needs |
| Charts in plain CSS/SVG | No charting dependency (free, small bundle) |
| IST bucketing in pure functions | Timezone edges (00:30 IST is the previous UTC day) are unit-tested |
| Message text never stored in Interactions | The audit trail shows actions and titles, not conversations |

## Testing
`test/unit/analytics.test.js` (IST bucketing, heatmap, gone-quiet ordering, follow-through),
`test/integration/analytics.test.js` (auth, user scoping, prefix and person filters, pagination, validation, no payload leaks).
