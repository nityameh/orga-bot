// src/scheduler.js
// Two cron jobs:
//   1. Every 60s  — poll for due reminders and fire them
//   2. Every Sunday 6pm IST — send weekly digest to active users
//
// Stateless — all state lives in Postgres.
// Safe to restart — re-checks DB on next tick, no missed reminders.

const cron   = require('node-cron');
const prisma = require('./db');
const { sendMessage, sendButtons } = require('./sender');
const { log, warn, error } = require('./logger');
const { getGoogleCalUrl } = require('./ical');
const { cleanupExpired } = require('./pending');

// ─── Job 1: Reminder poller ────────────────────────────────────────────────

function startReminderPoller() {
  cron.schedule('* * * * *', async () => {
    try {
      const due = await prisma.reminder.findMany({
        where: {
          status: 'pending',
          fireAt: { lte: new Date() },
        },
        include: { user: true },
        take: 50,
      });

      if (due.length > 0) {
        log('reminder.poller.due', { count: due.length });
      }

      for (const reminder of due) {
        await fireReminder(reminder);
      }

    } catch (err) {
      error('reminder.poller.error', { err: err.message });
    }
  });

  log('reminder.poller.started');
}

async function fireReminder(reminder, attempt = 1) {
  // Mark fired immediately to prevent double-firing on concurrent ticks
  await prisma.reminder.update({
    where: { id: reminder.id },
    data:  { status: 'fired' },
  });

  const gcalUrl = getGoogleCalUrl(reminder.title, reminder.fireAt);
  const bodyText = `*Reminder*\n\n${reminder.title}\n\nAdd to Google Calendar: ${gcalUrl}`;
  const buttons = [
    { id: 'reminder_done', title: 'Done' },
    { id: 'reminder_snooze', title: 'Snooze 1hr' },
  ];
  const sent = await sendButtons(reminder.user.phone, bodyText, buttons);

  if (sent) {
    log('reminder.fired', { title: reminder.title, phone: reminder.user.phone });
    return;
  }

  // Retry with backoff (max 3 attempts)
  if (attempt < 3) {
    const delayMs = attempt * 30 * 1000;
    warn('reminder.send_failed', { attempt, retryInSec: delayMs / 1000, id: reminder.id });
    setTimeout(async () => {
      await prisma.reminder.update({
        where: { id: reminder.id },
        data:  { status: 'pending', fireAt: new Date(Date.now() + 5000) },
      });
    }, delayMs);
  } else {
    error('reminder.failed_all_attempts', { id: reminder.id });
  }
}

// ─── Job 2: Weekly digest ──────────────────────────────────────────────────

function startWeeklyDigest() {
  cron.schedule('0 18 * * 0', async () => {
    log('digest.weekly.started');
    try {
      await sendWeeklyDigests();
    } catch (err) {
      error('digest.weekly.error', { err: err.message });
    }
  }, {
    timezone: 'Asia/Kolkata',
  });

  log('digest.weekly.scheduled');
}

async function sendWeeklyDigests() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const activeUsers = await prisma.user.findMany({
    where: {
      OR: [
        { notes: { some: { createdAt: { gte: weekAgo }, deletedAt: null } } },
        { tasks: { some: { createdAt: { gte: weekAgo } } } },
      ],
    },
    include: {
      notes:     { where: { createdAt: { gte: weekAgo }, deletedAt: null } },
      tasks:     { where: { createdAt: { gte: weekAgo } } },
      reminders: {
        where:   { status: 'pending', fireAt: { gte: new Date() } },
        take:    3,
        orderBy: { fireAt: 'asc' },
      },
    },
  });

  log('digest.weekly.sending', { userCount: activeUsers.length });

  for (const user of activeUsers) {
    await sendDigestToUser(user);
    await new Promise(r => setTimeout(r, 500));
  }
}

async function sendDigestToUser(user) {
  const noteCount     = user.notes.length;
  const tasksDone     = user.tasks.flatMap(t => t.items).filter(i => i.done).length;
  const upcomingCount = user.reminders.length;

  const upcomingLines = user.reminders.map((r, i) => {
    const dt = new Date(r.fireAt).toLocaleString('en-IN', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Kolkata', hour12: true,
    });
    return `${i + 1}. ${r.title} — ${dt}`;
  });

  const message = [
    `*Weekly Summary*`,
    ``,
    `Notes saved: ${noteCount}`,
    `Tasks completed: ${tasksDone}`,
    upcomingCount > 0 ? `\n_Coming up_` : null,
    ...upcomingLines,
  ].filter(l => l !== null).join('\n');

  const sent = await sendMessage(user.phone, message);
  if (sent) {
    log('digest.weekly.sent', { phone: user.phone });
  } else {
    warn('digest.weekly.failed', { phone: user.phone });
  }
}

// ─── SNOOZE / DONE reply handler ───────────────────────────────────────────

async function handleReminderReply(user, text) {
  const t = text.trim().toUpperCase();

  if (t === 'DONE') {
    const reminder = await prisma.reminder.findFirst({
      where:   { userId: user.id, status: 'fired' },
      orderBy: { fireAt: 'desc' },
    });

    if (!reminder) return false;

    await prisma.reminder.update({
      where: { id: reminder.id },
      data:  { status: 'done' },
    });

    await sendMessage(user.phone, `*Done* — "${reminder.title}"`);

    return true;
  }

  if (t === 'SNOOZE') {
    const reminder = await prisma.reminder.findFirst({
      where:   { userId: user.id, status: 'fired' },
      orderBy: { fireAt: 'desc' },
    });

    if (!reminder) return false;

    const snoozeUntil = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.reminder.update({
      where: { id: reminder.id },
      data: {
        status:      'pending',
        fireAt:      snoozeUntil,
        snoozeUntil,
      },
    });

    const timeIST = snoozeUntil.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Kolkata', hour12: true,
    });

    await sendMessage(user.phone, `*Snoozed* — will remind you at ${timeIST}`);
    return true;
  }

  return false;
}

// ─── Start all jobs ────────────────────────────────────────────────────────

function startDailyCleanup() {
  cron.schedule('0 3 * * *', async () => {
    try {
      await cleanupExpired();
    } catch (err) {
      error('cleanup.error', { err: err.message });
    }
  }, { timezone: 'Asia/Kolkata' });

  log('cleanup.daily.scheduled');
}

function startScheduler() {
  startReminderPoller();
  startWeeklyDigest();
  startDailyCleanup();
  log('scheduler.started');
}

module.exports = { startScheduler, handleReminderReply, sendWeeklyDigests };
