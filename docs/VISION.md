# Orga — Product Vision

## One-liner
WhatsApp-first client management for freelancers and small business owners in India.

## The Problem
A freelancer managing 3-8 clients juggles everything over WhatsApp — promises, deadlines, meeting notes, payments. Information is scattered across chats. Nothing is structured. Things fall through the cracks.

They don't need another app. They need their existing WhatsApp workflow to become organized automatically.

## The Solution
Text Orga like a friend. It turns unstructured messages into structured data — notes, tasks, reminders, client profiles, meeting schedules, and spreadsheet exports. A web dashboard lets you see everything visually.

## Core Value Props

### 1. Client Management (primary)
- Every note, task, and reminder is auto-tagged with the client name
- `/client rahul` shows everything about Rahul in one place — notes, pending tasks, upcoming meetings
- Dashboard client view = mini CRM per client
- **Goal:** Never forget what you promised to whom

### 2. Scheduling (meetings, events, deadlines)
- Set reminders via natural language: "meet rahul friday 3pm at his office"
- Alarm mode for critical deadlines — repeats until acknowledged
- iCal links — one tap adds to Google Calendar / Apple Calendar
- Google Calendar sync (planned) — two-way, auto-create events
- **Goal:** One place for all your schedule, accessible from WhatsApp or dashboard

### 3. Information Capture
- Notes saved from WhatsApp — meeting summaries, ideas, client briefs
- Pinned notes, archived notes, searchable by client/tag/date
- Full note editor on dashboard (Notion-style)
- **Goal:** Never lose a piece of information

### 4. Task Management
- Task lists per client or per project
- Mark done via WhatsApp ("done 1") or dashboard (click checkbox)
- Drag-drop reorder on dashboard
- **Goal:** Know exactly what's pending for each client

### 5. Data Export (planned)
- `/export` — all notes as formatted text via WhatsApp
- CSV/Excel export from dashboard — notes, tasks, reminders
- Google Sheets integration — auto-push client data to a spreadsheet
- WhatsApp → structured spreadsheet with zero manual work
- **Goal:** Your WhatsApp chaos becomes a clean spreadsheet

## User Persona
**Priya, freelance graphic designer, Mumbai**
- 5 active clients at any time
- All communication over WhatsApp
- Uses Google Calendar for big meetings but forgets smaller promises
- Tried Notion but stopped because it's another app to check
- Wants to say "met acme today, they want 3 logo options by friday" and have it tracked automatically

## What Orga is NOT
- Not a team tool (single-user MVP, team features later)
- Not a CRM with pipelines and deals (too complex)
- Not a project management tool (no Gantt charts, no sprints)
- Not an app to install (WhatsApp + web dashboard only)

## Platform Strategy
```
WhatsApp (input layer)
    ↕
Backend (intelligence layer)
    ↕
Dashboard (management layer)
    ↕
Exports (output layer) → Excel, Google Sheets, Calendar
```

WhatsApp is where data enters. Dashboard is where data is managed. Exports are where data leaves to other tools.

## Revenue Model (future)
- Free: 50 notes/month, basic reminders
- Pro (₹199/month): Unlimited notes, Google Calendar sync, Excel export, alarm reminders
- Business (₹499/month): Team features, shared clients, API access

## Success Metrics
- Messages processed per day (engagement)
- Notes saved per user per week (value delivery)
- Reminder acknowledgment rate (utility)
- Dashboard DAU / WhatsApp DAU ratio (platform balance)
- Free → Pro conversion rate (revenue)
