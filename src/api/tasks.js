// src/api/tasks.js — Tasks CRUD for dashboard

const express = require('express');
const router = express.Router();
const prisma = require('../db');

// POST /api/v1/tasks — create a task list
router.post('/', async (req, res) => {
  try {
    const { title, items, tags, client } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required' });
    }

    const formattedItems = items.map((text, i) => ({
      id: i + 1,
      text: typeof text === 'string' ? text : text.text,
      done: false,
      order: i,
    }));

    const task = await prisma.task.create({
      data: {
        userId: req.user.id,
        title,
        items: formattedItems,
        tags: tags || [],
        client: client || null,
      },
    });
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/tasks
router.get('/', async (req, res) => {
  try {
    const { client, page = 1, limit = 20 } = req.query;

    const where = { userId: req.user.id };
    if (client) {
      where.client = { contains: client, mode: 'insensitive' };
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.task.count({ where }),
    ]);

    res.json({ tasks, total, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/tasks/:id
router.get('/:id', async (req, res) => {
  try {
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/tasks/:id — update task title, tags, client
router.put('/:id', async (req, res) => {
  try {
    const { title, tags, client } = req.body;
    const data = {};
    if (title !== undefined) data.title = title;
    if (tags !== undefined) data.tags = tags;
    if (client !== undefined) data.client = client;

    const task = await prisma.task.update({
      where: { id: req.params.id },
      data,
    });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/tasks/:id/items — update items array (drag-drop reorder, toggle done, edit text)
router.put('/:id/items', async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items must be an array' });
    }

    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: { items },
    });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/v1/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.task.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
