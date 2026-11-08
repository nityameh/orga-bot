// @ts-check
// src/proactive/engine.js
// Runs proactive rules ("Orga messages you first") through the same guards for
// every rule: user opted in, outside quiet hours, under the daily nudge limit,
// and not already sent (dedupe key). Rules only decide *what* is worth saying;
// the engine decides *whether* it may be said. Every sent nudge is an
// Interaction with the rule and reason, so the dashboard can show "why".
// Docs: docs/modules/proactive.md

const QUIET_START_HOUR = 22; // IST
const QUIET_END_HOUR = 8;
const IST_OFFSET_MS = 330 * 60 * 1000;

/**
 * @typedef {Object} Candidate
 * @property {{ id: string, proactive?: boolean }} user
 * @property {import('../channels/types').OutboundMessage} message
 * @property {string} reason      Why this is worth interrupting for (shown in the dashboard)
 * @property {string} dedupeKey   Same key never sent twice to the same user
 */

/**
 * @typedef {Object} Rule
 * @property {string} name
 * @property {string} schedule    node-cron expression (IST)
 * @property {(now: Date) => Promise<Candidate[]>} findCandidates
 */

/**
 * @typedef {Object} NudgeStore
 * @property {(userId: string, since: Date) => Promise<number>} countSentSince
 * @property {(userId: string, dedupeKey: string) => Promise<boolean>} wasSent
 */

/** Hour of day in IST. @param {Date} date */
function istHour(date) {
  return new Date(date.getTime() + IST_OFFSET_MS).getUTCHours();
}

/** @param {Date} date */
function isQuietHours(date) {
  const h = istHour(date);
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

/** Start of the IST day as a UTC Date. @param {Date} date */
function istDayStart(date) {
  const d = new Date(date.getTime() + IST_OFFSET_MS);
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - IST_OFFSET_MS);
}

/**
 * @param {Object} deps
 * @param {NudgeStore} deps.store
 * @param {(user: { id: string }, message: import('../channels/types').OutboundMessage) => Promise<boolean>} deps.notify
 * @param {(event: { rule: string, userId: string, reason: string, dedupeKey: string }) => Promise<void> | void} deps.onSent
 * @param {number} deps.dailyLimit
 */
function createProactiveEngine({ store, notify, onSent, dailyLimit }) {
  /**
   * Decide whether a candidate may be sent now. Pure apart from store reads.
   * @param {Candidate} c @param {Date} now
   * @returns {Promise<'send' | 'opted_out' | 'quiet_hours' | 'daily_limit' | 'duplicate'>}
   */
  async function decide(c, now) {
    if (c.user.proactive === false) return 'opted_out';
    if (isQuietHours(now)) return 'quiet_hours';
    if (await store.wasSent(c.user.id, c.dedupeKey)) return 'duplicate';
    if ((await store.countSentSince(c.user.id, istDayStart(now))) >= dailyLimit) return 'daily_limit';
    return 'send';
  }

  /**
   * Run one rule now.
   * @param {Rule} rule @param {Date} [now]
   * @returns {Promise<Record<string, number>>} outcome counts (for logs/tests)
   */
  async function run(rule, now = new Date()) {
    /** @type {Record<string, number>} */
    const outcomes = {};
    const candidates = await rule.findCandidates(now);
    for (const c of candidates) {
      let outcome = await decide(c, now);
      if (outcome === 'send') {
        const ok = await notify(c.user, c.message);
        if (ok) await onSent({ rule: rule.name, userId: c.user.id, reason: c.reason, dedupeKey: c.dedupeKey });
        outcome = ok ? 'send' : /** @type {any} */ ('failed');
      }
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    }
    return outcomes;
  }

  return { run, decide };
}

module.exports = { createProactiveEngine, isQuietHours, istDayStart };
