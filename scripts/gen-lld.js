#!/usr/bin/env node
// scripts/gen-lld.js
// Auto-generates docs/LLD.md by scanning the live codebase.
// Run manually: node scripts/gen-lld.js
// Runs automatically: git pre-commit hook, Claude Code PostToolUse hook
//
// What it auto-generates:
//   - File tree with descriptions
//   - Exported functions per file
//   - API routes (from index.js)
//   - DB schema summary (from prisma/schema.prisma)
//   - Environment variables (from .env.example or .env)

const fs   = require('fs');
const path = require('path');

const ROOT    = path.join(__dirname, '..');
const OUT     = path.join(ROOT, 'docs', 'LLD.md');
const SRC     = path.join(ROOT, 'src');
const PRISMA  = path.join(ROOT, 'prisma', 'schema.prisma');

// ─── Helpers ───────────────────────────────────────────────────────────────

function readFile(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); }
  catch { return ''; }
}

function getExports(filePath) {
  const src     = readFile(filePath);
  const exports = [];

  // Match: async function foo(...) or function foo(...)
  const fnMatches = src.matchAll(/^(?:async\s+)?function\s+(\w+)\s*\(/gm);
  for (const m of fnMatches) exports.push(m[1]);

  // Match module.exports = { foo, bar }
  const exportsMatch = src.match(/module\.exports\s*=\s*\{([^}]+)\}/);
  if (exportsMatch) {
    const exported = exportsMatch[1]
      .split(',')
      .map(s => s.trim().split(':')[0].trim())
      .filter(Boolean);
    // Return only exported functions
    return exported.filter(e => exports.includes(e));
  }

  return exports.slice(0, 8); // fallback
}

function getFileDescription(relPath) {
  const descriptions = {
    'src/index.js':              'Express app entry — sets up routes, starts server, boots scheduler',
    'src/webhook.js':            'Meta webhook handler — GET verify, POST receive + signature check',
    'src/sender.js':             'sendMessage() / sendButtons() — wraps Meta send API',
    'src/classifier.js':         'Groq LLaMA intent classifier — text → JSON intent + keyword fallback',
    'src/router.js':             'Routes intent type to correct handler — intercepts done/snooze/DONE/SNOOZE',
    'src/scheduler.js':          'Cron engine — polls reminders every 60s, weekly digest every Sunday 6pm IST',
    'src/db.js':                 'Prisma client singleton — imported by all handlers',
    'src/handlers/note.js':      'Save note to DB, free tier limit check, reply confirmation',
    'src/handlers/task.js':      'Save task list, parse items, handle "done N" replies',
    'src/handlers/reminder.js':  'Save reminder to DB, datetime validation, snooze/done helpers',
    'src/handlers/commands.js':  '/today /notes /list /schedule /search — all DB queries',
  };
  return descriptions[relPath] || '';
}

// ─── Section builders ──────────────────────────────────────────────────────

function buildFileTree() {
  const files = [
    'src/index.js',
    'src/webhook.js',
    'src/sender.js',
    'src/classifier.js',
    'src/router.js',
    'src/scheduler.js',
    'src/db.js',
    'src/handlers/note.js',
    'src/handlers/task.js',
    'src/handlers/reminder.js',
    'src/handlers/commands.js',
    'prisma/schema.prisma',
    '.env',
    'package.json',
  ];

  const lines = ['```', 'orga-bot/'];
  const seen  = new Set();

  for (const f of files) {
    const parts = f.split('/');
    const dir   = parts.length > 1 ? parts[0] : null;

    if (dir && !seen.has(dir)) {
      lines.push(`├── ${dir}/`);
      seen.add(dir);
    }

    const exists   = fs.existsSync(path.join(ROOT, f));
    const prefix   = parts.length > 2 ? '│   │   ' : parts.length > 1 ? '│   ' : '├── ';
    const filename = parts[parts.length - 1];
    const desc     = getFileDescription(f);
    const status   = exists ? '' : ' ← MISSING';
    lines.push(`${prefix}├── ${filename}${status}${desc ? `    # ${desc}` : ''}`);
  }

  lines.push('```');
  return lines.join('\n');
}

function buildExportsTable() {
  const files = [
    ['src/index.js',             'App entry'],
    ['src/webhook.js',           'Webhook'],
    ['src/sender.js',            'Sender'],
    ['src/classifier.js',        'Classifier'],
    ['src/router.js',            'Router'],
    ['src/scheduler.js',         'Scheduler'],
    ['src/handlers/note.js',     'Note handler'],
    ['src/handlers/task.js',     'Task handler'],
    ['src/handlers/reminder.js', 'Reminder handler'],
    ['src/handlers/commands.js', 'Commands handler'],
  ];

  const rows = ['| File | Exported Functions |', '|---|---|'];

  for (const [relPath, label] of files) {
    const fullPath = path.join(ROOT, relPath);
    const exports  = getExports(fullPath);
    rows.push(`| \`${relPath}\` | ${exports.map(e => `\`${e}()\``).join(', ') || '—'} |`);
  }

  return rows.join('\n');
}

function buildApiRoutes() {
  const indexSrc = readFile(path.join(SRC, 'index.js'));
  const routes   = [];

  const matches = indexSrc.matchAll(/app\.(get|post|put|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g);
  for (const m of matches) {
    routes.push(`| \`${m[1].toUpperCase()}\` | \`${m[2]}\` |`);
  }

  return ['| Method | Path |', '|---|---|', ...routes].join('\n');
}

