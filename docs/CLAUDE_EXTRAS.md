# CLAUDE.md — Extras
# Quick Win 3: /client Command + Quick Win 5: Smarter /today

> Append this to your existing CLAUDE.md.
> All phases 1–4 + gap analysis fixes must be complete before starting.
> Both features are testable with curl + Prisma Studio. No WhatsApp needed.

---

## CURRENT EXTRAS: Quick Wins 3 + 5

**Goal:**
Two targeted improvements that make Orga feel like it was built
specifically for freelancers — not a generic productivity tool.

**What changes:**
- `/client [name]` — new command, new function in commands.js
- `/today` — existing function enhanced with overdue section

**No new schema needed. No new dependencies. No new files.**
Both features are pure additions to `src/handlers/commands.js`
and one update to `src/router.js`.

---

## Quick Win 3 — /client Command

### What It Does

Aggregates everything Orga knows about one client into a single reply.
Notes, tasks, and reminders — all filtered by client name — in one message.

### Usage

```
/client rahul
/client acme
/client priya
```

### Expected Reply

```
👤 Rahul
───────────────────
📝 Notes (3)
• Met Rahul — wants proposal by Friday · 2d ago
• Logo feedback — liked option B · 5d ago
• Project budget ₹50K confirmed · 1w ago

✅ Tasks (1 pending)
• Send revised proposal

🔔 Reminders (1 upcoming)
• Follow up on proposal · tomorrow 9am

No results? Try: /client [first name only]
```

### Code — Add to src/handlers/commands.js

```javascript
// ─── /client ───────────────────────────────────────────────────────────────
// Usage: /client rahul  or  /client acme
// Aggregates all notes, tasks, reminders for a specific client.

async function handleClient(user, message) {
  // Extract client name from message
  // Supports: "/client rahul" or "/client Rahul" or "/client acme corp"
  const raw = message.text
    .replace(/^\/client\s*/i, '')
    .trim()
    .toLowerCase();

  if (!raw) {
    await sendMessage(
      message.from,
      `Who do you want to look up?\n\nTry: /client rahul\nOr: /client acme`
    );
    return;
  }

  // Run all three queries in parallel for speed
  const [notes, tasks, reminders] = await Promise.all([

    // Notes — match client field OR tags OR body
    prisma.note.findMany({
      where: {
        userId:    user.id,
        deletedAt: null,
        OR: [
          { client:  { contains: raw, mode: 'insensitive' } },
          { project: { contains: raw, mode: 'insensitive' } },
          { tags:    { has: `#${raw}` } },
          { body:    { contains: raw, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take:    5,
    }),

    // Tasks — match client field OR tags
    prisma.task.findMany({
      where: {
        userId: user.id,
        OR: [
          { client: { contains: raw, mode: 'insensitive' } },
          { tags:   { has: `#${raw}` } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take:    3,
    }),

    // Reminders — upcoming only, match client OR title
    prisma.reminder.findMany({
      where: {
        userId: user.id,
        status: 'pending',
        fireAt: { gte: new Date() },
        OR: [
          { title: { contains: raw, mode: 'insensitive' } },
        ],
      },
      orderBy: { fireAt: 'asc' },
      take:    3,
    }),

  ]);

  // Nothing found at all
  if (notes.length === 0 && tasks.length === 0 && reminders.length === 0) {
    await sendMessage(
      message.from,
      `No results for "${raw}"\n\nTry a first name or company name.\nOr save a note first: "meeting with ${raw} — ..."`
    );
    return;
  }

  // Build reply
  const lines = [
    `👤 ${capitalise(raw)}`,
    `───────────────────`,
  ];

  // Notes section
  if (notes.length > 0) {
    lines.push(`\n📝 Notes (${notes.length})`);
    notes.forEach(n => {
      const age = timeAgo(n.createdAt);
      lines.push(`• ${n.title} · ${age}`);
    });
  }

  // Tasks section — show pending items only
  const pendingTasks = tasks.flatMap(t =>
    t.items.filter(i => !i.done).map(i => i.text)
  );

  if (pendingTasks.length > 0) {
    lines.push(`\n✅ Tasks (${pendingTasks.length} pending)`);
    pendingTasks.slice(0, 3).forEach(t => lines.push(`• ${t}`));
  }

  // Reminders section
  if (reminders.length > 0) {
    lines.push(`\n🔔 Reminders (${reminders.length} upcoming)`);
    reminders.forEach(r => {
      const when = formatWhen(r.fireAt);
      lines.push(`• ${r.title} · ${when}`);
    });
  }

  await sendMessage(message.from, lines.join('\n'));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function capitalise(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
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
    day: 'numeric', month: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Kolkata', hour12: true,
  });
}
```

---

## Quick Win 5 — Smarter /today With Overdue Section

### What It Does

Adds an overdue section at the top of `/today` showing reminders that
fired in the past 24 hours and were never marked done or snoozed.

This means nothing falls through the cracks silently.
A missed follow-up from yesterday is the first thing the user sees
when they check in the morning.

### Expected Reply (with overdue items)

```
📋 Your day

