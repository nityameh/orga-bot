// scripts/harvest-evals.js
// Build DRAFT eval cases from real conversations of users who opted in with
// /improve (ADR-017). Output goes to evals/review/candidates.json (git-ignored):
// review each case, fix `expect`, set review.approved = true, then run
// `npm run evals:promote` to merge approved cases into evals/agent/cases.json.
//   npm run evals:harvest            last 7 days
//   npm run evals:harvest -- 30      last 30 days
// Docs: docs/modules/evals.md

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const prisma = require('../src/db');
const { buildCandidates } = require('../src/evals/harvest');

const OUT = path.join(__dirname, '..', 'evals', 'review', 'candidates.json');
const CASES = path.join(__dirname, '..', 'evals', 'agent', 'cases.json');

(async () => {
  const days = Number(process.argv[2]) || 7;
  const since = new Date(Date.now() - days * 86400_000);

  const users = await prisma.user.findMany({ where: { evalOptIn: true }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  if (!userIds.length) {
    console.log('No users have opted in (/improve on). Nothing to harvest.');
    return;
  }

  const [messages, turns, people] = await Promise.all([
    prisma.conversationMessage.findMany({ where: { userId: { in: userIds }, role: 'user', traceId: { not: null }, createdAt: { gte: since } }, orderBy: { createdAt: 'asc' } }),
    prisma.interaction.findMany({ where: { userId: { in: userIds }, kind: 'agent.turn', createdAt: { gte: since } }, select: { traceId: true, payload: true } }),
    prisma.interaction.findMany({ where: { userId: { in: userIds }, person: { not: null } }, select: { userId: true, person: true }, distinct: ['userId', 'person'] }),
  ]);

  const turnByTrace = new Map(turns.map((t) => [t.traceId, t.payload]));
  /** @type {Record<string, string[]>} */
  const peopleByUser = {};
  for (const p of people) (peopleByUser[p.userId] ??= []).push(p.person);

  const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
  const caseIds = new Set([...JSON.parse(fs.readFileSync(CASES, 'utf8')).cases.map((c) => c.id), ...existing.map((c) => c.id)]);

  const fresh = buildCandidates(
    messages.map((m) => ({ userId: m.userId, text: m.content, createdAt: m.createdAt, turn: turnByTrace.get(m.traceId) ?? null })),
    peopleByUser,
    caseIds,
  );

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify([...existing, ...fresh], null, 2) + '\n');
  console.log(`✓ ${fresh.length} new candidates (${existing.length + fresh.length} awaiting review) → ${path.relative(process.cwd(), OUT)}`);
  console.log('  Review each one: check anonymisation, fix "expect", set review.approved = true, then npm run evals:promote');
})()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
