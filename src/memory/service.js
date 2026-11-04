// @ts-check
// src/memory/service.js
// Semantic memory over the user's notes and task lists (ADR-011):
//   index(sourceType, id)   embed content and upsert its Embedding row
//   search(userId, query)   hybrid retrieval: Postgres full-text + vector
//                           similarity, fused with Reciprocal Rank Fusion
// The embedder is injected (local open-source model in prod, fake in tests).
// Docs: docs/modules/memory.md

const { topK, reciprocalRankFusion } = require('./ranking');

const MAX_VECTORS_PER_USER = 5000; // in-process scan stays ~ms at this size
const MAX_CONTENT = 2000;

/**
 * @param {Object} deps
 * @param {import('@prisma/client').PrismaClient} deps.prisma
 * @param {import('./embedder').Embedder | null} deps.embedder  null → keyword-only search
 */
function createMemoryService({ prisma, embedder }) {
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
    await prisma.embedding.upsert({
      where: { sourceType_sourceId: { sourceType, sourceId } },
      create: { userId: source.userId, sourceType, sourceId, content, vector, model: embedder.model },
      update: { content, vector, model: embedder.model },
    });
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

  /** @param {string} userId @param {string} query @param {number} limit */
  async function vectorIds(userId, query, limit) {
    if (!embedder) return [];
    const [queryVector] = await embedder.embedQueries([query]);
    const rows = await prisma.embedding.findMany({
      where: { userId, model: embedder.model },
      select: { sourceType: true, sourceId: true, vector: true },
      take: MAX_VECTORS_PER_USER,
      orderBy: { createdAt: 'desc' },
    });
    return topK(queryVector, rows, limit).map((r) => `${r.sourceType}:${r.sourceId}`);
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

module.exports = { createMemoryService };
