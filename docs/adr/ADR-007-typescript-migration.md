# ADR-007: Migrate the backend to TypeScript incrementally

**Status:** Proposed
**Date:** 2026-11-04
**Deciders:** Nitya

## Context
The backend is ~3,500 lines of CommonJS JavaScript; the dashboard is already
TypeScript. Interfaces such as `ChannelAdapter`, `LLMProvider` and `Tool` are
central to the new design and are best enforced by a compiler. Most code will be
AI-written: a type checker catches a large class of AI mistakes automatically.

## Decision
- Add `tsconfig.json` with `allowJs` + `checkJs`, `strict: true`.
- All **new** modules are written in TypeScript; existing files migrate when touched.
- Runtime validation at boundaries (webhooks, API bodies, LLM outputs, env) with
  **Zod**, and types inferred from the schemas (one source of truth).
- `npm run typecheck` is a required CI step.

## Options Considered
| Option | Pros | Cons |
|---|---|---|
| Incremental TS (chosen) | No big-bang rewrite; immediate safety for new code | Mixed codebase for a while |
| Big-bang rewrite | Clean | Weeks of no features; high risk |
| JSDoc types only | No build step | Weaker tooling; reads worse on a resume |

## Consequences
- Build step (`tsc` or `tsx` in dev). Railway start command changes.
- Shared types between backend and dashboard become possible.

## Revisit When
Accepted once the build setup is merged.
