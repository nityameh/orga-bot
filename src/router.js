// src/router.js
// Two routing stages:
//   routeCommand(user, message)        deterministic fast path — exact commands,
//                                      numbered replies, confirmations. No LLM.
//   routeIntent(user, intent, message) legacy intent switch, used when the agent
//                                      is unavailable (no API key / budget spent).
// Free text that isn't a command goes to the agent (src/agent) in pipeline.js.
// Docs: docs/modules/messaging-pipeline.md

const { handleNote }     = require('./handlers/note');
const { handleTask, handleTaskDone } = require('./handlers/task');
const { handleReminder } = require('./handlers/reminder');
const { handleToday, handleList, handleListTasks,
        handleSchedule, handleSearch, handleHelp, handleClient, handleExport, handlePrivacy,
        handleEditInit, handleEditComplete, handleUnknown } = require('./handlers/commands');
const { classify, keywordFallback } = require('./classifier');
const { getPendingEdit, getPendingConfirm, savePendingEdit, clearPending } = require('./pending');
const { handleReminderReply } = require('./scheduler');
const { handleDelete, handleCancel, handleConfirmAction, handleUndo } = require('./handlers/delete');
const { handleQuery } = require('./handlers/query');
const { handleImprove, handleQuiet, handleLogin, handleLink, handleDeleteMyDataRequest, handleDeleteMyDataConfirm } = require('./handlers/account');
const { reply } = require('./channels');
const { handleApprovalDecision } = require('./agent');
const { log } = require('./logger');

const TASK_COMPLETION_PATTERNS = [
  /^(completed?|finished?|done with|did)\s+(task\s+)?(\d+)/i,
  /^(mark|marked)\s+(task\s+)?(\d+)\s+(as\s+)?(done|complete|finished)/i,
  /^task\s+(\d+)\s+(is\s+)?(done|complete|finished)/i,
];

// Slash commands whose meaning is fixed; mapped to an intent without an LLM call.
const SLASH_INTENTS = ['/today', '/notes', '/schedule', '/search', '/remind', '/task'];

/**
 * Handle messages whose meaning doesn't need a language model.
 * @returns {Promise<boolean>} true if the message was handled
 */
async function routeCommand(user, message) {
  const text = message.text?.trim().toLowerCase() || '';
  const intent = keywordFallback(message.text || '');

  // ─── Pending confirmation (bare number reply) ─────────────────────────
  if (/^\d+$/.test(text)) {
    const confirm = await getPendingConfirm(user.id);
    if (confirm) {
      if (confirm.action === 'edit') {
        const num = parseInt(text);
        const item = confirm.items.find(i => i.pos === num);
        if (item) {
          await clearPending(user.id);
          await savePendingEdit(user.id, item.id, item.summary);
          await reply(message,
            `*Editing*\n"${item.summary}"\n\nSend your updated text to replace it.\nReply CANCEL to leave it as is.`
          );
          return true;
        }
        await reply(message, `Invalid number. Pick from 1-${confirm.items.length}.`);
        return true;
      }

      if (await handleConfirmAction(user, message, confirm)) return true;
    }
  }

  // ─── Pending edit (user sending replacement text) ─────────────────────
  if (await getPendingEdit(user.id)) {
    if (await handleEditComplete(user, message, classify)) return true;
  }

  // ─── "done N" and natural variants — tick off a task item ─────────────
  if (/^done\s+\d+/.test(text) && await handleTaskDone(user, message)) return true;

  for (const pattern of TASK_COMPLETION_PATTERNS) {
    const match = text.match(pattern);
    const num = match && (match[3] || match[1]);
    if (num && /^\d+$/.test(num)) {
      message.text = `done ${num}`;
      if (await handleTaskDone(user, message)) return true;
    }
  }

  // ─── APPROVE / REJECT a parked external action (agent approvals) ──────
  if (text === 'approve' || text === 'reject') {
    const answer = await handleApprovalDecision(user, text === 'approve' ? 'APPROVE' : 'REJECT');
    if (answer) { await reply(message, answer); return true; }
  }

  // ─── DONE / SNOOZE replies to a fired reminder ────────────────────────
  if ((text === 'done' || text === 'snooze') && await handleReminderReply(user, message)) return true;

  // ─── edit / delete / cancel / undo ────────────────────────────────────
  if (/^edit\s+.+/i.test(text) && await handleEditInit(user, message)) return true;
  if (/^delete\s+.+/i.test(text) && text !== 'delete my data' && await handleDelete(user, message)) return true;
  if (/^cancel\s+.+/i.test(text) && await handleCancel(user, message)) return true;
  if (text === 'undo') { await handleUndo(user, message); return true; }

  // ─── Fixed slash commands ─────────────────────────────────────────────
  if (text.startsWith('/list'))                       { await handleListTasks(user, intent, message); return true; }
  if (text === '/help' || text.startsWith('/help '))  { await handleHelp(user, intent, message); return true; }
  if (text.startsWith('/client'))                     { await handleClient(user, message); return true; }
  if (text === '/export')                             { await handleExport(user, intent, message); return true; }
  if (text === '/privacy')                            { await handlePrivacy(user, intent, message); return true; }
  if (SLASH_INTENTS.some((c) => text === c || text.startsWith(`${c} `))) {
    await routeIntent(user, intent, message);
    return true;
  }

  // ─── Account: dashboard login, channel linking, data deletion ─────────
  if (text === '/login') { await handleLogin(user, message); return true; }
  if (text === '/quiet' || text.startsWith('/quiet ')) { await handleQuiet(user, message); return true; }
  if (text === '/improve' || text.startsWith('/improve ')) { await handleImprove(user, message); return true; }
  if (text === '/link' || text.startsWith('/link ')) { await handleLink(user, message); return true; }
  if (text === 'delete my data') { await handleDeleteMyDataRequest(user, message); return true; }
  if (text === 'confirm delete' && await handleDeleteMyDataConfirm(user, message)) return true;

  return false;
}

/** Legacy intent switch (fallback when the agent is unavailable). */
async function routeIntent(user, intent, message) {
  log('intent.routing', { type: intent.type, userId: user.id });
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

/** Commands first, then the classified intent. Kept for callers that already classified. */
async function route(user, intent, message) {
  if (await routeCommand(user, message)) return;
  return routeIntent(user, intent, message);
}

module.exports = { route, routeCommand, routeIntent };
