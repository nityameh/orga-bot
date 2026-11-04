// src/router.js
// Routes classified intents to real handlers.
// Intercepts action commands (done, delete, edit, cancel, undo) before classifier.

const { handleNote }     = require('./handlers/note');
const { handleTask, handleTaskDone } = require('./handlers/task');
const { handleReminder } = require('./handlers/reminder');
const { handleToday, handleList, handleListTasks,
        handleSchedule, handleSearch, handleHelp, handleClient, handleExport, handlePrivacy,
        handleEditInit, handleEditComplete, handleUnknown } = require('./handlers/commands');
const { classify } = require('./classifier');
const { getPendingEdit, getPendingConfirm, savePendingEdit, clearPending } = require('./pending');
const { handleReminderReply } = require('./scheduler');
const { handleDelete, handleCancel, handleConfirmAction, handleUndo } = require('./handlers/delete');
const { handleQuery } = require('./handlers/query');
const { sendMessage } = require('./sender');
const { log } = require('./logger');

async function route(user, intent, message) {
  log('intent.routing', { type: intent.type, phone: user.phone });

  const text = message.text?.trim().toLowerCase() || '';

  // ─── Pending confirmation check (bare number reply) ───────────────────
  // If user has a pending confirm_delete/confirm_edit/confirm_cancel and sends a number
  if (/^\d+$/.test(text)) {
    const confirm = await getPendingConfirm(user.id);
    if (confirm) {
      if (confirm.action === 'edit') {
        // For edit confirmations, start the edit flow
        const num = parseInt(text);
        const item = confirm.items.find(i => i.pos === num);
        if (item) {
          await savePendingEdit(user.id, item.id, item.summary);
          await clearPending(user.id);
          // Re-save the edit pending (clearPending removed it)
          await savePendingEdit(user.id, item.id, item.summary);
          await sendMessage(
            message.from,
            `*Editing*\n"${item.summary}"\n\nSend your updated text to replace it.\nReply CANCEL to leave it as is.`
          );
          return;
        }
        await sendMessage(message.from, `Invalid number. Pick from 1-${confirm.items.length}.`);
        return;
      }

      const handled = await handleConfirmAction(user, message, confirm);
      if (handled) return;
    }
  }

  // ─── Pending edit check (user sending replacement text) ───────────────
  const pendingEdit = await getPendingEdit(user.id);
  if (pendingEdit) {
    const handled = await handleEditComplete(user, message, classify);
    if (handled) return;
  }

  // ─── "done N" — mark task item complete ───────────────────────────────
  if (/^done\s+\d+/.test(text)) {
    const handled = await handleTaskDone(user, message);
    if (handled) return;
  }

  // Natural language task completion variants
  const taskCompletionPatterns = [
    /^(completed?|finished?|done with|did)\s+(task\s+)?(\d+)/i,
    /^(mark|marked)\s+(task\s+)?(\d+)\s+(as\s+)?(done|complete|finished)/i,
    /^task\s+(\d+)\s+(is\s+)?(done|complete|finished)/i,
  ];

  for (const pattern of taskCompletionPatterns) {
    const match = text.match(pattern);
    if (match) {
      const num = match[3] || match[1];
      if (num && /^\d+$/.test(num)) {
        message.text = `done ${num}`;
        const handled = await handleTaskDone(user, message);
        if (handled) return;
      }
    }
  }

  // ─── SNOOZE / DONE reminder replies ───────────────────────────────────
  if (text === 'done' || text === 'snooze') {
    const handled = await handleReminderReply(user, message.text);
    if (handled) return;
  }

  // ─── "edit ..." — numbered or text-based ──────────────────────────────
  if (/^edit\s+.+/i.test(text)) {
    const handled = await handleEditInit(user, message);
    if (handled) return;
  }

  // ─── "delete ..." — numbered or text-based ────────────────────────────
  if (/^delete\s+.+/i.test(text) && text !== 'delete my data') {
    const handled = await handleDelete(user, message);
    if (handled) return;
  }

  // ─── "cancel ..." — numbered or text-based ────────────────────────────
  if (/^cancel\s+.+/i.test(text)) {
    const handled = await handleCancel(user, message);
    if (handled) return;
  }

  // ─── "undo" ───────────────────────────────────────────────────────────
  if (text === 'undo') {
    await handleUndo(user, message);
    return;
  }

  // ─── Slash commands ───────────────────────────────────────────────────
  if (text.startsWith('/list'))    return handleListTasks(user, intent, message);
  if (text === '/help' || text.startsWith('/help ')) return handleHelp(user, intent, message);
  if (text.startsWith('/client'))  return handleClient(user, message);
  if (text === '/export')          return handleExport(user, intent, message);
  if (text === '/privacy')         return handlePrivacy(user, intent, message);

  // ─── DELETE MY DATA ───────────────────────────────────────────────────
  if (text === 'delete my data') {
    log('user.deletion_requested', { userId: user.id, phone: user.phone });
    await sendMessage(
      message.from,
      '*Deletion request received*\n\nAll your data will be permanently deleted within 24 hours. We will confirm via this chat.'
    );
    return;
  }

  // ─── Intent-based routing ─────────────────────────────────────────────
  switch (intent.type) {
    case 'NOTE':     return handleNote(user, intent, message);
    case 'TASK':     return handleTask(user, intent, message);
    case 'REMINDER': return handleReminder(user, intent, message);
    case 'SEARCH':   return handleSearch(user, intent, message);
    case 'QUERY':    return handleQuery(user, intent, message);
    case 'TODAY':    return handleToday(user, intent, message);
    case 'LIST':     return handleList(user, intent, message);
    case 'SCHEDULE': return handleSchedule(user, intent, message);
    case 'HELP':     return handleHelp(user, intent, message);
    case 'UNKNOWN':
    default:         return handleUnknown(user, intent, message);
  }
}

module.exports = { route };
