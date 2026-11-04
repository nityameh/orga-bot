# Future Enhancements

> Features planned but not yet implemented. Prioritized by user impact.

---

## Reminders — Better Delivery & Scheduling

### 1. Interactive buttons on reminder fire
- Use `sendButtons()` instead of plain text for fired reminders
- One-tap "Done" and "Snooze" instead of typing
- **File:** `src/scheduler.js` → `buildReminderMessage()` → switch to `sendButtons()`
- **Effort:** Small — `sendButtons()` already exists in `src/sender.js`

### 2. Create reminders from dashboard
- "New Reminder" button on `/dashboard/reminders` page
- Form: title + date picker + time picker
- Calls `POST /api/v1/reminders` (new endpoint needed)
- **Effort:** Medium — new API endpoint + dashboard form component

### 3. Template messages for outside 24hr window
- When user hasn't messaged Orga in 24hrs, plain text fails
- Use pre-approved `reminder_fire` Meta template instead
- Add `sendTemplate()` function to `src/sender.js`
- Scheduler checks last message time → decides text vs template
- **Blocked on:** `reminder_fire` template approval in Meta

### 4. Alarm-style reminders
- For urgent/high-priority reminders, send multiple messages at intervals until user acknowledges
- E.g., "alarm: wake up at 6am" → fires at 6:00, 6:05, 6:10 until user replies DONE
- New `mode` field on Reminder: "once" (default) | "alarm" (repeat until acknowledged)
- Schema change: add `mode String @default("once")` to Reminder model
- **Effort:** Medium — scheduler loop change + new schema field

### 5. Google Calendar integration
- Sync reminders to user's Google Calendar as events
- Two-way: events created in GCal show up as Orga reminders
- OAuth flow needed — user links Google account on dashboard
- Use Google Calendar API (`googleapis` npm package)
- **New files:** `src/integrations/gcal.js`, dashboard OAuth flow
- **Effort:** Large — OAuth, token storage, sync logic, webhook for GCal push notifications
- **Dependencies:** Google Cloud project, OAuth consent screen, Calendar API enabled

### 6. Apple Calendar / iCal support
- Generate `.ics` file links for each reminder
- User taps link on WhatsApp → opens in their default calendar app
- No OAuth needed — stateless, works with any calendar app
- Simpler alternative to full Google Calendar sync
- **Effort:** Small — generate ICS string, host as URL

### 7. Recurring reminders
- "remind me every Monday 9am to send weekly report"
- New fields: `recurrence` (daily/weekly/monthly), `recurrenceEnd`
- Scheduler creates next instance after each fire
- **Effort:** Medium — schema change + scheduler logic

---

## Dashboard — Features to Add

### 8. Create notes/tasks from dashboard
- "New Note" and "New Task" buttons
- Dashboard becomes a full input method alongside WhatsApp
- **Effort:** Small — new API endpoints + form components

### 9. WhatsApp OTP authentication
- Replace hardcoded phone with proper OTP login flow
- Phone → OTP via WhatsApp → JWT session (7-day expiry)
- Schema: new `OtpCode` model
- **Effort:** Medium — auth middleware, OTP send/verify, JWT

### 10. Mobile responsive dashboard
- Collapsible sidebar → hamburger menu on small screens
- Touch-friendly note cards and task items
- **Effort:** Small — Tailwind responsive classes

### 11. Deploy to Railway
- Two Railway services: `orga-api` (port 3000) + `orga-dashboard` (port 3001)
- Set `DASHBOARD_URL` env var for CORS
- **Effort:** Small — config only

---

## Integrations — Longer Term

### 12. Google Calendar two-way sync
- See above (#5) — full bidirectional sync
- Events created in GCal appear as Orga reminders
- Orga reminders appear as GCal events

### 13. Slack / Telegram as additional input channels
- Same backend, different input adapters
- Abstract `webhook.js` into channel-specific handlers

### 14. Voice notes → text
- User sends WhatsApp voice note → transcribe with Whisper API → save as note
- Meta webhook sends audio messages with media URL
- Download → transcribe → classify → save

### 15. File/image attachments on notes
- User sends image/PDF on WhatsApp → attach to note
- Store in S3/Cloudflare R2, save URL in note record

---

## Data Export & Spreadsheets

### 16. CSV/Excel export from dashboard
- Download button on Notes, Tasks, Reminders pages
- Generates CSV with columns: title, body, client, tags, date
- Use `csv-stringify` or build CSV string manually
- **Effort:** Small — frontend download, no backend change

### 17. Google Sheets auto-sync
- User links Google account (OAuth on dashboard)
- Orga creates a "Orga Data" spreadsheet with sheets: Notes, Tasks, Reminders, Clients
- Every new note/task/reminder auto-appends a row
- User says "export to sheet" on WhatsApp → triggers sync
- Use Google Sheets API (`googleapis` npm package)
- **Effort:** Large — OAuth, token storage, row-append logic, WhatsApp command
- **High value:** Freelancers live in spreadsheets. This is the "WhatsApp → structured spreadsheet" dream.

### 18. WhatsApp → Excel quick export
- User sends `/excel` or `/sheet` on WhatsApp
- Bot generates a formatted summary and sends it as a document attachment
- Meta API supports sending documents (PDF, XLSX)
- Use `exceljs` npm package to generate .xlsx in memory → upload to Meta → send
- **Effort:** Medium — Excel generation + Meta document upload API

---

## Client Management — CRM Features

### 19. Client profiles on dashboard
- Dedicated client page with editable fields: name, company, email, phone, notes
- Currently clients are just extracted names — make them first-class entities
- Schema change: new `Client` model with fields beyond just a name string
- **Effort:** Medium — new model, migration, dashboard page

### 20. Meeting scheduler
- "schedule meeting with rahul friday 3pm at coffee shop"
- Creates a reminder + adds location field + sends iCal
- Future: send meeting invite to client's WhatsApp too
- **Effort:** Medium — extend Reminder model with location/type fields

### 21. Client activity timeline
- Dashboard page showing chronological view of all interactions with a client
- Notes, tasks, reminders interleaved by date
- Like a CRM activity feed but auto-populated from WhatsApp
- **Effort:** Small — query + UI, data already exists

---

*Last updated: 2026-03-31*
*Add new items at the bottom of the relevant section.*
