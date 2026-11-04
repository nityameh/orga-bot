# CLAUDE.md — Phase 4 Update
# Reminders + Weekly Digest (Week 7)

> Append this to your existing CLAUDE.md after Phase 3 section.
> Phase 3 must be fully complete before starting anything here.
> Exit criteria from Phase 3: notes save, tasks save, search works, /today works.

---

## CURRENT PHASE: 4 — Reminders + Weekly Digest

**Goal this phase:**
When a user says "remind me tomorrow 9am to call Ravi" —
a WhatsApp message fires on their phone at exactly 9am the next day.
That is the entire phase.

**What changes from Phase 3:**
Phase 3 left the REMINDER intent as a stub in `router.js` —
it saved nothing, just replied "coming in Phase 4".
Phase 4 replaces that stub with real saving + a cron engine
that fires reminders at the right time.

**Without WhatsApp:**
90% testable locally. Cron job runs, finds due reminders,
attempts to send — you verify in logs + Prisma Studio.
Actual phone delivery only works once WhatsApp is connected.

---

## Phase 4 — Files to Write or Update

```
ADDED:   src/scheduler.js           ← cron engine — polls + fires reminders
UPDATED: src/handlers/reminder.js   ← save reminder to DB + confirm reply
UPDATED: src/router.js              ← replace REMINDER stub with real handler
UPDATED: src/index.js               ← start scheduler on app boot
UNCHANGED: src/classifier.js
UNCHANGED: src/handlers/note.js
UNCHANGED: src/handlers/task.js
UNCHANGED: src/handlers/commands.js
UNCHANGED: src/sender.js
UNCHANGED: src/db.js
UNCHANGED: prisma/schema.prisma     ← Reminder model already exists
```

---

## Phase 4 — Complete Code

### 1. src/handlers/reminder.js

```javascript
// src/handlers/reminder.js
// Saves a reminder to Postgres and confirms to user.
// The actual firing happens in scheduler.js — not here.

const prisma = require('../db');
const { sendMessage } = require('../sender');

async function handleReminder(user, intent, message) {
  // Classifier must have extracted a datetime
  // If it didn't, ask the user to clarify
  if (!intent.datetime) {
    await sendMessage(
      message.from,
      `🔔 When should I remind you?\n\nTry: "remind me tomorrow 9am to ${intent.title}"\nOr: "remind me in 2 hours to ${intent.title}"`
    );
    return;
  }

  const fireAt = new Date(intent.datetime);

  // Sanity check — don't save reminders in the past
  if (fireAt <= new Date()) {
    await sendMessage(
      message.from,
      `⚠️ That time has already passed.\n\nTry a future time — e.g. "remind me tomorrow 9am to ${intent.title}"`
    );
    return;
  }

  // Save to DB
  const reminder = await prisma.reminder.create({
    data: {
      userId: user.id,
      title:  intent.title,
      fireAt,
      status: 'pending',
    },
  });

  // Format confirmation
  const fireAtIST = fireAt.toLocaleString('en-IN', {
    weekday: 'short',
    month:   'short',
    day:     'numeric',
    hour:    '2-digit',
    minute:  '2-digit',
    timeZone: 'Asia/Kolkata',
    hour12:  true,
  });

  const reply = [
    `🔔 Reminder set`,
    ``,
    `"${reminder.title}"`,
    `${fireAtIST}`,
    ``,
    `Reply /schedule to see all upcoming reminders`,
  ].join('\n');

  await sendMessage(message.from, reply);
}

// Handle snooze — called from scheduler when user replies SNOOZE
async function snoozeReminder(reminderId, minutes = 60) {
  const snoozeUntil = new Date(Date.now() + minutes * 60 * 1000);

  await prisma.reminder.update({
    where: { id: reminderId },
    data: {
      status:      'snoozed',
      snoozeUntil,
      // Reset to pending so cron picks it up again
      fireAt:      snoozeUntil,
    },
  });

  return snoozeUntil;
}

// Handle done — called from scheduler when user replies DONE
async function markReminderDone(reminderId) {
  await prisma.reminder.update({
    where: { id: reminderId },
    data:  { status: 'done' },
  });
}

module.exports = { handleReminder, snoozeReminder, markReminderDone };
```

---

### 2. src/scheduler.js

