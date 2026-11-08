// @ts-check
// src/proactive/rules.js
// Built-in proactive rules. Each is a plain object { name, schedule,
// findCandidates } (see engine.js). Relevance is decided with cheap rules (no
// LLM call): a rule only produces a candidate when there is something concrete
// to say. Adding a rule = adding an object here and registering it in index.js.
// Docs: docs/modules/proactive.md

const { formatIST } = require('../agent/time');
const { istDayStart } = require('./engine');

const DAY = 24 * 60 * 60 * 1000;

/**
 * @param {Object} deps
 * @param {import('@prisma/client').PrismaClient} deps.prisma
 * @param {import('../integrations/google/api').GoogleApi | null} deps.googleApi
 * @param {import('../memory/service').MemoryService} deps.memory
 */
function createRules({ prisma, googleApi, memory }) {
  /** Morning brief at 08:30 IST: today's reminders, meetings, open tasks. */
  const morningBrief = {
    name: 'morning_brief',
    schedule: '30 8 * * *',
    async findCandidates(/** @type {Date} */ now) {
      const dayStart = istDayStart(now);
      const dayEnd = new Date(dayStart.getTime() + DAY);
      const users = await prisma.user.findMany({
        where: { proactive: true },
        select: {
          id: true, proactive: true,
          reminders: { where: { status: 'pending', fireAt: { gte: now, lt: dayEnd } }, orderBy: { fireAt: 'asc' }, take: 5 },
          tasks: { select: { items: true }, take: 20, orderBy: { createdAt: 'desc' } },
          integrations: { where: { provider: 'google', status: 'active' }, select: { id: true } },
        },
      });

      const out = [];
      for (const u of users) {
        const openTasks = u.tasks.flatMap((t) => /** @type {any[]} */ (t.items)).filter((i) => !i.done).length;
        let meetings = [];
        if (googleApi && u.integrations.length) {
          meetings = await googleApi.listEvents(u.id, now, dayEnd).catch(() => []);
        }
        if (!u.reminders.length && !meetings.length && !openTasks) continue; // nothing worth saying

        const lines = ['*Good morning ☀️ Your day:*'];
        for (const m of meetings.slice(0, 4)) lines.push(`📅 ${m.allDay ? 'All day' : formatIST(new Date(m.start)).split(', ').pop()} — ${m.title}`);
        for (const r of u.reminders) lines.push(`🔔 ${formatIST(r.fireAt).split(', ').pop()} — ${r.title}`);
        if (openTasks) lines.push(`📋 ${openTasks} open task${openTasks > 1 ? 's' : ''}`);

        out.push({
          user: u,
          message: { text: lines.join('\n'), template: { name: 'daily_digest', params: [String(openTasks), String(u.reminders.length)] } },
          reason: `${meetings.length} meetings, ${u.reminders.length} reminders, ${openTasks} open tasks today`,
          dedupeKey: `morning:${dayStart.toISOString().slice(0, 10)}`,
        });
      }
      return out;
    },
  };

  /** Meeting prep: ~30 min before a calendar event, surface related saved notes. */
  const meetingPrep = {
    name: 'meeting_prep',
    schedule: '*/10 * * * *',
    async findCandidates(/** @type {Date} */ now) {
      if (!googleApi) return [];
      const integrations = await prisma.integration.findMany({
        where: { provider: 'google', status: 'active', user: { proactive: true } },
        select: { user: { select: { id: true, proactive: true } } },
      });
      const out = [];
      for (const { user } of integrations) {
        const events = await googleApi.listEvents(user.id, new Date(now.getTime() + 20 * 60_000), new Date(now.getTime() + 40 * 60_000)).catch(() => []);
        for (const event of events.filter((/** @type {any} */ e) => !e.allDay)) {
          const { ids } = await memory.search(user.id, [event.title, ...event.attendees.map((/** @type {string} */ a) => a.split('@')[0])].join(' '), 3);
          const noteIds = ids.filter((r) => r.type === 'note').map((r) => r.id);
          if (!noteIds.length) continue; // only interrupt when we have something useful
          const notes = await prisma.note.findMany({ where: { id: { in: noteIds }, userId: user.id }, select: { title: true } });
          out.push({
            user,
            message: { text: [`📅 *${event.title}* starts at ${formatIST(new Date(event.start)).split(', ').pop()}.`, 'From your notes:', ...notes.map((n) => `• ${n.title}`)].join('\n') },
            reason: `${notes.length} saved notes related to "${event.title}"`,
            dedupeKey: `prep:${event.id}`,
          });
        }
      }
      return out;
    },
  };

  /** Weekly nudge (Monday 10:00) for task items open for more than 7 days. */
  const staleTasks = {
    name: 'stale_tasks',
    schedule: '0 10 * * 1',
    async findCandidates(/** @type {Date} */ now) {
      const weekAgo = new Date(now.getTime() - 7 * DAY);
      const users = await prisma.user.findMany({
        where: { proactive: true, tasks: { some: { createdAt: { lt: weekAgo } } } },
        select: { id: true, proactive: true, tasks: { where: { createdAt: { lt: weekAgo } }, select: { title: true, items: true }, take: 10 } },
      });
      const out = [];
      for (const u of users) {
        const stale = u.tasks.flatMap((t) => /** @type {any[]} */ (t.items).filter((i) => !i.done).map((i) => `${i.text} (${t.title})`));
        if (!stale.length) continue;
        out.push({
          user: u,
          message: { text: [`*${stale.length} task${stale.length > 1 ? 's have' : ' has'} been open for over a week:*`, ...stale.slice(0, 5).map((s) => `• ${s}`), '', 'Reply "done N" from /list, or ask me to clean them up.'].join('\n') },
          reason: `${stale.length} task items open > 7 days`,
          dedupeKey: `stale:${istDayStart(now).toISOString().slice(0, 10)}`,
        });
      }
      return out;
    },
  };

  return [morningBrief, meetingPrep, staleTasks];
}

module.exports = { createRules };
