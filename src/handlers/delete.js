// src/handlers/delete.js
// Handles delete, cancel, and undo commands.
// Supports both numbered (delete 2) and text-based (delete meeting note) inputs.
// Text-based inputs present matching options for user to confirm with a number.

const prisma = require('../db');
const { sendMessage } = require('../sender');
const { getPendingItem, savePendingConfirm, clearPending } = require('../pending');
const { log } = require('../logger');

// ─── handleDelete ─────────────────────────────────────────────────────────
// "delete 2"           → direct delete from pending list
// "delete meeting note" → search notes + tasks, present options

async function handleDelete(user, message) {
  const text = message.text.trim();
  const matchNum = text.match(/^delete\s+(\d+)$/i);
  const matchText = text.match(/^delete\s+(.+)/i);

  if (!matchText) return false;

  // Direct numbered delete — from a pending list
  if (matchNum) {
    const pos = parseInt(matchNum[1]);

    let item = await getPendingItem(user.id, 'note_list', pos);
    let type = 'note';

    if (!item) {
      item = await getPendingItem(user.id, 'task_list', pos);
      type = 'task';
    }

    if (!item) {
      await sendMessage(
        message.from,
        `*Delete*\n\nItem ${pos} not found.\nList expires after 10 minutes — try /notes or /list again.`
      );
      return true;
    }

    return await executeDelete(user, message.from, type, item);
  }

  // Text-based delete — search and present options
  const query = matchText[1].toLowerCase();
  const results = await searchForDelete(user.id, query);

  if (results.length === 0) {
    await sendMessage(
      message.from,
      `*Delete*\n\nNo matching items found for "${matchText[1]}".\nTry /notes or /list to see everything.`
    );
    return true;
  }

  if (results.length === 1) {
    // Single match — delete directly
    return await executeDelete(user, message.from, results[0].type, results[0]);
  }

  // Multiple matches — ask for confirmation
  const lines = [`*Delete — which one?*`, ''];
  results.forEach((r, i) => {
    const label = r.type === 'note' ? 'Note' : 'Task';
    lines.push(`${i + 1}. ${r.summary} — ${label} · ${r.age}`);
  });
  lines.push(`\nReply with the number.`);

  await savePendingConfirm(user.id, 'delete', results.map((r, i) => ({
    pos: i + 1,
    id: r.id,
    type: r.type,
    summary: r.summary,
  })));

  await sendMessage(message.from, lines.join('\n'));
  return true;
}

// ─── handleCancel ─────────────────────────────────────────────────────────
// "cancel 1"             → direct cancel from pending list
// "cancel call ravi"     → search reminders, present options

async function handleCancel(user, message) {
  const text = message.text.trim();
  const matchNum = text.match(/^cancel\s+(\d+)$/i);
  const matchText = text.match(/^cancel\s+(.+)/i);

  if (!matchText) return false;

  // Direct numbered cancel
  if (matchNum) {
    const pos = parseInt(matchNum[1]);
    const item = await getPendingItem(user.id, 'reminder_list', pos);

    if (!item) {
      await sendMessage(
        message.from,
        `*Cancel*\n\nReminder ${pos} not found.\nList expires after 10 minutes — try /schedule again.`
      );
      return true;
    }

    await prisma.reminder.delete({ where: { id: item.id } });
    await sendMessage(message.from, `*Cancelled* — "${item.summary}"`);
    log('reminder.cancelled', { userId: user.id, reminderId: item.id });
    await clearPending(user.id);
    return true;
  }

  // Text-based cancel — search reminders
  const query = matchText[1].toLowerCase();

  const reminders = await prisma.reminder.findMany({
    where: {
      userId: user.id,
      status: 'pending',
      title: { contains: query, mode: 'insensitive' },
    },
    orderBy: { fireAt: 'asc' },
    take: 5,
  });

  if (reminders.length === 0) {
    await sendMessage(
      message.from,
      `*Cancel*\n\nNo reminders found matching "${matchText[1]}".\nTry /schedule to see all.`
    );
    return true;
  }

  if (reminders.length === 1) {
    await prisma.reminder.delete({ where: { id: reminders[0].id } });
    await sendMessage(message.from, `*Cancelled* — "${reminders[0].title}"`);
    log('reminder.cancelled', { userId: user.id, reminderId: reminders[0].id });
    return true;
  }

  // Multiple matches — ask for confirmation
  const lines = [`*Cancel — which reminder?*`, ''];
  reminders.forEach((r, i) => {
    const dt = new Date(r.fireAt).toLocaleString('en-IN', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Kolkata', hour12: true,
    });
    lines.push(`${i + 1}. ${r.title} — ${dt}`);
  });
  lines.push(`\nReply with the number.`);

  await savePendingConfirm(user.id, 'cancel', reminders.map((r, i) => ({
    pos: i + 1,
    id: r.id,
    type: 'reminder',
    summary: r.title,
  })));

  await sendMessage(message.from, lines.join('\n'));
  return true;
}

