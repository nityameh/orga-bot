# CLAUDE.md — Sprint Plan
# Current Sprint: Fixes + Search + Features + Deployment

> This sprint covers all pending work agreed upon after Phase 4 completion.
> Work through each section in order — fixes first, then search, then features, then deploy.
> All items are testable with curl + Prisma Studio unless marked otherwise.

---

## SPRINT OVERVIEW

```
FIX 1    — Task completion natural language detection
FIX 3    — /help command + structured logging in all handlers
SEARCH   — Filter by type, date, and combined queries
FEATURE 1 — Edit notes (numbered list → edit N → replace text)
FEATURE 2 — Export notes (/export → formatted text reply)
FEATURE 4 — Quick capture shortcut (wa.me link — zero code)
FEATURE 7 — /privacy command
FEATURE 8 — Formatting + brand voice consistency
FEATURE 9 — Delete feature (numbered list delete/cancel/undo)
DEPLOY 1  — Railway deployment (always-on production)
```

---

## FIX 1 — Task Completion Natural Language

### Problem
When a user says "completed 4 tasks" or "finished task 1 and 2" the
classifier saves it as a NOTE. It should mark the task as done.

### Root Cause
The router only intercepts exact pattern `done N` before classification.
Natural language variations get classified as NOTE by Groq.

### Fix — Update src/router.js

Add these patterns to the router BEFORE the classifier call.
Place immediately after the existing `done N` intercept block.

```javascript
// In src/router.js — add after the existing "done N" check

// Natural language task completion variants
const taskCompletionPatterns = [
  /^(completed?|finished?|done with|did)\s+(task\s+)?(\d+)/i,
  /^(mark|marked)\s+(task\s+)?(\d+)\s+(as\s+)?(done|complete|finished)/i,
  /^task\s+(\d+)\s+(is\s+)?(done|complete|finished)/i,
];

for (const pattern of taskCompletionPatterns) {
  const match = text.match(pattern);
  if (match) {
    // Extract the number from whichever capture group has it
    const num = match[3] || match[1];
    if (num) {
      message.text = `done ${num}`; // normalise to existing handler format
      const handled = await handleTaskDone(user, message);
      if (handled) return;
    }
  }
}
```

### Test

```bash
# Save a task list first
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "messages": [{ "from": "919876543210", "id": "f001",
        "type": "text", "text": { "body": "tasks: send invoice, review brief, call Priya" },
        "timestamp": "1234567890" }],
      "contacts": [{ "profile": { "name": "Test" }, "wa_id": "919876543210" }]
    }}]}]
  }'

# Test natural language completion variants
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "messages": [{ "from": "919876543210", "id": "f002",
        "type": "text", "text": { "body": "completed task 1" },
        "timestamp": "1234567890" }],
      "contacts": [{ "profile": { "name": "Test" }, "wa_id": "919876543210" }]
    }}]}]
  }'

curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "messages": [{ "from": "919876543210", "id": "f003",
        "type": "text", "text": { "body": "finished task 2" },
        "timestamp": "1234567890" }],
      "contacts": [{ "profile": { "name": "Test" }, "wa_id": "919876543210" }]
    }}]}]
  }'
```

**Check:** Prisma Studio → Task table → items 1 and 2 have `done: true`
**Check:** Logs show `task.item_done` not `note.saved`

### Files Changed
```
UPDATED: src/router.js   ← 3 new regex patterns before classifier call
```

---

## FIX 3 — /help Command + Structured Logging

### Part A — /help Command

**Add to src/handlers/commands.js:**

```javascript
// ─── /help ─────────────────────────────────────────────────────────────────
async function handleHelp(user, message) {
  const reply = [
    '*Orga — Commands*',
    '',
    '*Save anything*',
    'Just type naturally:',
    '"Logo concepts for Acme — minimal, dark bg"',
    '"Remind me tomorrow 9am to follow up with Rahul"',
    '"Tasks: send invoice, review brief, call Priya"',
    '',
    '*Commands*',
    '/today — your day at a glance',
    '/notes — recent notes  (/notes acme to filter)',
    '/list — your task lists',
    '/schedule — upcoming reminders',
    '/search — find anything  (/search acme this week)',
    '/client [name] — everything about one client',
    '/export — get all your notes as text',
    '/privacy — what data is stored',
    '/help — this menu',
    '',
    '_Tip: reply "done 1" to tick off a task, "cancel 1" after /schedule to remove a reminder_',
  ].join('\n');

  await sendMessage(message.from, reply);
}
```

