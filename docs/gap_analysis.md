# Pre-Phase 5 Gap Analysis
# What Can Be Built Before WhatsApp Connects

---

## What Is Built (Phases 1–4)

| Area | Built | Status |
|---|---|---|
| Webhook receiver + signature verify | ✅ | Done |
| User identity by phone number | ✅ | Done |
| Claude intent classifier (8 types) | ✅ | Done |
| Note save + tag extraction | ✅ | Done |
| Task list save + mark done | ✅ | Done |
| Reminder save + cron fire | ✅ | Done |
| Snooze / Done reply handling | ✅ | Done |
| /today /notes /list /schedule /search | ✅ | Done |
| Free tier 50-note limit | ✅ | Done |
| Weekly digest cron | ✅ | Done |
| Keyword fallback if Claude fails | ✅ | Done |
| Soft delete on notes | ✅ | Done |
| DB indexes on hot paths | ✅ | Done |

---

## Gaps Identified — Achievable Without WhatsApp

Organised by: Functional Requirements (FR) and Non-Functional Requirements (NFR).
Every item here is buildable, testable with curl + Prisma Studio, and
aligned with decisions made in the PRD and market research.

---

## GAP 1 — FR: /help Command

**What was agreed:** PRD FR — every error SHALL suggest a next action.
Market research — freelancers are non-technical, need guidance inside chat.

**What is missing:**
There is no /help command. A new user who doesn't know what to say
will hit the UNKNOWN handler which just says "send me anything."
That is not enough for a first-time freelancer user.

**What to build:**
```
/help → full command menu with examples
```

Reply format:
```
👋 I'm Orga — your WhatsApp assistant.

Here's what I can do:

📝 SAVE NOTES
Just type anything:
"Logo ideas for Acme — serif, dark bg"
"Met Rahul — he wants proposal by Friday"

✅ TASKS
"tasks: send invoice, review brief, call Priya"
Reply "done 1" to tick off

🔔 REMINDERS
"remind me tomorrow 9am to call Ravi"
"in 2 hours remind me to send invoice"

📋 COMMANDS
/today     — your day at a glance
/notes     — recent notes (/notes acme to filter)
/list      — your task lists
/schedule  — upcoming reminders
/search    — find anything (/search acme)
/help      — this menu
```

**Files to update:** `src/handlers/commands.js` — add `handleHelp()`
**Router update:** add `/help` detection before the switch in `router.js`
**Classifier update:** add `HELP` to the system prompt types

---

## GAP 2 — FR: Onboarding Flow (First Message)

**What was agreed:** PRD — system SHALL create user on first message.
Market research — freelancers need instant first win, habit formed in 60 seconds.
Customer journey doc — bot asks ONE question on first contact.

**What is missing:**
Right now, a brand new user gets the same response as an existing one.
There is no "welcome" experience. First message = cold start.

**What to build:**
Detect if user is new (just created in `upsertUser`) →
send a personalised welcome instead of classifying the message.

```javascript
// In processMessage() — after upsertUser()
if (isNewUser) {
  await sendMessage(from, WELCOME_MESSAGE);
  return; // don't classify their first message
}
```

Welcome message:
```
👋 Hey [name]! I'm Orga.

I keep your notes, tasks and reminders
organised — right here in WhatsApp.
No app needed.

Try me now — send anything:
• A note: "meeting with Rahul went well"
• A task: "tasks: send invoice, call bank"
• A reminder: "remind me at 6pm to follow up"

Or type /help to see everything I can do.
```

**Files to update:** `src/webhook.js` — `upsertUser()` returns `isNew` flag
**Files to update:** `src/handlers/commands.js` — add `WELCOME_MESSAGE` constant

---

## GAP 3 — FR: Note Deletion

**What was agreed:** PRD FR-022 — deleted items SHALL be soft-deleted
and recoverable for 30 days. Schema has `deletedAt` field already.

**What is missing:**
The `deletedAt` field exists in the schema but there is no way
for a user to actually delete a note. No command, no handler.

**What to build:**
```
/delete [keyword]  →  finds matching note → confirms deletion
```

Flow:
```
User:  /delete acme logo
Bot:   Found: "Logo concepts for Acme" (2 days ago)
       Reply YES to delete · NO to cancel

User:  YES
Bot:   🗑️ Note deleted · recoverable for 30 days
```

**Files to update:** `src/handlers/commands.js` — add `handleDelete()`
**Files to update:** `src/router.js` — add DELETE routing
**Schema:** No change needed — `deletedAt` already exists

---

## GAP 4 — FR: Note Count Reset (Monthly)

**What was agreed:** PRD FR-023 — 50 notes/month free tier.
The count check queries DB correctly, but `noteCount` on User model
is never reset monthly. It just grows forever.

**What is missing:**
The free tier check uses a DB query (correct approach) but the
`noteCount` field on User is unused and misleading. Either use it
properly with a monthly reset, or remove it from the schema.

