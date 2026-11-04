# CLAUDE.md — Delete Feature
# Numbered List Delete + Undo (Notes, Tasks, Reminders)

> Append this to your existing CLAUDE.md.
> Quick Wins 3 + 5 (CLAUDE_EXTRAS.md) should be complete first.
> All features testable with curl + Prisma Studio. No WhatsApp needed.

---

## CURRENT FEATURE: Delete + Undo

**The Problem Being Solved:**
Users need to delete notes, cancel reminders, and remove tasks.
They cannot remember exact names. They should not have to.

**The Solution:**
Every list reply is numbered. User acts on a number.
The system holds the mapping for 10 minutes.

```
User:  /notes
Bot:   1. Logo concepts for Acme · 2h ago
       2. Grocery list · yesterday
       3. Met Rahul — proposal by Friday · 3d ago
       Reply "delete 2" to remove an item

User:  delete 2
Bot:   🗑️ Deleted: "Grocery list"
       Reply UNDO within 5 minutes to restore
```

**Three verbs. Consistent everywhere:**
- `delete N` — removes item N from last `/notes` or `/list` reply
- `cancel N` — cancels item N from last `/schedule` or `/today` reply
- `undo`     — restores last deleted note (soft delete only, 5 min window)

---

## Schema Changes

Two additions to `prisma/schema.prisma`.

### 1. PendingAction model — stores numbered list mappings

```prisma
// Add to prisma/schema.prisma

model PendingAction {
  id        String   @id @default(cuid())
  userId    String
  type      String   // "note_list" | "task_list" | "reminder_list"
  items     Json     // [{ pos: 1, id: "cuid", summary: "title" }, ...]
  expiresAt DateTime // now + 10 minutes
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])

  @@index([userId, expiresAt])
}
```

### 2. Add PendingAction relation to User model

```prisma
// In the existing User model — add one line:
model User {
  id             String          @id @default(cuid())
  phone          String          @unique
  tier           String          @default("free")
  lang           String          @default("en")
  createdAt      DateTime        @default(now())
  notes          Note[]
  tasks          Task[]
  reminders      Reminder[]
  pendingActions PendingAction[] // ADD THIS LINE
}
```

### Run after schema changes:
```bash
npx prisma db push
npx prisma generate
```

---

## New File: src/pending.js

```javascript
// src/pending.js
// Manages the PendingAction table.
// Stores numbered list mappings so "delete 3" knows what item 3 is.
// All entries expire after 10 minutes automatically.

const prisma = require('./db');

const TTL_MINUTES = 10;

/**
 * Save a numbered list mapping for a user.
 * Called after every /notes, /list, /schedule, /today reply.
 *
 * @param {string} userId
 * @param {string} type     - "note_list" | "task_list" | "reminder_list"
 * @param {Array}  items    - [{ pos, id, summary }]
 */
async function savePendingList(userId, type, items) {
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);

  // Upsert — one pending list per user per type at a time
  await prisma.pendingAction.deleteMany({
    where: { userId, type },
  });

  await prisma.pendingAction.create({
    data: { userId, type, items, expiresAt },
  });
}

/**
 * Retrieve a specific item by position from the user's last list.
 * Returns null if expired or position not found.
 *
 * @param {string} userId
 * @param {string} type   - "note_list" | "task_list" | "reminder_list"
 * @param {number} pos    - 1-based position number
 * @returns {{ id: string, summary: string } | null}
 */
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

  const items = pending.items;
  const item  = items.find(i => i.pos === pos);

  return item || null;
}

/**
 * Clear all pending actions for a user.
 * Called after a delete/cancel is executed.
 */
async function clearPending(userId) {
  await prisma.pendingAction.deleteMany({ where: { userId } });
}

/**
 * Clean up expired pending actions.
 * Called by daily cleanup cron in scheduler.js.
 */
async function cleanupExpired() {
  const deleted = await prisma.pendingAction.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  if (deleted.count > 0) {
    console.log(`Cleaned up ${deleted.count} expired pending actions`);
  }
}

module.exports = { savePendingList, getPendingItem, clearPending, cleanupExpired };
```

---

## New File: src/handlers/delete.js

