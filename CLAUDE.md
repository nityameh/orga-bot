# CLAUDE.md — Orga Bot

> This file is the single source of truth for this project.
> Read it completely before doing anything. Every decision made
> in this project is documented here. When in doubt, refer back.

---

## 1. What Is This Project

**Orga** is a WhatsApp-native productivity bot for Indian freelancers.

Instead of installing yet another app, a freelancer texts Orga on WhatsApp in plain language — just like texting a friend. Orga saves their notes, creates task lists, fires reminders at the right time, and answers "what do I have today?" — all inside one WhatsApp chat.

**The single problem it solves:**
> A freelancer managing 3–8 clients over WhatsApp loses track of what they promised, when, and to whom. Orga remembers it for them.

**What it is NOT:**
- Not a dashboard-first product (WhatsApp is the primary interface)
- Not a team tool yet (single-user MVP)
- Not a marketing bot (only responds, never cold-messages)
- Not an app (zero install required by the end user)

---

## 2. How It Works — The Technical Flow

```
User's WhatsApp
      │
      │  texts naturally: "remind me tomorrow 9am to call Ravi"
      ▼
Meta Cloud API (WhatsApp Business Platform)
      │
      │  POST /webhook  (HTTPS, signed with APP_SECRET)
      ▼
Our Node.js / Express Backend  (hosted on Railway)
      │
      ├─► Verify Meta signature  →  reject if invalid (403)
      ├─► Acknowledge Meta immediately  →  res.sendStatus(200)
      ├─► Upsert User record by phone number
      │
      │  (async, after 200 sent)
      ▼
Claude API  (claude-haiku-4-5-20251001)
      │
      │  classifies intent → returns JSON:
      │  { type: "REMINDER", title: "Call Ravi",
      │    datetime: "2026-03-21T09:00:00+05:30",
      │    tags: ["#ravi"], client: "ravi" }
      ▼
Handler  (reminder.js / note.js / task.js / commands.js)
      │
      ├─► Write to PostgreSQL (via Prisma ORM)
      ▼
Meta Cloud API  →  sends WhatsApp reply back to user
      │
      │  "🔔 Reminder set — tomorrow 9:00 AM · Call Ravi"
      │  [Snooze 1hr]  [Done]
      ▼
User's WhatsApp receives the reply
```

**Key rule:** Always `res.sendStatus(200)` to Meta BEFORE processing. Meta retries if it doesn't get 200 within 3 seconds. Processing is always async.

---

## 3. Tech Stack — And Why Each Choice Was Made

| Layer | Technology | Why |
|---|---|---|
| Runtime | Node.js 20 + Express | Fast to build, stateless, scales horizontally |
| Database | PostgreSQL (hosted on Railway) | Relational, reliable, Prisma ORM for safety |
| ORM | Prisma | Type-safe queries, migrations, familiar from AITF project |
| AI / NLP | Claude API — `claude-haiku-4-5-20251001` | Cheapest + fastest Claude model. ~₹0.08/1K messages. Use Haiku, NOT Sonnet. |
| Hosting | Railway.app | Auto-deploy from GitHub, includes free Postgres, HTTPS out of box |
| WhatsApp | Meta Cloud API (official) | Only legal way to build on WhatsApp at scale |
| Job Queue (Phase 4) | node-cron + DB polling | No Redis needed at MVP. Cron polls reminders table every 60s. |
| Payments (Phase 5+) | Razorpay | UPI-first, Indian company, easy WA payment link generation |

**Do not introduce new dependencies without a clear reason.** This stack is chosen for simplicity and your Node.js familiarity.

---

## 4. Project Structure

```
orga-bot/
├── src/
│   ├── index.js            # Express app entry. Sets up routes, starts server.
│   ├── webhook.js          # Meta webhook handler. GET = verify. POST = receive messages.
│   ├── sender.js           # sendMessage(to, text, buttons?) — wraps Meta send API
│   ├── classifier.js       # Claude intent classifier. Takes text, returns JSON intent.
│   ├── scheduler.js        # node-cron jobs. Polls reminders, sends digests.
│   └── handlers/
│       ├── note.js         # Save note, reply confirmation
│       ├── task.js         # Create task list, mark done
│       ├── reminder.js     # Create reminder, snooze logic
│       └── commands.js     # /today /notes /list /schedule /search
├── prisma/
│   └── schema.prisma       # DB schema — User, Note, Task, Reminder
├── .env                    # Local secrets — NEVER commit to git
├── .gitignore
└── package.json
```

