# ADR-017: Grow the eval set from real, consented, anonymised messages

**Status:** Accepted
**Date:** 2026-11-06
**Deciders:** Nitya
**Extends:** [ADR-013](ADR-013-evals-as-ci-gate.md)

## Context
The eval suite (32 cases) was written by hand. Hand-written cases miss how
real users actually phrase things (Hinglish, typos, half-sentences, follow-ups).
Real messages are the best test data, but they are personal.

## Decision
1. **Consent:** only users who send `/improve on` (`User.evalOptIn`, default
   false) are harvested. `/improve off` stops it.
2. **Linkage:** conversation messages store the turn's `traceId`, so a message
   can be joined to its `agent.turn` Interaction (tools called, outcome).
3. **Anonymisation:** emails, URLs, Indian phone numbers, long numbers, PAN and
   Aadhaar-like ids are masked; the user's known people/clients (from their own
   Interaction log) become consistent placeholders (`Person1`, …).
4. **Human review gate:** `npm run evals:harvest` writes **draft** cases to
   `evals/review/candidates.json` (git-ignored). Drafts record what the agent
   *did*; a reviewer checks the anonymisation, writes what it *should* do,
   sets `review.approved = true`, and `npm run evals:promote` merges it into
   `evals/agent/cases.json` (suite `real`). Nothing reaches git unreviewed.
5. Stable ids (hash of anonymised text) prevent duplicates.

## Options Considered
| Option | Pros | Cons |
|---|---|---|
| Opt-in + anonymise + human review (chosen) | Privacy-respecting; realistic cases; reviewer fixes wrong agent behaviour | Manual review effort |
| Auto-add every message | Fast growth | Privacy risk; encodes current mistakes as "expected" |
| Synthetic data from an LLM | Unlimited | Misses real phrasing; costs tokens |

## Consequences
- Conversation memory is pruned after 7 days, so harvest at least weekly.
- Anonymisation is pattern-based and can miss things (e.g. unknown names), which is why review is mandatory.

## Revisit When
Reviewing becomes the bottleneck (then add LLM-assisted pre-labelling, still with human approval).
