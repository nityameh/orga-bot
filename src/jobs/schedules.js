// @ts-check
// src/jobs/schedules.js
// The single list of scheduled (cron) jobs. Both runtimes read it:
//   server     → pg-boss `every()` (src/jobs/index.js)
//   serverless → /internal/tick checks which are due (src/jobs/tick.js)
// Adding a job = adding an entry here (Open/Closed); neither runtime changes.
// Reminder polling is not here: it runs every minute in both runtimes.
// Exports: createSchedules
// Docs: docs/modules/jobs.md

const { log } = require('../logger');

/**
 * @typedef {{ name: string, cron: string, run: () => Promise<unknown> }} Schedule
 *   cron is interpreted in IST (Asia/Kolkata).
 */

/**
 * @param {{
 *   sendWeeklyDigests: () => Promise<unknown>,
 *   runDailyCleanup: () => Promise<unknown>,
 *   engine: { run: (rule: any) => Promise<Record<string, number>> },
 *   rules: Array<{ name: string, schedule: string }>,
 * }} deps
 * @returns {Schedule[]}
 */
function createSchedules({ sendWeeklyDigests, runDailyCleanup, engine, rules }) {
  return [
    { name: 'digest.weekly', cron: '0 18 * * 0', run: sendWeeklyDigests },
    { name: 'cleanup.daily', cron: '0 3 * * *', run: runDailyCleanup },
    ...rules.map((rule) => ({
      name: `proactive.${rule.name}`,
      cron: rule.schedule,
      run: async () => {
        const outcomes = await engine.run(rule);
        if (Object.keys(outcomes).length) log('proactive.run', { rule: rule.name, ...outcomes });
      },
    })),
  ];
}

module.exports = { createSchedules };
