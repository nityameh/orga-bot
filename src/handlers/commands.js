// src/handlers/commands.js
// Handles /today, /notes, /list, /schedule, /search

const prisma = require('../db');
const { reply } = require('../channels');
const { log } = require('../logger');
const { savePendingList, savePendingEdit, getPendingEdit, getPendingItem, savePendingConfirm, clearPending } = require('../pending');

// ─── /today — with overdue section ────────────────────────────────────────
async function handleToday(user, intent, message) {
  const now        = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const yesterday  = new Date(now - 24 * 60 * 60 * 1000);

  const [latestTask, todayReminders, overdueReminders] = await Promise.all([
    prisma.task.findFirst({
      where:   { userId: user.id },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.reminder.findMany({
      where: {
        userId: user.id,
        status: 'pending',
        fireAt: { gte: todayStart, lte: todayEnd },
      },
      orderBy: { fireAt: 'asc' },
    }),
    // fired in last 24hrs but never marked done
    prisma.reminder.findMany({
      where: {
        userId: user.id,
        status: 'fired',
        fireAt: { gte: yesterday, lt: todayStart },
      },
      orderBy: { fireAt: 'asc' },
    }),
  ]);

  const pendingTasks = latestTask
    ? latestTask.items.filter(i => !i.done)
    : [];

  const lines = ['*Today*'];

  // Overdue section — always first
  if (overdueReminders.length > 0) {
    lines.push('');
    lines.push(`_Overdue (${overdueReminders.length})_`);
    overdueReminders.forEach((r, i) => {
      lines.push(`${i + 1}. ${r.title} — missed ${timeAgo(r.fireAt)}`);
    });
  }

  // Tasks section
  lines.push('');
  if (pendingTasks.length > 0) {
    lines.push(`_Tasks (${pendingTasks.length} pending)_`);
    pendingTasks.slice(0, 4).forEach((t, i) => lines.push(`${i + 1}. ${t.text}`));
    if (pendingTasks.length > 4) lines.push(`   + ${pendingTasks.length - 4} more — /list to see all`);
  } else {
    lines.push('_Tasks_ — all clear');
  }

  // Today's reminders section
  lines.push('');
  if (todayReminders.length > 0) {
    lines.push(`_Reminders (${todayReminders.length})_`);
    todayReminders.forEach((r, i) => {
      lines.push(`${i + 1}. ${formatTime(r.fireAt)} — ${r.title}`);
    });
  } else {
    lines.push('_Reminders_ — none today');
  }

  // Clean day sign-off
  if (overdueReminders.length === 0 && pendingTasks.length === 0 && todayReminders.length === 0) {
    lines.push('');
    lines.push('All caught up.');
  }

  await reply(message, lines.join('\n'));
  log('command.today', { userId: user.id });
}

// ─── /notes ────────────────────────────────────────────────────────────────
async function handleList(user, intent, message) {
  const text      = message.text.trim();
  const filterRaw = text.replace(/^\/notes?\s*/i, '').replace('#', '').trim().toLowerCase();

  const where = { userId: user.id, deletedAt: null };

  if (filterRaw) {
    where.OR = [
      { client:  { contains: filterRaw, mode: 'insensitive' } },
      { project: { contains: filterRaw, mode: 'insensitive' } },
      { tags:    { has: `#${filterRaw}` } },
    ];
  }

  const notes = await prisma.note.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take:    10,
  });

  if (notes.length === 0) {
    const msg = filterRaw
      ? `*Notes*\n\nNo notes found for "${filterRaw}". Try /notes to see all.`
      : `*Notes*\n\nNo notes yet — send me anything to save it.`;
    await reply(message, msg);
    return;
  }

  const header = filterRaw
    ? `*Notes — "${filterRaw}" (${notes.length})*`
    : `*Notes (${notes.length})*`;

  const lines = [header, ''];
  notes.forEach((n, i) => {
    const age  = timeAgo(n.createdAt);
    const tags = n.tags.length ? ` · ${n.tags.join(' ')}` : '';
    lines.push(`${i + 1}. ${n.title}${tags} · ${age}`);
  });
  lines.push(`\n_"delete N" to remove · "edit N" to update_`);

  const numberedItems = notes.map((n, i) => ({ pos: i + 1, id: n.id, summary: n.title }));
  await savePendingList(user.id, 'note_list', numberedItems);

  await reply(message, lines.join('\n'));
  log('command.notes', { userId: user.id, filter: filterRaw || null });
}

