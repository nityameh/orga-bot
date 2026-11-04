# CLAUDE.md — Phase 2 Update
# Claude Intent Classifier (Weeks 3–4)

> Append this to your existing CLAUDE.md after Phase 1 section.
> Phase 1 must be fully complete before starting anything here.
> Exit criteria: echo bot working, User row created in DB on first message.

---

## CURRENT PHASE: 2 — Intent Classifier

**One goal this phase:**
Send any text string into `classifier.js` → get back a clean JSON
intent object within 2 seconds. No WhatsApp needed. No UI needed.
Pure logic, tested with a test script.

**What changes from Phase 1:**
Phase 1 left `processMessage()` echoing the raw text back.
Phase 2 replaces that echo with a real Claude API call that
understands what the user actually wants.

---

## Phase 2 — Files to Write

Three things to build. In this order.

```
1. src/classifier.js      ← Claude API call + JSON parser + fallback
2. src/router.js          ← routes intent to correct handler
3. test/classifier.test.js ← 20 test cases, run with node
```

---

## Phase 2 — Complete Code

### 1. src/classifier.js

```javascript
// src/classifier.js
// Takes raw message text → returns structured intent JSON.
// Uses Claude Haiku — NOT Sonnet. Never change this model.
// Falls back to keyword matching if Claude API is unavailable.

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// ─── System prompt ────────────────────────────────────────────────────────
function buildSystemPrompt(currentTimeIST) {
  return `
You classify WhatsApp messages for a productivity bot used by Indian freelancers.

Current time (IST): ${currentTimeIST}

Return ONLY valid JSON. No explanation. No markdown. No backticks. Just the JSON object.

{
  "type": "NOTE | TASK | REMINDER | SEARCH | TODAY | LIST | SCHEDULE | UNKNOWN",
  "title": "clean 1-line summary, max 60 chars",
  "body": "original message text, or null",
  "datetime": "ISO 8601 with +05:30 offset, or null",
  "tags": ["#tag1", "#tag2"],
  "client": "client name lowercase or null",
  "project": "project name lowercase or null",
  "priority": "high | normal | low"
}

TYPE RULES:
- NOTE     → any idea, observation, meeting notes, something to remember
- TASK     → contains a to-do list, or starts with "task"/"todo"/"tasks:"
- REMINDER → has a time reference: "tomorrow", "at 3pm", "in 2 hours", "next Friday", "tonight"
- SEARCH   → asking about saved content: "find", "what did I note", "search", "show me"
- TODAY    → /today, "what's today", "what do I have today", "my day"
- LIST     → /notes, /list, "show my notes", "show tasks", optionally filtered by tag/client
- SCHEDULE → /schedule, "what's coming up", "upcoming", "this week"
- UNKNOWN  → greetings, "help", anything that doesn't fit above

TAG RULES:
- Extract client/company names → "#clientname" (e.g. "acme corp" → "#acme")
- Extract person names mentioned → "#personname" (e.g. "call Ravi" → "#ravi")
- Topic tags: work-related → "#work", personal → "#personal", ideas → "#ideas", money → "#finance"
- Project names → "#projectname"
- Maximum 4 tags. Only include tags that are clearly present.

DATETIME RULES:
- "tomorrow 9am"   → next calendar day at 09:00:00+05:30
- "in 2 hours"     → current time + 2 hours
- "next Friday"    → nearest upcoming Friday at 09:00:00+05:30
- "tonight"        → today at 20:00:00+05:30
- "this evening"   → today at 18:00:00+05:30
- "morning"        → 09:00:00+05:30 (default if no time given with a day)
- Only set datetime for REMINDER and SCHEDULE types. null for everything else.

PRIORITY RULES:
- "urgent", "asap", "critical", "important" → high
- Everything else → normal
- "low priority", "whenever", "someday" → low

EXAMPLES:
Input:  "remind me tomorrow at 9am to call Ravi about the proposal"
Output: {"type":"REMINDER","title":"Call Ravi about the proposal","body":"remind me tomorrow at 9am to call Ravi about the proposal","datetime":"2026-03-22T09:00:00+05:30","tags":["#ravi"],"client":"ravi","project":null,"priority":"normal"}

