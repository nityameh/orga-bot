# CLAUDE.md — Phase 1 Update
# Echo Bot + Webhook Handler (Week 2)

> Append this to your existing CLAUDE.md, or replace Section 10 onwards.
> Phase 0 must be fully complete before starting anything here.
> All 6 Phase 0 exit criteria must be checked off first.

---

## CURRENT PHASE: 1 — Echo Bot + Webhook Handler

**One goal this week:**
Text "hello" to the Orga number from your personal phone.
Get a reply back within 3 seconds.
That is the entire phase. Nothing more.

**What changes from Phase 0:**
Phase 0 left `handleWebhookMessage` as a stub — it verified the
signature, logged the message, and did nothing else.
Phase 1 replaces that stub with a real processing pipeline.

---

## Phase 1 — Files to Write

Four things to build. In this order. Do not jump ahead.

```
1. src/db.js          ← Prisma client singleton
2. src/sender.js      ← sendMessage() helper
3. src/webhook.js     ← update handleWebhookMessage (already exists)
4. smoke test         ← manual test from your phone
```

---

## Phase 1 — Complete Code

### 1. src/db.js — Prisma Client Singleton

```javascript
// src/db.js
// Single Prisma client instance shared across the app.
// Never instantiate PrismaClient anywhere else — import from here.

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'warn', 'error']
    : ['warn', 'error'],
});

module.exports = prisma;
```

**Why a singleton:** Prisma opens a connection pool. If you instantiate
`new PrismaClient()` in multiple files you exhaust DB connections fast.
One instance, imported everywhere.

---

### 2. src/sender.js — Send Message Helper

```javascript
// src/sender.js
// All outbound WhatsApp messages go through this file.
// Never call the Meta API directly from handlers — always use sendMessage().

const axios = require('axios');

const META_API_URL = `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`;

/**
 * Send a plain text message to a WhatsApp number.
 *
 * @param {string} to   - Recipient phone number e.g. "919876543210"
 * @param {string} text - Message body (max 4096 chars)
 * @returns {Promise<boolean>} true if sent, false if failed
 */
async function sendMessage(to, text) {
  try {
    await axios.post(
      META_API_URL,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`Sent to ${to}: "${text.substring(0, 60)}..."`);
    return true;

  } catch (err) {
    // Log the Meta error response if available
    const metaError = err.response?.data?.error;
    console.error('sendMessage failed:', metaError || err.message);
    return false;
  }
}

/**
 * Send interactive buttons message.
 * Used for reminder confirmations, task done buttons etc.
 * Phase 1: not used yet — here for reference in Phase 3+
 *
 * @param {string} to
 * @param {string} bodyText
 * @param {Array<{id: string, title: string}>} buttons - max 3
 */
async function sendButtons(to, bodyText, buttons) {
  try {
    await axios.post(
      META_API_URL,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: bodyText },
          action: {
            buttons: buttons.map(b => ({
              type: 'reply',
              reply: { id: b.id, title: b.title },
            })),
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return true;
  } catch (err) {
    console.error('sendButtons failed:', err.response?.data?.error || err.message);
    return false;
  }
}

module.exports = { sendMessage, sendButtons };
```

---

### 3. src/webhook.js — Full Replacement

Replace the entire existing `webhook.js` with this.
Everything from Phase 0 is preserved — only `handleWebhookMessage`
and the processing pipeline are new.