⚠️ Needs attention (2)
• Follow up with Priya re: invoice · missed yesterday
• Send revised proposal to Acme · missed 2 days ago

Tasks: 3 pending
  • Finish Acme rough cut
  • Export final files
  • Update project tracker

Reminders today (2)
  🔔 3:00 PM — Client call with Acme
  🔔 6:00 PM — Send final cut to Rahul
```

### Expected Reply (clean day)

```
📋 Your day

Tasks: 2 pending
  • Review brand brief
  • Send invoice to Rahul

Reminders today (1)
  🔔 11:00 AM — Call with Meera

All caught up ✅
```

### Code — Replace handleToday() in src/handlers/commands.js

```javascript
// ─── /today — enhanced with overdue section ────────────────────────────────
// Replace the existing handleToday() function entirely.

async function handleToday(user, intent, message) {
  const now        = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const yesterday  = new Date(now - 24 * 60 * 60 * 1000);

  // Run all queries in parallel
  const [latestTask, todayReminders, overdueReminders] = await Promise.all([

    // Most recent task list
    prisma.task.findFirst({
      where:   { userId: user.id },
      orderBy: { createdAt: 'desc' },
    }),

    // Reminders scheduled for today
    prisma.reminder.findMany({
      where: {
        userId: user.id,
        status: 'pending',
        fireAt: { gte: todayStart, lte: todayEnd },
      },
      orderBy: { fireAt: 'asc' },
    }),

    // Overdue — fired in last 24hrs but never marked done
    // status = 'fired' means it was sent but user never replied DONE
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

  // Build reply — overdue first, always
  const lines = ['📋 Your day'];

  // ── Overdue section ──────────────────────────────────────────────────────
  if (overdueReminders.length > 0) {
    lines.push('');
    lines.push(`⚠️ Needs attention (${overdueReminders.length})`);
    overdueReminders.forEach(r => {
      const missedWhen = timeAgo(r.fireAt);
      lines.push(`• ${r.title} · missed ${missedWhen}`);
    });
  }

  // ── Tasks section ────────────────────────────────────────────────────────
  lines.push('');
  if (pendingTasks.length > 0) {
    lines.push(`Tasks: ${pendingTasks.length} pending`);
    pendingTasks.slice(0, 4).forEach(t => lines.push(`  • ${t.text}`));
    if (pendingTasks.length > 4) {
      lines.push(`  + ${pendingTasks.length - 4} more · /list to see all`);
    }
  } else {
    lines.push('Tasks: all clear ✅');
  }

  // ── Today's reminders section ────────────────────────────────────────────
  lines.push('');
  if (todayReminders.length > 0) {
    lines.push(`Reminders today (${todayReminders.length})`);
    todayReminders.forEach(r => {
      const time = formatTime(r.fireAt);
      lines.push(`  🔔 ${time} — ${r.title}`);
    });
  } else {
    lines.push('No reminders today');
  }

  // ── Clean day sign-off ───────────────────────────────────────────────────
  if (overdueReminders.length === 0 &&
      pendingTasks.length === 0 &&
      todayReminders.length === 0) {
    lines.push('');
    lines.push('All caught up ✅');
  }

  await sendMessage(message.from, lines.join('\n'));
}
```

---

## Router Update — Add /client Routing

Add these two things to `src/router.js`.

```javascript
// 1. Add import at the top of router.js
const { handleToday, handleList, handleListTasks,
        handleSchedule, handleSearch, handleUnknown,
        handleClient }   = require('./handlers/commands'); // ADD handleClient

// 2. In the route() function — add /client detection
// Add this block BEFORE the switch statement,
// alongside the existing /list and "done N" checks:

  // /client command — check before switch
  if (text.startsWith('/client')) {
    return handleClient(user, message);
  }
```

---

## Also Export handleClient from commands.js

At the bottom of `src/handlers/commands.js`, add `handleClient` to the exports:

```javascript
// Replace existing module.exports with:
module.exports = {
  handleToday,      // updated — now includes overdue section
  handleList,
  handleListTasks,
  handleSchedule,
  handleSearch,
  handleUnknown,
  handleClient,     // new
};
```

---

## How to Test — Both Features

### Test /client

```bash
# First save some notes about a client
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "messages": [{
        "from": "919876543210", "id": "c001", "type": "text",
        "text": { "body": "met rahul today — he wants the logo by friday, budget confirmed at 50k" },
        "timestamp": "1234567890"
      }],
      "contacts": [{ "profile": { "name": "Test" }, "wa_id": "919876543210" }]
    }}]}]
  }'