**What to build — Option A (simpler, recommended):**
Remove `noteCount` from User model. The `note.js` handler already
queries `prisma.note.count({ where: { createdAt: { gte: thisMonth } } })`
which is correct and self-resetting. The field is redundant.

```bash
# In schema.prisma — remove noteCount field from User model
# Then: npx prisma db push
```

**Files to update:** `prisma/schema.prisma` — remove `noteCount Int`
**Files to update:** No code changes — the handler already works correctly

---

## GAP 5 — FR: /notes and /list Filter by Client

**What was agreed:** PRD + brainstorm — notes should be retrievable
by project or client. This was explicitly discussed as a core retrieval feature.

**What is partially missing:**
`/notes acme` filters by client/tag — this works.
But `/notes` with no argument returns last 10 notes with no context
about how many total notes exist. User has no idea of their history.

**What to build — enhance the /notes reply:**
```
📄 Your notes · 23 total

Recent:
• Logo concepts for Acme · #acme #design · 2h ago
• Met Rahul — proposal by Friday · #rahul #work · yesterday
• Grocery list · #personal · 2 days ago

Filter: /notes acme · /notes #design · /notes #work
Search: /search [keyword]
```

Also add `/notes this week` and `/notes today` time filters:
```javascript
// In handleList() — detect time filter
if (filterRaw === 'today') {
  where.createdAt = { gte: todayStart };
} else if (filterRaw === 'this week') {
  where.createdAt = { gte: weekStart };
}
```

**Files to update:** `src/handlers/commands.js` — enhance `handleList()`

---

## GAP 6 — FR: Recurring Reminders (Basic)

**What was agreed:** PRD F-016 — recurring reminders in v1.1.
But "every day at 9am" is something freelancers will ask for immediately.
A basic version is achievable now with minimal extra code.

**What is missing:**
No recurring support. Every reminder is one-shot.

**What to build — simple recurring:**
Detect patterns: "every day", "every Monday", "every weekday"
Add `recurring` and `recurPattern` fields to Reminder schema.
After firing, if `recurring = true`, create the next occurrence automatically.

```prisma
// Add to Reminder model in schema.prisma
recurring   Boolean   @default(false)
recurPattern String?  // "daily" | "weekly-mon" | "weekdays"
```

```javascript
// In scheduler.js — after firing a recurring reminder
if (reminder.recurring && reminder.recurPattern) {
  const nextFireAt = calculateNextOccurrence(reminder.recurPattern);
  await prisma.reminder.create({
    data: {
      userId:       reminder.userId,
      title:        reminder.title,
      fireAt:       nextFireAt,
      status:       'pending',
      recurring:    true,
      recurPattern: reminder.recurPattern,
    }
  });
}
```

**Classifier update:** Add recurring pattern detection to system prompt
**Files to update:** `prisma/schema.prisma`, `src/scheduler.js`, `src/classifier.js`

---

## GAP 7 — NFR: Structured Logging

**What was agreed:** PRD NFR-018 — system SHALL emit structured JSON logs
for every webhook event, classification result, and outbound message.

**What is missing:**
All logging is `console.log()` plain text. No structure, no searchability,
no way to debug issues in Railway logs at scale.

**What to build — simple structured logger:**
```javascript
// src/logger.js
function log(event, data = {}) {
  console.log(JSON.stringify({
    ts:    new Date().toISOString(),
    event,
    ...data,
  }));
}

module.exports = { log };
```

Usage across all files:
```javascript
log('message.received',  { from, type, id });
log('intent.classified', { type: intent.type, from, ms: elapsed });
log('note.saved',        { userId, noteId, tags });
log('reminder.fired',    { reminderId, userId });
log('send.failed',       { to, error: err.message });
```

**Files to update:** All handler files — replace `console.log` with `log()`
**New file:** `src/logger.js`

---

## GAP 8 — NFR: Error Handling + User-Facing Errors

**What was agreed:** PRD NFR-021 — error messages SHALL be human-readable
in plain language. Every error SHALL suggest a next action.

**What is missing:**
If `classifier.js` throws, `processMessage` throws, and the user
gets no reply at all. Silent failures. Bad experience.

**What to build:**
Wrap `processMessage` in a top-level try/catch.
On any unhandled error → send a friendly fallback message.

```javascript
// In src/webhook.js — update processMessage wrapper
processMessage(message).catch(async (err) => {
  console.error('processMessage fatal error:', err.message);
  // Always try to reply — even on errors
  try {
    await sendMessage(
      message.from,
      `Hmm, something went wrong on my end. Try again in a moment.\n\nIf it keeps happening, try /help`
    );
  } catch {
    // If even the error reply fails, just log it
  }
});
```

**Files to update:** `src/webhook.js`

---

## GAP 9 — NFR: Rate Limiting / Abuse Prevention

**What was agreed:** PRD NFR-008 — strict user data isolation.
Not discussed explicitly but implied — a single user should not be able
to flood the webhook and rack up Claude API costs.

**What is missing:**
No rate limiting. One user could send 1000 messages/minute,
triggering 1000 Claude API calls and crashing your billing.

