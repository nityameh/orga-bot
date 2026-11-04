# Orga — WhatsApp Productivity Bot

> Text your notes, tasks, and reminders on WhatsApp. Orga remembers everything.

---

## Quick Links

| Document | Audience | What's inside |
|---|---|---|
| [docs/PRODUCT.md](docs/PRODUCT.md) | Customer · PM · Founder | What it is, who it's for, roadmap, metrics |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | Developer | Architecture, setup, how to add features |
| [docs/LLD.md](docs/LLD.md) | Developer | Auto-generated low-level design — file tree, functions, DB schema, API routes |
| [CLAUDE.md](CLAUDE.md) | Developer | Full project bible — every decision documented |

---

## What is Orga?

A WhatsApp bot for Indian freelancers. Instead of installing another app,
you just text Orga on WhatsApp:

```
"note: logo concepts for acme — minimal design, dark bg"
"tasks: send invoice, review brief, follow up with priya"
"remind me tomorrow 9am to call Ravi"
"/today"
"/search acme"
```

Orga saves notes, creates task lists, fires reminders at the right time,
and answers "what do I have today?" — all inside WhatsApp.

---

## Current Status

**Phase 4 complete.** All core features working locally.

| Feature | Status |
|---|---|
| Save notes | ✅ Working |
| Task lists + "done N" | ✅ Working |
| Reminders (save + fire) | ✅ Working |
| /today /notes /search /schedule | ✅ Working |
| Weekly digest | ✅ Working |
| WhatsApp connected | 🔜 Phase 5 |
| Real users | 🔜 Phase 5 |

---

## Developer Setup

```bash
git clone <repo-url> && cd orga-bot
npm install
cp .env.example .env   # fill in DATABASE_URL and GROQ_API_KEY
psql -U postgres -c "CREATE DATABASE orga_dev;"
npm run db:push
npm run dev
```

Full setup guide → [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 + Express |
| Database | PostgreSQL + Prisma ORM |
| AI / NLP | Groq — LLaMA 3.3 70B (free tier) |
| WhatsApp | Meta Cloud API |
| Hosting | Railway.app |
| Cron | node-cron + DB polling |

---

## Project Structure

```
src/
├── index.js          App entry + scheduler boot
├── webhook.js        Meta webhook (verify + receive)
├── classifier.js     Groq intent classifier
├── router.js         Intent → handler routing
├── sender.js         WhatsApp send API wrapper
├── scheduler.js      Cron: reminders + weekly digest
├── db.js             Prisma client
└── handlers/
    ├── note.js       Save notes
    ├── task.js       Save tasks + done replies
    ├── reminder.js   Save reminders
    └── commands.js   /today /notes /search /schedule
```

---

*Built by Nitya Mehta · March 2026*
