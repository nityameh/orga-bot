// @ts-check
// src/memory/ranking.js
// Pure ranking helpers for hybrid retrieval (ADR-011).
// Docs: docs/modules/memory.md

/**
 * Dot product. Embeddings are L2-normalised, so this equals cosine similarity.
 * @param {number[]} a @param {number[]} b
 */
function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Top-k items by similarity to `query`, ignoring weak matches.
 * @template {{ vector: number[] }} T
 * @param {number[]} query @param {T[]} items @param {number} k @param {number} [minScore]
 * @returns {Array<T & { score: number }>}
 */
function topK(query, items, k, minScore = 0.75) {
  return items
    .map((item) => ({ ...item, score: dot(query, item.vector) }))
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * Reciprocal Rank Fusion: merge ranked lists from different retrievers
 * (keyword, vector) without calibrating their scores against each other.
 * score(d) = Σ 1 / (k + rank_i(d)). k = 60 is the standard constant.
 * @param {string[][]} rankedLists  each list = ids, best first
 * @param {number} [k]
 * @returns {Array<{ id: string, score: number }>}
 */
function reciprocalRankFusion(rankedLists, k = 60) {
  /** @type {Map<string, number>} */
  const scores = new Map();
  for (const list of rankedLists) {
    list.forEach((id, index) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1)));
  }
  return [...scores.entries()].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
}

module.exports = { dot, topK, reciprocalRankFusion };
