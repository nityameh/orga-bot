# Module: memory (semantic search over the user's data)

> **Path:** `src/memory/`  ·  **Status:** Stable (Phase 4)  ·  **Related ADRs:** [ADR-011](../adr/ADR-011-memory-and-hybrid-retrieval.md)

## Summary (read this first)
Lets Orga find saved notes by **meaning**, not just exact words. "What did
Ravi say about money?" finds "Ravi approved 50k", and it works for Hindi and
Hinglish too. It runs a free, open-source AI model inside Orga's own server,
so there is **no per-use cost** and no data is sent to an outside service.

## How it works
```
note/task created ─► event bus ─► memory subscriber ─► embed text (local model) ─► Embedding row
                                                               (multilingual-e5-small, 384 numbers)

search("what did ravi approve for budget")
   ├─ keyword: Postgres full-text search (ts_rank), 'simple' dictionary
   ├─ meaning: embed query → compare with the user's vectors (dot product)
   └─ Reciprocal Rank Fusion → best results first (falls back to keyword-only if the model is unavailable)
```
Used by the `search_notes` agent tool, by the agent's automatic "relevant
notes" context, and by the meeting-prep proactive rule.

## Files
| File | What it contains |
|---|---|
| `embedder.js` | `createLocalEmbedder()`: Transformers.js pipeline, lazy-loaded, E5 `query:`/`passage:` prefixes |
| `ranking.js` | `dot`, `topK`, `reciprocalRankFusion` (pure) |
| `service.js` | `index`, `search`, `backfill` (storage + retrieval, embedder injected) |
| `index.js` | Composition root + event-bus subscriber that keeps embeddings in sync |

## Cost-driven design decisions
| Decision | Free choice | Paid alternative avoided | Revisit when |
|---|---|---|---|
| Embedding model | `Xenova/multilingual-e5-small` in-process (ONNX, int8) | Embedding APIs | Retrieval quality evals show misses |
| Vector storage | `Float[]` column in the existing Postgres; cosine in-process | pgvector / vector DB | > ~20k items per user or search > 100 ms |
| Keyword search | Postgres full-text (built in) | Search service | — |
| Full-text index | None (query is already narrowed by `userId`) | — | Notes per user > ~10k |

## Operations
- First start downloads the model (~120 MB) to `MODEL_CACHE_DIR`; later loads take ~1–2 s.
- `npm run embeddings:check` verifies the real model (also a CI job).
- `npm run embeddings:backfill` embeds existing notes (after enabling or changing `EMBEDDING_MODEL`).
- `EMBEDDINGS=off` disables it entirely; search falls back to keywords.

## Edge Cases
| Situation | Behaviour |
|---|---|
| Model download fails | Search runs keyword-only; the next call retries the load |
| Note deleted | Re-index removes its embedding |
| Model changed | Old vectors ignored (`model` column) until backfilled |
| Another user's ids | Search filters by `userId` at every step |

## Testing
`test/unit/memory.proactive.test.js` (ranking/RRF), `test/integration/memory.proactive.test.js`
(real Postgres full-text + deterministic hash embedder), CI job `embeddings` (real model, English + Hinglish).
