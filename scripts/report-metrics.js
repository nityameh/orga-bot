// scripts/report-metrics.js
// Prints measured production numbers from the Interaction log — the source for
// docs/METRICS.md and for answering "what are your latency and cost?" honestly.
//   npm run metrics            last 7 days
//   npm run metrics -- 30      last 30 days
// Docs: docs/modules/interactions.md → Metrics

require('dotenv').config();
const prisma = require('../src/db');
const { summarise } = require('../src/interactions/metrics');

(async () => {
  const days = Number(process.argv[2]) || 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.interaction.findMany({
    where: { createdAt: { gte: since }, kind: { in: ['agent.turn', 'message.received', 'approval.requested', 'approval.granted', 'approval.rejected', 'nudge.sent'] } },
    select: { kind: true, userId: true, tokensIn: true, tokensOut: true, costMicros: true, payload: true, createdAt: true },
    take: 50_000,
  });
  const m = summarise(rows, { primaryModel: process.env.AGENT_MODEL || 'claude-opus-5-5' });
  const fmt = (v, unit = '') => (v === null || v === undefined ? '—' : `${v}${unit}`);

  console.log(`\nOrga metrics — last ${days} days (${rows.length} events)\n`);
  console.log(`Agent turns            ${m.agent.turns}`);
  console.log(`Latency p50 / p95      ${fmt(m.agent.latencyMs.p50, ' ms')} / ${fmt(m.agent.latencyMs.p95, ' ms')}`);
  console.log(`Tokens per turn        in ${fmt(m.agent.avgTokensIn)} · out ${fmt(m.agent.avgTokensOut)}`);
  console.log(`Prompt-cache hit rate  ${m.agent.cacheHitRate === null ? '—' : `${(m.agent.cacheHitRate * 100).toFixed(1)}%`}`);
  console.log(`Cost                   $${m.agent.costUSD.total.toFixed(4)} total · ${m.agent.costUSD.perTurn === null ? '—' : `$${m.agent.costUSD.perTurn.toFixed(5)}`} per turn`);
  console.log(`Failovers              ${m.agent.failovers}`);
  console.log(`Outcomes               ${JSON.stringify(m.agent.outcomes)}`);
  console.log(`Tool calls             ${JSON.stringify(m.agent.toolUse)} · error rate ${fmt(m.agent.toolErrorRate)}`);
  console.log(`Active users           ${m.users.active} · ${m.users.messages} messages · ${fmt(m.users.messagesPerActiveDay)} per active day`);
  console.log(`Approvals              ${JSON.stringify(m.approvals)}`);
  console.log(`Nudges                 ${JSON.stringify(m.nudges)}\n`);
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
