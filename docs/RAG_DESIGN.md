# RAG Feature — Design Document

## Summary

Orga now supports natural language questions over the user's saved data. Instead of just returning a list of matching titles (search), the bot reads the user's notes, tasks, and reminders and answers questions conversationally with source citations.

**Example:**
```
User: what did rahul say about the budget?
Bot:  Rahul confirmed a budget of 50k for the logo project during your
      meeting on 30 Mar. This was later increased to 75k after review.
      
      Sources: "Met Rahul — logo by Friday" (30 Mar), "Rahul project update" (29 Mar)
```

---

## Architecture

```
User Question
      │
      ▼
┌─────────────────┐
│  1. CLASSIFY     │  Groq LLM (llama-3.3-70b)
│                  │  Detects type=QUERY, extracts client/tags/keywords
│                  │  Cost: ~150 tokens
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  2. RETRIEVE     │  PostgreSQL keyword search
│                  │  Parallel queries: notes (10), tasks (5), reminders (5)
│                  │  Signals: client name, tags, keyword from title
│                  │  No vector DB — keyword search sufficient at MVP scale
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  3. GENERATE     │  Groq LLM (llama-3.3-70b)
│                  │  System: "Answer using ONLY these notes"
│                  │  Context: formatted documents (500-2000 tokens)
│                  │  Question: user's original message
│                  │  Cost: ~500 tokens
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  4. REPLY        │  Natural language answer + source citations
│                  │  Format: *Answer* + text + _Sources: ..._
└─────────────────┘
```

**Total cost per query:** ~650 tokens (~$0.00016 on Groq free tier)
**Latency:** ~1.5-2.5 seconds (classify + DB + generate)

---

## Design Decisions

### 1. Why keyword search, not vector search?

| Factor | Keyword Search | Vector Search (pgvector) |
|---|---|---|
| Setup complexity | Zero — already using Prisma/Postgres | Need pgvector extension, embedding model, index |
| Query speed | <50ms for <1000 notes | <50ms with HNSW index |
| Accuracy | Good for entity matching (names, topics) | Better for semantic similarity |
| Cost | Free | Embedding API cost per note |
| When to upgrade | When users have >1000 notes or semantic queries fail | — |

**Decision:** Keyword search for MVP. The LLM handles semantic understanding — the DB just needs to find documents containing relevant entities. At <1000 notes per user, keyword search retrieves the right documents 90%+ of the time.

**Upgrade path:** If users report "it couldn't find my note about X", add pgvector with embeddings. The retrieval function is isolated in `retrieveContext()` — swapping the search strategy requires changing only that function.

### 2. Why two LLM calls, not one?

**Option A (chosen):** Classify first, then retrieve, then generate.
- Pro: Only queries the DB with precise signals (client name, tags)
- Pro: Retrieval is fast and targeted
- Con: Two LLM calls = double latency

**Option B:** Single LLM call with ALL user notes as context.
- Pro: One call, simpler
- Con: Context window limit (8K tokens for Groq) — can't fit all notes
- Con: Expensive — sending all notes every time

**Option C:** Skip classification, extract keywords with regex, then generate.
- Pro: One LLM call
- Con: Keyword extraction is brittle ("what did rahul say about budget" → which keyword?)

**Decision:** Option A. The classifier already exists and is fast (300-500ms). The targeted retrieval means the generation LLM gets only relevant documents, not noise.

### 3. Why temperature 0.3 for generation?

- `0.0` = deterministic, but can sound robotic for natural language answers
- `0.3` = slightly creative, produces more natural sentences while staying factual
- `1.0` = too creative, might hallucinate details
- The system prompt's "ONLY use context" rule constrains hallucination regardless of temperature

### 4. How QUERY is distinguished from SEARCH

