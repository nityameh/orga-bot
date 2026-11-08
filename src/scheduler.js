// src/scheduler.js
// Time-driven work: fire due reminders (every minute), weekly digest (Sunday
// 6pm IST), nightly cleanup. Normally scheduled by the pg-boss job queue
// (src/jobs, ADR-009); startScheduler() is the node-cron fallback. Proactive messages go through notifyUser(), which
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

// ─── Job 1: Reminders ──────────────────────────────────────────────────────
// pollDueReminders claims due reminders atomically, then hands each to
// `dispatch`. With the job queue, dispatch enqueues a `reminder.send` job whose
// failures pg-boss retries with backoff (persisted, survives restarts). Without
// it (tests/dev), dispatch delivers directly, once.

/**
 * @param {(reminder: { id: string }) => Promise<unknown>} dispatch
 * @returns {Promise<number>} reminders claimed
 */
async function pollDueReminders(dispatch) {
  const now = new Date();
  // Due = pending and past its time, or a failed delivery whose backoff has elapsed.
  const due = await prisma.reminder.findMany({
    where: {
      OR: [
        { status: 'pending', fireAt: { lte: now } },
        { status: 'retry', nextAttemptAt: { lte: now } },
      ],
    },
    select: { id: true, status: true },
    take: 50,
  });
  let claimed = 0;
  for (const reminder of due) {
    // Claim atomically: only the process whose conditional update succeeds
    // dispatches it, so overlapping ticks or two instances can't double-fire.
    const { count } = await prisma.reminder.updateMany({
      where: { id: reminder.id, status: reminder.status },
      data:  { status: 'fired' },
    });
    if (count === 0) continue;
    claimed++;
    await dispatch(reminder);
  }
  if (claimed) log('reminder.poller.claimed', { count: claimed });
  return claimed;
}

/**
 * Send one claimed reminder. Throws when delivery fails so the job queue
 * retries it; returns quietly if it was cancelled/completed meanwhile.
 * @param {string} reminderId
 */
async function deliverReminder(reminderId) {
  const reminder = await prisma.reminder.findUnique({ where: { id: reminderId }, include: { user: true } });
  if (!reminder || reminder.status !== 'fired') return;

  const gcalUrl = getGoogleCalUrl(reminder.title, reminder.fireAt);
  const sent = await notifyUser(reminder.user, {
    text: `*Reminder*\n\n${reminder.title}\n\nAdd to Google Calendar: ${gcalUrl}`,
    buttons: [
      { id: 'reminder_done', title: 'Done' },
      { id: 'reminder_snooze', title: 'Snooze 1hr' },
    ],
    template: { name: 'reminder_fire', params: [reminder.title] },
  });
  if (!sent) throw new Error(`Reminder ${reminderId} could not be delivered`);

  log('reminder.fired', { reminderId, userId: reminder.userId });
  emit({ kind: KINDS.REMINDER_FIRED, userId: reminder.userId, summary: reminder.title, payload: { reminderId } });
}

/** Direct delivery (no job queue): one attempt, failure logged. */
async function deliverNow(/** @type {{ id: string }} */ reminder) {
  try {
    await deliverReminder(reminder.id);
  } catch (err) {
    error('reminder.send_failed', { reminderId: reminder.id, err: err.message, retry: 'none (job queue disabled)' });
  }
}

const RETRY_LIMIT = 5;
const RETRY_BASE_MS = 30 * 1000;
const RETRY_MAX_MS = 30 * 60 * 1000;

/**
 * Backoff before retry number `attempts` (1-based): 30s, 60s, 120s, ... capped at 30 min.
 * @param {number} attempts
 */
function retryDelayMs(attempts) {
  return Math.min(RETRY_BASE_MS * 2 ** (attempts - 1), RETRY_MAX_MS);
}

/**
 * Delivery with durable retries but no job queue (serverless, ADR-020): on
 * failure the reminder goes to status "retry" with a backoff stored in the row,
 * and the next tick picks it up. After RETRY_LIMIT failures it is "failed".
 * Same policy as the pg-boss queue (REMINDER_RETRY), kept in Postgres instead.
 * @param {{ id: string }} reminder
 */
async function deliverWithRetry(reminder) {
  try {
    await deliverReminder(reminder.id);
  } catch (err) {
    const row = await prisma.reminder.update({
      where: { id: reminder.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    const giveUp = row.attempts >= RETRY_LIMIT;
    // Conditional: only if still "fired" — the user may have snoozed or rescheduled meanwhile.
    await prisma.reminder.updateMany({
      where: { id: reminder.id, status: 'fired' },
      data: giveUp
        ? { status: 'failed', nextAttemptAt: null }
        : { status: 'retry', nextAttemptAt: new Date(Date.now() + retryDelayMs(row.attempts)) },
    });
    (giveUp ? error : warn)(giveUp ? 'reminder.failed_all_retries' : 'reminder.send_failed', {
      reminderId: reminder.id, attempts: row.attempts, err: err.message,
    });
  }
}

function startReminderPoller() {
  cron.schedule('* * * * *', () => pollDueReminders(deliverNow).catch((err) => error('reminder.poller.error', { err: err.message })));
  log('reminder.poller.started', { mode: 'node-cron' });
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

/** Nightly housekeeping: expired pending actions, old conversation memory. */
async function runDailyCleanup() {
  await cleanupExpired();
  // Conversation memory is short-term by design (privacy): keep 7 days.
  const { count } = await prisma.conversationMessage.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
  });
  if (count) log('conversation.pruned', { count });
  // Webhook de-dupe keys: channels stop retrying within hours, so 3 days is plenty.
  const dedupe = await prisma.processedMessage.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } },
  });
  if (dedupe.count) log('dedupe.pruned', { count: dedupe.count });
}

function startDailyCleanup() {
  cron.schedule('0 3 * * *', () => runDailyCleanup().catch((err) => error('cleanup.error', { err: err.message })), { timezone: 'Asia/Kolkata' });
  log('cleanup.daily.scheduled');
}

/** Fallback scheduling with node-cron (used when the pg-boss job queue is disabled). */
function startScheduler() {
  startReminderPoller();
  startWeeklyDigest();
  startDailyCleanup();
  log('scheduler.started');
}

module.exports = {
  startScheduler, handleReminderReply, sendWeeklyDigests, pollDueReminders, deliverReminder,
  deliverWithRetry, retryDelayMs, RETRY_LIMIT, runDailyCleanup,
};