```javascript
// src/handlers/delete.js
// Handles delete N, cancel N, and undo commands.

const prisma  = require('../db');
const { sendMessage }  = require('../sender');
const { getPendingItem, clearPending } = require('../pending');

// ─── handleDelete ──────────────────────────────────────────────────────────
// Called when user sends "delete N" — works on notes and task lists.

async function handleDelete(user, message) {
  const match = message.text.match(/^delete\s+(\d+)/i);
  if (!match) return false;

  const pos = parseInt(match[1]);

  // Try note_list first, then task_list
  let item = await getPendingItem(user.id, 'note_list', pos);
  let type = 'note';

  if (!item) {
    item = await getPendingItem(user.id, 'task_list', pos);
    type = 'task';
  }

  // Nothing found — list expired or wrong number
  if (!item) {
    await sendMessage(
      message.from,
      `Couldn't find item ${pos}.\n\nThe list expires after 10 minutes.\nTry /notes or /list again to get a fresh list.`
    );
    return true;
  }

  if (type === 'note') {
    // Soft delete — sets deletedAt, recoverable with /undo
    await prisma.note.update({
      where: { id: item.id },
      data:  { deletedAt: new Date() },
    });

    await sendMessage(
      message.from,
      `🗑️ Deleted: "${item.summary}"\n\nReply UNDO within 5 minutes to restore it.`
    );
  }

  if (type === 'task') {
    // Hard delete — tasks have no soft delete
    await prisma.task.delete({
      where: { id: item.id },
    });

    await sendMessage(
      message.from,
      `🗑️ Removed: "${item.summary}"`
    );
  }

  await clearPending(user.id);
  return true;
}

// ─── handleCancel ──────────────────────────────────────────────────────────
// Called when user sends "cancel N" — works on reminders.

async function handleCancel(user, message) {
  const match = message.text.match(/^cancel\s+(\d+)/i);
  if (!match) return false;

  const pos  = parseInt(match[1]);
  const item = await getPendingItem(user.id, 'reminder_list', pos);

  if (!item) {
    await sendMessage(
      message.from,
      `Couldn't find reminder ${pos}.\n\nThe list expires after 10 minutes.\nTry /schedule again to get a fresh list.`
    );
    return true;
  }

  // Hard delete reminders — they are time-based, no undo needed
  await prisma.reminder.delete({
    where: { id: item.id },
  });

  await sendMessage(
    message.from,
    `🗑️ Cancelled: "${item.summary}"`
  );

  await clearPending(user.id);
  return true;
}

// ─── handleUndo ────────────────────────────────────────────────────────────
// Called when user sends "undo" — restores the last soft-deleted note.
// Only works within 5 minutes of deletion.

async function handleUndo(user, message) {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  // Find most recently deleted note within the undo window
  const note = await prisma.note.findFirst({
    where: {
      userId:    user.id,
      deletedAt: { gte: fiveMinutesAgo },
    },
    orderBy: { deletedAt: 'desc' },
  });

  if (!note) {
    await sendMessage(
      message.from,
      `Nothing to undo.\n\nUndo only works within 5 minutes of deleting a note.`
    );
    return true;
  }

  // Restore by clearing deletedAt
  await prisma.note.update({
    where: { id: note.id },
    data:  { deletedAt: null },
  });

  await sendMessage(
    message.from,
    `↩️ Restored: "${note.title}"`
  );

  return true;
}

module.exports = { handleDelete, handleCancel, handleUndo };
```

---

## Update: src/handlers/commands.js

### Update handleList() — save numbered mapping after reply

```javascript
// In handleList() — after building the reply, save the list mapping
// Add these lines BEFORE the final sendMessage() call

// Build numbered items for delete mapping
const numberedItems = notes.map((n, i) => ({
  pos:     i + 1,
  id:      n.id,
  summary: n.title,
}));

// Save mapping so "delete N" knows what to delete
await savePendingList(user.id, 'note_list', numberedItems);

// Update the reply to include numbered format + delete hint
const lines = [header];
notes.forEach((n, i) => {
  const age  = timeAgo(n.createdAt);
  const tags = n.tags.length ? ` · ${n.tags.join(' ')}` : '';
  lines.push(`${i + 1}. ${n.title}${tags} · ${age}`); // numbered
});
lines.push(`\nReply "delete N" to remove an item`);    // hint
lines.push(`Search: /search [keyword]`);