Input:  "note: logo concepts for acme — minimal design, dark background, serif font"
Output: {"type":"NOTE","title":"Logo concepts for Acme","body":"note: logo concepts for acme — minimal design, dark background, serif font","datetime":null,"tags":["#acme","#design"],"client":"acme","project":null,"priority":"normal"}

Input:  "tasks: send invoice to rahul, review brand brief, follow up with priya"
Output: {"type":"TASK","title":"Task list","body":"tasks: send invoice to rahul, review brand brief, follow up with priya","datetime":null,"tags":["#rahul","#priya","#work"],"client":null,"project":null,"priority":"normal"}

Input:  "what did I save about the acme project?"
Output: {"type":"SEARCH","title":"Search: acme project","body":"what did I save about the acme project?","datetime":null,"tags":["#acme"],"client":"acme","project":"acme","priority":"normal"}

Input:  "/today"
Output: {"type":"TODAY","title":"Today overview","body":"/today","datetime":null,"tags":[],"client":null,"project":null,"priority":"normal"}
`.trim();
}

// ─── Main classify function ────────────────────────────────────────────────
async function classify(text) {
  // Get current IST time for relative datetime resolution
  const nowIST = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',  // ALWAYS Haiku. Never change.
      max_tokens: 300,                            // Intent JSON is never long
      system:     buildSystemPrompt(nowIST),
      messages: [
        { role: 'user', content: text }
      ],
    });

    const raw = response.content[0]?.text?.trim();
    if (!raw) throw new Error('Empty response from Claude');

    // Parse JSON — Claude should return clean JSON but be defensive
    const intent = JSON.parse(raw);

    // Validate required fields exist
    if (!intent.type) throw new Error('Missing type in intent');

    console.log(`Classified "${text.substring(0, 40)}..." → ${intent.type}`);
    return intent;

  } catch (err) {
    console.error('classify error:', err.message);
    console.log('Falling back to keyword classifier');
    return keywordFallback(text);
  }
}

// ─── Keyword fallback ──────────────────────────────────────────────────────
// Used when Claude API is unavailable or returns invalid JSON.
// Covers the most common cases. Always defaults to NOTE if unsure —
// better to save something than lose it.
function keywordFallback(text) {
  const t = text.toLowerCase().trim();

  const base = {
    body:     text,
    datetime: null,
    tags:     [],
    client:   null,
    project:  null,
    priority: 'normal',
  };

  if (t === '/today' || t.startsWith('what') && t.includes('today')) {
    return { ...base, type: 'TODAY', title: 'Today overview' };
  }

  if (t.startsWith('/notes') || t.startsWith('/list')) {
    return { ...base, type: 'LIST', title: 'List notes' };
  }

  if (t.startsWith('/schedule') || t.includes('coming up') || t.includes('upcoming')) {
    return { ...base, type: 'SCHEDULE', title: 'Upcoming schedule' };
  }

  if (t.startsWith('/search') || t.startsWith('find ') || t.includes('what did i')) {
    return { ...base, type: 'SEARCH', title: `Search: ${text.substring(0, 40)}` };
  }

  if (
    t.startsWith('/remind') ||
    t.includes('remind me') ||
    t.includes('tomorrow') ||
    t.includes('tonight') ||
    /\bat \d/.test(t) ||          // "at 3pm", "at 9am"
    /in \d+ (hour|min)/.test(t)   // "in 2 hours", "in 30 minutes"
  ) {
    return { ...base, type: 'REMINDER', title: text.substring(0, 60) };
  }

  if (
    t.startsWith('/task') ||
    t.startsWith('task:') ||
    t.startsWith('tasks:') ||
    t.startsWith('todo:') ||
    t.startsWith('to do:')
  ) {
    return { ...base, type: 'TASK', title: 'Task list' };
  }

  // Default → NOTE. Never return UNKNOWN from fallback.
  return { ...base, type: 'NOTE', title: text.substring(0, 60) };
}

module.exports = { classify };
```