**What to build — simple in-memory rate limiter:**
```javascript
// src/ratelimiter.js
const counts = new Map(); // phone → { count, resetAt }

function isRateLimited(phone) {
  const now    = Date.now();
  const window = 60 * 1000; // 1 minute window
  const limit  = 20;         // max 20 messages per minute per user

  const entry = counts.get(phone);

  if (!entry || now > entry.resetAt) {
    counts.set(phone, { count: 1, resetAt: now + window });
    return false;
  }

  if (entry.count >= limit) return true;

  entry.count++;
  return false;
}

module.exports = { isRateLimited };
```

```javascript
// In processMessage() — add after upsertUser()
if (isRateLimited(message.from)) {
  console.warn('Rate limited:', message.from);
  return; // silent drop — don't reply, don't classify
}
```

**New file:** `src/ratelimiter.js`
**Files to update:** `src/webhook.js`

---

## GAP 10 — NFR: Dedup Persistence Across Restarts

**What was agreed:** PRD FR-006 — system SHALL handle duplicate webhook
deliveries idempotently using Meta message ID deduplication.

**What is partially missing:**
Phase 1 built in-memory dedup (a Set of last 100 message IDs).
This resets on every Railway deploy or server restart.
During a deploy, Meta might retry a message and it gets processed twice.

**What to build:**
Add a `ProcessedMessage` model to Prisma schema.
Store message IDs in DB. TTL of 24hrs (Meta retries within minutes).

```prisma
// Add to schema.prisma
model ProcessedMessage {
  id        String   @id  // Meta message ID (wamid.xxx)
  createdAt DateTime @default(now())

  @@index([createdAt])  // for cleanup query
}
```

```javascript
// In webhook.js — replace in-memory Set with DB check
async function isDuplicate(messageId) {
  const existing = await prisma.processedMessage.findUnique({
    where: { id: messageId }
  });
  if (existing) return true;

  await prisma.processedMessage.create({ data: { id: messageId } });
  return false;
}
```

Add a daily cleanup cron in `scheduler.js`:
```javascript
// Clean up old message IDs — runs at 3am daily
cron.schedule('0 3 * * *', async () => {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prisma.processedMessage.deleteMany({
    where: { createdAt: { lt: dayAgo } }
  });
});
```

**New model:** `ProcessedMessage` in `schema.prisma`
**Files to update:** `src/webhook.js`, `src/scheduler.js`

---

## Summary — Priority Order

| Gap | Type | Effort | Impact | Do First? |
|---|---|---|---|---|
| GAP 8 — Error handling | NFR | 30 min | 🔴 High — silent failures right now | ✅ Yes |
| GAP 9 — Rate limiting | NFR | 45 min | 🔴 High — billing risk | ✅ Yes |
| GAP 2 — Onboarding flow | FR | 1 hr | 🔴 High — first impression | ✅ Yes |
| GAP 1 — /help command | FR | 1 hr | 🟡 Med — discoverability | ✅ Yes |
| GAP 7 — Structured logging | NFR | 1 hr | 🟡 Med — debuggability | ✅ Yes |
| GAP 4 — noteCount cleanup | FR | 20 min | 🟡 Med — schema correctness | ✅ Yes |
| GAP 5 — Enhanced /notes | FR | 1 hr | 🟡 Med — better UX | Do next |
| GAP 10 — Persistent dedup | NFR | 1.5 hr | 🟡 Med — correctness at scale | Do next |
| GAP 3 — Note deletion | FR | 1.5 hr | 🟢 Low — nice to have at MVP | After above |
| GAP 6 — Recurring reminders | FR | 2 hr | 🟢 Low — v1.1 scope really | After above |

---

## Files Affected Across All Gaps

```
NEW:     src/logger.js              ← Gap 7
NEW:     src/ratelimiter.js         ← Gap 9
UPDATED: src/webhook.js             ← Gap 2, 8, 9, 10
UPDATED: src/handlers/commands.js  ← Gap 1, 2, 3, 5
UPDATED: src/handlers/note.js      ← Gap 7
UPDATED: src/handlers/task.js      ← Gap 7
UPDATED: src/handlers/reminder.js  ← Gap 7
UPDATED: src/router.js             ← Gap 1, 3
UPDATED: src/scheduler.js          ← Gap 6, 7, 10
UPDATED: src/classifier.js         ← Gap 1, 6
UPDATED: prisma/schema.prisma      ← Gap 4, 6, 10
```

---

## What This Does NOT Include

These are intentionally excluded — not in MVP scope:

- Voice note transcription (post-MVP)
- Google Calendar sync (v1.1)
- Web dashboard (v1.1)
- Payments / upgrade flow (v1.1)
- Hindi language support (v1.2 — SME owners phase)
- Team / shared workspace (v2.0)
- Image OCR (post-MVP)

---

*Gap analysis against PRD v1.0 + market research decisions*
*All items testable with curl + Prisma Studio — no WhatsApp needed*
