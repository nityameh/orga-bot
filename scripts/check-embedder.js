// scripts/check-embedder.js
// Smoke test for the REAL embedding model (runs in CI; downloads ~120 MB once,
// cached). Checks dimensions and that meaning-based retrieval works across
// English and Hinglish: the related passage must outscore the unrelated one.
//   node scripts/check-embedder.js
// Docs: docs/modules/memory.md

require('dotenv').config();
const { createLocalEmbedder } = require('../src/memory/embedder');
const { dot } = require('../src/memory/ranking');

(async () => {
  const embedder = createLocalEmbedder({
    model: process.env.EMBEDDING_MODEL || 'Xenova/multilingual-e5-small',
    cacheDir: process.env.MODEL_CACHE_DIR || '.cache/models',
  });
  const started = Date.now();
  const [query] = await embedder.embedQueries(['how much budget did Ravi approve?']);
  const [related, hinglish, unrelated] = await embedder.embedPassages([
    'Ravi signed off 50k for phase one of the website',
    'Ravi ne phase 1 ke liye 50 hazaar approve kar diye',
    'Buy black printer ink cartridge',
  ]);
  const scores = { related: dot(query, related), hinglish: dot(query, hinglish), unrelated: dot(query, unrelated) };
  console.log({ model: embedder.model, dims: query.length, ms: Date.now() - started, scores });

  const ok = query.length === 384 && scores.related > scores.unrelated && scores.hinglish > scores.unrelated;
  if (!ok) {
    console.error('✗ Embedding model check failed');
    process.exit(1);
  }
  console.log('✓ Embedding model works (paraphrase and Hinglish rank above unrelated text)');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
