// @ts-check
// src/invites/onboarding.js
// What happens when a chat Orga has never seen sends a message (ADR-021).
// Orga is invite-only, so an unknown chat becomes an account only if its
// message carries a valid invite code or a link code:
//   "/start ORGA-K7PM-Q2XD"  Telegram deep link (t.me/<bot>?start=<code>)
//   "join ORGA-K7PM-Q2XD"    WhatsApp click-to-chat (wa.me/<number>?text=join <code>)
//   "ORGA-K7PM-Q2XD"         the code pasted on its own
//   "/link K7PM-Q2XD"        attach this chat to an existing account
// Anything else gets a short "invite-only" reply: no account, no LLM call.
//   parseOnboarding()   pure: message text → what the sender is trying to do
//   createOnboarding()  handler with injected dependencies
// Docs: docs/modules/invites.md

/**
 * @typedef {{ kind: 'invite', code: string } | { kind: 'link', code: string } | { kind: 'none' }} OnboardingIntent
 */

/**
 * @param {string} text
 * @returns {OnboardingIntent}
 */
function parseOnboarding(text) {
  const t = String(text ?? '').trim();
  const link = t.match(/^\/link(?:@\w+)?\s+(.+)$/i);
  if (link) return { kind: 'link', code: link[1] };
  const start = t.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i); // Telegram sends the deep-link payload after /start
  if (start) return start[1] ? { kind: 'invite', code: start[1] } : { kind: 'none' };
  const join = t.match(/^join\s+(.+)$/i);
  if (join) return { kind: 'invite', code: join[1] };
  if (/^orga[\s-]*[a-z0-9]{4}[\s-]*[a-z0-9]{4}$/i.test(t)) return { kind: 'invite', code: t };
  return { kind: 'none' };
}

const MESSAGES = {
  inviteOnly: [
    '*Hi, I\'m Orga* 👋',
    '',
    'Orga is invite-only for now.',
    '• Got an invite link? Open it and tap *Continue* for this app.',
    '• Already use Orga? Send /link in your Orga chat, then send me the code it gives you.',
  ].join('\n'),
  invalid: 'That invite code isn\'t valid. Check the link, or ask the person who invited you for a new one.',
  expired: 'That invite has expired. Ask the person who invited you for a new one.',
  used_up: 'That invite has already been used. Ask the person who invited you for a new one.',
  linkFailed: 'That link code is invalid or expired. Send /link in your Orga chat to get a new one (it lasts 10 minutes).',
  linked: '✅ *Linked.* This chat now uses your existing Orga account: same notes, tasks and reminders.',
  limited: 'Too many attempts. Please wait a few minutes and try again.',
};

/**
 * @param {Object} deps
 * @param {(code: unknown, identity: { channel: string, externalId: string, name?: string }) => Promise<{ ok: true, userId: string } | { ok: false, reason: string }>} deps.redeemInviteForChannel
 * @param {(code: string, inbound: any) => Promise<{ ok: true, userId: string } | { ok: false }>} deps.linkNewIdentity
 * @param {(message: any, text: string) => Promise<unknown>} deps.reply
 * @param {(userId: string, message: any) => Promise<unknown>} deps.welcome  greets a brand-new account
 * @param {(key: string) => boolean} deps.isAttemptLimited  guessing codes must be slow
 * @param {(event: string, fields: Record<string, unknown>) => void} deps.log
 */
function createOnboarding({ redeemInviteForChannel, linkNewIdentity, reply, welcome, isAttemptLimited, log }) {
  /**
   * Handle one message from a chat that has no account.
   * @param {import('../channels/types').InboundMessage} message
   * @returns {Promise<'joined' | 'linked' | 'rejected' | 'ignored'>}
   */
  return async function onboardUnknownChat(message) {
    const intent = parseOnboarding(message.text);
    if (intent.kind === 'none') {
      log('onboarding.invite_required', { channel: message.channel });
      await reply(message, MESSAGES.inviteOnly);
      return 'rejected';
    }

    if (isAttemptLimited(`${message.channel}:${message.externalId}`)) {
      log('onboarding.rate_limited', { channel: message.channel });
      await reply(message, MESSAGES.limited);
      return 'rejected';
    }

    if (intent.kind === 'link') {
      const result = await linkNewIdentity(intent.code, message);
      await reply(message, result.ok ? MESSAGES.linked : MESSAGES.linkFailed);
      return result.ok ? 'linked' : 'rejected';
    }

    const result = await redeemInviteForChannel(intent.code, { channel: message.channel, externalId: message.externalId, name: message.name });
    if (result.ok) {
      log('onboarding.joined', { channel: message.channel, userId: result.userId });
      await welcome(result.userId, message);
      return 'joined';
    }
    // A duplicate delivery of the joining message: the first one already replied.
    if (result.reason === 'already_joined') return 'ignored';
    log('onboarding.invite_failed', { channel: message.channel, reason: result.reason });
    await reply(message, MESSAGES[/** @type {'invalid' | 'expired' | 'used_up'} */ (result.reason)] ?? MESSAGES.invalid);
    return 'rejected';
  };
}

module.exports = { parseOnboarding, createOnboarding, MESSAGES };
