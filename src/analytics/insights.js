// @ts-check
// src/analytics/insights.js
// Pure aggregations over a user's Interaction rows for the analytics dashboard
// (Phase 5): activity over time, weekday × hour heatmap (IST), people the user
// has gone quiet on, and reminder follow-through. No I/O — unit-tested.
// Docs: docs/modules/analytics.md

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

/** @param {Date} d */
const istDate = (d) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/**
 * Messages in vs actions taken per IST day, oldest first, including empty days.
 * @param {Array<{ kind: string, createdAt: Date }>} rows @param {number} days @param {Date} now
 */
function dailySeries(rows, days, now) {
  /** @type {Map<string, { date: string, messages: number, actions: number }>} */
  const byDay = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const date = istDate(new Date(now.getTime() - i * DAY));
    byDay.set(date, { date, messages: 0, actions: 0 });
  }
  for (const r of rows) {
    const bucket = byDay.get(istDate(r.createdAt));
    if (!bucket) continue;
    if (r.kind === 'message.received') bucket.messages++;
    else if (/\.(created|completed|item_completed|cancelled|snoozed)$|^approval\.granted$/.test(r.kind)) bucket.actions++;
  }
  return [...byDay.values()];
}

/**
 * When the user is active: counts by IST weekday (0 = Monday) × hour.
 * @param {Array<{ kind: string, createdAt: Date }>} rows
 * @returns {number[][]} 7 × 24
 */
function activityHeatmap(rows) {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const r of rows) {
    if (r.kind !== 'message.received') continue;
    const ist = new Date(r.createdAt.getTime() + IST_OFFSET_MS);
    const weekday = (ist.getUTCDay() + 6) % 7; // Monday first
    grid[weekday][ist.getUTCHours()]++;
  }
  return grid;
}

/**
 * Per-person view: how much happens with each client/person and how long since
 * the last interaction. Sorted with the most neglected (longest silence) first.
 * @param {Array<{ person: string, count: number, last: Date }>} people
 * @param {Record<string, number>} openTasksByPerson
 * @param {Date} now
 * @param {number} [quietAfterDays]
 */
function peopleInsights(people, openTasksByPerson, now, quietAfterDays = 14) {
  return people
    .map((p) => {
      const daysSince = Math.floor((now.getTime() - p.last.getTime()) / DAY);
      return {
        person: p.person,
        interactions: p.count,
        lastInteraction: p.last.toISOString(),
        daysSinceLast: daysSince,
        openTasks: openTasksByPerson[p.person] ?? 0,
        goneQuiet: daysSince >= quietAfterDays,
      };
    })
    .sort((a, b) => Number(b.goneQuiet) - Number(a.goneQuiet) || b.openTasks - a.openTasks || b.daysSinceLast - a.daysSinceLast);
}

/**
 * Reminder follow-through: done vs missed (fired but never marked done after
 * a grace period) vs cancelled, plus a completion rate over decided reminders.
 * @param {Array<{ status: string, fireAt: Date }>} reminders @param {Date} now
 * @param {number} [graceHours]
 */
function reminderFollowThrough(reminders, now, graceHours = 24) {
  let done = 0;
  let missed = 0;
  let upcoming = 0;
  for (const r of reminders) {
    if (r.status === 'done') done++;
    else if (r.status === 'fired' && now.getTime() - r.fireAt.getTime() > graceHours * 3600_000) missed++;
    else if (r.status === 'pending' || r.status === 'snoozed') upcoming++;
  }
  const decided = done + missed;
  return { done, missed, upcoming, completionRate: decided ? Number((done / decided).toFixed(3)) : null };
}

module.exports = { dailySeries, activityHeatmap, peopleInsights, reminderFollowThrough, istDate };
