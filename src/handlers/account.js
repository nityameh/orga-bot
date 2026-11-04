// src/handlers/account.js
// Account-level chat commands:
//   /login             → sends a one-time dashboard login link (ADR-006)
//   /link [code]       → link another chat app (WhatsApp ⇄ Telegram) to this account
//   delete my data     → asks for confirmation
//   confirm delete     → permanently deletes the user and all their data
// Docs: docs/modules/handlers.md

const prisma = require('../db');
const { reply } = require('../channels');
const { authService } = require('../auth');
const { createLinkCode, consumeLinkCode } = require('../users/identity');
const { createRateLimiter } = require('../ratelimiter');
const { log } = require('../logger');

const DELETE_CONFIRM_TTL_MINUTES = 5;
// Guessing a link code would hijack an account; limit attempts per chat identity.
const isLinkAttemptLimited = createRateLimiter({ limit: 5, windowMs: 10 * 60 * 1000 });
const ACCOUNT_DELETE_TYPE = 'account_delete'; // not "confirm_*": numbered replies must not trigger it

async function handleLogin(user, message) {
  const { url } = await authService.issueLoginLink(user.id);
  await reply(message,
    [
      `*Dashboard login*`,
      ``,
      `Tap to sign in (works once, expires in 10 minutes):`,
      url,
      ``,
      `Didn't ask for this? Ignore it — nobody can use it without this chat.`,
    ].join('\n'),
  );
  log('auth.login_link_issued', { userId: user.id });
}

/**
 * "/link" → issue a code. "/link CODE" (sent from the other app) → join that account.
 */
async function handleLink(user, message) {
  const arg = message.text.trim().slice('/link'.length).trim();

  if (!arg) {
    const { code, ttlMinutes } = await createLinkCode(user.id);
    await reply(message, [
      `*Link another app*`,
      ``,
      `Open Orga on your other chat app and send:`,
      `/link ${code}`,
      ``,
      `Expires in ${ttlMinutes} minutes.`,
    ].join('\n'));
    return;
  }

  if (isLinkAttemptLimited(`${message.channel}:${message.externalId}`)) {
    await reply(message, `Too many attempts. Try again in a few minutes.`);
    return;
  }

  const result = await consumeLinkCode(arg, user, message);
  const replies = {
    linked: `*Linked*\n\nThis chat is now connected to your Orga account. Your notes, tasks and reminders are available here.`,
    invalid: `That code is invalid or expired. Send /link in your other app to get a new one.`,
    same_account: `This chat is already part of that account.`,
    has_data: `This chat already has its own notes or tasks, so I can't merge it automatically. Send DELETE MY DATA here first if you don't need them, then try again.`,
  };
  await reply(message, replies[result]);
}

async function handleDeleteMyDataRequest(user, message) {
  await prisma.pendingAction.deleteMany({ where: { userId: user.id, type: ACCOUNT_DELETE_TYPE } });
  await prisma.pendingAction.create({
    data: {
      userId: user.id,
      type: ACCOUNT_DELETE_TYPE,
      items: [],
      expiresAt: new Date(Date.now() + DELETE_CONFIRM_TTL_MINUTES * 60 * 1000),
    },
  });
  await reply(message,
    `*Delete all your data?*\n\nThis permanently deletes every note, task, reminder and dashboard session. It cannot be undone.\n\nReply CONFIRM DELETE within ${DELETE_CONFIRM_TTL_MINUTES} minutes to proceed.`,
  );
  log('user.deletion_requested', { userId: user.id });
}

/** @returns {Promise<boolean>} true if a pending request existed and was executed */
async function handleDeleteMyDataConfirm(user, message) {
  const pending = await prisma.pendingAction.findFirst({
    where: { userId: user.id, type: ACCOUNT_DELETE_TYPE, expiresAt: { gt: new Date() } },
  });
  if (!pending) return false;

  // Explicit child deletes in one transaction: works with or without FK cascades.
  await prisma.$transaction([
    prisma.note.deleteMany({ where: { userId: user.id } }),
    prisma.task.deleteMany({ where: { userId: user.id } }),
    prisma.reminder.deleteMany({ where: { userId: user.id } }),
    prisma.pendingAction.deleteMany({ where: { userId: user.id } }),
    prisma.loginToken.deleteMany({ where: { userId: user.id } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.linkCode.deleteMany({ where: { userId: user.id } }),
    prisma.interaction.deleteMany({ where: { userId: user.id } }),
    prisma.channelIdentity.deleteMany({ where: { userId: user.id } }),
    prisma.user.delete({ where: { id: user.id } }),
  ]);

  await reply(message, `*Deleted*\n\nAll your data has been permanently removed. Message me again any time to start fresh.`);
  log('user.deleted', { userId: user.id });
  return true;
}

module.exports = { handleLogin, handleLink, handleDeleteMyDataRequest, handleDeleteMyDataConfirm };
