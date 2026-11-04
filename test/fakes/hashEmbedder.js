// test/fakes/hashEmbedder.js
// Deterministic stand-in for the real embedding model: bag-of-words hashed into
// a small normalised vector. Shared words → high similarity. No downloads, no
// randomness — lets tests exercise the vector path and RRF end to end.

const DIMS = 64;

function hashWord(word) {
  let h = 2166136261;
  for (const ch of word) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Math.abs(h) % DIMS;
}

function embed(text) {
  const v = new Array(DIMS).fill(0);
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 2)) v[hashWord(w)] += 1;
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

function createHashEmbedder() {
  return {
    model: 'test-hash-64',
    embedQueries: async (texts) => texts.map(embed),
    embedPassages: async (texts) => texts.map(embed),
  };
}

module.exports = { createHashEmbedder };
