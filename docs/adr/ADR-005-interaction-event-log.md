# ADR-005: Make an append-only Interaction log the backbone of the system

**Status:** Accepted
**Date:** 2026-11-04
**Deciders:** Nitya

## Context
Three planned features need the same data: the analytics dashboard, the
proactive engine, and the audit trail ("what did the agent do and why?").
Today nothing records interactions; data lives only in Note/Task/Reminder rows.

## Decision
Every significant event is written once to an append-only `Interaction` table:
`id, userId, personId?, channel, source, kind, summary, payload Json,
traceId, tokensIn?, tokensOut?, costMicros?, createdAt`.
- Writes go through one `recordInteraction()` function (single write path).
- Producers use the **Observer pattern**: modules emit domain events on an
  in-process event bus; a subscriber persists them. Producers never import the
  analytics or proactive modules.
- Analytics, proactive rules and audit are read views (CQRS-lite).
- `kind` is a documented enum in `docs/modules/interactions.md`.

## Options Considered
| Option | Pros | Cons |
|---|---|---|
| Single append-only table (chosen) | Simple; one source for 3 features | Table grows; needs indexes + retention |
| Derive analytics from existing tables | No new table | Loses inbound messages, agent actions, emails |
| External analytics (PostHog, Segment) | Rich UI | Personal data leaves our DB; not the learning goal |

## Consequences
- Indexes: `(userId, createdAt)`, `(userId, personId, createdAt)`, `(userId, kind)`.
- Retention: raw payloads pruned after 180 days; summaries kept.
- PII: message text stored, so dashboard auth (ADR-006) is a prerequisite.

## Revisit When
Table passes ~10M rows → partition by month or roll up into aggregate tables.
