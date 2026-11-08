# ADR-002: Reposition Orga as a personal AI agent with interaction analytics

**Status:** Accepted
**Date:** 2026-11-04
**Deciders:** Nitya

## Context
v1 was a WhatsApp notes/tasks/reminders bot for Indian freelancers. Instinct-style
agents (calendar, email, proactive, task execution) now define the category.
Orga is a personal project for the owner, friends and colleagues, and a
portfolio piece that must meet industry engineering standards.

## Decision
Build a personal AI agent reachable on WhatsApp and Telegram that:
1. connects to Google Calendar and Gmail and gathers context itself,
2. acts through tools with human approval for risky actions,
3. messages the user proactively,
4. logs every interaction and exposes organisation + analytics in a dashboard.

## Options Considered
| Option | Pros | Cons |
|---|---|---|
| Personal agent + analytics (chosen) | Strong portfolio signal; unique analytics angle; no commercial risk | Large scope; must be phased |
| Stay a notes bot | Small, done | Weak differentiation; not resume-grade |
| Commercial Instinct clone | Big upside | Meta's Jan-2026 Business API terms bar general-purpose AI bots; funded competitors |

## Consequences
- Positive: clear differentiator (interaction analytics + transparency).
- Negative: v1 decisions in CLAUDE.md §13 are superseded; more infrastructure.
- Follow-up: ADR-003 to ADR-014; roadmap in `docs/ROADMAP.md`.

## Revisit When
Usage grows past ~50 users or the project becomes commercial.