**Every file has one job. Do not put multiple concerns in one file.**

---

## 5. Database Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String     @id @default(cuid())
  phone     String     @unique           // WhatsApp number e.g. "919876543210"
  tier      String     @default("free")  // "free" | "pro" | "team"
  lang      String     @default("en")    // "en" | "hi"
  noteCount Int        @default(0)       // rolling monthly count for free tier limit
  createdAt DateTime   @default(now())
  notes     Note[]
  tasks     Task[]
  reminders Reminder[]
}

model Note {
  id        String    @id @default(cuid())
  userId    String
  title     String                        // clean summary from Claude
  body      String?                       // full original text
  tags      String[]                      // ["#acme", "#design", "#work"]
  client    String?                       // extracted client name
  project   String?                       // extracted project name
  createdAt DateTime  @default(now())
  deletedAt DateTime?                     // soft delete — recoverable for 30 days
  user      User      @relation(fields: [userId], references: [id])

  @@index([userId, createdAt])
  @@index([userId, tags])
}

model Task {
  id        String   @id @default(cuid())
  userId    String
  title     String                        // task list name
  items     Json                          // [{ id, text, done, order }]
  tags      String[]
  client    String?
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])

  @@index([userId, createdAt])
}

model Reminder {
  id          String    @id @default(cuid())
  userId      String
  title       String
  fireAt      DateTime                    // when to send the WA message
  status      String    @default("pending") // "pending" | "fired" | "done" | "snoozed"
  snoozeUntil DateTime?
  createdAt   DateTime  @default(now())
  user        User      @relation(fields: [userId], references: [id])

  @@index([status, fireAt])              // critical — used by cron job every 60s
}
```

**Important schema decisions:**
- Phone numbers stored WITHOUT the `+` prefix, e.g. `"919876543210"` not `"+91 98765 43210"`
- `tags` is a Postgres string array — supports `@> ARRAY['#acme']` queries
- `deletedAt` on Note enables soft delete — never hard delete user data
- All FK indexes are explicit — no full table scans in hot paths

---

## 6. Environment Variables

Every variable that changes between environments lives in `.env` locally
and in Railway's Variables tab for production.

```env
# Meta / WhatsApp
WHATSAPP_TOKEN=          # Permanent system user token from Meta Business Manager
PHONE_NUMBER_ID=         # From Meta Developer Portal → WhatsApp → API Setup
WEBHOOK_VERIFY_TOKEN=    # You define this string. Meta echoes it back during setup.
APP_SECRET=              # From Meta Developer Portal → App Settings → Basic

# Database
DATABASE_URL=            # Full postgres:// connection string from Railway

# AI
CLAUDE_API_KEY=          # From console.anthropic.com