---

### 2. src/router.js

```javascript
// src/router.js
// Routes a classified intent to the correct handler.
// Phase 2: stubs for all handlers — each replies with a placeholder.
// Phase 3 will replace each stub with real logic.

const { sendMessage } = require('./sender');

async function route(user, intent, message) {
  console.log(`Routing ${intent.type} for user ${user.phone}`);

  switch (intent.type) {
    case 'NOTE':
      return handleNote(user, intent, message);
    case 'TASK':
      return handleTask(user, intent, message);
    case 'REMINDER':
      return handleReminder(user, intent, message);
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

// ─── Stubs — Phase 2 ───────────────────────────────────────────────────────
// Each of these sends a placeholder reply confirming the intent was understood.
// Phase 3 replaces each one with real DB logic.

async function handleNote(user, intent, message) {
  await sendMessage(
    message.from,
    `📝 Got it — note received\n"${intent.title}"\n\n(Saving coming in next build)`
  );
}

async function handleTask(user, intent, message) {
  await sendMessage(
    message.from,
    `✅ Task list received\n"${intent.title}"\n\n(Task saving coming in next build)`
  );
}

async function handleReminder(user, intent, message) {
  const time = intent.datetime
    ? `\nScheduled: ${new Date(intent.datetime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
    : '';
  await sendMessage(
    message.from,
    `🔔 Reminder understood\n"${intent.title}"${time}\n\n(Reminder saving coming in next build)`
  );
}

async function handleSearch(user, intent, message) {
  await sendMessage(
    message.from,
    `🔍 Search received\n"${intent.title}"\n\n(Search coming in next build)`
  );
}

async function handleToday(user, intent, message) {
  await sendMessage(
    message.from,
    `📋 /today received\n\n(Your daily overview coming in next build)`
  );
}

async function handleList(user, intent, message) {
  await sendMessage(
    message.from,
    `📄 List request received\n\n(Note listing coming in next build)`
  );
}

async function handleSchedule(user, intent, message) {
  await sendMessage(
    message.from,
    `📅 Schedule request received\n\n(Schedule view coming in next build)`
  );
}

async function handleUnknown(user, intent, message) {
  await sendMessage(
    message.from,
    `👋 Hey! I'm Orga.\n\nSend me a note, task, or reminder.\nOr try /today to see your day.`
  );
}

module.exports = { route };
```

---

### 3. Update src/webhook.js — Replace Echo with Classifier

Find the `processMessage` function in `webhook.js` and replace it.
Everything else in webhook.js stays exactly the same.

```javascript
// src/webhook.js — updated processMessage() only
// Replace the existing processMessage function with this.
// Do not touch anything else in webhook.js.

const { classify } = require('./classifier');
const { route }    = require('./router');

async function processMessage(message) {
  console.log('Processing:', {
    from: message.from,
    text: message.text,
    id:   message.id,
  });

  // Step 1: Get or create user
  const user = await upsertUser(message.from, message.name);

  // Step 2: Classify intent with Claude
  const intent = await classify(message.text);

  // Step 3: Route to correct handler
  await route(user, intent, message);
}
```

---

### 4. test/classifier.test.js — Run Without WhatsApp

```javascript
// test/classifier.test.js
// Run with: node test/classifier.test.js
// No Jest, no Mocha — plain Node. No WhatsApp needed.
// Tests the classifier in isolation.

require('dotenv').config();
const { classify } = require('../src/classifier');

// ─── Test cases ────────────────────────────────────────────────────────────
const tests = [

  // REMINDER tests
  { input: 'remind me tomorrow at 9am to call Ravi',
    expect: { type: 'REMINDER', hasDatetime: true, client: 'ravi' } },

  { input: 'in 2 hours remind me to send the invoice',
    expect: { type: 'REMINDER', hasDatetime: true } },

  { input: 'tonight at 8pm follow up with priya',
    expect: { type: 'REMINDER', hasDatetime: true, client: 'priya' } },

  { input: 'next friday 3pm meeting with acme team',
    expect: { type: 'REMINDER', hasDatetime: true, client: 'acme' } },

  // NOTE tests
  { input: 'note: logo concepts for acme — minimal, serif, dark bg',
    expect: { type: 'NOTE', client: 'acme' } },

  { input: 'meeting with rahul was good, he wants proposal by friday',
    expect: { type: 'NOTE', client: 'rahul' } },

  { input: 'idea: add voice note support to the app',
    expect: { type: 'NOTE' } },

  { input: 'password for acme staging server is abc123',
    expect: { type: 'NOTE', client: 'acme' } },

  // TASK tests
  { input: 'tasks: send invoice, review brief, follow up priya',
    expect: { type: 'TASK' } },

  { input: 'todo: buy groceries, call bank, submit assignment',
    expect: { type: 'TASK' } },

  { input: 'task list for today: 1) finish design 2) send email 3) update sheet',
    expect: { type: 'TASK' } },

  // SEARCH tests
  { input: 'what did I save about the acme project?',
    expect: { type: 'SEARCH', client: 'acme' } },

  { input: 'find my notes on logo design',
    expect: { type: 'SEARCH' } },

  { input: '/search rahul',
    expect: { type: 'SEARCH' } },

  // COMMAND tests
  { input: '/today',
    expect: { type: 'TODAY' } },

  { input: 'what do I have today',
    expect: { type: 'TODAY' } },

  { input: '/notes',
    expect: { type: 'LIST' } },

  { input: '/notes #acme',
    expect: { type: 'LIST' } },

  { input: '/schedule',
    expect: { type: 'SCHEDULE' } },

  // HINGLISH / edge cases
  { input: 'kal subah 9 baje remind karna rahul ko call karne ke liye',
    expect: { type: 'REMINDER' } },   // Hindi — should still classify

  { input: 'hello',
    expect: { type: 'UNKNOWN' } },

];

// ─── Test runner ───────────────────────────────────────────────────────────
async function runTests() {
  console.log(`\nRunning ${tests.length} classifier tests...\n`);

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const test of tests) {
    try {
      const result = await classify(test.input);

      const errors = [];

      // Check type
      if (result.type !== test.expect.type) {
        errors.push(`type: expected "${test.expect.type}" got "${result.type}"`);
      }

      // Check datetime present if expected
      if (test.expect.hasDatetime && !result.datetime) {
        errors.push(`datetime: expected a datetime but got null`);
      }

      // Check client if expected
      if (test.expect.client && result.client !== test.expect.client) {
        errors.push(`client: expected "${test.expect.client}" got "${result.client}"`);
      }

      if (errors.length === 0) {
        console.log(`  ✅  "${test.input.substring(0, 50)}..."`);
        passed++;
      } else {
        console.log(`  ❌  "${test.input.substring(0, 50)}..."`);
        errors.forEach(e => console.log(`       → ${e}`));
        failed++;
        failures.push({ input: test.input, errors });
      }

      // Small delay to avoid Claude API rate limits
      await new Promise(r => setTimeout(r, 300));

    } catch (err) {
      console.log(`  💥  "${test.input.substring(0, 50)}" — ERROR: ${err.message}`);
      failed++;
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────');
  console.log(`Results: ${passed}/${tests.length} passed`);

  const pct = Math.round((passed / tests.length) * 100);
  console.log(`Accuracy: ${pct}%`);

  if (pct >= 90) {
    console.log('✅ PASS — classifier is ready for Phase 3');
  } else {
    console.log('❌ FAIL — tune the system prompt until accuracy >= 90%');
    console.log('\nFailing cases:');
    failures.forEach(f => {
      console.log(`  "${f.input}"`);
      f.errors.forEach(e => console.log(`    → ${e}`));
    });
  }

  console.log('─────────────────────────────────────\n');
}

runTests().catch(console.error);
```

---

## Phase 2 — Install New Dependency

```bash
npm install @anthropic-ai/sdk
```

Add `CLAUDE_API_KEY` to your `.env` if not already there:
```env
CLAUDE_API_KEY=sk-ant-xxxxxxxxxxxxx
```

Get the key from **console.anthropic.com → API Keys → Create key**.

---

## Phase 2 — How to Test (No WhatsApp Needed)

### Step 1: Run the test suite
```bash
node test/classifier.test.js
```

You should see 20 tests run. Target: **18/20 or better (90%+)**.

### Step 2: Test the full pipeline with curl
```bash
# Start your server
npm run dev

# Simulate an inbound message (no signature check in dev)
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "919876543210",
            "id": "test_002",
            "type": "text",
            "text": { "body": "remind me tomorrow 9am to call Ravi" },
            "timestamp": "1234567890"
          }],
          "contacts": [{ "profile": { "name": "Test" }, "wa_id": "919876543210" }]
        }
      }]
    }]
  }'
