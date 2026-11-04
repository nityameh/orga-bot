// src/api/notes.js — Notes CRUD for dashboard

const express = require('express');
const router = express.Router();
const prisma = require('../db');

// POST /api/v1/notes — create a note
router.post('/', async (req, res) => {
  try {
    const { title, body, tags, client, project } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    const note = await prisma.note.create({
      data: {
        userId: req.user.id,
        title,
        body: body || null,
        tags: tags || [],
        client: client || null,
        project: project || null,
      },
    });
    res.status(201).json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/notes — list notes with filters
router.get('/', async (req, res) => {
  try {
    const { search, client, tag, pinned, archived, page = 1, limit = 20, sort = 'createdAt' } = req.query;

    const where = {
      userId: req.user.id,
      deletedAt: null,
    };

    // Exclude archived by default
    if (archived !== 'true') {
      where.archivedAt = null;
    }

    if (pinned === 'true') where.pinned = true;

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { body: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (client) {
      where.client = { contains: client, mode: 'insensitive' };
    }

    if (tag) {
      where.tags = { has: tag.startsWith('#') ? tag : `#${tag}` };
    }

    const [notes, total] = await Promise.all([
      prisma.note.findMany({
        where,
        orderBy: [{ pinned: 'desc' }, { [sort]: 'desc' }],
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.note.count({ where }),
    ]);

    res.json({ notes, total, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/notes/:id
router.get('/:id', async (req, res) => {
  try {
    const note = await prisma.note.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/notes/:id — update note
router.put('/:id', async (req, res) => {
  try {
    const { title, body, tags, client, project, pinned, archivedAt } = req.body;

    const data = {};
    if (title !== undefined) data.title = title;
    if (body !== undefined) data.body = body;
    if (tags !== undefined) data.tags = tags;
    if (client !== undefined) data.client = client;
    if (project !== undefined) data.project = project;
    if (pinned !== undefined) data.pinned = pinned;
    if (archivedAt !== undefined) data.archivedAt = archivedAt;

    const note = await prisma.note.update({
      where: { id: req.params.id },
      data,
    });
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/v1/notes/:id — soft delete
router.delete('/:id', async (req, res) => {
  try {
    await prisma.note.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/notes/:id/pin — toggle pin
router.post('/:id/pin', async (req, res) => {
  try {
    const note = await prisma.note.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!note) return res.status(404).json({ error: 'Note not found' });

    const updated = await prisma.note.update({
      where: { id: req.params.id },
      data: { pinned: !note.pinned },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/notes/:id/archive — toggle archive
router.post('/:id/archive', async (req, res) => {
  try {
    const note = await prisma.note.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!note) return res.status(404).json({ error: 'Note not found' });

    const updated = await prisma.note.update({
      where: { id: req.params.id },
      data: { archivedAt: note.archivedAt ? null : new Date() },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
