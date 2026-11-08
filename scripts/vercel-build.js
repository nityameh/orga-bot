// scripts/vercel-build.js
// Vercel build step for the API project (ADR-020): generate the Prisma client
// for Vercel's Linux runtime, then apply migrations, but ONLY for production
// deployments. Preview deployments (every pushed branch) must never migrate
// the production database.
// Docs: docs/DEPLOY.md

const { execSync } = require('child_process');

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

run('npx prisma generate');

if (process.env.VERCEL_ENV === 'production') {
  run('npx prisma migrate deploy');
} else {
  console.log(`Skipping migrations (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'}; only production migrates).`);
}