// ─── /list ─────────────────────────────────────────────────────────────────
async function handleListTasks(user, intent, message) {
  const text      = message.text.trim();
  const filterRaw = text.replace(/^\/list\s*/i, '').replace('#', '').trim().toLowerCase();

  const where = { userId: user.id };

  if (filterRaw) {
    where.OR = [
      { client: { contains: filterRaw, mode: 'insensitive' } },
      { tags:   { has: `#${filterRaw}` } },
    ];
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take:    5,
  });

  if (tasks.length === 0) {
    await reply(message,
      `*Task Lists*\n\nNo task lists yet. Try: "tasks: send invoice, review brief, call Ravi"`
    );
    return;
  }

  const lines = [`*Task Lists*`, ''];
  tasks.forEach((t, i) => {
    const pending   = t.items.filter(it => !it.done).length;
    const completed = t.items.filter(it => it.done).length;
    lines.push(`${i + 1}. ${t.title} — ${pending} pending, ${completed} done · ${timeAgo(t.createdAt)}`);
  });
  lines.push(`\n_"delete N" to remove a list_`);

  const numberedItems = tasks.map((t, i) => ({ pos: i + 1, id: t.id, summary: t.title }));
  await savePendingList(user.id, 'task_list', numberedItems);

  await reply(message, lines.join('\n'));
  log('command.list', { userId: user.id, filter: filterRaw || null });
}

// ─── /schedule ─────────────────────────────────────────────────────────────
async function handleSchedule(user, intent, message) {
  const now     = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const reminders = await prisma.reminder.findMany({
    where: {
      userId: user.id,
      status: 'pending',
      fireAt: { gte: now, lte: weekEnd },
    },
    orderBy: { fireAt: 'asc' },
  });

  if (reminders.length === 0) {
    await reply(message,
      `*Schedule*\n\nNothing scheduled for the next 7 days.\nSet one: "remind me tomorrow 9am to call Ravi"`
    );
    return;
  }

  const lines = [`*Schedule — next 7 days (${reminders.length})*`, ''];
  reminders.forEach((r, i) => {
    const dt = new Date(r.fireAt).toLocaleString('en-IN', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Kolkata', hour12: true,
    });
    lines.push(`${i + 1}. ${r.title} — ${dt}`);
  });
  lines.push(`\n_"cancel N" to remove a reminder_`);

  const numberedItems = reminders.map((r, i) => ({ pos: i + 1, id: r.id, summary: r.title }));
  await savePendingList(user.id, 'reminder_list', numberedItems);

  await reply(message, lines.join('\n'));
  log('command.schedule', { userId: user.id });
}

