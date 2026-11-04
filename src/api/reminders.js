// src/api/reminders.js — Reminders CRUD for dashboard

const express = require('express');
const router = express.Router();
const prisma = require('../db');

// POST /api/v1/reminders — create a reminder
router.post('/', async (req, res) => {
  try {
    const { title, fireAt } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    if (!fireAt) return res.status(400).json({ error: 'fireAt is required' });

    const fireDate = new Date(fireAt);
    if (fireDate <= new Date()) {
      return res.status(400).json({ error: 'fireAt must be in the future' });
    }

    const reminder = await prisma.reminder.create({
      data: {
        userId: req.user.id,
        title,
        fireAt: fireDate,
        status: 'pending',
      },
    });
    res.status(201).json(reminder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/reminders
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const where = { userId: req.user.id };
    if (status) where.status = status;

    const [reminders, total] = await Promise.all([
      prisma.reminder.findMany({
        where,
        orderBy: { fireAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.reminder.count({ where }),
    ]);

    res.json({ reminders, total, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/reminders/:id
router.put('/:id', async (req, res) => {
  try {
    const { title, fireAt, status } = req.body;
    const data = {};
    if (title !== undefined) data.title = title;
    if (fireAt !== undefined) data.fireAt = new Date(fireAt);
    if (status !== undefined) data.status = status;

    const reminder = await prisma.reminder.update({
      where: { id: req.params.id },
      data,
    });
    res.json(reminder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/v1/reminders/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.reminder.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
