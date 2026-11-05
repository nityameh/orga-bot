# ADR-016: pgvector as the vector database for retrieval

**Status:** Accepted
**Date:** 2026-11-06
**Deciders:** Nitya
**Supersedes:** the "in-process cosine over Float[]" part of [ADR-011](ADR-011-memory-and-hybrid-retrieval.md)

## Context
Phase 4 stored embeddings as `Float[]` and computed cosine similarity in the
Node process, loading up to 5,000 vectors per user per query. It was free and
fast at tiny scale, but it isn't a vector database: every search moves all of a
user's vectors over the network and scans them linearly, and there is no index.

## Decision
Use **pgvector** inside the existing Postgres:
- Column `Embedding.embedding vector(384)` (multilingual-e5-small dimensions).
- **HNSW** index with `vector_cosine_ops`; queries order by the `<=>` cosine-distance operator.
- `SET LOCAL hnsw.ef_search = 100` per query so filtering by `userId` doesn't starve the approximate search.
- Reads and writes use parameterised `$queryRaw`/`$executeRaw` (Prisma models the column as `Unsupported`).
- CI uses the `pgvector/pgvector:pg16` image; a drift-check script accepts the HNSW index, which Prisma can't express.

## Options Considered
| Option | Pros | Cons |
|---|---|---|
| pgvector in existing Postgres (chosen) | Free; same transactions, joins and user scoping as the rest of the data; ANN index | Needs the extension on the host (Railway pgvector template / Docker locally) |
| Qdrant / Weaviate / Chroma (self-hosted) | Purpose-built, filtering features | Another always-on service to pay for and secure; data duplicated outside the DB |
| Pinecone (managed) | No ops | Paid beyond free tier; user data leaves our database |
| Keep in-process scan | No extension needed | Not a vector DB; O(n) per query; network-heavy |

## Consequences
- Existing Phase 4 vectors are dropped by the migration; run `npm run embeddings:backfill`.
- Local development needs Postgres with pgvector (e.g. `docker run pgvector/pgvector:pg16`).
- Changing the embedding model's dimensions requires a migration (column type is fixed).

## Revisit When
A user exceeds ~1M vectors, or filtered recall measured by retrieval evals drops (then consider partial indexes per user or pgvector iterative scans).
