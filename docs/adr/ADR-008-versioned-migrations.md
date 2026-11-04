# ADR-008: Use versioned Prisma migrations instead of `db push`

**Status:** Accepted
**Date:** 2026-11-04
**Deciders:** Nitya

## Context
Schema changes are applied with `prisma db push`, and `.gitignore` excludes
`prisma/migrations/`. There is no history of schema changes, no review of them,
and no safe way to roll production forward. Upcoming changes (ChannelIdentity,
Interaction, Integration, Session, pgvector) include data migrations.

## Decision
- Remove `prisma/migrations/` from `.gitignore`; baseline the current schema.
- Developers run `prisma migrate dev`; production runs `prisma migrate deploy`
  as a Railway pre-deploy command.
- Every migration is reviewed in its PR. Destructive changes use
  expand → migrate data → contract across separate deploys.

## Consequences
- `npm run db:push` is removed for anything except throwaway local databases.
- CI runs migrations against a fresh Postgres container before tests.

## Revisit When
Never for this project; this is baseline practice.
