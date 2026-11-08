// src/handlers/note.js
// Saves a note to Postgres and replies with confirmation.

const prisma = require('../db');
const { reply } = require('../channels');
const { log, warn } = require('../logger');
const { emit, KINDS } = require('../interactions');

const FREE_NOTE_LIMIT = 50;

async function handleNote(user, intent, message) {
  // Check free tier limit
  if (user.tier === 'free') {
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const count = await prisma.note.count({
      where: {
        userId:    user.id,
        createdAt: { gte: thisMonth },
        deletedAt: null,
      },
    });

    // Warn at 80%
    if (count >= FREE_NOTE_LIMIT * 0.8 && count < FREE_NOTE_LIMIT) {
      await reply(message,
        `${count}/${FREE_NOTE_LIMIT} free notes used this month.`
      );
    }

    // Block at 100%
    if (count >= FREE_NOTE_LIMIT) {
      await reply(message,
        `*Limit reached*\n\nYou've used all ${FREE_NOTE_LIMIT} free notes this month. Reply /upgrade for unlimited.`
      );
      warn('note.free_tier_blocked', { userId: user.id, count });
      return;
    }
  }

  // Save the note
  const note = await prisma.note.create({
    data: {
      userId:  user.id,
      title:   intent.title,
      body:    intent.body || message.text,
      tags:    intent.tags    || [],
      client:  intent.client  || null,
      project: intent.project || null,
    },
  });

  const tagLine = note.tags.length > 0 ? note.tags.join(' ') : '';

  const replyText = [
    `*Note saved*`,
    ``,
    `${note.title}`,
    tagLine ? tagLine : null,
  ].filter(l => l !== null).join('\n');

  await reply(message, replyText);
  log('note.saved', { userId: user.id, noteId: note.id, tags: note.tags, client: note.client });
  emit({ kind: KINDS.NOTE_CREATED, userId: user.id, person: note.client, summary: note.title, payload: { noteId: note.id, tags: note.tags } });
}

module.exports = { handleNote };