**Add to module.exports at bottom of commands.js:**
```javascript
module.exports = {
  handleToday,
  handleList,
  handleListTasks,
  handleSchedule,
  handleSearch,
  handleUnknown,
  handleClient,
  handleHelp,   // ADD THIS
};
```

**Add to src/router.js:**
```javascript
// Import
const { ..., handleHelp } = require('./handlers/commands');

// In route() — before the switch, with other intercepts
if (text === '/help' || text === 'help') {
  return handleHelp(user, message);
}
```

---

### Part B — Structured Logging in All Handlers

Import logger at the top of each file and replace console.log/warn/error.

**src/handlers/note.js — add at top:**
```javascript
const { log, warn, error } = require('../logger');
```

Replace:
```javascript
// console.log('Note saved:', note.id)  →
log('note.saved', { userId: user.id, noteId: note.id, tags: note.tags, client: note.client });

// console.warn('Free tier limit hit')  →
warn('note.free_tier_blocked', { userId: user.id, count });
```

**src/handlers/task.js — add at top:**
```javascript
const { log, warn } = require('../logger');
```

Replace:
```javascript
// console.log('Task created')  →
log('task.created', { userId: user.id, taskId: task.id, itemCount: items.length });

// console.log('Task item done')  →
log('task.item_done', { userId: user.id, taskId: task.id, itemPos: itemNum });
```

**src/handlers/reminder.js — add at top:**
```javascript
const { log, warn } = require('../logger');
```

Replace:
```javascript
// console.log('Reminder created')  →
log('reminder.created', { userId: user.id, reminderId: reminder.id, fireAt: reminder.fireAt });
```

**src/handlers/commands.js — add at top:**
```javascript
const { log } = require('../logger');
```

Replace in each command handler:
```javascript
log('command.today',    { userId: user.id });
log('command.list',     { userId: user.id, filter: filterRaw });
log('command.schedule', { userId: user.id });
log('command.search',   { userId: user.id, query });
log('command.client',   { userId: user.id, client: raw });
log('command.help',     { userId: user.id });
```

**src/router.js — add at top:**
```javascript
const { log } = require('../logger');
```

```javascript
// At the start of route()
log('intent.routing', { type: intent.type, from: user.phone });
```

### Files Changed
```
UPDATED: src/handlers/commands.js  ← handleHelp() added + logger imports
UPDATED: src/handlers/note.js      ← logger imports + replacements
UPDATED: src/handlers/task.js      ← logger imports + replacements
UPDATED: src/handlers/reminder.js  ← logger imports + replacements
UPDATED: src/router.js             ← /help routing + logger import
```

---

## SEARCH — Filter by Type, Date, and Combined

### What to Support

```
/search acme              → keyword (already works)
/search #note             → notes only
/search #task             → tasks only
/search #reminder         → reminders only
/search today             → saved today
/search yesterday         → saved yesterday
/search this week         → saved this week
/search acme this week    → keyword + date combined
/search #note rahul       → type + keyword combined
```

### Update handleSearch() in src/handlers/commands.js

Replace the existing handleSearch() entirely:

```javascript
async function handleSearch(user, intent, message) {
  const raw   = message.text.replace(/^\/(search|find)\s*/i, '').trim();
  const query = raw
    .replace(/^(find|search|what did i (note|save|write) about)\s*/i, '')
    .replace(/\?$/, '')
    .trim();

  if (!query) {
    await sendMessage(message.from,
      'What are you looking for?\n\nTry:\n/search acme\n/search #note\n/search this week\n/search rahul this week'
    );
    return;
  }

  // Parse filters from query
  const filters = parseSearchFilters(query);

  const now          = new Date();
  const todayStart   = new Date(now); todayStart.setHours(0,0,0,0);
  const yesterdayStart = new Date(todayStart - 86400000);
  const weekStart    = new Date(now - 7 * 86400000);

  // Build date range
  let dateRange = null;
  if      (filters.dateRange === 'today')     dateRange = { gte: todayStart };
  else if (filters.dateRange === 'yesterday') dateRange = { gte: yesterdayStart, lt: todayStart };
  else if (filters.dateRange === 'week')      dateRange = { gte: weekStart };

  const keyword = filters.keyword;
  const results = [];

  // Search notes — unless type filter excludes them
  if (!filters.type || filters.type === 'note') {
    const noteWhere = {
      userId:    user.id,
      deletedAt: null,
      ...(dateRange ? { createdAt: dateRange } : {}),
    };

    if (keyword) {
      noteWhere.OR = [
        { title:   { contains: keyword, mode: 'insensitive' } },
        { body:    { contains: keyword, mode: 'insensitive' } },
        { client:  { contains: keyword, mode: 'insensitive' } },
        { project: { contains: keyword, mode: 'insensitive' } },
        { tags:    { has: `#${keyword.toLowerCase()}` } },
      ];
    }

    const notes = await prisma.note.findMany({
      where:   noteWhere,
      orderBy: { createdAt: 'desc' },
      take:    5,
    });

    notes.forEach(n => results.push({
      type:    'note',
      title:   n.title,
      tags:    n.tags,
      created: n.createdAt,
    }));
  }

  // Search tasks — unless type filter excludes them
  if (!filters.type || filters.type === 'task') {
    const taskWhere = {
      userId: user.id,
      ...(dateRange ? { createdAt: dateRange } : {}),
    };

    if (keyword) {
      taskWhere.OR = [
        { title:  { contains: keyword, mode: 'insensitive' } },
        { client: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const tasks = await prisma.task.findMany({
      where:   taskWhere,
      orderBy: { createdAt: 'desc' },
      take:    3,
    });

    tasks.forEach(t => results.push({
      type:    'task',
      title:   t.title,
      tags:    t.tags,
      created: t.createdAt,
    }));
  }

  // Search reminders — unless type filter excludes them
  if (!filters.type || filters.type === 'reminder') {
    const remWhere = {
      userId: user.id,
      ...(dateRange ? { createdAt: dateRange } : {}),
    };

    if (keyword) {
      remWhere.title = { contains: keyword, mode: 'insensitive' };
    }

    const reminders = await prisma.reminder.findMany({
      where:   remWhere,
      orderBy: { createdAt: 'desc' },
      take:    3,
    });

    reminders.forEach(r => results.push({
      type:    'reminder',
      title:   r.title,
      tags:    [],
      created: r.createdAt,
    }));
  }

  // Sort all results by date
  results.sort((a, b) => new Date(b.created) - new Date(a.created));

  if (results.length === 0) {
    const hint = filters.type
      ? `No ${filters.type}s found for "${keyword || 'that filter'}"`
      : `No results for "${query}"`;
    await sendMessage(message.from, `${hint}\n\nTry /search without filters to see everything.`);
    return;
  }

  // Format reply
  const typeEmoji = { note: '📝', task: '✅', reminder: '🔔' };
  const header = `*Search results (${results.length})*\n`;
  const lines  = [header];

  results.forEach((r, i) => {
    const age  = timeAgo(r.created);
    const tags = r.tags?.length ? ` · ${r.tags.join(' ')}` : '';
    const icon = typeEmoji[r.type] || '•';
    lines.push(`${i + 1}. ${icon} ${r.title}${tags} · ${age}`);
  });

  await sendMessage(message.from, lines.join('\n'));
  log('command.search', { userId: user.id, query, filters, resultCount: results.length });
}

// ─── Search filter parser ──────────────────────────────────────────────────
function parseSearchFilters(query) {
  const q = query.toLowerCase().trim();
  const filters = { type: null, dateRange: null, keyword: null };

  // Type detection
  if (q.includes('#note'))     filters.type = 'note';
  if (q.includes('#task'))     filters.type = 'task';
  if (q.includes('#reminder')) filters.type = 'reminder';

  // Date detection
  if (q.includes('this week'))  filters.dateRange = 'week';
  else if (q.includes('today'))     filters.dateRange = 'today';
  else if (q.includes('yesterday')) filters.dateRange = 'yesterday';

  // Remaining text = keyword
  filters.keyword = q
    .replace(/#(note|task|reminder)/g, '')
    .replace(/\b(this week|today|yesterday)\b/g, '')
    .trim() || null;

  return filters;
}
```

### Files Changed
```
UPDATED: src/handlers/commands.js  ← handleSearch() replaced
                                      parseSearchFilters() added
```

---

## FEATURE 1 — Edit Notes

### How It Works

```
/notes → numbered list → "edit 2" → bot asks for replacement → user sends new text → updated
```

Runs new text through Groq classifier to re-extract title, tags, client automatically.

### Add to src/pending.js

```javascript
// New function — save an edit intent
async function savePendingEdit(userId, noteId, currentTitle) {
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);

  await prisma.pendingAction.deleteMany({
    where: { userId, type: 'edit_note' },
  });

  await prisma.pendingAction.create({
    data: {
      userId,
      type:  'edit_note',
      items: [{ noteId, currentTitle }],
      expiresAt,
    },
  });
}

// New function — retrieve pending edit
async function getPendingEdit(userId) {
  const pending = await prisma.pendingAction.findFirst({
    where: {
      userId,
      type:      'edit_note',
      expiresAt: { gt: new Date() },
    },
  });

  if (!pending) return null;
  return pending.items[0]; // { noteId, currentTitle }
}

module.exports = {
  savePendingList,
  getPendingItem,
  clearPending,
  cleanupExpired,
  savePendingEdit,  // ADD
  getPendingEdit,   // ADD
};
```

### Add handleEdit to src/handlers/commands.js

```javascript
// Add import at top
const { savePendingList, savePendingEdit, getPendingEdit, clearPending } = require('../pending');

// ─── Edit initiation — "edit N" ────────────────────────────────────────────
async function handleEditInit(user, message) {
  const match = message.text.match(/^edit\s+(\d+)/i);
  if (!match) return false;

  const pos  = parseInt(match[1]);
  const item = await getPendingItem(user.id, 'note_list', pos);

  if (!item) {
    await sendMessage(
      message.from,
      `Couldn't find note ${pos}.\n\nList expires after 10 minutes — try /notes again.`
    );
    return true;
  }

  // Save edit intent
  await savePendingEdit(user.id, item.id, item.summary);

  await sendMessage(
    message.from,
    `*Editing note ${pos}*\n"${item.summary}"\n\nSend your updated text to replace it.\nOr reply CANCEL to leave it as is.`
  );

  return true;
}

// ─── Edit completion — receives replacement text ───────────────────────────
// Called from router when user has a pending edit and sends free text
async function handleEditComplete(user, message, classify) {
  const pending = await getPendingEdit(user.id);
  if (!pending) return false;

  // CANCEL check
  if (message.text.trim().toUpperCase() === 'CANCEL') {
    await clearPending(user.id);
    await sendMessage(message.from, 'Edit cancelled — note unchanged.');
    return true;
  }

  // Slash command check — user sent a command instead of edit text
  if (message.text.trim().startsWith('/')) {
    await clearPending(user.id);
    return false; // let it route normally
  }

  // Re-classify the new text to extract updated title, tags, client
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
  await sendMessage(
    message.from,
    `Updated ✓\n"${intent.title || message.text.substring(0, 60)}"${tags}`
  );

  log('note.edited', { userId: user.id, noteId: pending.noteId });
  return true;
}
```

### Update src/router.js

```javascript
// Add imports
const { handleEditInit, handleEditComplete } = require('./handlers/commands');
const { classify } = require('./classifier');
const { getPendingEdit } = require('./pending');

// In route() — add these checks in order BEFORE the switch

  // Check for pending note edit — user is sending replacement text
  const pendingEdit = await getPendingEdit(user.id);
  if (pendingEdit) {
    const handled = await handleEditComplete(user, message, classify);
    if (handled) return;
  }

  // "edit N" — initiate note edit
  if (/^edit\s+\d+/i.test(text)) {
    const handled = await handleEditInit(user, message);
    if (handled) return;
  }
```

### Update handleList() in commands.js

Add hint to the /notes reply:
```javascript
// At end of notes reply, add:
lines.push(`\nReply "edit N" to update · "delete N" to remove`);
```

### Files Changed
```
UPDATED: src/pending.js            ← savePendingEdit() + getPendingEdit()
UPDATED: src/handlers/commands.js  ← handleEditInit() + handleEditComplete()
UPDATED: src/router.js             ← edit intercepts added
```

---

## FEATURE 2 — Export Notes

### What It Does

`/export` → sends all the user's notes as a formatted plain text reply.
If notes exceed 4000 characters, splits into multiple messages.

### Add to src/handlers/commands.js

```javascript
// ─── /export ───────────────────────────────────────────────────────────────
async function handleExport(user, message) {
  const notes = await prisma.note.findMany({
    where:   { userId: user.id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (notes.length === 0) {
    await sendMessage(message.from, 'No notes to export yet.');
    return;
  }

  // Format all notes
  const lines = [
    `*Orga Export — ${notes.length} notes*`,
    `_${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}_`,
    '',
  ];

  notes.forEach((n, i) => {
    const date = new Date(n.createdAt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
    const tags = n.tags?.length ? ` · ${n.tags.join(' ')}` : '';
    lines.push(`${i + 1}. *${n.title}*${tags}`);
    if (n.body && n.body !== n.title) lines.push(`   ${n.body}`);
    lines.push(`   _${date}_`);
    lines.push('');
  });

  const fullText = lines.join('\n');

  // Split into 3800-char chunks (safe under 4096 limit)
  const CHUNK_SIZE = 3800;

  if (fullText.length <= CHUNK_SIZE) {
    await sendMessage(message.from, fullText);
  } else {
    const chunks = [];
    let current  = '';

    for (const line of lines) {
      if ((current + '\n' + line).length > CHUNK_SIZE) {
        chunks.push(current);
        current = line;
      } else {
        current += (current ? '\n' : '') + line;
      }
    }

    if (current) chunks.push(current);

    // Send header first
    await sendMessage(
      message.from,
      `*Exporting ${notes.length} notes in ${chunks.length} messages...*`
    );

    for (const chunk of chunks) {
      await sendMessage(message.from, chunk);
      await new Promise(r => setTimeout(r, 500)); // small delay between chunks
    }
  }

  log('command.export', { userId: user.id, noteCount: notes.length });
}
```

### Update router.js

```javascript
// Import
const { ..., handleExport } = require('./handlers/commands');

// In route() — before the switch
if (text.startsWith('/export')) {
  return handleExport(user, message);
}
```

### Files Changed
```
UPDATED: src/handlers/commands.js  ← handleExport() added
UPDATED: src/router.js             ← /export routing
```

---

## FEATURE 4 — Quick Capture Shortcut (Zero Code)

### The Link

Generate this link using your Orga phone number:

```
https://wa.me/<PHONE_NUMBER>?text=Hi%20Orga
```

Example (replace with your real number):
```
https://wa.me/911234567890?text=Hi%20Orga
```

### How to Add to Phone Homescreen

**Android (Chrome):**
1. Open Chrome → paste the wa.me link → open it
2. Three dots menu → Add to Home screen
3. Name it "Orga" → Add

**iPhone (Safari):**
1. Open Safari → paste the wa.me link
2. Share button → Add to Home Screen
3. Name it "Orga" → Add

### No code changes. Do this now.

---

## FEATURE 7 — /privacy Command

### Add to src/handlers/commands.js

```javascript
// ─── /privacy ──────────────────────────────────────────────────────────────
async function handlePrivacy(user, message) {
  const reply = [
    '*Your data with Orga*',
    '',
    'What is stored:',
    '1. Your WhatsApp phone number (your identity)',
    '2. Notes, tasks, and reminders you send',
    '3. Tags and client names extracted from your messages',
    '',
    'What is NOT stored:',
    '1. Your WhatsApp contacts or chat history',
    '2. Any messages from other chats',
    '3. Payment information',
    '',
    'Your data is stored securely in a private database.',
    'Only you can access your notes — no one else can see them.',
    '',
    'To delete all your data: reply DELETE MY DATA',
    '_We will permanently remove everything within 24 hours._',
  ].join('\n');

  await sendMessage(message.from, reply);
  log('command.privacy', { userId: user.id });
}
```

### Handle DELETE MY DATA

```javascript
// In router.js — add before the switch
if (text === 'delete my data') {
  // Soft flag for manual review — don't auto-delete in MVP
  warn('user.deletion_requested', { userId: user.id, phone: user.phone });
  await sendMessage(
    message.from,
    'Deletion request received.\n\nWe will permanently delete all your data within 24 hours and confirm via this chat.'
  );
  return;
}
```

### Update router.js

```javascript
const { ..., handlePrivacy } = require('./handlers/commands');

// In route() — before switch
if (text === '/privacy') {
  return handlePrivacy(user, message);
}
```

### Files Changed
```
UPDATED: src/handlers/commands.js  ← handlePrivacy() added
UPDATED: src/router.js             ← /privacy routing + delete my data
```

---

## FEATURE 8 — Formatting + Brand Voice

### Rules to Apply Everywhere

```
1. Always have a bold heading on every reply
2. Numbered lists not bullet points
3. Max 4 lines per section
4. No "I'm Orga" or "I" statements
5. Short, confident, human tone
6. No trailing tips unless error occurred
7. Minimal emoji — section headers only, never mid-sentence
```

### Key Reply Reformats

**Note saved:**
```
Before:  📝 #acme #design\n"Logo concepts"\nSaved · /search acme to find later
After:   *Note saved*\nLogo concepts · #acme #design
```

**Reminder set:**
```
Before:  🔔 Reminder set\n\n"Call Ravi"\ntomorrow 9:00 AM IST\n\nReply /schedule to see all
After:   *Reminder set*\nCall Ravi · tomorrow 9am
```

**Task created:**
```
Before:  ✅ Tasks saved (3)\n\n1. Send invoice\n2. Review brief\n3. Call Priya\n\nReply "done 1" to tick off item 1
After:   *Tasks (3)*\n1. Send invoice\n2. Review brief\n3. Call Priya\n_Reply "done 1" to tick off_
```

**/today:**
```
Before:  📋 Your day\n\n⚠️ Needs attention (1)\n• Follow up...
After:   *Today*\n\n_Overdue (1)_\n1. Follow up with Priya · missed yesterday\n\n_Tasks (2)_\n1. Send invoice\n2. Review brief\n\n_Reminders_\n3pm · Call with Meera
```

**Unknown/greeting:**
```
Before:  👋 Hey! I'm Orga.\n\nSend me anything:\n• A note to save\n• A task list\n• A reminder\n\nOr try:\n/today — your day\n/notes — recent notes
After:   *Hey!*\nSend me notes, tasks, or reminders — just type naturally.\n\n/help for the full command list
```

**Empty state:**
```
Before:  You haven't saved any notes yet.\n\nJust send me anything to save it as a note.
After:   No notes yet — send anything to save it.
```

### Files to Update

Go through each handler and apply the voice rules above:
```
UPDATED: src/handlers/note.js      ← note saved reply
UPDATED: src/handlers/task.js      ← task created + done reply
UPDATED: src/handlers/reminder.js  ← reminder set reply
UPDATED: src/handlers/commands.js  ← all command replies
UPDATED: src/webhook.js            ← welcome message + error message
```

---

## FEATURE 9 — Delete Feature

Full implementation is documented in `docs/CLAUDE_DELETE.md`.

### Summary of What It Adds

```
/notes  → numbered list → "delete N" → soft deletes note (recoverable)
/list   → numbered list → "delete N" → hard deletes task list
/schedule → numbered list → "cancel N" → hard deletes reminder
"undo"  → restores last soft-deleted note within 5 minutes
```

### New Files Required

```
NEW:     src/pending.js              ← already planned, extends existing
NEW:     src/handlers/delete.js      ← handleDelete, handleCancel, handleUndo
UPDATED: prisma/schema.prisma        ← PendingAction model
UPDATED: src/handlers/commands.js    ← numbered list format + savePendingList()
UPDATED: src/router.js               ← delete/cancel/undo intercepts
UPDATED: src/scheduler.js            ← cleanupExpired() in 3am cron
```

Run after schema change:
```bash
npx prisma db push
npx prisma generate
```

**Read docs/CLAUDE_DELETE.md for complete code.**

---

## DEPLOY 1 — Railway Deployment

### Why Now

ngrok URL changes every restart. Real users need a permanent URL.
Railway gives a fixed HTTPS URL, auto-deploys from GitHub, and includes Postgres.

### Steps

**1. Create Railway account**
Go to railway.app → Sign up with GitHub

**2. Create new project**
New Project → Deploy from GitHub repo → select orga-bot

**3. Add Postgres**
Add service → Database → PostgreSQL
Copy `DATABASE_URL` from Railway → Postgres → Connect tab

**4. Set all environment variables**
Railway → orga-api service → Variables tab
Add all 7 variables from your `.env` file:
```
WHATSAPP_TOKEN
PHONE_NUMBER_ID
APP_SECRET
WEBHOOK_VERIFY_TOKEN
DATABASE_URL        ← from Railway Postgres
GROQ_API_KEY        ← your Groq key
PORT=3000
NODE_ENV=production
```

**5. Run DB migration on Railway**
Railway → orga-api → Settings → Deploy command:
```
npx prisma db push && node src/index.js
```
Or add to package.json:
```json
"start": "npx prisma db push && node src/index.js"
```

**6. Deploy**
```bash
git add -A
git commit -m "feat: sprint complete — search, edit, export, delete, help, privacy"
git push
```
Railway auto-deploys on push to main.

**7. Update Meta webhook URL**
Meta Developer Portal → WhatsApp → Configuration → Edit Webhook
Set Callback URL to:
```
https://your-app.up.railway.app/webhook
```
Verify and Save.

**8. Smoke test**
Text "hello" from your phone to Orga → reply arrives ✓

### After Railway is Live

ngrok is no longer needed.
The bot works 24/7 without your laptop being open.
Reminders fire at the right time even when your computer is off.

---

## Sprint Exit Criteria

- [ ] "completed task 1" → item 1 marked done, not saved as note
- [ ] "finished 2" → item 2 marked done
- [ ] /help → full command menu displayed
- [ ] All handlers use log() not console.log()
- [ ] /search #note → notes only
- [ ] /search this week → items from last 7 days only
- [ ] /search rahul this week → combined filter works
- [ ] /notes → "edit 2" → send new text → note updated with re-classified tags
- [ ] /notes → "edit 2" → CANCEL → note unchanged
- [ ] /export → all notes returned as formatted text
- [ ] /export with 50+ notes → split across multiple messages
- [ ] wa.me link on homescreen → opens Orga chat in one tap
- [ ] /privacy → data explanation displayed
- [ ] "delete my data" → deletion request logged + confirmation sent
- [ ] All replies have bold heading
- [ ] Replies are numbered not bulleted
- [ ] Tone is short and human not robotic
- [ ] /notes → "delete 2" → note soft deleted
- [ ] /schedule → "cancel 1" → reminder removed
- [ ] "undo" within 5 min → note restored
- [ ] Railway deployed → bot works without ngrok
- [ ] Meta webhook updated to Railway URL

---

## Implementation Order for Claude Code

```
1. FIX 1 — router.js task completion patterns          (15 min)
2. FIX 3A — /help command in commands.js + router      (20 min)
3. FIX 3B — logger imports across all handlers         (20 min)
4. FEATURE 4 — wa.me link (do this yourself, 2 min)
5. FEATURE 7 — /privacy in commands.js + router        (20 min)
6. FEATURE 8 — reply formatting across all handlers    (45 min)
7. SEARCH — parseSearchFilters + handleSearch replace  (30 min)
8. FEATURE 9 — delete (follow CLAUDE_DELETE.md)        (60 min)
9. FEATURE 2 — /export in commands.js + router         (30 min)
10. FEATURE 1 — edit notes (pending.js + commands.js)  (45 min)
11. DEPLOY 1 — Railway setup + deploy                  (45 min)
```

---

*Sprint: Post Phase 4 · Fixes + Search + Features + Deployment*
*All items testable with curl + Prisma Studio*
*No WhatsApp needed except for Deploy smoke test*
