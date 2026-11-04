# Contributing to Orga

Welcome. This guide will get you from zero to making your first contribution
in under 30 minutes. Read it completely before touching any code.

---

## 1. What You Need to Know First

- Orga is a **WhatsApp bot** — the interface is WhatsApp, not a web app
- Every message goes: WhatsApp → Meta webhook → Express → Groq AI → Handler → DB → Reply
- The codebase is intentionally simple — one file, one job
- We are in **Phase 4**. Read [PRODUCT.md](./PRODUCT.md) to understand the roadmap

---

## 2. Local Setup (15 minutes)

### Prerequisites
- Node.js 20+
- PostgreSQL 14+ running locally (default port 5432)
- A Groq API key from [console.groq.com](https://console.groq.com) (free)

### Steps

```bash
# 1. Clone the repo
git clone <repo-url>
cd orga-bot

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env
# Edit .env — fill in DATABASE_URL and GROQ_API_KEY at minimum

# 4. Create local database
psql -U postgres -c "CREATE DATABASE orga_dev;"

# 5. Push schema to DB
npm run db:push

# 6. Start the server
npm run dev
```

You should see:
```
Orga listening on port 3000
Reminder poller started — checking every 60s
Weekly digest scheduled — every Sunday 6:00 PM IST
Scheduler running
```

### Verify it works
```bash
curl http://localhost:3000/
# → {"status":"ok","service":"orga-bot"}
```

---

## 3. Architecture — How It All Fits Together

```
src/
├── index.js          Entry point. Sets up Express routes, starts scheduler.
│                     Touch this only to add new top-level routes.
│
├── webhook.js        Meta's entry point. Two jobs only:
│                     GET /webhook  → verify token with Meta
│                     POST /webhook → verify signature, send 200, dispatch async
│                     NEVER do slow work here — always fire-and-forget.
│
├── classifier.js     Calls Groq. Text in → JSON intent out.
│                     Has a keyword fallback for when Groq is down.
│                     Never change the model without checking cost implications.
│
├── router.js         Intent router. Reads intent.type, calls the right handler.
│                     Also intercepts "done N", "DONE", "SNOOZE" before routing.
│
├── sender.js         The only file that calls Meta's send API.
│                     In dev (no WHATSAPP_TOKEN): logs to console instead.
│                     Never call Meta directly from handlers — always use this.
│
├── scheduler.js      Two cron jobs:
│                     - Every 60s: poll for due reminders, fire them
│                     - Every Sunday 6pm IST: weekly digest
│                     Stateless — restarts are safe.
│
├── db.js             Prisma client singleton. Just import this wherever you
│                     need DB access. Don't create new Prisma instances.
│
└── handlers/
    ├── note.js       Save note + free tier check + reply
    ├── task.js       Save task list + "done N" logic
    ├── reminder.js   Save reminder + datetime validation + snooze/done helpers
    └── commands.js   /today /notes /list /schedule /search — all read-only queries
```

### The Golden Rules

1. **`res.sendStatus(200)` first, always.** Meta retries if it doesn't get 200 in 3 seconds.
   All processing is async after the response is sent.

2. **One file, one job.** If you find yourself writing DB logic in webhook.js, stop.
   If you find yourself calling Meta API in a handler, stop. Route it through sender.js.

3. **Groq is Groq, not Claude, not OpenAI.** Model: `llama-3.3-70b-versatile`.
   Never change this without discussion — cost implications are real.

4. **Never hard-delete user data.** Notes use soft delete (`deletedAt`).
   Always check `deletedAt: null` in queries.

5. **Phone numbers without `+`.** Stored as `"919876543210"` not `"+91 98765 43210"`.

---

## 4. How to Test Without WhatsApp

You don't need a WhatsApp number to develop or test. Use these tools:

### Interactive tester (best for manual testing)
```bash
# Terminal 1 — server
npm run dev

# Terminal 2 — type messages
node test/manual.js
```

### Classifier test suite
```bash
node test/classifier.test.js
# Must pass 90%+ before any changes to classifier.js are merged
```

### Curl (for specific flow testing)
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "messages": [{ "from": "919876543210", "id": "test_001", "type": "text",
        "text": { "body": "your message here" }, "timestamp": "1234567890" }],
      "contacts": [{ "profile": { "name": "Test" }, "wa_id": "919876543210" }]
    }}]}]
  }'
