# ADR-011: Long-term memory and hybrid retrieval on pgvector

**Status:** Proposed
**Date:** 2026-11-04
**Deciders:** Nitya

## Context
`docs/RAG_DESIGN.md` uses keyword retrieval only. "What did Priya say about the
budget?" fails when the note says "cost estimate". The agent also has no memory
of facts about people beyond raw notes.

## Decision
1. **Hybrid search:** store embeddings in Postgres with the `pgvector`
   extension; combine vector similarity and Postgres full-text search using
   Reciprocal Rank Fusion. Every answer cites its source rows.
2. **Contextual chunks:** before embedding, prefix each chunk with a short
   LLM-written context ("Email from Acme about invoice #42, Oct 2026").
3. **Memory layers:**
   - *Episodic:* the Interaction log (ADR-005).
   - *Semantic:* `Memory` facts about people and preferences
     ("Priya prefers calls after 4pm"), extracted by a nightly
     consolidation job that merges, updates and expires facts.
   - Users can view, edit and delete memories in the dashboard.
4. Embedding provider sits behind an `EmbeddingProvider` interface (Strategy).

## Options Considered
| Option | Pros | Cons |
|---|---|---|
| pgvector in existing DB (chosen) | No new service; joins with user data; row-level scoping | Less tuned than dedicated stores at huge scale |
| Pinecone / Weaviate | Managed | Data duplicated outside the DB; tenant isolation harder |
| Keyword only (current) | Simple | Misses paraphrases |

## Consequences
- Retrieval quality measured with a labelled set (recall@5) in the eval suite.

## Revisit When
More than ~5M chunks, or latency of hybrid search exceeds 300 ms p95.