// ─── /search ───────────────────────────────────────────────────────────────
async function handleSearch(user, intent, message) {
  const raw   = message.text.replace(/^\/(search|find)\s*/i, '').trim();
  const query = raw
    .replace(/^(find|search|what did i (note|save|write) about)\s*/i, '')
    .replace(/\?$/, '')
    .trim();

  if (!query) {
    await reply(message,
      `*Search*\n\nWhat are you looking for?\n/search acme\n/search #note\n/search this week`
    );
    return;
  }

  const filters = parseSearchFilters(query);

  const now            = new Date();
  const todayStart     = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart - 86400000);
  const weekStart      = new Date(now - 7 * 86400000);

  let dateRange = null;
  if      (filters.dateRange === 'today')     dateRange = { gte: todayStart };
  else if (filters.dateRange === 'yesterday') dateRange = { gte: yesterdayStart, lt: todayStart };
  else if (filters.dateRange === 'week')      dateRange = { gte: weekStart };

  const keyword = filters.keyword;
  const results = [];

  // Search notes (fetch body for snippets)
  if (!filters.type || filters.type === 'note') {
    const noteWhere = { userId: user.id, deletedAt: null, ...(dateRange ? { createdAt: dateRange } : {}) };
    if (keyword) {
      noteWhere.OR = [
        { title:   { contains: keyword, mode: 'insensitive' } },
        { body:    { contains: keyword, mode: 'insensitive' } },
        { client:  { contains: keyword, mode: 'insensitive' } },
        { project: { contains: keyword, mode: 'insensitive' } },
        { tags:    { has: `#${keyword.toLowerCase()}` } },
      ];
    }
    const notes = await prisma.note.findMany({ where: noteWhere, orderBy: { createdAt: 'desc' }, take: 8 });
    notes.forEach(n => results.push({
      type: 'note', title: n.title, body: n.body, client: n.client || null, created: n.createdAt,
    }));
  }

  // Search tasks
  if (!filters.type || filters.type === 'task') {
    const taskWhere = { userId: user.id, ...(dateRange ? { createdAt: dateRange } : {}) };
    if (keyword) {
      taskWhere.OR = [
        { title:  { contains: keyword, mode: 'insensitive' } },
        { client: { contains: keyword, mode: 'insensitive' } },
      ];
    }
    const tasks = await prisma.task.findMany({ where: taskWhere, orderBy: { createdAt: 'desc' }, take: 5 });
    tasks.forEach(t => {
      const pendingCount = t.items.filter(i => !i.done).length;
      results.push({
        type: 'task', title: t.title, body: `${pendingCount} pending`, client: t.client || null, created: t.createdAt,
      });
    });
  }

  // Search reminders
  if (!filters.type || filters.type === 'reminder') {
    const remWhere = { userId: user.id, ...(dateRange ? { createdAt: dateRange } : {}) };
    if (keyword) remWhere.title = { contains: keyword, mode: 'insensitive' };
    const reminders = await prisma.reminder.findMany({ where: remWhere, orderBy: { createdAt: 'desc' }, take: 5 });
    reminders.forEach(r => results.push({
      type: 'reminder', title: r.title, body: r.status, client: null, created: r.createdAt,
    }));
  }

  if (results.length === 0) {
    const hint = filters.type ? `No ${filters.type}s for "${keyword || 'that filter'}"` : `No results for "${query}"`;
    await reply(message, `*Search*\n\n${hint}\nTry /search without filters.`);
    return;
  }

  // Group results by client
  const groups = {};
  for (const r of results) {
    const key = r.client || 'General';
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }

  const typeLabel = { note: 'note', task: 'task', reminder: 'reminder' };
  const lines = [`*Search — "${query}" (${results.length} results)*`];
  let num = 0;

  for (const [client, items] of Object.entries(groups)) {
    lines.push('');
    lines.push(`_${capitalise(client)} (${items.length})_`);
    for (const r of items) {
      num++;
      const age = timeAgo(r.created);
      const snippet = keyword && r.body ? extractSnippet(r.body, keyword) : null;
      lines.push(`${num}. [${typeLabel[r.type]}] ${r.title} · ${age}`);
      if (snippet) lines.push(`   "${snippet}"`);
    }
  }

  await reply(message, lines.join('\n'));
  log('command.search', { userId: user.id, query, filters, resultCount: results.length });
}