```

### Prisma Studio (visual DB browser)
```bash
npx prisma studio
# Opens at http://localhost:5555
```

---

## 5. How to Add a New Feature

### Example: Adding a new intent type "BUDGET"

1. **Add to classifier** — update `buildSystemPrompt()` in `classifier.js`:
   - Add `BUDGET` to the TYPE list with a clear rule
   - Add an example input/output pair

2. **Add a handler** — create `src/handlers/budget.js`:
   ```javascript
   const { sendMessage } = require('../sender');
   async function handleBudget(user, intent, message) {
     // your logic
     await sendMessage(message.from, 'reply');
   }
   module.exports = { handleBudget };
   ```

3. **Wire it in router** — add to `router.js`:
   ```javascript
   const { handleBudget } = require('./handlers/budget');
   // in the switch:
   case 'BUDGET': return handleBudget(user, intent, message);
   ```

4. **Add DB model if needed** — update `prisma/schema.prisma`, then:
   ```bash
   npm run db:push
   npm run db:gen
   ```

5. **Add test cases** — add to `test/classifier.test.js`

6. **Run tests** — `node test/classifier.test.js` must stay ≥ 90%

7. **Run gen-lld** — `node scripts/gen-lld.js` updates the LLD doc

---

## 6. Adding a New Database Field

1. Edit `prisma/schema.prisma`
2. Run `npm run db:push` — applies changes to local DB
3. Run `npm run db:gen` — regenerates the Prisma client
4. Update the relevant handler to use the new field
5. Run `node scripts/gen-lld.js` to update docs

**Never drop columns in production without a migration plan.**

---

## 7. Environment Variables

| Variable | Where to get it | Required locally |
|---|---|---|
| `DATABASE_URL` | Local: `postgresql://postgres:postgres@localhost:5432/orga_dev` | Yes |
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) → API Keys | Yes |
| `WHATSAPP_TOKEN` | Meta Business Manager → System User | No (dev bypasses it) |
| `PHONE_NUMBER_ID` | Meta Developer Portal → WhatsApp → API Setup | No |
| `WEBHOOK_VERIFY_TOKEN` | You choose this string | No |
| `APP_SECRET` | Meta App Settings → Basic | No (dev bypasses it) |

In `NODE_ENV=development` with no `APP_SECRET` or `WHATSAPP_TOKEN`:
- Signature verification is skipped
- Messages are logged to console instead of sent via WhatsApp

---

## 8. Useful Commands

```bash
npm run dev          # Start with nodemon (auto-restart)
npm run start        # Production start
npm run db:push      # Sync schema → DB (no migration file needed)
npm run db:gen       # Regenerate Prisma client after schema change
npx prisma studio    # Visual DB browser at localhost:5555

node test/classifier.test.js   # Run classifier accuracy tests
node test/manual.js            # Interactive message tester
node scripts/gen-lld.js        # Regenerate docs/LLD.md
```

---

## 9. Branch & Commit Convention

```bash
# Branch names
feat/phase-5-whatsapp-connect
fix/reminder-double-fire
chore/update-deps

# Commit messages
feat: add budget tracking intent
fix: prevent double-firing on server restart
chore: regenerate LLD after phase 4
docs: update contributing guide
```

---

## 10. Before You Submit a PR

- [ ] `node test/classifier.test.js` passes ≥ 90%
- [ ] `node scripts/gen-lld.js` run — `docs/LLD.md` updated
- [ ] No hardcoded secrets anywhere in code
- [ ] `sender.js` is the only file calling Meta API
- [ ] `res.sendStatus(200)` still happens before any async work in webhook.js
- [ ] No new Prisma client instances — use `require('./db')`

---

*Questions? Read CLAUDE.md first — it has the answers to most things.*