function buildDbSchema() {
  const schema = readFile(PRISMA);
  if (!schema) return '_prisma/schema.prisma not found_';

  const models = [];
  const modelMatches = schema.matchAll(/model\s+(\w+)\s*\{([^}]+)\}/g);

  for (const m of modelMatches) {
    const name   = m[1];
    const body   = m[2];
    const fields = [];

    const fieldMatches = body.matchAll(/^\s+(\w+)\s+(\w+[\[\]?]*)/gm);
    for (const f of fieldMatches) {
      if (!f[1].startsWith('@') && !f[1].startsWith('//')) {
        fields.push(`\`${f[1]}\` ${f[2]}`);
      }
    }

    models.push(`**${name}** — ${fields.slice(0, 6).join(', ')}${fields.length > 6 ? ', ...' : ''}`);
  }

  return models.join('\n\n');
}

function buildEnvVars() {
  // Try .env first, fall back to listing known vars
  const envContent = readFile(path.join(ROOT, '.env'));
  const rows       = ['| Variable | Required | Purpose |', '|---|---|---|'];

  const known = [
    ['WHATSAPP_TOKEN',        'Yes (prod)',  'Permanent system user token from Meta Business Manager'],
    ['PHONE_NUMBER_ID',       'Yes (prod)',  'From Meta Developer Portal → WhatsApp → API Setup'],
    ['WEBHOOK_VERIFY_TOKEN',  'Yes',         'String you define — Meta echoes it back during webhook setup'],
    ['APP_SECRET',            'Yes (prod)',  'From Meta App Settings → Basic — used for signature verification'],
    ['DATABASE_URL',          'Yes',         'Full postgres:// connection string (local or Railway)'],
    ['GROQ_API_KEY',          'Yes',         'From console.groq.com — used for intent classification'],
    ['PORT',                  'No',          'Defaults to 3000'],
    ['NODE_ENV',              'No',          'development skips signature check and WhatsApp sends'],
  ];

  for (const [name, required, purpose] of known) {
    const set = envContent.includes(`${name}=`) ? '✓ set' : '✗ not set';
    rows.push(`| \`${name}\` | ${required} | ${purpose} |`);
  }

  return rows.join('\n');
}

function buildMessageFlow() {
  return `\`\`\`
WhatsApp User
      │  texts: "remind me tomorrow 9am to call Ravi"
      ▼
Meta Cloud API  →  POST /webhook
      │
      ├─► verifySignature()          webhook.js
      ├─► res.sendStatus(200)        ← MUST happen within 3s
      ├─► extractMessage()
      │
      ▼ (async)
upsertUser(phone)                    db.js + Prisma
      │
      ▼
classify(text)                       classifier.js
      │  Groq LLaMA 3.3 70B → JSON intent
      │  { type: "REMINDER", title: "...", datetime: "...", ... }
      │
      ▼
route(user, intent, message)         router.js
      │
      ├─► "done N"    → handleTaskDone()
      ├─► "DONE"      → handleReminderReply()
      ├─► "SNOOZE"    → handleReminderReply()
      │
      └─► switch(intent.type)
            NOTE      → handlers/note.js      → prisma.note.create()
            TASK      → handlers/task.js      → prisma.task.create()
            REMINDER  → handlers/reminder.js  → prisma.reminder.create()
            SEARCH    → handlers/commands.js  → prisma.note.findMany()
            TODAY     → handlers/commands.js  → tasks + reminders query
            LIST      → handlers/commands.js  → prisma.note.findMany()
            SCHEDULE  → handlers/commands.js  → prisma.reminder.findMany()
            UNKNOWN   → handlers/commands.js  → help message
      │
      ▼
sendMessage(to, text)                sender.js
      │  DEV: logs to console
      │  PROD: POST graph.facebook.com/messages
      ▼
User's WhatsApp receives reply

── Parallel: Cron Engine (scheduler.js) ──────────────────────────
Every 60s:   SELECT reminders WHERE status='pending' AND fireAt <= now
             → mark 'fired' → sendMessage() → retry on failure
Every Sun 6pm IST: weekly digest → all active users
\`\`\``;
}

