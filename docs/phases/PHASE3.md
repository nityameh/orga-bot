# CLAUDE.md — Phase 3 Update
# Notes + Tasks + Search + Commands (Weeks 5–6)

> Append this to your existing CLAUDE.md after Phase 2 section.
> Phase 2 must be fully complete before starting anything here.
> Exit criteria from Phase 2: classifier accuracy >= 90%, router stubs working.

---

## CURRENT PHASE: 3 — Notes + Tasks + Search + Commands

**Goal this phase:**
Replace every stub in `router.js` with real database logic.
By the end, a user can save a note, create a task list,
tick off tasks, search their notes, and ask what's due today —
all through text messages, all persisted in Postgres.

**No WhatsApp needed.**
Test everything with curl + prisma studio.
`sendMessage()` will fail silently without WhatsApp — that is fine.
The DB writes are what matter right now.

---

## Phase 3 — Files to Write or Update

```
UPDATED: src/handlers/note.js       ← save + confirm note
UPDATED: src/handlers/task.js       ← save task list + mark done
UPDATED: src/handlers/commands.js   ← /today /notes /list /schedule /search
UPDATED: src/router.js              ← replace stubs with real handler imports
UPDATED: src/webhook.js             ← handle button replies (task done)
UNCHANGED: src/classifier.js
UNCHANGED: src/sender.js
UNCHANGED: src/db.js
UNCHANGED: prisma/schema.prisma     ← already has all models from Phase 0
```

---

## Phase 3 — Complete Code

### 1. src/handlers/note.js

```javascript
// src/handlers/note.js
// Saves a note to Postgres and replies with confirmation.

const prisma = require('../db');
const { sendMessage } = require('../sender');

// Free tier limit
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
      await sendMessage(
        message.from,
        `⚡ Heads up — you've used ${count}/${FREE_NOTE_LIMIT} free notes this month.`
      );
    }

    // Block at 100%
    if (count >= FREE_NOTE_LIMIT) {
      await sendMessage(
        message.from,
        `⚠️ You've hit your free limit of ${FREE_NOTE_LIMIT} notes this month.\n\nReply /upgrade to get unlimited notes.`
      );
      return;
    }
  }

  // Save the note
  const note = await prisma.note.create({
    data: {
      userId:  user.id,
      title:   intent.title,
      body:    intent.body || message.text,
      tags:    intent.tags     || [],
      client:  intent.client   || null,
      project: intent.project  || null,
    },
  });

  // Build reply
  const tagLine = note.tags.length > 0
    ? note.tags.join(' ')
    : '';

  const reply = [
    `📝 Note saved`,
    tagLine ? tagLine : null,
    `"${note.title}"`,
    ``,
    `Search it later: /search ${intent.client || note.tags[0]?.replace('#','') || 'notes'}`,
  ].filter(l => l !== null).join('\n');

  await sendMessage(message.from, reply);
}

module.exports = { handleNote };
```

---

### 2. src/handlers/task.js

```javascript
// src/handlers/task.js
// Saves a task list and handles marking items done.

const prisma = require('../db');
const { sendMessage, sendButtons } = require('../sender');

async function handleTask(user, intent, message) {
  // Parse items from the message body
  // Supports: "tasks: A, B, C" or "1. A 2. B 3. C" or newline-separated
  const items = parseTaskItems(intent.body || message.text);

  if (items.length === 0) {
    await sendMessage(message.from,
      `I couldn't find any tasks in that message.\n\nTry: "tasks: send invoice, review brief, call Ravi"`
    );
    return;
  }

  // Save to DB
  const task = await prisma.task.create({
    data: {
      userId: user.id,
      title:  intent.title || 'Task list',
      items:  items.map((text, i) => ({ id: i + 1, text, done: false, order: i })),
      tags:   intent.tags   || [],
      client: intent.client || null,
    },
  });

  // Format reply
  const itemLines = items.map((item, i) => `${i + 1}. ${item}`).join('\n');

  const reply = [
    `✅ Tasks saved (${items.length})`,
    ``,
    itemLines,
    ``,
    `Reply "done 1" to tick off item 1`,
  ].join('\n');

  await sendMessage(message.from, reply);
}

