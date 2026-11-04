// @ts-check
// src/proactive/index.js
// Composition root for proactive messaging: wires rules, the engine, the
// Interaction-backed nudge store and channel delivery; schedules each rule.
// Docs: docs/modules/proactive.md

const cron = require('node-cron');
const prisma = require('../db');
const { getConfig } = require('../config');
const { createProactiveEngine } = require('./engine');
const { createRules } = require('./rules');
const { notifyUser } = require('../channels');
const { googleApi } = require('../integrations');
const { memory } = require('../memory');
const { emit, KINDS } = require('../interactions');
const { log, error } = require('../logger');

const engine = createProactiveEngine({
  dailyLimit: getConfig().PROACTIVE_DAILY_LIMIT,
  notify: notifyUser,
  store: {
    countSentSince: (userId, since) => prisma.interaction.count({ where: { userId, kind: KINDS.NUDGE_SENT, createdAt: { gte: since } } }),
    wasSent: async (userId, dedupeKey) => (await prisma.interaction.count({
      where: { userId, kind: KINDS.NUDGE_SENT, payload: { path: ['dedupeKey'], equals: dedupeKey } },
    })) > 0,
  },
  onSent: ({ rule, userId, reason, dedupeKey }) => emit({ kind: KINDS.NUDGE_SENT, userId, summary: reason, payload: { rule, dedupeKey } }),
});

const rules = createRules({ prisma, googleApi, memory });

function startProactiveJobs() {
  for (const rule of rules) {
    cron.schedule(rule.schedule, async () => {
      try {
        const outcomes = await engine.run(rule);
        if (Object.keys(outcomes).length) log('proactive.run', { rule: rule.name, ...outcomes });
      } catch (err) {
        error('proactive.rule_failed', { rule: rule.name, err: /** @type {Error} */ (err).message });
      }
    }, { timezone: 'Asia/Kolkata' });
  }
  log('proactive.scheduled', { rules: rules.map((r) => r.name).join(',') });
}

module.exports = { startProactiveJobs, engine, rules };