```

Check the logs — you should see:
```
Processing: { from: '919876543210', text: 'remind me tomorrow 9am...' }
Classified "remind me tomorrow 9am to call Ravi..." → REMINDER
Routing REMINDER for user 919876543210
```

### Step 3: Check accuracy on edge cases
Try these manually in the test script or curl:
```
"kal subah call karna hai"          → should be REMINDER
"aaj kya hai mera"                  → should be TODAY
"logo wala note dikhao"             → should be LIST or SEARCH
```

---

## Phase 2 — If Accuracy Is Below 90%

Tune the system prompt in `buildSystemPrompt()`. Most common issues:

| Problem | Fix |
|---|---|
| Hinglish not classified correctly | Add more Hindi examples to the prompt |
| Datetime not extracted | Add more datetime format examples |
| Client name not extracted | Add "extract all person and company names as tags" instruction |
| NOTE and REMINDER confused | Strengthen the rule: "REMINDER requires explicit time reference" |
| Everything coming back as NOTE | Check that CLAUDE_API_KEY is set correctly in .env |

---

## Phase 2 — Exit Criteria

Do not move to Phase 3 until ALL of these are true.

- [ ] `npm install @anthropic-ai/sdk` done
- [ ] `CLAUDE_API_KEY` set in `.env`
- [ ] `src/classifier.js` written
- [ ] `src/router.js` written with stubs for all 8 intent types
- [ ] `processMessage()` in `webhook.js` updated — echo removed, classify + route added
- [ ] Test suite runs: `node test/classifier.test.js`
- [ ] Accuracy **≥ 90%** (18/20 tests passing)
- [ ] curl test works — REMINDER intent classified and logged correctly
- [ ] Cost confirmed: check Anthropic console, each test run should cost < $0.01

---

## Phase 2 — What NOT to Build

- No DB writes yet — router stubs only send replies, nothing saved
- No note/task/reminder models used yet (Phase 3)
- No free tier limit checks (Phase 3)
- No interactive buttons (Phase 3)
- No voice note handling (Phase 3)
- No cron jobs (Phase 4)

---

## Files Changed This Phase

```
ADDED:    src/classifier.js       ← new — Claude API + fallback
ADDED:    src/router.js           ← new — intent router with stubs
ADDED:    test/classifier.test.js ← new — 20 test cases
UPDATED:  src/webhook.js          ← processMessage() only — echo replaced
UNCHANGED: src/index.js
UNCHANGED: src/db.js
UNCHANGED: src/sender.js
UNCHANGED: prisma/schema.prisma
```

---

## What Phase 3 Will Add (For Context Only)

Phase 3 replaces each stub in `router.js` with real DB logic:
- `handleNote()` → saves to Note table, replies with tag confirmation
- `handleTask()` → saves to Task table, replies with numbered list
- `handleReminder()` → saves to Reminder table, replies with time confirmation
- `handleSearch()` → queries Note + Task tables, replies with results
- `handleToday()` → queries all tables for today, replies with summary
- `handleList()` → queries notes with optional tag filter
- `handleSchedule()` → queries reminders for next 7 days

The classifier and router structure never change after Phase 2.
Only the internals of each handler function get filled in.

---

*Phase: 2 — Claude Intent Classifier*
*Previous: Phase 1 — Echo Bot + Webhook Handler*
*Next: Phase 3 — Notes + Tasks + Search + Commands*