// Handle "done 1" or "done 2" replies
async function handleTaskDone(user, message) {
  const match = message.text.match(/^done\s+(\d+)/i);
  if (!match) return false; // not a done command

  const itemNum = parseInt(match[1]);

  // Find the most recent task list for this user
  const task = await prisma.task.findFirst({
    where:   { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  if (!task) {
    await sendMessage(message.from, `You don't have any task lists yet.`);
    return true;
  }

  // Update the item
  const items = task.items;
  const item  = items.find(i => i.id === itemNum);

  if (!item) {
    await sendMessage(message.from, `Item ${itemNum} not found in your latest task list.`);
    return true;
  }

  item.done = true;

  await prisma.task.update({
    where: { id: task.id },
    data:  { items },
  });

  const remaining = items.filter(i => !i.done).length;

  const reply = remaining === 0
    ? `✅ Done! All tasks completed 🎉`
    : `✅ "${item.text}" done\n${remaining} task${remaining > 1 ? 's' : ''} remaining`;

  await sendMessage(message.from, reply);
  return true;
}

// Parse task items from various natural language formats
function parseTaskItems(text) {
  // Remove common prefixes
  const cleaned = text
    .replace(/^(tasks?|todo|to-do|to do)\s*:\s*/i, '')
    .trim();

  // Try comma-separated first: "A, B, C"
  if (cleaned.includes(',')) {
    return cleaned.split(',').map(s => s.trim()).filter(Boolean);
  }

  // Try numbered list: "1. A 2. B" or "1) A 2) B"
  const numbered = cleaned.match(/\d+[.)]\s*[^0-9.]+/g);
  if (numbered && numbered.length > 1) {
    return numbered.map(s => s.replace(/^\d+[.)]\s*/, '').trim()).filter(Boolean);
  }

  // Try newline-separated
  const lines = cleaned.split('\n').map(s => s.trim()).filter(Boolean);
  if (lines.length > 1) return lines;

  // Single item
  return cleaned ? [cleaned] : [];
}

module.exports = { handleTask, handleTaskDone };
```

---

### 3. src/handlers/commands.js

```javascript
// src/handlers/commands.js
// Handles all /command style messages:
// /today, /notes, /list, /schedule, /search

const prisma = require('../db');
const { sendMessage } = require('../sender');

// ─── /today ────────────────────────────────────────────────────────────────
async function handleToday(user, intent, message) {
  const now       = new Date();
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
  const todayEnd   = new Date(now); todayEnd.setHours(23,59,59,999);

  // Pending tasks (most recent task list)
  const latestTask = await prisma.task.findFirst({
    where:   { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  const pendingTasks = latestTask
    ? latestTask.items.filter(i => !i.done)
    : [];

  // Reminders due today
  const reminders = await prisma.reminder.findMany({
    where: {
      userId: user.id,
      status: 'pending',
      fireAt: { gte: todayStart, lte: todayEnd },
    },
    orderBy: { fireAt: 'asc' },
  });

  // Build reply
  const lines = ['📋 Your day\n'];

  if (pendingTasks.length > 0) {
    lines.push(`Tasks: ${pendingTasks.length} pending`);
    pendingTasks.slice(0, 3).forEach(t => lines.push(`  • ${t.text}`));
    if (pendingTasks.length > 3) lines.push(`  + ${pendingTasks.length - 3} more`);
  } else {
    lines.push('Tasks: all clear ✅');
  }

  lines.push('');

  if (reminders.length > 0) {
    lines.push('Reminders today:');
    reminders.forEach(r => {
      const time = new Date(r.fireAt).toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit',
        timeZone: 'Asia/Kolkata', hour12: true,
      });
      lines.push(`  🔔 ${time} — ${r.title}`);
    });
  } else {
    lines.push('No reminders today');
  }

  await sendMessage(message.from, lines.join('\n'));
}

// ─── /notes ────────────────────────────────────────────────────────────────
// Usage: /notes  or  /notes #acme  or  /notes acme
async function handleList(user, intent, message) {
  const text = message.text.trim();

  // Extract optional filter from message e.g. "/notes acme" or "/notes #design"
  const filterRaw = text.replace(/^\/notes?\s*/i, '').replace('#', '').trim().toLowerCase();

  const where = {
    userId:    user.id,
    deletedAt: null,
  };

  if (filterRaw) {
    // Filter by client name OR tag
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
      ? `No notes found for "${filterRaw}"\n\nTry /notes to see all your notes.`
      : `You haven't saved any notes yet.\n\nJust send me anything to save it as a note.`;
    await sendMessage(message.from, msg);
    return;
  }

  const header = filterRaw
    ? `📄 Notes for "${filterRaw}" (${notes.length})\n`
    : `📄 Your recent notes (${notes.length})\n`;

  const lines = [header];

  notes.forEach(n => {
    const age  = timeAgo(n.createdAt);
    const tags = n.tags.length ? ` · ${n.tags.join(' ')}` : '';
    lines.push(`• ${n.title}${tags} · ${age}`);
  });

  lines.push(`\nSearch: /search [keyword]`);

  await sendMessage(message.from, lines.join('\n'));
}

// ─── /list ─────────────────────────────────────────────────────────────────
// Shows active task lists
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
    await sendMessage(message.from,
      `No task lists found.\n\nTry: "tasks: send invoice, review brief, call Ravi"`
    );
    return;
  }

  const lines = [`✅ Your task lists\n`];

  tasks.forEach(t => {
    const pending   = t.items.filter(i => !i.done).length;
    const completed = t.items.filter(i => i.done).length;
    const age       = timeAgo(t.createdAt);
    lines.push(`• ${t.title} · ${pending} pending, ${completed} done · ${age}`);
  });

  await sendMessage(message.from, lines.join('\n'));
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
    await sendMessage(message.from,
      `📅 Nothing scheduled for the next 7 days.\n\nSet a reminder: "remind me [when] to [what]"`
    );
    return;
  }

  const lines = [`📅 Next 7 days (${reminders.length})\n`];

  reminders.forEach(r => {
    const dt = new Date(r.fireAt).toLocaleString('en-IN', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Kolkata', hour12: true,
    });
    lines.push(`🔔 ${dt}\n   ${r.title}`);
  });

  await sendMessage(message.from, lines.join('\n'));
}

