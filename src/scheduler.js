// src/scheduler.js
// Time-driven jobs: fire due reminders (every minute), weekly digest (Sunday
// 6pm IST), nightly cleanup. Proactive messages go through notifyUser(), which
// picks the user's channel and falls back to approved WhatsApp templates
// outside the 24-hour window.
// Stateless — all state lives in Postgres; safe to restart.
// Docs: docs/modules/scheduler.md

const cron   = require('node-cron');
const prisma = require('./db');
const { reply, notifyUser } = require('./channels');
const { emit, KINDS } = require('./interactions');
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
  // Claim the reminder atomically: only the process whose conditional update
  // succeeds sends it, so overlapping ticks or two instances can't double-fire.
  const { count } = await prisma.reminder.updateMany({
    where: { id: reminder.id, status: 'pending' },
    data:  { status: 'fired' },
  });
  if (count === 0) return;

  const gcalUrl = getGoogleCalUrl(reminder.title, reminder.fireAt);
  const bodyText = `*Reminder*\n\n${reminder.title}\n\nAdd to Google Calendar: ${gcalUrl}`;
  const buttons = [
    { id: 'reminder_done', title: 'Done' },
    { id: 'reminder_snooze', title: 'Snooze 1hr' },
  ];
  const sent = await notifyUser(reminder.user, {
    text: bodyText,
    buttons,
    template: { name: 'reminder_fire', params: [reminder.title] },
  });

  if (sent) {
    log('reminder.fired', { reminderId: reminder.id, userId: reminder.userId });
    emit({ kind: KINDS.REMINDER_FIRED, userId: reminder.userId, summary: reminder.title, payload: { reminderId: reminder.id } });
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

  const nextUp = user.reminders[0]?.title || 'nothing scheduled';
  const sent = await notifyUser(user, {
    text: message,
    template: { name: 'weekly_digest', params: [String(noteCount), String(tasksDone), nextUp] },
  });
  if (sent) {
    log('digest.weekly.sent', { userId: user.id });
    emit({ kind: KINDS.DIGEST_SENT, userId: user.id, payload: { noteCount, tasksDone, upcomingCount } });
  } else {
    warn('digest.weekly.failed', { userId: user.id });
  }
}

// ─── SNOOZE / DONE reply handler ───────────────────────────────────────────

async function handleReminderReply(user, message) {
  const t = message.text.trim().toUpperCase();

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

    await reply(message, `*Done* — "${reminder.title}"`);
    emit({ kind: KINDS.REMINDER_COMPLETED, userId: user.id, summary: reminder.title, payload: { reminderId: reminder.id } });

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

    await reply(message, `*Snoozed* — will remind you at ${timeIST}`);
    emit({ kind: KINDS.REMINDER_SNOOZED, userId: user.id, summary: reminder.title, payload: { reminderId: reminder.id, until: snoozeUntil.toISOString() } });
    return true;
  }

  return false;
}

// ─── Start all jobs ────────────────────────────────────────────────────────

function startDailyCleanup() {
  cron.schedule('0 3 * * *', async () => {
    try {
      await cleanupExpired();
      // Conversation memory is short-term by design (privacy): keep 7 days.
      const { count } = await prisma.conversationMessage.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      });
      if (count) log('conversation.pruned', { count });
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
