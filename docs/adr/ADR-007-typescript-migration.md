# ADR-007: Static typing via TypeScript-checked JavaScript (JSDoc), Zod at boundaries

**Status:** Accepted (amended 2026-11-05 during Phase 0 implementation)
**Date:** 2026-11-04
**Deciders:** Nitya

## Context
The backend is ~3,500 lines of CommonJS JavaScript; the dashboard is already
TypeScript. Interfaces such as `AuthRepository`, `ChannelAdapter`, `LLMProvider`
and `Tool` are central to the design and are best enforced by a compiler. Most
code is AI-written, and a type checker catches a large class of AI mistakes.

The original proposal was incremental `.ts` files. While implementing it we
found a blocker: legacy CommonJS modules `require()` new modules, and neither
Node's `require` nor Vitest's module runner load `.ts` through `require` without
a build step or loader hooks. That would mean a build pipeline before any feature work.

## Decision
- Type-check JavaScript with the TypeScript compiler: `tsconfig.json` with
  `allowJs`, `strict`, `noEmit`. `npm run typecheck` is a required CI step.
- Files opt in with `// @ts-check`. **All new modules must opt in**, and legacy
  files opt in when they are substantially modified.
- Types are written as JSDoc (`@typedef`, `@param`, `@returns`); interfaces are
  `@typedef` object types (see `AuthRepository` in `src/auth/authService.js`).
- Runtime validation at every boundary (env, webhooks, API bodies, LLM output)
  uses **Zod**, with static types inferred via `z.infer` so there is one source of truth.
- No build step: production runs the source directly.

## Options Considered
| Option | Pros | Cons |
|---|---|---|
| TS-checked JS via JSDoc (chosen) | Same type safety in CI; zero build step; works with CommonJS `require` today | JSDoc is more verbose than TS syntax |
| Incremental `.ts` files | Nicer syntax | Needs a build step or loader hooks for mixed CJS; blocked feature work |
| Big-bang rewrite to TS | Clean | Weeks of no features; high risk |

Industry precedent: Svelte and webpack type-check their JavaScript with JSDoc.

## Consequences
- `npm run typecheck` (tsc) is a merge gate.
- A later move to `.ts` stays possible: JSDoc types translate mechanically.

## Revisit When
A build step is introduced for another reason (bundling, ESM migration), at
which point new modules can switch to `.ts` syntax.
