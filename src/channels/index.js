// @ts-check
// src/channels/index.js
// Composition root for channels plus the two functions the rest of the app
// uses to talk to users:
//   reply(message, text, buttons?)   answer an inbound message on its own channel
//   notifyUser(user, outbound)       proactive message on the user's most recent channel
// Handlers never import an adapter directly (ADR-003).
// Docs: docs/modules/channels.md

const prisma = require('../db');
const { getConfig } = require('../config');
const { createChannelRegistry } = require('./registry');
const { createWhatsAppAdapter } = require('./whatsapp');
const { createTelegramAdapter } = require('./telegram');
const { createWebAdapter } = require('./web');
const { emit, KINDS } = require('../interactions');
const { warn } = require('../logger');

const config = getConfig();
const allowUnsigned = config.NODE_ENV !== 'production';

const registry = createChannelRegistry();

registry.register(createWhatsAppAdapter({
  token: config.WHATSAPP_TOKEN,
  phoneNumberId: config.PHONE_NUMBER_ID,
  verifyToken: config.WEBHOOK_VERIFY_TOKEN,
  appSecret: config.APP_SECRET,
  allowUnsigned,
}));

registry.register(createWebAdapter({ prisma }));

registry.register(createTelegramAdapter({
  botToken: config.TELEGRAM_BOT_TOKEN,
  webhookSecret: config.TELEGRAM_WEBHOOK_SECRET,
  allowUnsigned,
}));

/**
 * @param {{ channel: string, externalId: string, userId?: string }} target
 * @param {import('./types').OutboundMessage} outbound
 */
async function deliver(target, outbound) {
  const ok = await registry.get(target.channel).send(target.externalId, outbound);
  if (ok && target.userId) {
    emit({ kind: KINDS.MESSAGE_SENT, userId: target.userId, channel: target.channel, payload: { chars: outbound.text.length } });
  }
  return ok;
}

/**
 * Reply to an inbound message on the channel it came from.
 * @param {import('./types').InboundMessage & { userId?: string }} message
 * @param {string} text
 * @param {import('./types').Button[]} [buttons]
 */
function reply(message, text, buttons) {
  return deliver({ channel: message.channel, externalId: message.externalId, userId: message.userId }, { text, buttons });
}

/**
 * Choose where and how to send a proactive message:
 * the identity the user wrote from most recently; if that channel only allows
 * free-form messages inside a window (WhatsApp 24h) and we're outside it, use
 * the outbound's template instead. Pure; exported for tests.
 * @param {Array<{channel: string, externalId: string, lastInboundAt: Date | null}>} identities
 * @param {(name: string) => import('./types').ChannelCapabilities} capabilitiesOf
 * @param {Date} now
 * @returns {{ identity: {channel: string, externalId: string}, mode: 'freeform' | 'template' } | null}
 */
function planDelivery(identities, capabilitiesOf, now) {
  const sorted = [...identities].sort(
    (a, b) => (b.lastInboundAt?.getTime() ?? 0) - (a.lastInboundAt?.getTime() ?? 0),
  );
  const identity = sorted[0];
  if (!identity) return null;

  const windowHours = capabilitiesOf(identity.channel).freeformWindowHours;
  if (windowHours === null) return { identity, mode: 'freeform' };

  const last = identity.lastInboundAt?.getTime() ?? 0;
  const insideWindow = now.getTime() - last < windowHours * 60 * 60 * 1000;
  return { identity, mode: insideWindow ? 'freeform' : 'template' };
}

/**
 * Send a proactive message to a user (reminders, digests, nudges).
 * @param {{ id: string }} user
 * @param {import('./types').OutboundMessage} outbound
 * @returns {Promise<boolean>}
 */
async function notifyUser(user, outbound) {
  const identities = await prisma.channelIdentity.findMany({
    where: { userId: user.id },
    select: { channel: true, externalId: true, lastInboundAt: true },
  });
  const plan = planDelivery(
    identities.filter((i) => registry.has(i.channel)),
    (name) => registry.get(name).capabilities,
    new Date(),
  );
  if (!plan) {
    warn('notify.no_identity', { userId: user.id });
    return false;
  }

  const target = { ...plan.identity, userId: user.id };
  if (plan.mode === 'template') {
    const adapter = registry.get(target.channel);
    if (!outbound.template || !adapter.sendTemplate) {
      warn('notify.outside_window_no_template', { userId: user.id, channel: target.channel });
      return false;
    }
    const ok = await adapter.sendTemplate(target.externalId, outbound.template);
    if (ok) emit({ kind: KINDS.MESSAGE_SENT, userId: user.id, channel: target.channel, payload: { template: outbound.template.name } });
    return ok;
  }
  return deliver(target, outbound);
}

module.exports = { registry, reply, notifyUser, planDelivery };
