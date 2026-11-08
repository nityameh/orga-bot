// src/api/chat.js — Web chat endpoints (ADR-018), session-authenticated.
//   GET  /chat/messages?after=<ISO>   messages in both directions, oldest first
//   POST /chat/messages { text }       202 Accepted; processed by the same pipeline
//                                      as WhatsApp/Telegram; replies arrive via GET
// Docs: docs/modules/channels.md → Web chat

const crypto = require('crypto');
const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { processInbound } = require('../pipeline');
const { runWithContext } = require('../context');
const { runInBackground } = require('../runtime/background');
const { reply } = require('../channels');
const { error } = require('../logger');

const router = express.Router();

const SendBody = z.object({ text: z.string().trim().min(1).max(2000) });
const ListQuery = z.object({
  after: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

router.get('/messages', async (req, res, next) => {
  try {
    const q = ListQuery.safeParse(req.query);
    if (!q.success) return res.status(400).json({ error: 'Invalid query' });
    const { after, limit } = q.data;
    const rows = await prisma.webMessage.findMany({
      where: { userId: req.user.id, ...(after ? { createdAt: { gt: after } } : {}) },
      // No cursor: the most recent page, then oldest-first for display.
      orderBy: { createdAt: after ? 'asc' : 'desc' },
      take: limit,
      select: { id: true, direction: true, text: true, buttons: true, createdAt: true },
    });
    res.json({ messages: after ? rows : rows.reverse() });
  } catch (err) {
    next(err);
  }
});

router.post('/messages', async (req, res, next) => {
  try {
    const body = SendBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Message must be 1–2000 characters' });
    const userId = req.user.id;
    const text = body.data.text;

    // A user who joined via WhatsApp/Telegram gets a web identity on first use.
    await prisma.channelIdentity.upsert({
      where: { channel_externalId: { channel: 'web', externalId: userId } },
      create: { userId, channel: 'web', externalId: userId, lastInboundAt: new Date() },
      update: {},
    });
    const saved = await prisma.webMessage.create({ data: { userId, direction: 'in', text } });

    const message = { channel: 'web', externalId: userId, from: userId, id: `web_${crypto.randomUUID()}`, text, name: '' };
    res.status(202).json({ id: saved.id, createdAt: saved.createdAt });

    // Process after responding, exactly like a webhook: the browser polls for the reply.
    // On Vercel, waitUntil keeps the function alive until this finishes (ADR-020).
    runInBackground(() => runWithContext({ channel: 'web' }, async () => {
      try {
        await processInbound(message);
      } catch (err) {
        error('webchat.processing_failed', { err: err.message });
        await reply(message, "I'm having trouble on my side right now. Please try again in a minute.").catch(() => {});
      }
    }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
