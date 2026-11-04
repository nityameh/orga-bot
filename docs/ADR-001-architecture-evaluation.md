# ADR-001: Evaluation of Current Architecture vs. Documented Design

**Status:** Proposed
**Date:** 2026-08-10
**Deciders:** Nitya (project owner)

## Context

`CLAUDE.md` is declared the single source of truth for Orga and states the project is in **Phase 0 — Meta Setup + Dev Environment**, with "zero feature code" produced yet. The codebase tells a different story: `src/` has 22 files including a router, four intent handlers, a REST API layer, rate limiting, structured logging, and a RAG-based query pipeline. `docs/gap_analysis.md` confirms Phases 1–4 are built. A `dashboard/` Next.js app exists with its own `CLAUDE.md`/`AGENTS.md`. Tests (`vitest`, `playwright`) and CI git hooks are in place.

This ADR evaluates the *actual* architecture against the *documented* one, since several real decisions now conflict with what section 13 of `CLAUDE.md` calls "final for MVP — do not revisit."

## Decision

Treat this as a documentation-debt problem, not a code problem: the build is materially ahead of and different from its own spec. The options below are ways to resolve the conflict.

## Findings — Where Reality Diverges From the Doc

### 1. AI provider: Groq, not Claude
`CLAUDE.md` §3 and §7 mandate `claude-haiku-4-5-20251001` for classification, "never Sonnet," with no other model discussed. `src/classifier.js` uses the Groq SDK (`llama-3.3-70b-versatile`) exclusively, for both classification and the RAG answer-generation step described in `docs/RAG_DESIGN.md`. There is no Anthropic SDK dependency anywhere in `package.json`. Separately, `@google/genai` and `@google/generative-ai` are installed and referenced only by a throwaway connectivity script (`test/test-gemini.js`) — dead weight, not part of any live path.

This isn't a regression — Groq's free tier at 70B parameters is a defensible choice for high-volume, cheap classification — but it directly contradicts the "decisions already made, do not revisit" table, and nobody would know that from reading `CLAUDE.md`.

### 2. A dashboard exists
§1 states Orga is "not a dashboard-first product," and §13 lists "No dashboard at MVP — Dashboard is Phase 3+" as final. `src/api/` (6 files: notes, tasks, reminders, clients, query, middleware, all behind phone-based `authenticate`) is a full REST layer purpose-built to serve `dashboard/`, a separate Next.js app. This is either an intentional pull-forward of Phase 3 or scope creep — the doc gives no way to tell which.

### 3. Undocumented feature: conversational query (RAG)
`docs/RAG_DESIGN.md` describes a four-stage pipeline (classify → keyword retrieve → LLM generate → cite sources) backing a new `QUERY` intent type, plus a `PendingAction` model for multi-step confirmations (e.g., delete flows). None of this exists in `CLAUDE.md` §5 (schema) or §7 (classifier contract) — the classifier system prompt in the doc still lists the old 8-type enum without `QUERY`.

