// src/pending.js
// Manages PendingAction table — numbered list mappings for delete/edit.
// All entries expire after 10 minutes.

const prisma = require('./db');
const { log } = require('./logger');

const TTL_MINUTES = 10;

async function savePendingList(userId, type, items) {
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);

  await prisma.pendingAction.deleteMany({ where: { userId, type } });

  await prisma.pendingAction.create({
    data: { userId, type, items, expiresAt },
  });
}

async function getPendingItem(userId, type, pos) {
  const pending = await prisma.pendingAction.findFirst({
    where: {
      userId,
      type,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!pending) return null;
  return pending.items.find(i => i.pos === pos) || null;
}

async function savePendingEdit(userId, noteId, currentTitle) {
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);

  await prisma.pendingAction.deleteMany({ where: { userId, type: 'edit_note' } });

  await prisma.pendingAction.create({
    data: {
      userId,
      type: 'edit_note',
      items: [{ noteId, currentTitle }],
      expiresAt,
    },
  });
}

async function getPendingEdit(userId) {
  const pending = await prisma.pendingAction.findFirst({
    where: {
      userId,
      type: 'edit_note',
      expiresAt: { gt: new Date() },
    },
  });

  if (!pending) return null;
  return pending.items[0];
}

async function savePendingConfirm(userId, action, items) {
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);
  const type = `confirm_${action}`; // confirm_delete, confirm_edit, confirm_cancel

  await prisma.pendingAction.deleteMany({ where: { userId, type } });

  await prisma.pendingAction.create({
    data: { userId, type, items, expiresAt },
  });
}

async function getPendingConfirm(userId) {
  const pending = await prisma.pendingAction.findFirst({
    where: {
      userId,
      type: { startsWith: 'confirm_' },
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!pending) return null;
  return { action: pending.type.replace('confirm_', ''), items: pending.items };
}

async function clearPending(userId) {
  await prisma.pendingAction.deleteMany({ where: { userId } });
}

async function cleanupExpired() {
  const deleted = await prisma.pendingAction.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  if (deleted.count > 0) {
    log('pending.cleanup', { count: deleted.count });
  }
}

module.exports = { savePendingList, getPendingItem, savePendingEdit, getPendingEdit, savePendingConfirm, getPendingConfirm, clearPending, cleanupExpired };