await sendMessage(message.from, lines.join('\n'));

// Remove the old sendMessage at the end — it is replaced by this one
```

### Update handleSchedule() — save numbered mapping after reply

```javascript
// In handleSchedule() — after building the reply, save the list mapping
// Add these lines BEFORE the final sendMessage() call

const numberedItems = reminders.map((r, i) => ({
  pos:     i + 1,
  id:      r.id,
  summary: r.title,
}));

await savePendingList(user.id, 'reminder_list', numberedItems);

// Update reply to numbered format + cancel hint
const lines = [`📅 Next 7 days (${reminders.length})\n`];
reminders.forEach((r, i) => {
  const dt = new Date(r.fireAt).toLocaleString('en-IN', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Kolkata', hour12: true,
  });
  lines.push(`${i + 1}. ${r.title} · ${dt}`); // numbered
});
lines.push(`\nReply "cancel N" to remove a reminder`); // hint

await sendMessage(message.from, lines.join('\n'));
```

### Update handleListTasks() — save numbered mapping after reply

```javascript
// In handleListTasks() — after building the reply, save the list mapping

const numberedItems = tasks.map((t, i) => ({
  pos:     i + 1,
  id:      t.id,
  summary: t.title,
}));

await savePendingList(user.id, 'task_list', numberedItems);

// Update reply to numbered format + delete hint
const lines = [`✅ Your task lists\n`];
tasks.forEach((t, i) => {
  const pending   = t.items.filter(i => !i.done).length;
  const completed = t.items.filter(i => i.done).length;
  const age       = timeAgo(t.createdAt);
  lines.push(`${i + 1}. ${t.title} · ${pending} pending, ${completed} done · ${age}`);
});
lines.push(`\nReply "delete N" to remove a task list`);

await sendMessage(message.from, lines.join('\n'));
```

### Add import at top of commands.js

```javascript
// Add at the top of src/handlers/commands.js
const { savePendingList } = require('../pending');
```

### Add handleUndo to exports

```javascript
// Update module.exports at bottom of commands.js
// handleUndo is in delete.js but routed through commands context
// Just make sure it is exported from delete.js — router imports it from there
```

---

## Update: src/router.js

```javascript
// Add imports at the top of router.js
const { handleDelete, handleCancel, handleUndo } = require('./handlers/delete');

// In the route() function — add these checks BEFORE the switch statement
// Order matters — check these before classifying with Claude

  // "delete N" — remove note or task by position
  if (/^delete\s+\d+/i.test(text)) {
    const handled = await handleDelete(user, message);
    if (handled) return;
  }

  // "cancel N" — cancel reminder by position
  if (/^cancel\s+\d+/i.test(text)) {
    const handled = await handleCancel(user, message);
    if (handled) return;
  }

  // "undo" — restore last deleted note
  if (text === 'undo') {
    await handleUndo(user, message);
    return;
  }
```

---

## Update: src/scheduler.js

Add cleanup of expired pending actions to the daily cron.

```javascript
// Add import at top of scheduler.js
const { cleanupExpired } = require('./pending');

// Add to the existing daily cleanup cron (3am job):
cron.schedule('0 3 * * *', async () => {
  // Existing: clean up processed messages
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prisma.processedMessage.deleteMany({
    where: { createdAt: { lt: dayAgo } }
  });

  // NEW: clean up expired pending actions
  await cleanupExpired();
});
```

---

## How to Test

### Test delete a note

```bash
# Step 1: Save two notes
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "messages": [{ "from": "919876543210", "id": "d001",
        "type": "text", "text": { "body": "note: logo ideas for acme — serif, dark bg" },
        "timestamp": "1234567890" }],
      "contacts": [{ "profile": { "name": "Test" }, "wa_id": "919876543210" }]
    }}]}]
  }'

curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "messages": [{ "from": "919876543210", "id": "d002",
        "type": "text", "text": { "body": "note: grocery list — milk eggs bread" },
        "timestamp": "1234567890" }],
      "contacts": [{ "profile": { "name": "Test" }, "wa_id": "919876543210" }]
    }}]}]
  }'

# Step 2: List notes — this saves the numbered mapping
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "messages": [{ "from": "919876543210", "id": "d003",
        "type": "text", "text": { "body": "/notes" },
        "timestamp": "1234567890" }],
      "contacts": [{ "profile": { "name": "Test" }, "wa_id": "919876543210" }]
    }}]}]
  }'