| User says | Type | Why |
|---|---|---|
| "/search rahul" | SEARCH | Explicit command, wants a list |
| "find notes about acme" | SEARCH | "find" = list request |
| "what did rahul say about budget?" | QUERY | Question word + "say" = wants an answer |
| "summarize my logo project" | QUERY | "summarize" = wants synthesis |
| "when was my last meeting with acme?" | QUERY | "when was" = wants a specific fact |

The classifier prompt includes explicit examples for both types. In the keyword fallback, question words (what/when/how/who/tell me/summarize) trigger QUERY.

### 5. Fallback strategy

If the second LLM call (generation) fails:
1. Log the error
2. Fall back to returning a simple list of matching items (same as SEARCH)
3. User still gets useful output — just not a synthesized answer

This ensures the feature degrades gracefully under Groq rate limits or outages.

### 6. Context formatting

Documents are formatted as:
```
[NOTE] Title (date) [tags]
Full body text

[TASK] Title (date)
Items: ○ pending item, ✓ done item

[REMINDER] Title — fire time (status)
```

The `[NOTE]`, `[TASK]`, `[REMINDER]` prefixes help the LLM distinguish document types. Dates are included so the LLM can answer "when" questions. Full body text is included (not just titles) so the LLM has the actual content.

### 7. Source citations

Sources are always appended to the answer in italics:
```
_Sources: "Note title" (date), "Task title" (date)_
```

This builds user trust — they can verify the answer by checking the original note. Max 5 sources cited (3 notes + 2 tasks) to keep the reply short.

---

## Files Changed

| File | Change | Purpose |
|---|---|---|
| `src/classifier.js` | Added QUERY type + examples + fallback | Detect question-type messages |
| `src/handlers/query.js` | **NEW** (140 lines) | Core RAG handler: retrieve + generate + format |
| `src/router.js` | Added `case 'QUERY'` | Route to query handler |
| `src/api/query.js` | **NEW** (80 lines) | Dashboard API: POST /api/v1/query |
| `src/api/index.js` | Mount `/query` route | — |

---

## Performance Profile

| Step | Latency | Tokens |
|---|---|---|
| Classify intent | 300-500ms | ~150 |
| DB retrieval (3 parallel queries) | 20-50ms | 0 |
| Generate answer | 500-1000ms | ~500 |
| Format + send reply | <10ms | 0 |
| **Total** | **~1-2 seconds** | **~650** |

At Groq free tier (6000 RPM, 12K TPM), this supports ~18 queries per minute before hitting limits. For a single freelancer, this is more than enough.

---

## Testing

### Test cases implemented in curl-test.js:

1. **Basic question about a client** — "what did rahul say about the budget?"
   - Expected: Answer referencing specific notes with amounts and dates
   
2. **Time-based question** — "when was my last meeting with acme?"
   - Expected: Answer with specific date from notes

3. **Status question** — "what's pending for rahul?"
   - Expected: Answer listing pending tasks and upcoming reminders

4. **No context available** — "what about xyz company?"
   - Expected: "I don't have notes about that."

5. **Summarization** — "summarize my notes on acme"
   - Expected: Multi-sentence synthesis of all acme-related notes

### Dashboard API test:
```bash
curl -X POST http://localhost:3000/api/v1/query?phone=919876543210 \
  -H "Content-Type: application/json" \
  -d '{"question":"what did rahul say about the budget?"}'
```

---

## Limitations

1. **No conversation memory** — each question is independent. "What else?" doesn't work.
2. **Keyword retrieval misses** — "financial discussion" won't find notes about "budget" (no semantic search).
3. **10-note context limit** — if a user has 50 notes about a client, only the 10 most recent are used.
4. **English/Hinglish only** — pure Hindi questions may not classify correctly.
5. **No image/file context** — only text notes are searchable.

---

## Future Improvements

1. **Vector search** — pgvector embeddings for semantic matching
2. **Conversation memory** — remember last 3 questions for follow-ups
3. **Streaming** — stream the LLM response for perceived faster reply on dashboard
4. **Confidence scoring** — if LLM isn't sure, show list instead of answer
