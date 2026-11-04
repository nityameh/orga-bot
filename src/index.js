require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { handleWebhookVerify, handleWebhookMessage } = require('./webhook');
const { startScheduler, sendWeeklyDigests } = require('./scheduler');

const app = express();

// CORS — allow dashboard to call API
app.use(cors({
  origin: process.env.DASHBOARD_URL || 'http://localhost:3001',
  credentials: true,
}));

// CRITICAL: capture raw body for signature verification before JSON parsing
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

app.get('/webhook', handleWebhookVerify);
app.post('/webhook', handleWebhookMessage);

// Dashboard API
app.use('/api/v1', require('./api'));

// iCal download — no auth, cuid is unguessable
const prisma = require('./db');
const { generateIcsContent } = require('./ical');
app.get('/ical/:id.ics', async (req, res) => {
  try {
    const reminder = await prisma.reminder.findUnique({ where: { id: req.params.id } });
    if (!reminder) return res.status(404).send('Not found');
    const ics = generateIcsContent(reminder.title, reminder.fireAt);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${reminder.id}.ics"`);
    res.send(ics);
  } catch { res.status(500).send('Error'); }
});

// Health check — Railway uses this
app.get('/', (req, res) => res.json({ status: 'ok', service: 'orga-bot' }));

const PORT = process.env.PORT || 3000;
// TEMP test route — remove before deploy
app.get('/test-digest', async (req, res) => {
  await sendWeeklyDigests();
  res.json({ ok: true });
});

const server = app.listen(PORT, () => {
  console.log(`Orga listening on port ${PORT}`);
  startScheduler();
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Run: npx kill-port ${PORT}`);
    process.exit(1);
  }
  throw err;
});