# App
PORT=3000
NODE_ENV=development     # "production" on Railway
```

**Rules:**
- Never hardcode any of these values in source code
- Never commit `.env` to git — it is in `.gitignore`
- On Railway, set all of these in the Variables tab — Railway injects at runtime

---

## 7. Claude API Usage — Critical Rules

**Always use `claude-haiku-4-5-20251001` for message classification.**
Never use Sonnet for this — it is 10x more expensive and not meaningfully better
for structured intent extraction.

The classifier returns a strict JSON object. The system prompt must say
"return ONLY valid JSON, no explanation, no markdown backticks."

```javascript
// classifier.js — the system prompt
const SYSTEM_PROMPT = `
You classify WhatsApp messages for a productivity bot used by Indian freelancers.

Current time (IST): {{CURRENT_TIME}}

Return ONLY valid JSON. No explanation. No markdown. No backticks. Just JSON.

{
  "type": "NOTE | TASK | REMINDER | SEARCH | TODAY | LIST | SCHEDULE | UNKNOWN",
  "title": "clean 1-line summary of the content",
  "body": "original text or null",
  "datetime": "ISO 8601 datetime string in IST, or null if not a time-based request",
  "tags": ["#tag1", "#tag2"],  // auto-tag: client names, topics, #work #personal #ideas
  "client": "client name in lowercase or null",
  "project": "project name in lowercase or null",
  "priority": "high | normal | low"
}

Classification rules:
- NOTE: any observation, idea, meeting notes, anything to remember
- TASK: contains a list of things to do, or starts with "task" / "todo" / "tasks:"
- REMINDER: has a time reference ("tomorrow", "at 3pm", "in 2 hours", "next Friday")
- SEARCH: question about previously saved content ("what did I note about...", "find...")
- TODAY: asks for today's overview ("/today", "what's today", "what do I have today")
- LIST: asks to see notes or tasks ("/notes", "/list", "/notes #acme", "/list work")
- SCHEDULE: asks for upcoming schedule ("/schedule", "what's coming up")
- UNKNOWN: greetings, help requests, anything else

Tag rules:
- Extract client/company names as tags: "acme" → "#acme", "rahul" → "#rahul"
- Topic tags: work-related → "#work", personal → "#personal", ideas → "#ideas"
- Project names → "#projectname"
- Maximum 4 tags per item

Datetime rules:
- "tomorrow 9am" → next day at 09:00:00 IST
- "in 2 hours" → current time + 2 hours
- "next Friday" → nearest upcoming Friday at 09:00:00 IST (morning default)
- "tonight" → today at 20:00:00 IST
- Always output in ISO 8601 with +05:30 timezone offset
`.trim();
```

**Fallback:** If Claude API is unavailable or returns invalid JSON,
fall back to keyword classification:
- Starts with `/remind` or contains "remind me" → REMINDER
- Starts with `/note` → NOTE
- Starts with `/task` or "task:" or "tasks:" → TASK
- Starts with `/today` → TODAY
- Starts with `/notes` → LIST
- Starts with `/search` → SEARCH
- Everything else → NOTE (default to saving rather than losing)

---

## 8. Meta WhatsApp API — Key Facts

**Sending a message:**
```javascript
// POST https://graph.facebook.com/v18.0/{PHONE_NUMBER_ID}/messages
{
  "messaging_product": "whatsapp",
  "to": "919876543210",        // recipient number, no + prefix
  "type": "text",
  "text": { "body": "Your message here" }
}
// Auth header: Authorization: Bearer {WHATSAPP_TOKEN}
```

**The 24-hour session window rule:**
- When a user messages you → 24-hour window opens
- Within the window: send ANY text for FREE, no template needed
- Outside the window: MUST use a pre-approved Message Template
- Our reminders fire outside the window → they use the `reminder_fire` template

**Inbound message shape (simplified):**
```javascript
// req.body structure from Meta webhook
{
  "entry": [{
    "changes": [{
      "value": {
        "messages": [{
          "from": "919876543210",     // sender phone number
          "id": "wamid.xxx",          // unique message ID — use for dedup
          "timestamp": "1234567890",
          "type": "text",
          "text": { "body": "the actual message text" }
        }],
        "contacts": [{
          "profile": { "name": "Nitya" },
          "wa_id": "919876543210"
        }]
      }
    }]
  }]
}
```

**Webhook verification (GET /webhook):**
Meta calls this when you register your webhook URL. Your code must:
1. Check `hub.mode === 'subscribe'`
2. Check `hub.verify_token === process.env.WEBHOOK_VERIFY_TOKEN`
3. If both match → respond with `hub.challenge` as plain text, status 200
4. Otherwise → status 403

**Signature verification (POST /webhook):**
Every inbound POST has `X-Hub-Signature-256: sha256=xxxxx` header.
Must verify: `HMAC-SHA256(APP_SECRET, rawBody) === signature`
Use `req.rawBody` not `req.body` (parsed JSON won't match).

---

## 9. Bot Reply Patterns

Keep all replies short, structured, and actionable.
Never reply with walls of text. Every reply should have at most 3–4 lines.

```
// Note saved
📝 #acme #design
"Logo concepts for Acme"
Saved · /search acme to find later

// Task list created
✅ Your tasks (3)
1. Send invoice to Rahul
2. Review brand brief
3. Follow up with Priya

Reply "done 1" to tick off

// Reminder set
🔔 Reminder set
Tomorrow · 9:00 AM
Call Ravi

// /today response
📋 Your day
Tasks: 3 pending
🔔 6:00 PM — Send proposal
🔔 9:00 PM — Weekly digest

// Search result
🔍 2 notes matching "acme"
• Logo concepts · 2 days ago
• Meeting notes · last week

// Free limit warning (at 80%)
⚡ 40/50 free notes used this month
Reply /upgrade for unlimited