```javascript
// src/scheduler.js
// The cron engine. Runs two jobs:
//   1. Every 60s  — check for due reminders, fire them
//   2. Every Sun 6pm IST — send weekly digest to all active users
//
// Designed to be stateless — all state lives in Postgres.
// Safe to restart — will re-check DB on next tick.

const cron    = require('node-cron');
const prisma  = require('./db');
const { sendMessage } = require('./sender');

// ─── Job 1: Reminder poller ────────────────────────────────────────────────
// Runs every 60 seconds.
// Finds all reminders where fireAt <= now AND status = 'pending'
// Fires each one, marks as 'fired'.
// If send fails, retries up to 3 times with exponential backoff.

function startReminderPoller() {
  cron.schedule('* * * * *', async () => {
    try {
      const due = await prisma.reminder.findMany({
        where: {
          status: 'pending',
          fireAt: { lte: new Date() },
        },
        include: { user: true },
        take: 50, // safety cap — process max 50 per tick
      });

      if (due.length > 0) {
        console.log(`Reminder poller: ${due.length} due`);
      }

      for (const reminder of due) {
        await fireReminder(reminder);
      }

    } catch (err) {
      console.error('Reminder poller error:', err.message);
    }
  });

  console.log('Reminder poller started — checking every 60s');
}

// Fire a single reminder with retry logic
async function fireReminder(reminder, attempt = 1) {
  // Mark as fired immediately to prevent double-firing
  // (in case of concurrent cron ticks or server restart)
  await prisma.reminder.update({
    where: { id: reminder.id },
    data:  { status: 'fired' },
  });

  const message = buildReminderMessage(reminder.title);

  const sent = await sendMessage(reminder.user.phone, message);

  if (sent) {
    console.log(`Reminder fired: "${reminder.title}" → ${reminder.user.phone}`);
    return;
  }

  // Send failed — retry with backoff (max 3 attempts)
  if (attempt < 3) {
    const delayMs = attempt * 30 * 1000; // 30s, 60s
    console.warn(`Reminder send failed (attempt ${attempt}) — retrying in ${delayMs/1000}s`);

    setTimeout(async () => {
      // Reset to pending for retry
      await prisma.reminder.update({
        where: { id: reminder.id },
        data:  { status: 'pending', fireAt: new Date(Date.now() + 5000) },
      });
    }, delayMs);
  } else {
    console.error(`Reminder failed after 3 attempts: ${reminder.id}`);
    // Leave as 'fired' — don't retry indefinitely
  }
}

// Build the reminder message body
// NOTE: When WhatsApp is connected, this must use an approved template.
// For now (no WhatsApp), plain text is fine for testing.
function buildReminderMessage(title) {
  return [
    `🔔 Reminder`,
    ``,
    `${title}`,
    ``,
    `Reply DONE to clear · SNOOZE for 1 hour`,
  ].join('\n');
}

// ─── Job 2: Weekly digest ──────────────────────────────────────────────────
// Runs every Sunday at 6:00 PM IST.
// Cron timezone: Asia/Kolkata
// Sends a summary of the week to every user who was active this week.

function startWeeklyDigest() {
  // "0 18 * * 0" = every Sunday at 18:00
  cron.schedule('0 18 * * 0', async () => {
    console.log('Weekly digest job started');
    try {
      await sendWeeklyDigests();
    } catch (err) {
      console.error('Weekly digest error:', err.message);
    }
  }, {
    timezone: 'Asia/Kolkata',
  });

  console.log('Weekly digest scheduled — every Sunday 6:00 PM IST');
}

async function sendWeeklyDigests() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Find users who saved at least one note or task this week
  const activeUsers = await prisma.user.findMany({
    where: {
      OR: [
        { notes: { some: { createdAt: { gte: weekAgo }, deletedAt: null } } },
        { tasks: { some: { createdAt: { gte: weekAgo } } } },
      ],
    },
    include: {
      notes:     { where: { createdAt: { gte: weekAgo }, deletedAt: null } },
      tasks:     { where: { createdAt: { gte: weekAgo } } },
      reminders: {
        where: {
          status: 'pending',
          fireAt: { gte: new Date() },
        },
        take: 3,
        orderBy: { fireAt: 'asc' },
      },
    },
  });

  console.log(`Sending weekly digest to ${activeUsers.length} users`);

  for (const user of activeUsers) {
    await sendDigestToUser(user);
    // Small delay between sends to avoid Meta rate limits
    await new Promise(r => setTimeout(r, 500));
  }
}

async function sendDigestToUser(user) {
  const noteCount      = user.notes.length;
  const tasksDone      = user.tasks.flatMap(t => t.items).filter(i => i.done).length;
  const upcomingCount  = user.reminders.length;

  const upcomingLines = user.reminders.map(r => {
    const dt = new Date(r.fireAt).toLocaleString('en-IN', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Kolkata', hour12: true,
    });
    return `  🔔 ${dt} — ${r.title}`;
  });

  const message = [
    `📊 Your week with Orga`,
    ``,
    `📝 Notes saved: ${noteCount}`,
    `✅ Tasks completed: ${tasksDone}`,
    upcomingCount > 0 ? `\nComing up:` : null,
    ...upcomingLines,
    ``,
    `Keep going 💪`,
  ].filter(l => l !== null).join('\n');

  const sent = await sendMessage(user.phone, message);

  if (sent) {
    console.log(`Weekly digest sent to ${user.phone}`);
  } else {
    console.warn(`Weekly digest failed for ${user.phone}`);
  }
}

// ─── Handle SNOOZE / DONE text replies ────────────────────────────────────
// Called from webhook.js when user replies to a reminder message.
// Returns true if handled, false if not a reminder reply.

async function handleReminderReply(user, text) {
  const t = text.trim().toUpperCase();

  if (t === 'DONE') {
    // Mark the most recently fired reminder as done
    const reminder = await prisma.reminder.findFirst({
      where:   { userId: user.id, status: 'fired' },
      orderBy: { fireAt: 'desc' },
    });

    if (!reminder) return false;

    await prisma.reminder.update({
      where: { id: reminder.id },
      data:  { status: 'done' },
    });

    await sendMessage(user.phone, `✅ "${reminder.title}" marked done`);
    return true;
  }

  if (t === 'SNOOZE') {
    // Snooze the most recently fired reminder by 1 hour
    const reminder = await prisma.reminder.findFirst({
      where:   { userId: user.id, status: 'fired' },
      orderBy: { fireAt: 'desc' },
    });

    if (!reminder) return false;

    const snoozeUntil = new Date(Date.now() + 60 * 60 * 1000); // +1 hour

    await prisma.reminder.update({
      where: { id: reminder.id },
      data: {
        status:      'pending',
        fireAt:      snoozeUntil,
        snoozeUntil,
      },
    });

    const timeIST = snoozeUntil.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Kolkata', hour12: true,
    });

    await sendMessage(user.phone, `⏰ Snoozed — I'll remind you at ${timeIST}`);
    return true;
  }

  return false; // not a reminder reply
}