# Save a task for the same client
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "messages": [{
        "from": "919876543210", "id": "c002", "type": "text",
        "text": { "body": "tasks for rahul: send logo options, share invoice, update timeline" },
        "timestamp": "1234567890"
      }],
      "contacts": [{ "profile": { "name": "Test" }, "wa_id": "919876543210" }]
    }}]}]
  }'

# Now test /client
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "messages": [{
        "from": "919876543210", "id": "c003", "type": "text",
        "text": { "body": "/client rahul" },
        "timestamp": "1234567890"
      }],
      "contacts": [{ "profile": { "name": "Test" }, "wa_id": "919876543210" }]
    }}]}]
  }'
```

**Expected in logs:** notes + tasks aggregated for "rahul" client.

### Test /today overdue section

```bash
# Manually insert an overdue reminder in Prisma Studio:
# status = "fired"
# fireAt = yesterday's date
# userId = your test user's id
# title = "Follow up with Priya re: invoice"

# Then call /today
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "messages": [{
        "from": "919876543210", "id": "t001", "type": "text",
        "text": { "body": "/today" },
        "timestamp": "1234567890"
      }],
      "contacts": [{ "profile": { "name": "Test" }, "wa_id": "919876543210" }]
    }}]}]
  }'
```

**Expected in logs:** overdue section appears before tasks section.

---

## Exit Criteria

- [ ] `/client rahul` → shows notes, tasks, reminders for rahul in one reply
- [ ] `/client unknownperson` → "no results" message with helpful suggestion
- [ ] `/client` with no name → asks who to look up
- [ ] `/today` with no overdue → clean reply, "All caught up ✅" at end
- [ ] `/today` with overdue reminders → overdue section appears FIRST
- [ ] Overdue shows reminders with `status: "fired"` from past 24hrs only
- [ ] All queries run in parallel — not sequential awaits
- [ ] No changes to any other file outside commands.js and router.js

---

## Files Changed

```
UPDATED: src/handlers/commands.js  ← handleClient() added
                                      handleToday() replaced
UPDATED: src/router.js             ← /client routing added
                                      handleClient imported
UNCHANGED: everything else
```

---

*Extras: Quick Win 3 (/client) + Quick Win 5 (smarter /today)*
*Quick Win 1 (context-aware snooze) — separate MD when ready*