// Unknown / greeting
👋 Hey! I'm Orga.
Send me a note, task, or reminder.
Or try /today to see your day.
```

---

## 10. Current Build Phase

**We are in Phase 0 — Meta Setup + Dev Environment.**

Phase 0 produces zero feature code. Its only output is:
a live Railway URL that Meta can reach, a connected WhatsApp number,
3 approved message templates, and all environment variables set.

### Phase 0 Checklist

Complete these in order. Do not start Phase 1 until ALL are checked.

#### A. Meta Business Account
- [ ] Created Meta Business account at business.facebook.com
- [ ] Business verification documents submitted
- [ ] Meta Developer App created (type: Business)
- [ ] WhatsApp product added to the app
- [ ] Dedicated phone number registered as WABA
- [ ] Phone number status shows "Connected" in Meta Portal
- [ ] Permanent system user token generated (saved securely)
- [ ] PHONE_NUMBER_ID noted from API Setup page
- [ ] APP_SECRET noted from App Settings → Basic

#### B. Message Templates Submitted
All 3 templates must be submitted with category UTILITY.

**Template 1: `reminder_fire`**
```
🔔 Reminder: {{1}}

Reply DONE to clear, or SNOOZE to remind in 1 hour.
```

**Template 2: `daily_digest`**
```
Good morning! ☀️ Your day:
📋 {{1}} tasks pending
🔔 {{2}} reminders today

Reply /today for details.
```

**Template 3: `weekly_digest`**
```
Your week with Orga 📊
Notes saved: {{1}}
Tasks completed: {{2}}
Coming up: {{3}}
```

- [ ] `reminder_fire` submitted — status Pending/Approved
- [ ] `daily_digest` submitted — status Pending/Approved
- [ ] `weekly_digest` submitted — status Pending/Approved

#### C. Railway + Postgres
- [ ] Railway project created at railway.app
- [ ] PostgreSQL service added to project
- [ ] DATABASE_URL copied from Railway → Postgres → Connect tab
- [ ] Node.js service created, named "orga-api"
- [ ] Public domain generated for orga-api (HTTPS URL)

#### D. GitHub Repo + Node.js Project
- [ ] Private GitHub repo created: `orga-bot`
- [ ] `npm init -y` run
- [ ] Dependencies installed:
  ```bash
  npm install express dotenv axios @prisma/client node-cron
  npm install -D prisma nodemon
  ```
- [ ] Folder structure created (see Section 4)
- [ ] `package.json` scripts added:
  ```json
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "db:push": "prisma db push",
    "db:gen": "prisma generate"
  }
  ```
- [ ] `.gitignore` includes `node_modules/` and `.env`

#### E. Prisma Schema + DB
- [ ] `prisma/schema.prisma` written (see Section 5)
- [ ] `DATABASE_URL` added to `.env`
- [ ] `npx prisma db push` run successfully — tables created in Railway Postgres
- [ ] `npx prisma generate` run — client generated

#### F. Environment Variables
- [ ] All 6 variables set in `.env` (local)
- [ ] All 6 variables set in Railway → orga-api → Variables tab (production)

#### G. Minimal App Deployed + Webhook Registered
- [ ] `src/index.js` written with GET /webhook (verify) and POST /webhook (stub)
- [ ] Code pushed to GitHub → Railway auto-deploys
- [ ] Railway build succeeds, app is live
- [ ] Webhook URL registered in Meta Developer Portal
- [ ] Meta shows webhook status as "Verified"
- [ ] Subscribed to `messages` field in webhook settings
- [ ] **Smoke test passed**: sent WA message to Orga number → appears in Railway logs

---

## 11. Phase 0 — The Code to Write

This is the only code for Phase 0. Write nothing else.

### src/index.js
```javascript
require('dotenv').config();
const express = require('express');
const { handleWebhookVerify, handleWebhookMessage } = require('./webhook');

const app = express();

// CRITICAL: capture raw body for signature verification before JSON parsing
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

app.get('/webhook', handleWebhookVerify);
app.post('/webhook', handleWebhookMessage);

