// @ts-check
// src/agent/tools/reminders.js
// Agent tools: create_reminder, list_reminders, cancel_reminder, get_today.
// Docs: docs/modules/agent.md

const { z } = require('zod');
const prisma = require('../../db');
const { emit, KINDS } = require('../../interactions');
const { ToolInputError } = require('../toolRegistry');
const { formatIST, startOfDayIST } = require('../time');

const DAY = 24 * 60 * 60 * 1000;
const isoWithOffset = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$/,
  'use ISO 8601 with an offset, e.g. 2026-11-06T09:00:00+05:30',
);

/** @type {import('../toolRegistry').Tool<any>} */
const createReminder = {
  name: 'create_reminder',
  description:
    'Schedule a reminder message to the user at a specific future time. Resolve relative times ' +
    '("tomorrow 9am", "in 2 hours") yourself using the current time in IST. If the user gave no time, ask instead of guessing. ' +
    'Returns the reminder id and the time formatted for the user.',
  permission: 'write',
  inputSchema: z.strictObject({
    title: z.string().min(1).max(120).describe('What to remind about, phrased as an action: "Call Ravi about the proposal"'),
    fireAt: isoWithOffset.describe('When to send it, ISO 8601 with +05:30 offset'),
    person: z.string().min(1).max(60).optional(),
  }),
  async execute({ title, fireAt, person }, { user, now }) {
    const when = new Date(fireAt);
    if (Number.isNaN(when.getTime())) throw new ToolInputError('fireAt is not a valid date.');
    if (when <= now) throw new ToolInputError(`fireAt (${formatIST(when)}) is in the past; it is now ${formatIST(now)}.`);
    if (when.getTime() - now.getTime() > 366 * DAY) throw new ToolInputError('Reminders can be at most a year ahead.');

    const reminder = await prisma.reminder.create({ data: { userId: user.id, title, fireAt: when, status: 'pending' } });
    emit({ kind: KINDS.REMINDER_CREATED, userId: user.id, person, summary: title, payload: { reminderId: reminder.id, fireAt: when.toISOString(), via: 'agent' } });
    return { reminderId: reminder.id, title, when: formatIST(when) };
  },
};

/** @type {import('../toolRegistry').Tool<any>} */
const listReminders = {
  name: 'list_reminders',
  description: 'List upcoming (pending or snoozed) reminders in a time window, soonest first. Defaults to the next 7 days.',
  permission: 'read',
  inputSchema: z.strictObject({
    from: isoWithOffset.optional(),
    to: isoWithOffset.optional(),
  }),
  async execute({ from, to }, { user, now }) {
    const start = from ? new Date(from) : now;
    const end = to ? new Date(to) : new Date(now.getTime() + 7 * DAY);
    const reminders = await prisma.reminder.findMany({
      where: { userId: user.id, status: { in: ['pending', 'snoozed'] }, fireAt: { gte: start, lte: end } },
      orderBy: { fireAt: 'asc' },
      take: 20,
    });
    return { reminders: reminders.map((r) => ({ reminderId: r.id, title: r.title, when: formatIST(r.fireAt) })) };
  },
};

/** @type {import('../toolRegistry').Tool<any>} */
const cancelReminder = {
  name: 'cancel_reminder',
  description: 'Cancel (delete) a pending reminder. Needs the reminderId from list_reminders.',
  permission: 'write',
  inputSchema: z.strictObject({ reminderId: z.string().min(1) }),
  async execute({ reminderId }, { user }) {
    const reminder = await prisma.reminder.findFirst({ where: { id: reminderId, userId: user.id, status: { in: ['pending', 'snoozed'] } } });
    if (!reminder) throw new ToolInputError('No pending reminder with that id.');
    await prisma.reminder.deleteMany({ where: { id: reminderId, userId: user.id } });
    emit({ kind: KINDS.REMINDER_CANCELLED, userId: user.id, summary: reminder.title, payload: { reminderId, via: 'agent' } });
    return { cancelled: reminder.title, was: formatIST(reminder.fireAt) };
  },
};

/** @type {import('../toolRegistry').Tool<any>} */
const getToday = {
  name: 'get_today',
  description: "Overview of the user's day: today's remaining reminders and open task items. Use for \"what's my day\" style questions.",
  permission: 'read',
  inputSchema: z.strictObject({}),
  async execute(_input, { user, now }) {
    const endOfDay = new Date(startOfDayIST(now).getTime() + DAY);
    const [reminders, tasks] = await Promise.all([
      prisma.reminder.findMany({
        where: { userId: user.id, status: { in: ['pending', 'snoozed'] }, fireAt: { gte: now, lt: endOfDay } },
        orderBy: { fireAt: 'asc' },
      }),
      prisma.task.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);
    const openItems = tasks.flatMap((t) => /** @type {any[]} */ (t.items).filter((i) => !i.done).map((i) => ({ list: t.title, text: i.text })));
    return {
      now: formatIST(now),
      remindersToday: reminders.map((r) => ({ title: r.title, when: formatIST(r.fireAt) })),
      openTaskItems: openItems.slice(0, 15),
      openTaskCount: openItems.length,
    };
  },
};

module.exports = { createReminder, listReminders, cancelReminder, getToday };
