// @ts-check
// src/invites/index.js
// Composition root for invites.
// Docs: docs/modules/invites.md

const prisma = require('../db');
const { getConfig } = require('../config');
const { createInviteService } = require('./service');

const { notifyUser } = require('../channels');
const { emit, KINDS } = require('../interactions');

const invites = createInviteService({ prisma, dashboardUrl: getConfig().DASHBOARD_URL });

const WELCOME = [
  '*Welcome to Orga 👋*',
  '',
  'I keep your notes, tasks and reminders, and I can work with your Google Calendar and Gmail.',
  'Try: "remind me tomorrow 9am to call Ravi" or "note: Acme wants the logo in blue".',
  'Use me here, or send /link from WhatsApp/Telegram to connect them.',
].join('\n');

/**
 * Redeem an invite and greet the new user in their web chat.
 * @param {unknown} code
 */
async function redeemAndWelcome(code) {
  const result = await invites.redeemInvite(code);
  if (result.ok) {
    emit({ kind: KINDS.USER_CREATED, userId: result.userId, channel: 'web', payload: { via: 'invite' } });
    await notifyUser({ id: result.userId }, { text: WELCOME });
  }
  return result;
}

module.exports = { invites, redeemAndWelcome };
