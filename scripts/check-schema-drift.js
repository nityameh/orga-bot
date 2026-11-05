// scripts/check-schema-drift.js
// CI check: the migrated database must match prisma/schema.prisma.
// Prisma can't express some Postgres features we use on purpose (the pgvector
// HNSW index). Those are listed in KNOWN_EXTRAS and ignored; anything else in
// the diff fails the build.
//   DATABASE_URL=... node scripts/check-schema-drift.js
// Docs: docs/adr/ADR-016-pgvector.md

const { execFileSync } = require('child_process');

// Statements Prisma would emit to "fix" intentional, schema-unrepresentable objects.
const KNOWN_EXTRAS = [/DROP INDEX "Embedding_embedding_hnsw_idx";/];

const diff = execFileSync('npx', ['prisma', 'migrate', 'diff', '--from-url', process.env.DATABASE_URL, '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

const unexpected = diff
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('--') && l !== '-- This is an empty migration.')
  .filter((l) => !KNOWN_EXTRAS.some((re) => re.test(l)));

if (unexpected.length) {
  console.error('✗ Schema drift between migrations and prisma/schema.prisma:\n' + unexpected.join('\n'));
  process.exit(1);
}
console.log('✓ Database matches schema (known extras ignored: HNSW index)');