// Health check — Railway uses this
app.get('/', (req, res) => res.json({ status: 'ok', service: 'orga-bot' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Orga listening on port ${PORT}`));
```

### src/webhook.js
```javascript
const crypto = require('crypto');

// GET /webhook — Meta verification handshake
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

// POST /webhook — inbound messages
function handleWebhookMessage(req, res) {
  // 1. Verify Meta signature FIRST
  if (!verifySignature(req)) {
    console.warn('Invalid signature — rejected');
    return res.sendStatus(403);
  }

  // 2. Acknowledge Meta immediately — BEFORE any processing
  res.sendStatus(200);

  // 3. Extract message (async — do not await here)
  const message = extractMessage(req.body);
  if (!message) return; // not a message event (e.g. status update)

  // 4. Log for debugging — remove sensitive data in production
  console.log('Inbound message:', {
    from: message.from,
    type: message.type,
    text: message.text,
    id:   message.id,
  });

  // Phase 1 will add: processMessage(message) here
}

// Verify X-Hub-Signature-256 header
function verifySignature(req) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.APP_SECRET)
    .update(req.rawBody)
    .digest('hex');

  // Use timingSafeEqual to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// Extract the message object from Meta's nested webhook payload
function extractMessage(body) {
  try {
    const entry   = body?.entry?.[0];
    const change  = entry?.changes?.[0];
    const value   = change?.value;
    const msg     = value?.messages?.[0];

    if (!msg) return null;
    if (msg.type !== 'text') return null; // Phase 0: text only

    return {
      from:      msg.from,              // "919876543210"
      id:        msg.id,                // wamid.xxx — for dedup later
      text:      msg.text?.body || '',
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

## 12. What Comes Next — Phase 1

After Phase 0 is complete, Phase 1 adds:

1. **sender.js** — `sendMessage(to, text)` helper that calls Meta's send API
2. **Prisma client** — `upsertUser(phone)` creates or retrieves user from DB
3. **Echo bot** — receives text → replies "You said: [text]"
4. **Full webhook processing** — replaces the stub log with real message handling

Phase 1 exit criteria: text "hello" to Orga from your phone → get a reply within 3 seconds.

---

## 13. Decisions Already Made — Do Not Revisit

These decisions are final for MVP. Do not suggest alternatives.

| Decision | Rationale |
|---|---|
| Node.js not Python/Django | Your stack. Consistency with AITF project. |
| Haiku not Sonnet for classification | 10x cheaper. Sufficient accuracy. |
| Railway not AWS for MVP | Zero DevOps overhead. You know AWS from AITF — save it for v2. |
| No Redis at MVP | node-cron + DB polling is enough for < 1000 users. |
| No dashboard at MVP | WhatsApp IS the interface. Dashboard is Phase 3+. |
| Phone number = user identity | No separate auth. No email. No password. |
| Soft delete on notes | Never lose user data. 30-day recovery window. |
| Plain `/today` not `/today@orga` | Simpler. Bot responds to anything starting with /today. |
| Tags use # prefix internally | Auto-applied by Claude. User never needs to type #. |

---

## 14. Reference — Useful Commands

```bash
# Development
npm run dev                    # start with nodemon (auto-restart)
npm run db:push                # push schema changes to Railway Postgres
npm run db:gen                 # regenerate Prisma client after schema change

# Testing webhook locally (use ngrok to expose localhost)
ngrok http 3000                # gives you a public HTTPS URL for local testing
# Then update webhook URL in Meta Portal to the ngrok URL temporarily

# Prisma
npx prisma studio              # opens visual DB browser at localhost:5555
npx prisma db push             # sync schema to DB (no migration file)
npx prisma generate            # regenerate client after schema changes

# Git
git add -A && git commit -m "feat: ..." && git push
# Railway auto-deploys on push to main
```

---

## 15. Costs Reference

| Service | Free Tier | When You Pay |
|---|---|---|
| Meta Cloud API | 1,000 conversations/month free | $0.004/conversation after |
| Meta templates (utility, India) | — | $0.004 per outbound template msg |
| Claude Haiku | $0.25/M input tokens | ~₹0.08 per 1,000 messages classified |
| Railway Postgres | $5 credit/month | $5/month Starter when credit runs out |
| Railway app hosting | $5 credit/month | Included in Starter |
| GitHub | Free private repos | Free forever at this scale |

**Total to first 100 real users: ~₹500–800/month.**

---

*Last updated: March 2026 | Phase: 0 — Meta Setup + Dev Environment*
*Next phase: Phase 1 — Echo Bot + Webhook Handler*
