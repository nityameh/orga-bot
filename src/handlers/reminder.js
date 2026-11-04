// src/handlers/reminder.js
// Saves a reminder to Postgres and confirms to user.
// Actual firing happens in scheduler.js — not here.

const prisma = require('../db');
const { sendMessage } = require('../sender');
const { log } = require('../logger');
const { getGoogleCalUrl } = require('../ical');

async function handleReminder(user, intent, message) {
  if (!intent.datetime) {
    await sendMessage(
      message.from,
      `*Reminder*\n\nWhen should I remind you?\n"remind me tomorrow 9am to ${intent.title}"\n"remind me in 2 hours to ${intent.title}"`
    );
    return;
  }

  const fireAt = new Date(intent.datetime);

  if (fireAt <= new Date()) {
    await sendMessage(
      message.from,
      `*Reminder*\n\nThat time has already passed. Try a future time:\n"remind me tomorrow 9am to ${intent.title}"`
    );
    return;
  }

  const reminder = await prisma.reminder.create({
    data: {
      userId: user.id,
      title:  intent.title,
      fireAt,
      status: 'pending',
    },
  });

  const fireAtIST = fireAt.toLocaleString('en-IN', {
    weekday:  'short',
    month:    'short',
    day:      'numeric',
    hour:     '2-digit',
    minute:   '2-digit',
    timeZone: 'Asia/Kolkata',
    hour12:   true,
  });

  const gcalUrl = getGoogleCalUrl(reminder.title, reminder.fireAt);

  const reply = [
    `*Reminder set*`,
    ``,
    `${reminder.title}`,
    `${fireAtIST}`,
    ``,
    `Add to Google Calendar: ${gcalUrl}`,
  ].join('\n');

  await sendMessage(message.from, reply);
  log('reminder.created', { userId: user.id, reminderId: reminder.id, fireAt: reminder.fireAt });
}

async function snoozeReminder(reminderId, minutes = 60) {
  const snoozeUntil = new Date(Date.now() + minutes * 60 * 1000);

  await prisma.reminder.update({
    where: { id: reminderId },
    data: {
      status:      'snoozed',
      snoozeUntil,
      fireAt:      snoozeUntil,
    },
  });

  return snoozeUntil;
}

async function markReminderDone(reminderId) {
  await prisma.reminder.update({
    where: { id: reminderId },
    data:  { status: 'done' },
  });
}

module.exports = { handleReminder, snoozeReminder, markReminderDone };