// ─── /search ───────────────────────────────────────────────────────────────
async function handleSearch(user, intent, message) {
  // Extract search query: "/search acme" or "find acme" or "what did I note about acme"
  const text  = message.text.trim();
  const query = text
    .replace(/^\/(search|find)\s*/i, '')
    .replace(/^(find|search|what did i (note|save|write) about)\s*/i, '')
    .replace(/\?$/, '')
    .trim();

  if (!query) {
    await sendMessage(message.from,
      `What are you looking for?\n\nTry: /search acme\nOr: /search #design`
    );
    return;
  }

  const cleanQuery = query.replace('#', '').toLowerCase();

  // Search across notes
  const notes = await prisma.note.findMany({
    where: {
      userId:    user.id,
      deletedAt: null,
      OR: [
        { title:   { contains: cleanQuery, mode: 'insensitive' } },
        { body:    { contains: cleanQuery, mode: 'insensitive' } },
        { client:  { contains: cleanQuery, mode: 'insensitive' } },
        { project: { contains: cleanQuery, mode: 'insensitive' } },
        { tags:    { has: `#${cleanQuery}` } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take:    5,
  });

  if (notes.length === 0) {
    await sendMessage(message.from,
      `🔍 No results for "${query}"\n\nTry a different keyword or /notes to see everything.`
    );
    return;
  }

  const lines = [`🔍 ${notes.length} result${notes.length > 1 ? 's' : ''} for "${query}"\n`];

  notes.forEach(n => {
    const age  = timeAgo(n.createdAt);
    const tags = n.tags.length ? ` · ${n.tags.join(' ')}` : '';
    lines.push(`• ${n.title}${tags} · ${age}`);
  });

  await sendMessage(message.from, lines.join('\n'));
}

// ─── handleUnknown ─────────────────────────────────────────────────────────
async function handleUnknown(user, intent, message) {
  await sendMessage(
    message.from,
    `👋 Hey! I'm Orga.\n\nSend me anything:\n• A note to save\n• A task list\n• A reminder\n\nOr try:\n/today — your day\n/notes — recent notes\n/search [word] — find something`
  );
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

module.exports = {
  handleToday,
  handleList,
  handleListTasks,
  handleSchedule,
  handleSearch,
  handleUnknown,
};
```

---

### 4. src/router.js — Full Replacement

Replace the entire existing `router.js` with this.

```javascript
// src/router.js
// Routes classified intents to real handlers.
// Phase 3: all handlers now have real DB logic.

const { handleNote }                                       = require('./handlers/note');
const { handleTask, handleTaskDone }                       = require('./handlers/task');
const { handleToday, handleList, handleListTasks,
        handleSchedule, handleSearch, handleUnknown }      = require('./handlers/commands');

// Reminder handler is a stub here — Phase 4 fills it in
const { sendMessage } = require('./sender');

async function route(user, intent, message) {
  console.log(`Routing ${intent.type} for ${user.phone}`);

  // Check for "done N" replies first — intercept before routing
  const text = message.text?.trim().toLowerCase() || '';
  if (/^done\s+\d+/.test(text)) {
    const handled = await handleTaskDone(user, message);
    if (handled) return;
  }

  // Check for /list command (different from LIST intent for notes)
  if (text.startsWith('/list')) {
    return handleListTasks(user, intent, message);
  }

  switch (intent.type) {
    case 'NOTE':
      return handleNote(user, intent, message);

    case 'TASK':
      return handleTask(user, intent, message);

    case 'REMINDER':
      // Phase 4 will replace this stub with real reminder saving
      await sendMessage(
        message.from,
        `🔔 Reminder noted: "${intent.title}"\n${intent.datetime
          ? `\nScheduled: ${new Date(intent.datetime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
          : ''}\n\n(Reminder firing coming in Phase 4)`
      );
      break;

    case 'SEARCH':
      return handleSearch(user, intent, message);

    case 'TODAY':
      return handleToday(user, intent, message);

    case 'LIST':
      return handleList(user, intent, message);

    case 'SCHEDULE':
      return handleSchedule(user, intent, message);

    case 'UNKNOWN':
    default:
      return handleUnknown(user, intent, message);
  }
}

module.exports = { route };
```

---

### 5. src/webhook.js — Add Button Reply Handler

Add this to the existing `extractMessage()` function in `webhook.js`.
Phase 3 needs to handle "done 1" text replies.
No structural change — just ensure `extractMessage` passes
the raw text through correctly. It already does from Phase 1.

No changes needed to webhook.js for Phase 3.
The `processMessage()` function already calls `route(user, intent, message)`
which now handles "done N" replies inside the router.

---

## Phase 3 — How to Test Without WhatsApp

### Step 1: Start the server
```bash
npm run dev
```

### Step 2: Save a note
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "messages": [{
        "from": "919876543210", "id": "t001", "type": "text",
        "text": { "body": "note: logo concepts for acme — minimal design, dark bg, serif font" },
        "timestamp": "1234567890"
      }],
      "contacts": [{ "profile": { "name": "Test" }, "wa_id": "919876543210" }]
    }}]}]
  }'
```
**Check:** `npx prisma studio` → Note table → row exists with tags `["#acme","#design"]`

### Step 3: Create a task list
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "messages": [{
        "from": "919876543210", "id": "t002", "type": "text",
        "text": { "body": "tasks: send invoice to rahul, review brand brief, follow up priya" },
        "timestamp": "1234567890"
      }],
      "contacts": [{ "profile": { "name": "Test" }, "wa_id": "919876543210" }]
    }}]}]
  }'
```
**Check:** Task table → row with 3 items, all `done: false`

### Step 4: Mark a task done
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "messages": [{
        "from": "919876543210", "id": "t003", "type": "text",
        "text": { "body": "done 1" },
        "timestamp": "1234567890"
      }],
      "contacts": [{ "profile": { "name": "Test" }, "wa_id": "919876543210" }]
    }}]}]
  }'