// ─── Search filter parser ─────────────────────────────────────────────────
function parseSearchFilters(query) {
  const q = query.toLowerCase().trim();
  const filters = { type: null, dateRange: null, keyword: null };

  if (q.includes('#note'))     filters.type = 'note';
  if (q.includes('#task'))     filters.type = 'task';
  if (q.includes('#reminder')) filters.type = 'reminder';

  if (q.includes('this week'))       filters.dateRange = 'week';
  else if (q.includes('today'))      filters.dateRange = 'today';
  else if (q.includes('yesterday'))  filters.dateRange = 'yesterday';

  filters.keyword = q
    .replace(/#(note|task|reminder)/g, '')
    .replace(/\b(this week|today|yesterday)\b/g, '')
    .trim() || null;

  return filters;
}

// ─── /help ─────────────────────────────────────────────────────────────────
async function handleHelp(user, intent, message) {
  const help = [
    `*Help*`,
    ``,
    `_Save a note_`,
    `"Meeting with Rahul went well"`,
    `"Logo concepts for Acme — minimal, dark"`,
    ``,
    `_Create tasks_`,
    `"tasks: send invoice, call bank, review brief"`,
    `"done 1" to tick off item 1`,
    ``,
    `_Set reminders_`,
    `"remind me tomorrow 9am to call Ravi"`,
    `Reply DONE or SNOOZE when it fires`,
    ``,
    `_Commands_`,
    `/today — your day at a glance`,
    `/notes — recent notes`,
    `/list — your task lists`,
    `/schedule — upcoming reminders`,
    `/search [word] — find notes and tasks`,
    `/client [name] — everything about a client`,
    `/export — backup all your notes`,
    `/privacy — what data is stored`,
    `/login — open your dashboard`,
    `/quiet — turn proactive messages on/off`,
    `/improve — help test Orga's quality (opt-in)`,
    `/link — connect WhatsApp and Telegram`,
    `/help — this message`,
  ].join('\n');

  await reply(message, help);
}

// ─── /unknown ──────────────────────────────────────────────────────────────
async function handleUnknown(user, intent, message) {
  await reply(message,
    `*Orga*\n\nSend me notes, tasks, or reminders — I'll keep track.\n\n/today — your day\n/help — full list of commands`
  );
}

// ─── /client ───────────────────────────────────────────────────────────────
async function handleClient(user, message) {
  const raw = message.text
    .replace(/^\/client\s*/i, '')
    .trim()
    .toLowerCase();

  if (!raw) {
    await reply(message,
      `*Client*\n\nWho do you want to look up?\n/client rahul\n/client acme`
    );
    return;
  }

  const weekAgo     = new Date(Date.now() - 7 * 86400000);
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000);

  const [notes, tasks, reminders, thisWeekCount, lastWeekCount] = await Promise.all([
    prisma.note.findMany({
      where: {
        userId: user.id, deletedAt: null,
        OR: [
          { client:  { contains: raw, mode: 'insensitive' } },
          { project: { contains: raw, mode: 'insensitive' } },
          { tags:    { has: `#${raw}` } },
          { body:    { contains: raw, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.task.findMany({
      where: {
        userId: user.id,
        OR: [
          { client: { contains: raw, mode: 'insensitive' } },
          { tags:   { has: `#${raw}` } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.reminder.findMany({
      where: {
        userId: user.id,
        OR: [{ title: { contains: raw, mode: 'insensitive' } }],
      },
      orderBy: { fireAt: 'desc' },
      take: 5,
    }),
    // This week's notes count
    prisma.note.count({
      where: {
        userId: user.id, deletedAt: null, createdAt: { gte: weekAgo },
        OR: [
          { client: { contains: raw, mode: 'insensitive' } },
          { tags:   { has: `#${raw}` } },
        ],
      },
    }),
    // Last week's notes count
    prisma.note.count({
      where: {
        userId: user.id, deletedAt: null,
        createdAt: { gte: twoWeeksAgo, lt: weekAgo },
        OR: [
          { client: { contains: raw, mode: 'insensitive' } },
          { tags:   { has: `#${raw}` } },
        ],
      },
    }),
  ]);

  if (notes.length === 0 && tasks.length === 0 && reminders.length === 0) {
    await reply(message,
      `*${capitalise(raw)}*\n\nNo results found. Save a note first: "meeting with ${raw} — ..."`
    );
    return;
  }

  // Find last interaction date
  const allDates = [
    ...notes.map(n => new Date(n.createdAt)),
    ...tasks.map(t => new Date(t.createdAt)),
    ...reminders.map(r => new Date(r.createdAt)),
  ];
  const lastInteraction = allDates.length > 0 ? timeAgo(new Date(Math.max(...allDates))) : 'never';

  // Trend line
  const trend = thisWeekCount > lastWeekCount ? 'up'
              : thisWeekCount < lastWeekCount ? 'down' : 'same';
  const trendText = trend === 'up'   ? `${thisWeekCount} notes this week (up from ${lastWeekCount})`
                  : trend === 'down' ? `${thisWeekCount} notes this week (down from ${lastWeekCount})`
                  : `${thisWeekCount} notes this week`;

  const lines = [`*${capitalise(raw)}*`];

  // Stats
  lines.push('');
  lines.push(`Last activity: ${lastInteraction}`);
  lines.push(trendText);

  // Action items — undone tasks + pending reminders
  const pendingTasks = tasks.flatMap(t => t.items.filter(i => !i.done).map(i => ({ text: i.text, type: 'task' })));
  const pendingReminders = reminders.filter(r => r.status === 'pending').map(r => ({ text: `${r.title} — ${formatWhen(r.fireAt)}`, type: 'reminder' }));
  const actionItems = [...pendingTasks, ...pendingReminders];

  if (actionItems.length > 0) {
    lines.push('');
    lines.push(`_Action items (${actionItems.length})_`);
    actionItems.slice(0, 5).forEach((a, i) => {
      lines.push(`${i + 1}. ${a.text} (${a.type})`);
    });
  }

  // Recent notes
  if (notes.length > 0) {
    lines.push('');
    lines.push(`_Recent notes (${notes.length})_`);
    notes.forEach((n, i) => lines.push(`${i + 1}. ${n.title} · ${timeAgo(n.createdAt)}`));
  }

  await reply(message, lines.join('\n'));
  log('command.client', { userId: user.id, client: raw });
}

// ─── Utility ───────────────────────────────────────────────────────────────
function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  if (seconds < 60)     return 'just now';
  if (seconds < 3600)   return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400)  return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(date).toLocaleDateString('en-IN');
}

function capitalise(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function extractSnippet(body, keyword) {
  if (!body || !keyword) return null;
  const lower = body.toLowerCase();
  const idx = lower.indexOf(keyword.toLowerCase());
  if (idx === -1) return null;

  const start = Math.max(0, idx - 20);
  const end = Math.min(body.length, idx + keyword.length + 40);
  let snippet = body.substring(start, end).replace(/\n/g, ' ');
  if (start > 0) snippet = '...' + snippet;
  if (end < body.length) snippet = snippet + '...';
  return snippet;
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Kolkata', hour12: true,
  });
}

function formatWhen(date) {
  const now      = new Date();
  const diffMs   = new Date(date) - now;
  const diffHrs  = diffMs / (1000 * 60 * 60);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffHrs  < 1)  return 'in under an hour';
  if (diffHrs  < 24) return `today ${formatTime(date)}`;
  if (diffDays < 2)  return `tomorrow ${formatTime(date)}`;
  if (diffDays < 7)  return new Date(date).toLocaleDateString('en-IN', {
    weekday: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Kolkata', hour12: true,
  });
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata',
  });
}

// ─── /export ──────────────────────────────────────────────────────────────
async function handleExport(user, intent, message) {
  const notes = await prisma.note.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (notes.length === 0) {
    await reply(message, `*Export*\n\nNo notes to export yet — send me anything to save it.`);
    return;
  }

  // Format notes as a clean text dump
  const lines = [
    `*Export — ${notes.length} notes*`,
    `${new Date().toLocaleDateString('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' })}`,
    ``,
  ];

  notes.forEach((n, i) => {
    const date = new Date(n.createdAt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
    const tags = n.tags.length ? `  Tags: ${n.tags.join(' ')}` : '';
    const client = n.client ? `  Client: ${n.client}` : '';

    lines.push(`\n${i + 1}. ${n.title}`);
    if (n.body && n.body !== n.title) lines.push(`   ${n.body}`);
    lines.push(`   ${date}${tags}${client}`);
  });

  lines.push('');
  lines.push(`Total: ${notes.length} notes`);

  const fullText = lines.join('\n');

  // WhatsApp max is ~4096 chars. Split if needed.
  if (fullText.length <= 4000) {
    await reply(message, fullText);
  } else {
    // Split into chunks at note boundaries
    let chunk = [];
    let chunkLen = 0;
    let part = 1;

    for (const line of lines) {
      if (chunkLen + line.length > 3800 && chunk.length > 0) {
        await reply(message, `*Export (part ${part})*\n\n${chunk.join('\n')}`);
        chunk = [];
        chunkLen = 0;
        part++;
      }
      chunk.push(line);
      chunkLen += line.length + 1;
    }

    if (chunk.length > 0) {
      await reply(message, `*Export (part ${part})*\n\n${chunk.join('\n')}`);
    }
  }
}

// ─── /privacy ─────────────────────────────────────────────────────────────
async function handlePrivacy(user, intent, message) {
  const reply = [
    '*Your Data*',
    '',
    '_What is stored_',
    '1. Your WhatsApp phone number',
    '2. Notes, tasks, and reminders you send',
    '3. Tags and client names extracted from your messages',
    '',
    '_What is NOT stored_',
    '1. Your WhatsApp contacts or chat history',
    '2. Messages from other chats',
    '3. Payment information',
    '',
    'Your data is stored securely in a private database.',
    'Only you can access your notes.',
    '',
    'To delete all your data, reply: DELETE MY DATA',
  ].join('\n');

  await reply(message, reply);
}

// ─── Edit note — "edit N" or "edit meeting note" ─────────────────────────
async function handleEditInit(user, message) {
  const text = message.text.trim();
  const matchNum = text.match(/^edit\s+(\d+)$/i);
  const matchText = text.match(/^edit\s+(.+)/i);

  if (!matchText) return false;

  // Direct numbered edit — from a pending note_list
  if (matchNum) {
    const pos  = parseInt(matchNum[1]);
    const item = await getPendingItem(user.id, 'note_list', pos);

    if (!item) {
      await reply(message,
        `*Edit*\n\nNote ${pos} not found.\nList expires after 10 minutes — try /notes again.`
      );
      return true;
    }

    await savePendingEdit(user.id, item.id, item.summary);
    await reply(message,
      `*Editing*\n"${item.summary}"\n\nSend your updated text to replace it.\nReply CANCEL to leave it as is.`
    );
    return true;
  }

  // Text-based edit — search notes
  const query = matchText[1].toLowerCase();

  const notes = await prisma.note.findMany({
    where: {
      userId: user.id,
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
  });

  if (notes.length === 0) {
    await reply(message,
      `*Edit*\n\nNo notes found matching "${matchText[1]}".\nTry /notes to see all.`
    );
    return true;
  }

  if (notes.length === 1) {
    await savePendingEdit(user.id, notes[0].id, notes[0].title);
    await reply(message,
      `*Editing*\n"${notes[0].title}"\n\nSend your updated text to replace it.\nReply CANCEL to leave it as is.`
    );
    return true;
  }

  // Multiple matches — ask for confirmation
  const lines = [`*Edit — which note?*`, ''];
  notes.forEach((n, i) => {
    lines.push(`${i + 1}. ${n.title} · ${timeAgo(n.createdAt)}`);
  });
  lines.push(`\nReply with the number.`);

  await savePendingConfirm(user.id, 'edit', notes.map((n, i) => ({
    pos: i + 1,
    id: n.id,
    type: 'note',
    summary: n.title,
  })));

  await reply(message, lines.join('\n'));
  return true;
}

// Called from router when user has a pending edit and sends free text
async function handleEditComplete(user, message, classify) {
  const pending = await getPendingEdit(user.id);
  if (!pending) return false;

  if (message.text.trim().toUpperCase() === 'CANCEL') {
    await clearPending(user.id);
    await reply(message, '*Edit cancelled*');
    return true;
  }

  // If user sent a command instead of edit text, cancel and route normally
  if (message.text.trim().startsWith('/')) {
    await clearPending(user.id);
    return false;
  }

  const intent = await classify(message.text);

  await prisma.note.update({
    where: { id: pending.noteId },
    data: {
      title:   intent.title   || message.text.substring(0, 60),
      body:    message.text,
      tags:    intent.tags    || [],
      client:  intent.client  || null,
      project: intent.project || null,
    },
  });

  await clearPending(user.id);

  const tags = intent.tags?.length ? `\n${intent.tags.join(' ')}` : '';
  await reply(message,
    `*Updated*\n"${intent.title || message.text.substring(0, 60)}"${tags}`
  );

  log('note.edited', { userId: user.id, noteId: pending.noteId });
  return true;
}

module.exports = { handleToday, handleList, handleListTasks, handleSchedule, handleSearch, handleHelp, handleClient, handleExport, handlePrivacy, handleEditInit, handleEditComplete, handleUnknown };
