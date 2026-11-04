// src/handlers/task.js
// Saves a task list and handles marking items done.

const prisma = require('../db');
const { sendMessage } = require('../sender');
const { log } = require('../logger');

async function handleTask(user, intent, message) {
  const items = parseTaskItems(intent.body || message.text);

  if (items.length === 0) {
    await sendMessage(message.from,
      `*Tasks*\n\nCouldn't find any tasks. Try: "tasks: send invoice, review brief, call Ravi"`
    );
    return;
  }

  // Append mode — add items to an existing task list
  if (intent.append && intent.targetList) {
    const target = intent.targetList.toLowerCase();
    const existing = await prisma.task.findFirst({
      where: {
        userId: user.id,
        OR: [
          { title:  { contains: target, mode: 'insensitive' } },
          { client: { contains: target, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      const maxId = existing.items.reduce((max, i) => Math.max(max, i.id), 0);
      const newItems = items.map((text, i) => ({
        id: maxId + i + 1,
        text,
        done: false,
        order: existing.items.length + i,
      }));

      const updatedItems = [...existing.items, ...newItems];

      await prisma.task.update({
        where: { id: existing.id },
        data: { items: updatedItems },
      });

      const pending = updatedItems.filter(i => !i.done).length;
      const addedLines = newItems.map((item) => `${item.id}. ${item.text}`).join('\n');

      const reply = [
        `*Added to "${existing.title}"*`,
        ``,
        addedLines,
        ``,
        `${pending} pending total`,
      ].join('\n');

      await sendMessage(message.from, reply);
      log('task.appended', { userId: user.id, taskId: existing.id, addedCount: items.length });
      return;
    }

    // No matching list found — create new one
    log('task.append_miss', { userId: user.id, targetList: target });
  }

  // Create new task list
  const task = await prisma.task.create({
    data: {
      userId: user.id,
      title:  intent.title || 'Task list',
      items:  items.map((text, i) => ({ id: i + 1, text, done: false, order: i })),
      tags:   intent.tags   || [],
      client: intent.client || null,
    },
  });

  const itemLines = items.map((item, i) => `${i + 1}. ${item}`).join('\n');

  const reply = [
    `*Tasks saved (${items.length})*`,
    ``,
    itemLines,
    ``,
    `Reply "done 1" to tick off`,
  ].join('\n');

  await sendMessage(message.from, reply);
  log('task.created', { userId: user.id, taskId: task.id, itemCount: items.length });
}

// Handle "done 1" or "done 2" replies
// Searches across ALL task lists, not just the latest
async function handleTaskDone(user, message) {
  const match = message.text.match(/^done\s+(\d+)/i);
  if (!match) return false;

  const itemNum = parseInt(match[1]);

  const tasks = await prisma.task.findMany({
    where:   { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take:    10,
  });

  if (tasks.length === 0) {
    await sendMessage(message.from, `*Tasks*\n\nNo task lists yet.`);
    return true;
  }

  // Search all task lists for the item number
  let task = null;
  let item = null;

  for (const t of tasks) {
    const found = t.items.find(i => i.id === itemNum && !i.done);
    if (found) {
      task = t;
      item = found;
      break;
    }
  }

  // Also try matching by position in latest task
  if (!item) {
    const latest = tasks[0];
    const found = latest.items.find(i => i.id === itemNum);
    if (found) {
      task = latest;
      item = found;
    }
  }

  if (!item) {
    await sendMessage(message.from, `Item ${itemNum} not found in your tasks. Try /list to check.`);
    return true;
  }

  if (item.done) {
    await sendMessage(message.from, `"${item.text}" is already done.`);
    return true;
  }

  item.done = true;

  await prisma.task.update({
    where: { id: task.id },
    data:  { items: task.items },
  });

  const remaining = task.items.filter(i => !i.done).length;

  const reply = remaining === 0
    ? `*Done* — all tasks in "${task.title}" completed.`
    : `*Done* — "${item.text}"\n${remaining} task${remaining > 1 ? 's' : ''} remaining in "${task.title}"`;

  await sendMessage(message.from, reply);
  log('task.item_done', { userId: user.id, taskId: task.id, itemId: itemNum });
  return true;
}

function parseTaskItems(text) {
  const cleaned = text
    .replace(/^add to .+? tasks?:\s*/i, '')       // "add to acme tasks: ..."
    .replace(/^(tasks?|todo|to-do|to do)\s*:\s*/i, '')  // "tasks: ..."
    .trim();

  if (cleaned.includes(',')) {
    return cleaned.split(',').map(s => s.trim()).filter(Boolean);
  }

  const numbered = cleaned.match(/\d+[.)]\s*[^0-9.]+/g);
  if (numbered && numbered.length > 1) {
    return numbered.map(s => s.replace(/^\d+[.)]\s*/, '').trim()).filter(Boolean);
  }

  const lines = cleaned.split('\n').map(s => s.trim()).filter(Boolean);
  if (lines.length > 1) return lines;

  return cleaned ? [cleaned] : [];
}

module.exports = { handleTask, handleTaskDone };