### 4. Schema drift
`prisma/schema.prisma` no longer matches §5: `User.noteCount` was removed (correctly — `docs/gap_analysis.md` GAP 4 flagged it as redundant with a live COUNT query, and it's gone). `Note` gained `pinned` and `archivedAt`. A new `PendingAction` model exists. None of this is reflected back into `CLAUDE.md`.

### 5. Operational hardening beyond Phase 0 scope
Rate limiting (`ratelimiter.js`), structured JSON logging (`logger.js`), a top-level error-reply wrapper, and new-user onboarding are all implemented — matching `gap_analysis.md`'s "do first" priorities. One flagged gap remains genuinely open: **dedup is still in-memory** (`processedIds` Set, capped at 100, in `webhook.js`), which resets on every deploy — `gap_analysis.md` GAP 10 (persistent dedup via a `ProcessedMessage` table) is documented but not built. This is the one place where the gap-analysis doc and the code still agree on what's missing.

## Options Considered

### Option A: Rewrite `CLAUDE.md` to match reality
| Dimension | Assessment |
|---|---|
| Complexity | Low — mechanical, but requires care to not silently relitigate decisions |
| Cost | ~1–2 hours |
| Risk | Low |
| Team familiarity | High — you already know the actual system |

**Pros:** Restores "single source of truth" as true. Removes the risk of a future session (yours or Claude's) re-deriving Phase 0 steps that are already done, or reintroducing Claude Haiku because the doc says to. Section 13's "do not revisit" table currently blocks legitimate, already-shipped decisions (Groq, dashboard) from ever being reconsidered in writing.
**Cons:** One-time effort; will drift again without a habit of updating it.

### Option B: Leave `CLAUDE.md` as historical Phase-0 spec, add a living `CURRENT_STATE.md`
| Dimension | Assessment |
|---|---|
| Complexity | Low |
| Cost | ~30 min to start, ongoing upkeep |
| Risk | Medium — two documents can disagree with each other too |
| Team familiarity | High |

**Pros:** Preserves original intent/rationale as a record. Doesn't require touching a file described as immutable.
**Cons:** You already have this problem with `docs/gap_analysis.md`, `docs/phases/PHASE1-4.md`, `docs/FUTURE.md` etc. — adding another doc without consolidating is more surface area to go stale, not less.

### Option C: Do nothing, treat code as the source of truth going forward
| Dimension | Assessment |
|---|---|
| Complexity | None |
| Cost | None now, high later |
| Risk | High |

**Pros:** No effort today.
**Cons:** `CLAUDE.md` explicitly says "read completely before doing anything... every decision made in this project is documented here" — any future session (including this one) will act on stale premises: wrong AI provider, wrong file structure, wrong phase. This is the option most likely to cause a real bug (e.g., someone adding an Anthropic API key integration nobody asked for, because the doc still says to).

## Trade-off Analysis

The core tension is accuracy vs. churn. Option A costs the least ongoing effort because there's exactly one file to trust, but it means editing a file whose header claims permanence. That's fine — "do not revisit" should mean *decisions*, not *facts about what's built*. The AI-provider swap, the dashboard, and the RAG feature are decisions that already happened; the doc should record them, not fight them. Option C is the only one that actively increases risk with zero benefit.

## Consequences

- **Easier:** any future work session (agent or human) starts from ground truth instead of a three-month-stale snapshot.
- **Harder:** section 13's "final for MVP" framing needs updating to "final unless superseded here" — otherwise every correction looks like a violation of the file's own rules.
- **Needs follow-up:** decide whether the dashboard and RAG query feature are in-scope MVP now or should be flagged as pulled-forward/out-of-charter, since the PRD-level docs (`PRODUCT.md`, `VISION.md`) weren't reviewed in this pass.

## Action Items

1. [ ] Update `CLAUDE.md` §3 (tech stack) and §7 (Claude API rules) to reflect Groq as the classification/generation engine, or make an explicit decision to migrate to Claude Haiku and treat that as a new tracked change.
2. [ ] Update `CLAUDE.md` §13 to record the dashboard and RAG/QUERY feature as accepted scope changes, with a one-line rationale each.
3. [ ] Sync `CLAUDE.md` §5 (schema) with the live `prisma/schema.prisma` (`pinned`, `archivedAt`, `PendingAction`; remove `noteCount`).
4. [ ] Update `CLAUDE.md` §10 to reflect actual phase (Phases 1–4 shipped per `gap_analysis.md`) instead of Phase 0.
5. [ ] Close GAP 10 from `docs/gap_analysis.md` — persistent dedup via `ProcessedMessage` — it's the one real functional gap this review surfaced, not just a documentation one.
6. [ ] Remove unused `@google/genai` / `@google/generative-ai` dependencies and `test/test-gemini.js`, or document why they're kept.