```javascript
// src/webhook.js
const crypto  = require('crypto');
const prisma  = require('./db');
const { sendMessage } = require('./sender');

// ─── In-memory dedup store ─────────────────────────────────────────────────
// Meta sometimes delivers the same webhook twice within seconds.
// We track the last 100 message IDs to prevent double-processing.
// This resets on server restart — good enough for MVP.
// Replace with Redis SET in production at scale.
const processedIds = new Set();
const MAX_IDS = 100;

function isDuplicate(messageId) {
  if (processedIds.has(messageId)) return true;
  processedIds.add(messageId);
  // Keep the set bounded — remove oldest when over limit
  if (processedIds.size > MAX_IDS) {
    const first = processedIds.values().next().value;
    processedIds.delete(first);
  }
  return false;
}

// ─── GET /webhook — Meta verification handshake ────────────────────────────
function handleWebhookVerify(req, res) {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook verified by Meta');
    return res.status(200).send(challenge);
  }

  console.warn('Webhook verification failed', { mode, token });
  res.sendStatus(403);
}

// ─── POST /webhook — inbound messages ─────────────────────────────────────
function handleWebhookMessage(req, res) {
  // Step 1: Verify Meta signature
  if (!verifySignature(req)) {
    console.warn('Invalid signature — rejected');
    return res.sendStatus(403);
  }

  // Step 2: Acknowledge Meta IMMEDIATELY
  // Must happen before any async work — Meta retries if no 200 within 3s
  res.sendStatus(200);

  // Step 3: Extract message from nested payload
  const message = extractMessage(req.body);
  if (!message) return; // status update or non-text event — ignore

  // Step 4: Dedup check
  if (isDuplicate(message.id)) {
    console.log(`Duplicate message ignored: ${message.id}`);
    return;
  }

  // Step 5: Process async — fire and forget from webhook handler
  processMessage(message).catch(err => {
    console.error('processMessage error:', err);
  });
}

// ─── processMessage — the async pipeline ──────────────────────────────────
async function processMessage(message) {
  console.log('Processing:', {
    from: message.from,
    text: message.text,
    id:   message.id,
  });

  // Step 1: Get or create user
  const user = await upsertUser(message.from, message.name);

  // Step 2: Echo reply (Phase 1 only)
  // This entire block gets replaced in Phase 2 with the classifier
  await sendMessage(
    message.from,
    `You said: "${message.text}"\n\n(Orga is warming up — full features coming soon 🚀)`
  );

  // Phase 2 will replace the echo with:
  // const intent = await classify(message.text);
  // await route(user, intent, message);
}

// ─── upsertUser ────────────────────────────────────────────────────────────
async function upsertUser(phone, name = '') {
  const user = await prisma.user.upsert({
    where:  { phone },
    update: { /* nothing to update on subsequent messages */ },
    create: {
      phone,
      tier: 'free',
      lang: 'en',
    },
  });

  if (!user.createdAt) {
    // Newly created
    console.log(`New user: ${phone} (${name})`);
  }

  return user;
}

// ─── verifySignature ───────────────────────────────────────────────────────
function verifySignature(req) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.APP_SECRET)
    .update(req.rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// ─── extractMessage ────────────────────────────────────────────────────────
function extractMessage(body) {
  try {
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const msg   = value?.messages?.[0];

    if (!msg) return null;

    // Phase 1: text messages only
    // Phase 3 will add: interactive (button replies), audio (voice notes)
    if (msg.type !== 'text') {
      console.log(`Ignored message type: ${msg.type}`);
      return null;
    }

    return {
      from:      msg.from,
      id:        msg.id,
      text:      msg.text?.body?.trim() || '',
      type:      msg.type,
      timestamp: msg.timestamp,
      name:      value?.contacts?.[0]?.profile?.name || '',
    };
  } catch (err) {
    console.error('extractMessage error:', err);
    return null;
  }
}

module.exports = { handleWebhookVerify, handleWebhookMessage };
```

---

### 4. src/index.js — No Changes Needed

The `index.js` from Phase 0 is already correct.
Do not modify it. It already has:
- Raw body capture for signature verification
- Routes for GET and POST /webhook
- Health check on GET /

---

## Phase 1 — What Each File Does (Summary)

```
src/db.js        Prisma client. Import this wherever you need DB access.
                 Never new PrismaClient() anywhere else.

src/sender.js    sendMessage(to, text) and sendButtons(to, text, buttons).
                 All outbound messages go through here. Never call Meta API directly.

src/webhook.js   Full webhook pipeline:
                   GET  → Meta verification handshake
                   POST → verify sig → ack 200 → dedup → upsertUser → echo reply

src/index.js     Unchanged from Phase 0.
```

---

## Phase 1 — Things That Must Not Change

These are architecture decisions. Do not modify them:

**1. res.sendStatus(200) before processMessage()**
If you await processMessage() before sending 200, and it takes > 3s,
Meta will retry the webhook. You will get duplicate messages.
The 200 must be sent immediately. Processing is always fire-and-forget.

