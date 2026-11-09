// @ts-check
// src/invites/index.js
// Composition root for invites and chat onboarding (ADR-018, ADR-021).
//   invites               createInvite / redeemInvite / redeemInviteForChannel / revokeInvite
//   redeemAndWelcome()    web invite page → account + welcome in web chat
//   onboardUnknownChat()  first message from an unknown Telegram/WhatsApp chat
//   inviteChannels()      public handles for the invite page's "Continue on…" buttons
// Docs: docs/modules/invites.md

const prisma = require('../db');
const { getConfig } = require('../config');
const { createInviteService } = require('./service');
const { createOnboarding } = require('./onboarding');
const { linkNewIdentity } = require('../users/identity');
const { createRateLimiter } = require('../ratelimiter');
const { notifyUser, reply } = require('../channels');
const { emit, KINDS } = require('../interactions');
const { log } = require('../logger');

const config = getConfig();
const invites = createInviteService({ prisma, dashboardUrl: config.DASHBOARD_URL });

/** @param {'web' | 'chat'} where */
const welcomeText = (where) => [
  '*Welcome to Orga 👋*',
  '',
  'I\'m your personal assistant. I keep your notes, tasks and reminders, and I can work with your Google Calendar and Gmail.',
  'You can also ask me anything: questions, explanations, drafting a message, translating, brainstorming.',
  '',
  'Try: "remind me tomorrow 9am to call Ravi" or "explain SIP vs FD simply".',
  where === 'web'
    ? 'Use me here, or send /link to connect WhatsApp or Telegram.'
    : 'Send /login any time to open your dashboard, or /help for commands.',
].join('\n');

/**
 * Redeem an invite and greet the new user in their web chat.
 * @param {unknown} code
 */
async function redeemAndWelcome(code) {
  const result = await invites.redeemInvite(code);
  if (result.ok) {
    emit({ kind: KINDS.USER_CREATED, userId: result.userId, channel: 'web', payload: { via: 'invite' } });
    await notifyUser({ id: result.userId }, { text: welcomeText('web') });
  }
  return result;
}

const onboardUnknownChat = createOnboarding({
  redeemInviteForChannel: invites.redeemInviteForChannel,
  linkNewIdentity,
  reply: (message, text) => reply(message, text),
  welcome: async (userId, message) => {
    emit({ kind: KINDS.USER_CREATED, userId, channel: message.channel, payload: { via: 'invite' } });
    await reply(message, welcomeText('chat'));
  },
  // Guessing codes would grant accounts; 5 attempts per chat per 10 minutes.
  isAttemptLimited: createRateLimiter({ limit: 5, windowMs: 10 * 60 * 1000 }),
  log,
});

/**
 * Which chat apps a new user can join from. Public, non-secret values; a
 * channel is listed only when it is actually configured.
 * @returns {{ telegram: string | null, whatsapp: string | null }}
 */
function inviteChannels() {
  return {
    telegram: config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_BOT_USERNAME ? config.TELEGRAM_BOT_USERNAME : null,
    whatsapp: config.WHATSAPP_TOKEN && config.WHATSAPP_NUMBER ? config.WHATSAPP_NUMBER : null,
  };
}

module.exports = { invites, redeemAndWelcome, onboardUnknownChat, inviteChannels };
