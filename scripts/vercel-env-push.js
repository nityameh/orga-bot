// scripts/vercel-env-push.js
// Push production environment variables from .env.vercel to the linked Vercel
// API project (ADR-020) without printing any value.
// - Values go through stdin (never argv, so they don't appear in process lists).
// - Secrets are stored as Vercel "sensitive" variables (write-only in the UI).
// - Empty values are skipped; existing variables are overwritten (--force).
// Usage: npm run vercel:env [-- --file .env.vercel] [-- --dry-run]
// Docs: docs/DEPLOY.md → Option A

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');

const VERCEL = ['-y', 'vercel@65.12.1'];
const NOT_SECRET = new Set(['NODE_ENV', 'DASHBOARD_URL', 'TELEGRAM_BOT_USERNAME', 'WHATSAPP_NUMBER', 'SIGNUP_MODE','AGENT_PROVIDER', 'AGENT_MODEL', 'AGENT_EFFORT', 'GOOGLE_REDIRECT_URI', 'GOOGLE_CLIENT_ID', 'PHONE_NUMBER_ID']);
const REQUIRED = ['DATABASE_URL', 'DIRECT_URL', 'CRON_SECRET', 'DASHBOARD_URL', 'NODE_ENV'];

const args = process.argv.slice(2);
const fileArg = args.indexOf('--file');
const file = path.resolve(fileArg >= 0 ? args[fileArg + 1] : '.env.vercel');
const dryRun = args.includes('--dry-run');

if (!fs.existsSync(file)) {
  console.error(`Missing ${file}. Run: cp .env.vercel.example .env.vercel  and fill it in.`);
  process.exit(1);
}

const vars = Object.entries(dotenv.parse(fs.readFileSync(file))).filter(([, v]) => v.trim() !== '');
const present = new Set(vars.map(([k]) => k));
const missing = REQUIRED.filter((k) => !present.has(k));
if (missing.length) {
  console.error(`Fill these in ${path.basename(file)} first: ${missing.join(', ')}`);
  process.exit(1);
}

// Cheap sanity checks that catch the common Supabase mix-ups before a failed deploy.
const db = Object.fromEntries(vars);
const problems = [];
if (!/:6543\//.test(db.DATABASE_URL) || !/pgbouncer=true/.test(db.DATABASE_URL)) problems.push('DATABASE_URL should be the transaction pooler (port 6543) with ?pgbouncer=true&connection_limit=5&pool_timeout=20');
// connection_limit=1 starves concurrent requests on Fluid compute (ADR-023).
const limit = Number(new URL(db.DATABASE_URL).searchParams.get('connection_limit') ?? 0);
if (limit > 0 && limit < 3) problems.push('DATABASE_URL connection_limit should be at least 3 (5 recommended): one Vercel instance serves concurrent requests');
if (!/:5432\//.test(db.DIRECT_URL)) problems.push('DIRECT_URL should be the session pooler (port 5432)');
if (db.CRON_SECRET.length < 16) problems.push('CRON_SECRET must be at least 16 characters');
if (!db.DASHBOARD_URL.startsWith('https://') || db.DASHBOARD_URL.endsWith('/')) problems.push('DASHBOARD_URL must start with https:// and have no trailing slash');
if (db.TELEGRAM_BOT_TOKEN && !db.TELEGRAM_WEBHOOK_SECRET) problems.push('TELEGRAM_WEBHOOK_SECRET is required when TELEGRAM_BOT_TOKEN is set');
if (problems.length) {
  console.error(`Fix ${path.basename(file)}:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}

let failed = 0;
for (const [name, value] of vars) {
  const type = NOT_SECRET.has(name) ? '--no-sensitive' : '--sensitive';
  if (dryRun) {
    console.log(`would set ${name} (${type === '--sensitive' ? 'sensitive' : 'plain'}, ${value.length} chars)`);
    continue;
  }
  const res = spawnSync('npx', [...VERCEL, 'env', 'add', name, '--environment', 'production', type, '--force', '--yes'], {
    input: value,
    encoding: 'utf8',
    shell: process.platform === 'win32', // npx is a .cmd on Windows
  });
  if (res.status === 0) {
    console.log(`✓ ${name}`);
  } else {
    failed++;
    // stderr from the CLI never contains the value (it was sent on stdin).
    console.error(`✗ ${name}: ${(res.stderr || res.stdout || '').trim().split('\n').pop()}`);
  }
}

if (failed) process.exit(1);
if (!dryRun) console.log('\nDone. Redeploy for changes to take effect: npx vercel deploy --prod');
