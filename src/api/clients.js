// src/api/clients.js — Client aggregation for dashboard

const express = require('express');
const router = express.Router();
const prisma = require('../db');

// GET /api/v1/clients — list all unique clients
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get distinct client names from notes and tasks
    const [noteClients, taskClients] = await Promise.all([
      prisma.note.findMany({
        where: { userId, deletedAt: null, client: { not: null } },
        select: { client: true },
        distinct: ['client'],
      }),
      prisma.task.findMany({
        where: { userId, client: { not: null } },
        select: { client: true },
        distinct: ['client'],
      }),
    ]);

    const clientSet = new Set([
      ...noteClients.map(n => n.client.toLowerCase()),
      ...taskClients.map(t => t.client.toLowerCase()),
    ]);

    // Get counts for each client
    const clients = [];
    for (const name of clientSet) {
      const [noteCount, taskCount, reminderCount] = await Promise.all([
        prisma.note.count({
          where: { userId, deletedAt: null, client: { equals: name, mode: 'insensitive' } },
        }),
        prisma.task.count({
          where: { userId, client: { equals: name, mode: 'insensitive' } },
        }),
        prisma.reminder.count({
          where: {
            userId,
            status: 'pending',
            title: { contains: name, mode: 'insensitive' },
          },
        }),
      ]);

      clients.push({ name, noteCount, taskCount, reminderCount });
    }

    clients.sort((a, b) => (b.noteCount + b.taskCount) - (a.noteCount + a.taskCount));
    res.json({ clients });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/clients/:name — aggregated view for one client
router.get('/:name', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const name = decodeURIComponent(req.params.name).toLowerCase();

    const [notes, tasks, reminders] = await Promise.all([
      prisma.note.findMany({
        where: {
          userId,
          deletedAt: null,
          OR: [
            { client: { contains: name, mode: 'insensitive' } },
            { tags: { has: `#${name}` } },
            { body: { contains: name, mode: 'insensitive' } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.task.findMany({
        where: {
          userId,
          OR: [
            { client: { contains: name, mode: 'insensitive' } },
            { tags: { has: `#${name}` } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.reminder.findMany({
        where: {
          userId,
          title: { contains: name, mode: 'insensitive' },
        },
        orderBy: { fireAt: 'desc' },
        take: 10,
      }),
    ]);

    // Compute stats
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000);

    const thisWeekNotes = notes.filter(n => new Date(n.createdAt) >= weekAgo).length;
    const lastWeekNotes = notes.filter(n => new Date(n.createdAt) >= twoWeeksAgo && new Date(n.createdAt) < weekAgo).length;

    const allDates = [...notes.map(n => new Date(n.createdAt)), ...tasks.map(t => new Date(t.createdAt)), ...reminders.map(r => new Date(r.createdAt))];
    const lastInteraction = allDates.length > 0 ? new Date(Math.max(...allDates)).toISOString() : null;

    const actionItems = [
      ...tasks.flatMap(t => t.items.filter(i => !i.done).map(i => ({ text: i.text, type: 'task' }))),
      ...reminders.filter(r => r.status === 'pending').map(r => ({ text: r.title, type: 'reminder', fireAt: r.fireAt })),
    ];

    res.json({ name, notes, tasks, reminders, stats: { lastInteraction, thisWeekNotes, lastWeekNotes, actionItems } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
