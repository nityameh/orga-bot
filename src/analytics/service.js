// @ts-check
// src/analytics/service.js
// Read models for the analytics dashboard, built from the Interaction log
// (CQRS-lite, ADR-005). Every query is scoped by userId.
// Docs: docs/modules/analytics.md

const { summarise } = require('../interactions/metrics');
const { dailySeries, activityHeatmap, peopleInsights, reminderFollowThrough } = require('./insights');

const DAY = 24 * 60 * 60 * 1000;
const MAX_ROWS = 20_000;

/** @param {import('@prisma/client').PrismaClient} prisma */
function createAnalyticsService(prisma) {
  /** Overview cards + charts for the last `days` days. @param {string} userId @param {number} days */
  async function overview(userId, days, now = new Date()) {
    const since = new Date(now.getTime() - days * DAY);
    const [rows, reminders] = await Promise.all([
      prisma.interaction.findMany({
        where: { userId, createdAt: { gte: since } },
        select: { kind: true, userId: true, tokensIn: true, tokensOut: true, costMicros: true, payload: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: MAX_ROWS,
      }),
      prisma.reminder.findMany({ where: { userId, fireAt: { gte: since } }, select: { status: true, fireAt: true } }),
    ]);
    const metrics = summarise(rows);
    return {
      days,
      series: dailySeries(rows, days, now),
      heatmap: activityHeatmap(rows),
      reminders: reminderFollowThrough(reminders, now),
      agent: metrics.agent,
      approvals: metrics.approvals,
      nudges: metrics.nudges,
      messages: metrics.users.messages,
    };
  }

  /** People/clients the user deals with, most neglected first. @param {string} userId */
  async function people(userId, now = new Date()) {
    const [grouped, tasks] = await Promise.all([
      prisma.interaction.groupBy({
        by: ['person'],
        where: { userId, person: { not: null } },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      prisma.task.findMany({ where: { userId, client: { not: null } }, select: { client: true, items: true } }),
    ]);
    /** @type {Record<string, number>} */
    const openTasks = {};
    for (const t of tasks) {
      const key = /** @type {string} */ (t.client).toLowerCase();
      openTasks[key] = (openTasks[key] ?? 0) + /** @type {any[]} */ (t.items).filter((i) => !i.done).length;
    }
    return peopleInsights(
      grouped.map((g) => ({ person: /** @type {string} */ (g.person), count: g._count._all, last: /** @type {Date} */ (g._max.createdAt) })),
      openTasks,
      now,
    );
  }

  /**
   * Paginated audit timeline (newest first) with optional filters. Payloads are
   * omitted except for agent turns, which expose tools, outcome and cost.
   * @param {string} userId
   * @param {{ kind?: string, person?: string, before?: Date, limit?: number }} [filters]
   */
  async function timeline(userId, { kind, person, before, limit = 50 } = {}) {
    const rows = await prisma.interaction.findMany({
      where: {
        userId,
        ...(kind ? { kind: kind.endsWith('.*') ? { startsWith: kind.slice(0, -1) } : kind } : {}),
        ...(person ? { person: person.toLowerCase() } : {}),
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100) + 1,
      select: { id: true, kind: true, channel: true, person: true, summary: true, traceId: true, costMicros: true, payload: true, createdAt: true },
    });
    const page = rows.slice(0, Math.min(limit, 100));
    return {
      items: page.map(({ payload, ...r }) => ({
        ...r,
        details: r.kind === 'agent.turn' ? pick(/** @type {any} */ (payload), ['outcome', 'tools', 'model', 'latencyMs', 'steps'])
          : r.kind === 'nudge.sent' ? pick(/** @type {any} */ (payload), ['rule'])
            : undefined,
      })),
      nextBefore: rows.length > page.length ? page[page.length - 1].createdAt.toISOString() : null,
    };
  }

  return { overview, people, timeline };
}

/** @param {any} obj @param {string[]} keys */
function pick(obj, keys) {
  if (!obj) return undefined;
  return Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
}

module.exports = { createAnalyticsService };