// ─── handleConfirmAction ──────────────────────────────────────────────────
// User replied with just a number — execute the pending confirm action

async function handleConfirmAction(user, message, confirm) {
  const num = parseInt(message.text.trim());
  const item = confirm.items.find(i => i.pos === num);

  if (!item) {
    await sendMessage(
      message.from,
      `Invalid number. Pick from 1-${confirm.items.length}.`
    );
    return true;
  }

  if (confirm.action === 'delete') {
    return await executeDelete(user, message.from, item.type, item);
  }

  if (confirm.action === 'cancel') {
    await prisma.reminder.delete({ where: { id: item.id } });
    await sendMessage(message.from, `*Cancelled* — "${item.summary}"`);
    log('reminder.cancelled', { userId: user.id, reminderId: item.id });
    await clearPending(user.id);
    return true;
  }

  if (confirm.action === 'edit') {
    // Handled in commands.js — just return the item info
    return { noteId: item.id, summary: item.summary };
  }

  return false;
}

// ─── handleUndo ───────────────────────────────────────────────────────────

async function handleUndo(user, message) {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  const note = await prisma.note.findFirst({
    where: {
      userId: user.id,
      deletedAt: { gte: fiveMinutesAgo },
    },
    orderBy: { deletedAt: 'desc' },
  });

  if (!note) {
    await sendMessage(
      message.from,
      `*Undo*\n\nNothing to undo. Works within 5 minutes of deleting a note.`
    );
    return true;
  }

  await prisma.note.update({
    where: { id: note.id },
    data: { deletedAt: null },
  });

  await sendMessage(message.from, `*Restored* — "${note.title}"`);
  log('note.restored', { userId: user.id, noteId: note.id });
  return true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function executeDelete(user, phone, type, item) {
  if (type === 'note') {
    await prisma.note.update({
      where: { id: item.id },
      data: { deletedAt: new Date() },
    });
    await sendMessage(phone, `*Deleted* — "${item.summary}"\n\nReply UNDO within 5 minutes to restore.`);
    log('note.deleted', { userId: user.id, noteId: item.id });
  }

  if (type === 'task') {
    await prisma.task.delete({ where: { id: item.id } });
    await sendMessage(phone, `*Removed* — "${item.summary}"`);
    log('task.deleted', { userId: user.id, taskId: item.id });
  }

  await clearPending(user.id);
  return true;
}

async function searchForDelete(userId, query) {
  const [notes, tasks] = await Promise.all([
    prisma.note.findMany({
      where: {
        userId,
        deletedAt: null,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { body: { contains: query, mode: 'insensitive' } },
          { client: { contains: query, mode: 'insensitive' } },
          { tags: { has: `#${query}` } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.task.findMany({
      where: {
        userId,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { client: { contains: query, mode: 'insensitive' } },
          { tags: { has: `#${query}` } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
    }),
  ]);

  const results = [];

  notes.forEach(n => {
    results.push({
      id: n.id,
      type: 'note',
      summary: n.title,
      age: timeAgo(n.createdAt),
    });
  });

  tasks.forEach(t => {
    results.push({
      id: t.id,
      type: 'task',
      summary: t.title,
      age: timeAgo(t.createdAt),
    });
  });

  return results;
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(date).toLocaleDateString('en-IN');
}

module.exports = { handleDelete, handleCancel, handleConfirmAction, handleUndo };