```
**Check:** Task table → item 1 is now `done: true`

### Step 5: Search notes
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "messages": [{
        "from": "919876543210", "id": "t004", "type": "text",
        "text": { "body": "/search acme" },
        "timestamp": "1234567890"
      }],
      "contacts": [{ "profile": { "name": "Test" }, "wa_id": "919876543210" }]
    }}]}]
  }'
```
**Check:** Logs show note found, sendMessage called with result

### Step 6: /today
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "messages": [{
        "from": "919876543210", "id": "t005", "type": "text",
        "text": { "body": "/today" },
        "timestamp": "1234567890"
      }],
      "contacts": [{ "profile": { "name": "Test" }, "wa_id": "919876543210" }]
    }}]}]
  }'
```
**Check:** Logs show pending tasks count + today's reminders

---

## Phase 3 — Exit Criteria

Do not move to Phase 4 until ALL of these are true.

- [ ] Send a note via curl → row appears in Note table in Prisma Studio
- [ ] Note has correct `tags`, `client`, `title` fields populated
- [ ] Send "tasks: A, B, C" → Task row created with 3 items all `done: false`
- [ ] Send "done 1" → item 1 in latest task is `done: true`
- [ ] Send "/search acme" → returns notes tagged #acme in logs
- [ ] Send "/notes" → returns last 10 notes in logs
- [ ] Send "/today" → returns pending tasks + today's reminders in logs
- [ ] Send "/schedule" → returns upcoming reminders in logs
- [ ] Free tier limit fires a warning log at 40 notes (80%)
- [ ] Free tier blocks at 50 notes (100%)
- [ ] No uncaught errors in Railway logs across all 6 curl tests

---

## Phase 3 — What NOT to Build

- No reminder firing yet — REMINDER intent shows a stub reply (Phase 4)
- No snooze buttons — Phase 4
- No weekly digest — Phase 4
- No voice note handling — post-MVP
- No payments / upgrade flow — post-MVP
- No web dashboard — post-MVP
- No recurring tasks or reminders — post-MVP

---

## Files Changed This Phase

```
UPDATED: src/handlers/note.js       ← real DB write + free tier check
UPDATED: src/handlers/task.js       ← real DB write + "done N" handler
UPDATED: src/handlers/commands.js   ← /today /notes /list /schedule /search
UPDATED: src/router.js              ← stubs replaced with real handler calls
UNCHANGED: src/webhook.js
UNCHANGED: src/classifier.js
UNCHANGED: src/sender.js
UNCHANGED: src/db.js
UNCHANGED: prisma/schema.prisma
```

---

## What Phase 4 Will Add (For Context Only)

Phase 4 replaces the REMINDER stub in `router.js` with real logic:
- `handleReminder()` → saves to Reminder table with `fireAt` datetime
- `scheduler.js` → cron job polls every 60s, fires due reminders via WA template
- Snooze handling → button reply updates `snoozeUntil`, reschedules
- Weekly digest → Sunday 6pm cron, sends summary to all active users

The note/task/search/command logic built in Phase 3 never changes after this.

---

*Phase: 3 — Notes + Tasks + Search + Commands*
*Previous: Phase 2 — Claude Intent Classifier*
*Next: Phase 4 — Reminders + Weekly Digest*