**2. req.rawBody for signature verification**
`req.body` is parsed JSON — it won't produce the same HMAC as the raw bytes.
The `express.json({ verify: ... })` in index.js captures `req.rawBody`.
Never use `req.body` in `verifySignature()`.

**3. Phone number format**
Meta sends numbers without `+` prefix: `"919876543210"` not `"+919876543210"`.
Store and query them exactly as received. Never normalize or format.

**4. Prisma singleton from db.js**
Never do `new PrismaClient()` in any handler file.
Always `const prisma = require('./db')`.

---

## Phase 1 — How to Test

### Step 1: Local test with ngrok
```bash
# Terminal 1 — start local server
npm run dev

# Terminal 2 — expose to internet
ngrok http 3000
# Copy the https://xxxx.ngrok.io URL

# In Meta Developer Portal:
# WhatsApp → Configuration → Edit Webhook
# Set callback URL to: https://xxxx.ngrok.io/webhook
# Verify and save
```

### Step 2: Signature test (optional but good practice)
```bash
# Test that unsigned requests are rejected
curl -X POST https://your-railway-url.up.railway.app/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
# Should return: 403
```

### Step 3: Real message test
Send "hello" from your personal WhatsApp to the Orga number.
Within 3 seconds you should receive:
```
You said: "hello"

(Orga is warming up — full features coming soon 🚀)
```

### Step 4: Check Railway logs
In Railway → orga-api → Logs, you should see:
```
Processing: { from: '91XXXXXXXXXX', text: 'hello', id: 'wamid.xxx' }
Sent to 91XXXXXXXXXX: "You said: "hello"..."
```

### Step 5: Check DB
```bash
npx prisma studio
# Open localhost:5555
# Check User table — your phone number should appear as a row
```

---

## Phase 1 — Exit Criteria

Do not move to Phase 2 until ALL of these are true.

- [ ] Text "hello" to Orga → reply received within 3 seconds
- [ ] Text anything else → echo reply received correctly
- [ ] User row exists in Railway Postgres after first message
- [ ] Sending same message twice → only ONE reply received (dedup working)
- [ ] Unsigned POST to /webhook → returns 403
- [ ] Railway logs show clean structured output per message
- [ ] No uncaught promise rejections in logs

---

## Phase 1 — What NOT to Build

These will be tempting. Do not build them.

- No intent classification yet (Phase 2)
- No note/task/reminder saving (Phase 3)
- No /today or /notes commands (Phase 3)
- No free tier limits (Phase 3)
- No message templates / cron jobs (Phase 4)
- No voice note handling (Phase 3)
- No interactive button replies in echo (Phase 3)
- No error message to user if processing fails (Phase 2+)

If the echo reply works cleanly, Phase 1 is done.

---

## What Phase 2 Will Add (For Context Only)

When Phase 1 is complete, Phase 2 replaces the echo block
in `processMessage()` with the Claude classifier.

The echo block:
```javascript
// PHASE 1 — replace this entire block in Phase 2
await sendMessage(
  message.from,
  `You said: "${message.text}"...`
);
```

Gets replaced with:
```javascript
// PHASE 2
const intent = await classify(message.text);
await route(user, intent, message);
```

Everything else in webhook.js stays the same.
The pipeline (verify → ack → dedup → upsertUser → process) never changes.
Only what happens inside `processMessage()` evolves each phase.

---

## Quick Reference — Commands This Week

```bash
# Start dev server
npm run dev

# After any schema change
npx prisma db push && npx prisma generate

# Visual DB browser
npx prisma studio

# Deploy (push to GitHub → Railway auto-deploys)
git add -A && git commit -m "feat: phase 1 echo bot" && git push

# View live logs
# Railway dashboard → orga-api → Logs tab
```

---

## Files Changed This Phase

```
ADDED:   src/db.js          ← new
ADDED:   src/sender.js      ← new
UPDATED: src/webhook.js     ← handleWebhookMessage fully implemented
UNCHANGED: src/index.js
UNCHANGED: prisma/schema.prisma
UNCHANGED: .env
```

---

*Phase: 1 — Echo Bot + Webhook Handler*
*Previous: Phase 0 — Meta Setup + Dev Environment*
*Next: Phase 2 — Claude Intent Classifier*
