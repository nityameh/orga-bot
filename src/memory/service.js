// @ts-check
// src/memory/service.js
// Semantic memory over the user's notes and task lists (ADR-011, ADR-016):
//   index(sourceType, id)   embed content and upsert its pgvector row
//   search(userId, query)   hybrid retrieval: Postgres full-text + pgvector
//                           nearest neighbours (HNSW, cosine), fused with
//                           Reciprocal Rank Fusion
// The embedder is injected (local open-source model in prod, fake in tests).
// Docs: docs/modules/memory.md

const crypto = require('crypto');
const { reciprocalRankFusion } = require('./ranking');

const MAX_CONTENT = 2000;
const MIN_SIMILARITY = 0.75;  // cosine similarity floor (e5 scores are compressed: unrelated ≈ 0.73)
const EF_SEARCH = 100;        // HNSW candidate list; higher = better recall when filtering by user

/** pgvector text literal: '[0.1,0.2,…]' (validated numbers only, never user text). @param {number[]} v */
function toVectorLiteral(v) {
  if (!v.every((x) => Number.isFinite(x))) throw new Error('Embedding contains non-finite values');
  return `[${v.join(',')}]`;
}

/**
 * @param {Object} deps
 * @param {import('@prisma/client').PrismaClient} deps.prisma
 * @param {import('./embedder').Embedder | null} deps.embedder  null → keyword-only search
 * @param {number} [deps.minSimilarity]  cosine floor for vector hits (tests use a fake embedder with a different scale)
 */
function createMemoryService({ prisma, embedder, minSimilarity = MIN_SIMILARITY }) {
  /** @param {'note' | 'task'} type @param {string} id */
  async function loadSource(type, id) {
    if (type === 'note') {
      const n = await prisma.note.findUnique({ where: { id } });
      if (!n || n.deletedAt) return null;
      return { userId: n.userId, content: [n.title, n.body].filter(Boolean).join('\n') };
    }
    const t = await prisma.task.findUnique({ where: { id } });
    if (!t) return null;
    const items = /** @type {any[]} */ (t.items).map((i) => i.text).join('; ');
    return { userId: t.userId, content: `${t.title}: ${items}` };
  }

  /**
   * Embed one note/task and store the vector. Removes the row if the source is gone.
   * @param {'note' | 'task'} sourceType @param {string} sourceId
   */
  async function index(sourceType, sourceId) {
    if (!embedder) return;
    const source = await loadSource(sourceType, sourceId);
    if (!source) {
      await prisma.embedding.deleteMany({ where: { sourceType, sourceId } });
      return;
    }
    const content = source.content.slice(0, MAX_CONTENT);
    const [vector] = await embedder.embedPassages([content]);
    // Raw SQL: Prisma can't write the pgvector type. All values are bound parameters.
    await prisma.$executeRaw`
      INSERT INTO "Embedding" ("id", "userId", "sourceType", "sourceId", "content", "embedding", "model", "createdAt")
      VALUES (${crypto.randomUUID()}, ${source.userId}, ${sourceType}, ${sourceId}, ${content}, ${toVectorLiteral(vector)}::vector, ${embedder.model}, now())
      ON CONFLICT ("sourceType", "sourceId")
      DO UPDATE SET "content" = EXCLUDED."content", "embedding" = EXCLUDED."embedding", "model" = EXCLUDED."model"`;
  }

  /**
   * Keyword retrieval with Postgres full-text search ('simple' dictionary: no
   * stemming, works for mixed English/Hinglish). Ranked by ts_rank.
   * @param {string} userId @param {string} query @param {number} limit
   */
  async function keywordNoteIds(userId, query, limit) {
    const terms = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1).slice(0, 8);
    if (!terms.length) return [];
    const tsquery = terms.join(' | '); // any term matches; rank rewards more matches
    /** @type {Array<{ id: string }>} */
    const rows = await prisma.$queryRaw`
      SELECT id FROM "Note"
      WHERE "userId" = ${userId} AND "deletedAt" IS NULL
        AND to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(body, '')) @@ to_tsquery('simple', ${tsquery})
      ORDER BY ts_rank(to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(body, '')), to_tsquery('simple', ${tsquery})) DESC
      LIMIT ${limit}`;
    return rows.map((r) => `note:${r.id}`);
  }

  /**
   * Nearest neighbours in pgvector (cosine distance `<=>`, HNSW index), scoped
   * to the user and the current model. ef_search is raised inside the
   * transaction so the user filter doesn't starve the approximate search.
   * @param {string} userId @param {string} query @param {number} limit
   */
  async function vectorIds(userId, query, limit) {
    if (!embedder) return [];
    const [queryVector] = await embedder.embedQueries([query]);
    const literal = toVectorLiteral(queryVector);
    const [, rows] = await prisma.$transaction([
      prisma.$executeRawUnsafe(`SET LOCAL hnsw.ef_search = ${EF_SEARCH}`),
      prisma.$queryRaw`
        SELECT "sourceType", "sourceId", 1 - ("embedding" <=> ${literal}::vector) AS score
        FROM "Embedding"
        WHERE "userId" = ${userId} AND "model" = ${embedder.model} AND "embedding" IS NOT NULL
        ORDER BY "embedding" <=> ${literal}::vector
        LIMIT ${limit}`,
    ]);
    return /** @type {Array<{ sourceType: string, sourceId: string, score: number }>} */ (rows)
      .filter((r) => Number(r.score) >= minSimilarity)
      .map((r) => `${r.sourceType}:${r.sourceId}`);
  }

  /**
   * Hybrid search. Returns note/task ids best-first; callers load the rows.
   * Falls back to keyword-only if the embedder is unavailable or fails.
   * @param {string} userId @param {string} query @param {number} [limit]
   * @returns {Promise<{ ids: Array<{ type: 'note' | 'task', id: string }>, mode: 'hybrid' | 'keyword' }>}
   */
  async function search(userId, query, limit = 6) {
    const pool = limit * 3;
    const keyword = keywordNoteIds(userId, query, pool);
    let vector = /** @type {Promise<string[]>} */ (Promise.resolve([]));
    let mode = /** @type {'hybrid' | 'keyword'} */ ('keyword');
    if (embedder) {
      mode = 'hybrid';
      vector = vectorIds(userId, query, pool).catch(() => { mode = 'keyword'; return []; });
    }
    const fused = reciprocalRankFusion([await keyword, await vector]).slice(0, limit);
    return {
      mode,
      ids: fused.map(({ id }) => {
        const [type, sourceId] = id.split(':');
        return { type: /** @type {'note' | 'task'} */ (type), id: sourceId };
      }),
    };
  }

  /** Re-embed everything for one user (or all users) — after a model change or first enable. */
  async function backfill(/** @type {string | undefined} */ userId) {
    if (!embedder) return 0;
    const where = userId ? { userId } : {};
    const [notes, tasks] = await Promise.all([
      prisma.note.findMany({ where: { ...where, deletedAt: null }, select: { id: true } }),
      prisma.task.findMany({ where, select: { id: true } }),
    ]);
    for (const n of notes) await index('note', n.id);
    for (const t of tasks) await index('task', t.id);
    return notes.length + tasks.length;
  }

  return { index, search, backfill, enabled: Boolean(embedder) };
}

/** @typedef {ReturnType<typeof createMemoryService>} MemoryService */

module.exports = { createMemoryService, toVectorLiteral };
