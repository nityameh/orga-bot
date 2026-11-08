// @ts-check
// src/memory/embedder.js
// Text → vector embeddings with a free, open-source model running inside the
// Node process (Transformers.js + ONNX Runtime; no API, no per-call cost).
// Default model: multilingual-e5-small (384 dims, ~120 MB quantized) — handles
// English, Hindi and Hinglish. The model downloads once and is cached on disk.
// Docs: docs/modules/memory.md · Decision: ADR-011

/**
 * Port for embedding providers (Strategy pattern). Vectors are L2-normalised,
 * so cosine similarity equals the dot product.
 * @typedef {Object} Embedder
 * @property {string} model
 * @property {(texts: string[]) => Promise<number[][]>} embedQueries   for search queries
 * @property {(texts: string[]) => Promise<number[][]>} embedPassages  for stored content
 */

/**
 * @param {{ model: string, cacheDir: string }} cfg
 * @returns {Embedder}
 */
function createLocalEmbedder({ model, cacheDir }) {
  /** @type {Promise<any> | null} */
  let loading = null;

  // Lazy: the first call pays the load (~1-2 s from disk); the app boots fast.
  function getPipeline() {
    if (!loading) {
      loading = (async () => {
        const { pipeline, env } = await import('@huggingface/transformers');
        env.cacheDir = cacheDir;
        return pipeline('feature-extraction', model, { dtype: 'q8' });
      })();
      loading.catch(() => { loading = null; }); // allow retry after a failed download
    }
    return loading;
  }

  /** @param {string[]} texts */
  async function embed(texts) {
    if (!texts.length) return [];
    const extractor = await getPipeline();
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    return output.tolist();
  }

  // E5 models are trained with these prefixes; omitting them degrades retrieval.
  return {
    model,
    embedQueries: (texts) => embed(texts.map((t) => `query: ${t}`)),
    embedPassages: (texts) => embed(texts.map((t) => `passage: ${t}`)),
  };
}

module.exports = { createLocalEmbedder };
