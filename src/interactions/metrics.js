// @ts-check
// src/interactions/metrics.js
// Turns raw Interaction rows into the operational numbers that matter:
// agent latency percentiles, tokens and cost per turn, prompt-cache hit rate,
// provider failovers, tool usage, active users, approvals and nudges.
// Pure (rows in, numbers out) so it is unit-tested and reused by the CLI
// report (scripts/report-metrics.js) and, in Phase 5, the analytics API.
// Docs: docs/modules/interactions.md → Metrics

/** Nearest-rank percentile. @param {number[]} sorted ascending @param {number} p */
function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

/**
 * @param {Array<{ kind: string, userId: string, tokensIn: number | null, tokensOut: number | null, costMicros: number | null, payload: any, createdAt: Date }>} rows
 * @param {{ primaryModel?: string }} [opts]
 */
function summarise(rows, { primaryModel } = {}) {
  const turns = rows.filter((r) => r.kind === 'agent.turn');
  const latencies = turns.map((t) => Number(t.payload?.latencyMs)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const sum = (/** @type {number[]} */ xs) => xs.reduce((s, x) => s + x, 0);

  const tokensIn = sum(turns.map((t) => t.tokensIn ?? 0));
  const tokensOut = sum(turns.map((t) => t.tokensOut ?? 0));
  const cacheRead = sum(turns.map((t) => Number(t.payload?.cacheRead) || 0));
  const cost = sum(turns.map((t) => t.costMicros ?? 0));

  /** @type {Record<string, number>} */
  const outcomes = {};
  /** @type {Record<string, number>} */
  const toolUse = {};
  let toolErrors = 0;
  let failovers = 0;
  for (const t of turns) {
    outcomes[t.payload?.outcome ?? 'unknown'] = (outcomes[t.payload?.outcome ?? 'unknown'] ?? 0) + 1;
    for (const call of t.payload?.tools ?? []) {
      toolUse[call.name] = (toolUse[call.name] ?? 0) + 1;
      if (!call.ok) toolErrors++;
    }
    if (primaryModel && t.payload?.model && t.payload.model !== primaryModel) failovers++;
  }

  const count = (/** @type {string} */ kind) => rows.filter((r) => r.kind === kind).length;
  const received = rows.filter((r) => r.kind === 'message.received');
  const days = new Set(received.map((r) => r.createdAt.toISOString().slice(0, 10)));
  /** @type {Record<string, number>} */
  const nudgesByRule = {};
  for (const n of rows.filter((r) => r.kind === 'nudge.sent')) nudgesByRule[n.payload?.rule ?? 'unknown'] = (nudgesByRule[n.payload?.rule ?? 'unknown'] ?? 0) + 1;
  const totalToolCalls = sum(Object.values(toolUse));

  return {
    agent: {
      turns: turns.length,
      latencyMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
      avgTokensIn: turns.length ? Math.round(tokensIn / turns.length) : null,
      avgTokensOut: turns.length ? Math.round(tokensOut / turns.length) : null,
      // Share of input tokens served from the prompt cache (cheaper, faster).
      cacheHitRate: tokensIn ? Number((cacheRead / tokensIn).toFixed(3)) : null,
      costUSD: { total: cost / 1e6, perTurn: turns.length ? cost / 1e6 / turns.length : null },
      outcomes,
      failovers,
      toolUse,
      toolErrorRate: totalToolCalls ? Number((toolErrors / totalToolCalls).toFixed(3)) : null,
    },
    users: {
      active: new Set(received.map((r) => r.userId)).size,
      messages: received.length,
      messagesPerActiveDay: days.size ? Number((received.length / days.size).toFixed(1)) : null,
    },
    approvals: { requested: count('approval.requested'), granted: count('approval.granted'), rejected: count('approval.rejected') },
    nudges: { sent: count('nudge.sent'), byRule: nudgesByRule },
  };
}

module.exports = { summarise, percentile };