// ─── Assemble the document ─────────────────────────────────────────────────

function generate() {
  const now = new Date().toLocaleString('en-IN', {
    timeZone:    'Asia/Kolkata',
    day:         '2-digit',
    month:       'short',
    year:        'numeric',
    hour:        '2-digit',
    minute:      '2-digit',
    hour12:      true,
  });

  const doc = `# Orga Bot — Low Level Design

> **Auto-generated** by \`scripts/gen-lld.js\`
> Last updated: ${now} IST
> Do not edit this file manually — your changes will be overwritten.
> To update: \`node scripts/gen-lld.js\`

---

## 1. Project Overview

Orga is a WhatsApp-native productivity bot for Indian freelancers.
A user texts naturally ("remind me tomorrow 9am to call Ravi") and Orga
saves notes, creates tasks, fires reminders, and answers queries — all
inside one WhatsApp chat. Zero app install required.

**Current Phase:** 4 — Reminders + Weekly Digest
**Stack:** Node.js 20 + Express · PostgreSQL + Prisma · Groq LLaMA · Meta Cloud API · Railway

---

## 2. File Structure

${buildFileTree()}

---

## 3. Message Flow

${buildMessageFlow()}

---

## 4. API Routes

${buildApiRoutes()}

---

## 5. Exported Functions by File

${buildExportsTable()}

---

## 6. Database Schema

${buildDbSchema()}

---

## 7. Environment Variables

${buildEnvVars()}

---

## 8. Intent Types

| Type | Trigger | Handler | DB Write |
|---|---|---|---|
| \`NOTE\` | Any idea/observation/meeting notes | \`handlers/note.js\` | \`Note\` table |
| \`TASK\` | "tasks:", "todo:", list of things to do | \`handlers/task.js\` | \`Task\` table |
| \`REMINDER\` | Time reference: "tomorrow", "at 3pm" | \`handlers/reminder.js\` | \`Reminder\` table |
| \`SEARCH\` | "find", "what did I note about..." | \`handlers/commands.js\` | Read only |
| \`TODAY\` | "/today", "what do I have today" | \`handlers/commands.js\` | Read only |
| \`LIST\` | "/notes", "/list" | \`handlers/commands.js\` | Read only |
| \`SCHEDULE\` | "/schedule", "what's coming up" | \`handlers/commands.js\` | Read only |
| \`UNKNOWN\` | Greetings, help, unrecognised | \`handlers/commands.js\` | None |

---

## 9. Reminder Lifecycle

\`\`\`
User sends "remind me in 2 hours to call Ravi"
      │
      ▼
Reminder saved: { status: "pending", fireAt: <2hrs from now> }
      │
      ▼  (cron polls every 60s)
fireAt <= now  →  status: "pending" → "fired"  →  sendMessage()
      │
      ├─► User replies "DONE"   →  status: "fired" → "done"
      └─► User replies "SNOOZE" →  status: "fired" → "pending", fireAt = now+1hr
\`\`\`

---

## 10. Free Tier Limits

| Resource | Free Limit | Warning At | Handler |
|---|---|---|---|
| Notes / month | 50 | 40 (80%) | \`handlers/note.js\` |
| Tasks | Unlimited | — | — |
| Reminders | Unlimited | — | — |

---

## 11. Key Design Decisions

| Decision | Reason |
|---|---|
| \`res.sendStatus(200)\` before processing | Meta retries if no 200 within 3s |
| Groq LLaMA 3.3 70B for classification | Free tier, Claude-level quality for JSON extraction |
| Soft delete on notes (\`deletedAt\`) | Never lose user data — 30-day recovery window |
| Cron marks reminder \`fired\` before sending | Prevents double-firing on server restart |
| Phone number = user identity | No auth, no email, zero friction |
| \`node-cron\` + DB polling, no Redis | Sufficient for < 1000 users at MVP |
| Dedup via in-memory Set of last 100 IDs | Meta sometimes delivers same webhook twice |

---

*Generated by scripts/gen-lld.js · Orga Bot*
`;

  fs.writeFileSync(OUT, doc, 'utf8');
  console.log(`✓ docs/LLD.md updated (${now} IST)`);
}

generate();