// ─── Start all jobs ────────────────────────────────────────────────────────
function startScheduler() {
  startReminderPoller();
  startWeeklyDigest();
  console.log('Scheduler running');
}

module.exports = { startScheduler, handleReminderReply };
```

---

### 3. src/index.js — Add Scheduler Start

Add two lines to the existing `index.js`.
Everything else stays exactly the same.

```javascript
// src/index.js — add these two lines after require statements

require('dotenv').config();
const express    = require('express');
const { handleWebhookVerify, handleWebhookMessage } = require('./webhook');
const { startScheduler } = require('./scheduler'); // ADD THIS LINE

const app = express();

app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

app.get('/webhook',  handleWebhookVerify);
app.post('/webhook', handleWebhookMessage);
app.get('/',         (req, res) => res.json({ status: 'ok', service: 'orga-bot' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Orga listening on port ${PORT}`);
  startScheduler(); // ADD THIS LINE — starts cron jobs after server is up
});
```

---

### 4. src/router.js — Replace REMINDER Stub

Find the REMINDER case in `router.js` and replace the stub.
Everything else in `router.js` stays exactly the same.

```javascript
// In src/router.js — add this import at the top
const { handleReminder }            = require('./handlers/reminder');
const { handleReminderReply }       = require('./scheduler');

// In the route() function — add SNOOZE/DONE check before the switch
// (add this block right after the "done N" task check)

  // Check for SNOOZE / DONE reminder replies
  if (text === 'done' || text === 'snooze') {
    const handled = await handleReminderReply(user, message.text);
    if (handled) return;
  }

// Replace the REMINDER case in the switch:
    case 'REMINDER':
      return handleReminder(user, intent, message);
```

---

## Phase 4 — How to Test Without WhatsApp

### Step 1: Verify scheduler starts
```bash
npm run dev
```
You should see in logs:
```
Orga listening on port 3000
Reminder poller started — checking every 60s
Weekly digest scheduled — every Sunday 6:00 PM IST
Scheduler running
```

### Step 2: Save a reminder via curl
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "messages": [{
        "from": "919876543210", "id": "r001", "type": "text",
        "text": { "body": "remind me in 2 minutes to test the scheduler" },
        "timestamp": "1234567890"
      }],
      "contacts": [{ "profile": { "name": "Test" }, "wa_id": "919876543210" }]
    }}]}]
  }'
```
**Check Prisma Studio:** Reminder table → row with `status: "pending"`, `fireAt` ~2 minutes from now.

### Step 3: Watch it fire
Wait 2 minutes. Watch the logs:
```
Reminder poller: 1 due
Reminder fired: "test the scheduler" → 919876543210
```
**Check Prisma Studio:** Same row now has `status: "fired"`.

The `sendMessage()` call will fail silently (no WhatsApp) — that is expected.
The important thing is the DB state changed from `pending` → `fired`.

### Step 4: Test snooze
```bash
# Simulate user replying SNOOZE
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "messages": [{
        "from": "919876543210", "id": "r002", "type": "text",
        "text": { "body": "SNOOZE" },
        "timestamp": "1234567890"
      }],
      "contacts": [{ "profile": { "name": "Test" }, "wa_id": "919876543210" }]
    }}]}]
  }'
