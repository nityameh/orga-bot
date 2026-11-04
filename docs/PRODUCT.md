# Orga — Product Document

---

## For the Customer (Freelancer using Orga)

### What is Orga?

Orga is your personal work assistant on WhatsApp.

You already use WhatsApp all day to talk to clients. Now you can also use it to
remember everything — notes from meetings, tasks you promised, reminders you set.
No new app. No login. Just text Orga like you'd text a friend.

### What can I do with it?

**Save a note:**
> "note: acme wants the logo in blue with minimal design"

Orga saves it. You can find it later.

**Create a task list:**
> "tasks: send invoice to rahul, review design brief, follow up with priya"

Orga saves your list. Reply "done 1" when you finish the first task.

**Set a reminder:**
> "remind me tomorrow 9am to call Ravi about the proposal"

Orga will message you at exactly 9am tomorrow.

**Find something you saved:**
> "/search acme"

Orga shows you everything you saved about acme.

**See your day:**
> "/today"

Orga shows your pending tasks and reminders for today.

### What does it cost?

- **Free:** Save up to 50 notes per month. Tasks and reminders are unlimited.
- **Pro (coming soon):** Unlimited notes, priority support, team features.

### Who is it for?

Freelancers, consultants, and solo professionals in India who:
- Manage 3–8 clients over WhatsApp
- Lose track of what they promised, when, and to whom
- Don't want to install yet another productivity app

---

## For the Product Manager

### Problem Statement

Indian freelancers manage all client communication over WhatsApp.
The result: notes in chats, tasks forgotten, reminders missed.
Existing tools (Notion, Todoist, Google Tasks) require context-switching
away from WhatsApp — so they don't get used.

### Solution

A WhatsApp-native bot that lives where the work already happens.
Zero app install. Zero onboarding. Texts naturally, like a person.

### Target User

- Indian freelancer / consultant / solo professional
- 3–8 active clients at any time
- 22–40 years old, comfortable with WhatsApp
- Frustrated by forgetting commitments, not by lack of apps

### Core Value Proposition

> "Orga remembers everything you promised — so you don't have to."

### North Star Metric

**Weekly active users who send at least 3 messages per week.**

### Current Phase & Roadmap

| Phase | Status | Description |
|---|---|---|
| 0 | ✅ Done | Meta setup, Railway, env, minimal webhook |
| 1 | ✅ Done | Echo bot, user creation in DB |
| 2 | ✅ Done | Intent classifier (Groq LLaMA) — 100% accuracy on test suite |
| 3 | ✅ Done | Notes, tasks, search, /today, /notes, /schedule |
| 4 | ✅ Done | Reminders save + fire via cron, snooze, weekly digest |
| 5 | 🔜 Next | First 5 real users — WhatsApp connected, feedback loop |
| 6 | Planned | Pro tier, Razorpay payments, upgrade flow |
| 7 | Planned | Team features, shared task lists |

### Key Metrics to Track (Phase 5+)

| Metric | Target |
|---|---|
| D7 retention | > 40% |
| Messages per active user per week | > 5 |
| Notes saved per user per month | > 10 |
| Reminder completion rate | > 60% |
| Free → Pro conversion | > 5% |

### Monetisation

- **Free tier:** 50 notes/month (tasks + reminders unlimited)
- **Pro tier:** ₹299/month — unlimited notes, priority
- **Team tier:** ₹799/month — shared lists, multi-user (Phase 7+)
- **Payments:** Razorpay UPI links via WhatsApp

### Risks

| Risk | Mitigation |
|---|---|
| Meta restricts bot behaviour | Use only approved templates for outbound messages |
| Groq API downtime | Keyword fallback classifier built in |
| User sends non-text (images, voice) | Graceful ignore with guidance message |
| Free tier abuse | Rolling monthly note count per user |

---

## For the Developer

See [CONTRIBUTING.md](./CONTRIBUTING.md) for architecture, setup, and how to contribute.
See [LLD.md](./LLD.md) for the auto-generated low-level design.

---

*Last updated: March 2026 | Phase 4 complete*
