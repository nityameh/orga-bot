// @ts-check
// src/jobs/cron.js
// Minimal 5-field cron matcher in IST (Asia/Kolkata, UTC+05:30, no DST). Used by
// the serverless tick to decide which schedules are due; pg-boss and node-cron
// interpret the same expressions on the long-running server.
// Supports: *, n, a-b, a,b,c, */n and a-b/n. Not supported: names (MON, JAN), L, W, #.
// Exports: parseCron, matches, latestOccurrence
// Docs: docs/modules/jobs.md → Serverless tick

const IST_OFFSET_MS = 330 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** @type {Array<[number, number]>} min, max for minute, hour, day-of-month, month, day-of-week */
const RANGES = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];

/**
 * @param {string} field
 * @param {[number, number]} range
 * @returns {Set<number>}
 */
function parseField(field, [min, max]) {
  const values = new Set();
  for (const part of field.split(',')) {
    const [base, stepText] = part.split('/');
    const step = stepText === undefined ? 1 : Number(stepText);
    let lo, hi;
    if (base === '*') {
      [lo, hi] = [min, max];
    } else if (base.includes('-')) {
      [lo, hi] = base.split('-').map(Number);
    } else {
      lo = Number(base);
      hi = stepText === undefined ? lo : max; // "5/15" means from 5 every 15
    }
    if (![lo, hi, step].every(Number.isInteger) || step < 1 || lo < min || hi > max || lo > hi) {
      throw new Error(`Invalid cron field "${field}"`);
    }
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return values;
}

/**
 * @typedef {{ minute: Set<number>, hour: Set<number>, dom: Set<number>, month: Set<number>, dow: Set<number>, domStar: boolean, dowStar: boolean }} CronSpec
 */

/**
 * @param {string} expr  e.g. "30 8 * * *"
 * @returns {CronSpec}
 */
function parseCron(expr) {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`Cron expression needs 5 fields: "${expr}"`);
  const [minute, hour, dom, month, dow] = fields.map((f, i) => parseField(f, RANGES[i]));
  return { minute, hour, dom, month, dow, domStar: fields[2] === '*', dowStar: fields[4] === '*' };
}

/**
 * Does the cron fire in the IST minute containing `date`?
 * Day rule follows standard cron: if both day-of-month and day-of-week are
 * restricted, either may match.
 * @param {CronSpec} spec
 * @param {Date} date
 */
function matches(spec, date) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS); // read IST fields via getUTC*
  if (!spec.minute.has(ist.getUTCMinutes()) || !spec.hour.has(ist.getUTCHours()) || !spec.month.has(ist.getUTCMonth() + 1)) {
    return false;
  }
  const domOk = spec.dom.has(ist.getUTCDate());
  const dowOk = spec.dow.has(ist.getUTCDay());
  if (spec.domStar || spec.dowStar) return domOk && dowOk;
  return domOk || dowOk;
}

/**
 * Most recent minute ≤ now at which the cron fired, looking back at most
 * `lookbackMs`. Returns null when it did not fire in that window.
 * @param {string | CronSpec} cron
 * @param {Date} now
 * @param {number} lookbackMs
 * @returns {Date | null}
 */
function latestOccurrence(cron, now, lookbackMs) {
  const spec = typeof cron === 'string' ? parseCron(cron) : cron;
  const start = Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS;
  for (let t = start; t >= start - lookbackMs; t -= MINUTE_MS) {
    if (matches(spec, new Date(t))) return new Date(t);
  }
  return null;
}

module.exports = { parseCron, matches, latestOccurrence };