```
**Check Prisma Studio:** Same reminder now has `status: "pending"`, `fireAt` = 1 hour from now.

### Step 5: Test DONE
```bash
# Simulate user replying DONE
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "messages": [{
        "from": "919876543210", "id": "r003", "type": "text",
        "text": { "body": "DONE" },
        "timestamp": "1234567890"
      }],
      "contacts": [{ "profile": { "name": "Test" }, "wa_id": "919876543210" }]
    }}]}]
  }'
```
**Check Prisma Studio:** Reminder `status: "done"`.

### Step 6: Test weekly digest manually
Add this temporary test route to `index.js` for local testing only.
Remove it before deploying.

```javascript
// TEMP — remove before deploy
app.get('/test-digest', async (req, res) => {
  const { sendWeeklyDigests } = require('./scheduler');
  await sendWeeklyDigests();
  res.json({ ok: true });
});
```

Then call it:
```bash
curl http://localhost:3000/test-digest
```
Check logs — you should see digest attempted for your test user.

---

## Phase 4 — Important Note on WhatsApp Templates

When WhatsApp IS connected, reminders that fire outside a 24hr
session window MUST use a pre-approved Meta template.

The 3 templates you submitted in Phase 0 cover this:

| Template | Used for |
|---|---|
| `reminder_fire` | When cron fires a due reminder |
| `daily_digest` | Morning task summary (optional, Phase 5) |
| `weekly_digest` | Sunday evening summary |

When WhatsApp connects, update `buildReminderMessage()` in `scheduler.js`
to use the template format instead of plain text:

```javascript
// When WhatsApp is connected — replace buildReminderMessage() with:
async function fireReminderWithTemplate(reminder) {
  await axios.post(META_API_URL, {
    messaging_product: 'whatsapp',
    to:   reminder.user.phone,
    type: 'template',
    template: {
      name:     'reminder_fire',
      language: { code: 'en' },
      components: [{
        type:       'body',
        parameters: [{ type: 'text', text: reminder.title }],
      }],
    },
  }, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }
  });
}
```

Do NOT implement this now. Only when WhatsApp is connected.

---

## Phase 4 — Exit Criteria

Do not move to Phase 5 until ALL of these are true.

- [ ] Server starts → logs show "Reminder poller started" and "Weekly digest scheduled"
- [ ] Send "remind me in 2 minutes to test" → Reminder row in DB with correct `fireAt`
- [ ] Wait 2 minutes → row changes from `status: "pending"` to `status: "fired"` in Prisma Studio
- [ ] Send "SNOOZE" → fired reminder resets to `status: "pending"`, `fireAt` = now + 1hr
- [ ] Send "DONE" → reminder updates to `status: "done"`
- [ ] `/test-digest` endpoint → logs show digest attempted for active users
- [ ] Server restart → cron jobs restart automatically (stateless — no missed reminders)
- [ ] No uncaught errors in logs across all tests

---

## Phase 4 — What NOT to Build

- No recurring reminders — post-MVP
- No location-based reminders — post-MVP
- No interactive WhatsApp buttons for snooze — needs WhatsApp connected
- No email fallback — not in scope
- No reminder editing — post-MVP
- No daily digest cron — optional, add after Phase 5 if users ask for it

---

## Files Changed This Phase

```
ADDED:   src/scheduler.js           ← cron engine + weekly digest
UPDATED: src/handlers/reminder.js   ← real DB save + datetime validation
UPDATED: src/router.js              ← REMINDER stub replaced + snooze/done routing
UPDATED: src/index.js               ← startScheduler() called on boot
UNCHANGED: src/classifier.js
UNCHANGED: src/handlers/note.js
UNCHANGED: src/handlers/task.js
UNCHANGED: src/handlers/commands.js
UNCHANGED: src/sender.js
UNCHANGED: src/db.js
UNCHANGED: prisma/schema.prisma
```

---

## What Phase 5 Means (For Context Only)

Phase 5 is not a coding phase. It is a users phase.

- You use Orga yourself for 1 full week
- 5 freelancer friends get access via a wa.me link
- You watch Railway logs in real time during their first sessions
- You call 2 of them after 3 days — what confused them, what they loved
- You fix the top 3 friction points
- You write a build-in-public LinkedIn post

The only metric that matters at the end of Phase 5:
Did 3 of 5 friends use it again without you prompting them?
If yes — product market fit signal. If no — the feedback calls tell you why.

---

*Phase: 4 — Reminders + Weekly Digest*
*Previous: Phase 3 — Notes + Tasks + Search + Commands*
*Next: Phase 5 — First Real Users + Feedback Loop*