# Step 3: Delete item 2 (grocery list)
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "messages": [{ "from": "919876543210", "id": "d004",
        "type": "text", "text": { "body": "delete 2" },
        "timestamp": "1234567890" }],
      "contacts": [{ "profile": { "name": "Test" }, "wa_id": "919876543210" }]
    }}]}]
  }'
```

**Check Prisma Studio:** Note "grocery list" now has `deletedAt` set. Not hard deleted.

### Test undo

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "messages": [{ "from": "919876543210", "id": "d005",
        "type": "text", "text": { "body": "undo" },
        "timestamp": "1234567890" }],
      "contacts": [{ "profile": { "name": "Test" }, "wa_id": "919876543210" }]
    }}]}]
  }'
```

**Check Prisma Studio:** `deletedAt` is now null again. Note restored.

### Test cancel a reminder

```bash
# Step 1: View schedule — saves reminder list mapping
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "messages": [{ "from": "919876543210", "id": "d006",
        "type": "text", "text": { "body": "/schedule" },
        "timestamp": "1234567890" }],
      "contacts": [{ "profile": { "name": "Test" }, "wa_id": "919876543210" }]
    }}]}]
  }'

# Step 2: Cancel item 1
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "messages": [{ "from": "919876543210", "id": "d007",
        "type": "text", "text": { "body": "cancel 1" },
        "timestamp": "1234567890" }],
      "contacts": [{ "profile": { "name": "Test" }, "wa_id": "919876543210" }]
    }}]}]
  }'
```

**Check Prisma Studio:** Reminder row deleted.

### Test expired list

```bash
# Wait 11 minutes after /notes, then try delete 1
# Expected: "Couldn't find item 1 — list has expired, try /notes again"
```

---

## Exit Criteria

- [ ] `/notes` → numbered list → "delete 2" → note 2 has `deletedAt` set in DB
- [ ] "undo" within 5 min → `deletedAt` cleared → note restored
- [ ] "undo" after 5 min → "nothing to undo" message
- [ ] `/list` → numbered list → "delete 1" → task row deleted from DB
- [ ] `/schedule` → numbered list → "cancel 2" → reminder row deleted
- [ ] "delete 5" when list only has 3 items → helpful error message
- [ ] "delete 1" after 10 minutes → list expired message
- [ ] PendingAction rows cleaned up by 3am cron
- [ ] `/notes` after delete → deleted note no longer appears (deletedAt filter)
- [ ] No changes to classifier.js — delete/cancel/undo never go through Claude

---

## Files Changed

```
NEW:     src/pending.js              ← list mapping store
NEW:     src/handlers/delete.js      ← delete, cancel, undo handlers
UPDATED: src/handlers/commands.js   ← handleList, handleSchedule,
                                       handleListTasks all save numbered maps
UPDATED: src/router.js              ← delete/cancel/undo routing added
UPDATED: src/scheduler.js          ← cleanupExpired() added to 3am cron
UPDATED: prisma/schema.prisma      ← PendingAction model + User relation
UNCHANGED: src/classifier.js
UNCHANGED: src/handlers/note.js
UNCHANGED: src/handlers/task.js
UNCHANGED: src/handlers/reminder.js
UNCHANGED: src/sender.js
UNCHANGED: src/db.js
UNCHANGED: src/webhook.js
```

---

## Design Decisions — Do Not Revisit

| Decision | Reason |
|---|---|
| Numbered list not named delete | User cannot remember exact names |
| 10 minute TTL on list mapping | Long enough to use, short enough to stay clean |
| Soft delete notes only | Notes have value — always recoverable. Tasks and reminders are transient. |
| 5 minute undo window | Enough time to realise a mistake. Longer creates confusion about what "undo" means. |
| No confirmation step | User chose the number — that is the confirmation |
| Hard delete reminders + tasks | Time-based items and action lists don't need recovery |
| delete vs cancel vocabulary | "cancel" feels right for future-scheduled things. "delete" for saved content. |

---

*Delete Feature: numbered list delete + undo*
*Touches: schema, pending.js, delete.js, commands.js, router.js, scheduler.js*
