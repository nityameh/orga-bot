// scripts/backfill-embeddings.js
// Embed all existing notes and task lists (first enable, or after changing
// EMBEDDING_MODEL). Idempotent: re-running re-embeds in place.
//   node scripts/backfill-embeddings.js            all users
//   node scripts/backfill-embeddings.js <userId>   one user
// Docs: docs/modules/memory.md

require('dotenv').config();
const { memory } = require('../src/memory');
const prisma = require('../src/db');

(async () => {
  if (!memory.enabled) {
    console.error('Embeddings are off (EMBEDDINGS=off or NODE_ENV=test).');
    process.exit(1);
  }
  const started = Date.now();
  const count = await memory.backfill(process.argv[2]);
  console.log(`✓ Embedded ${count} items in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
