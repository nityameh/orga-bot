// @ts-check
// src/users/identity.js
// Maps channel identities (WhatsApp number, Telegram chat id) to Orga users,
// and links several channels to one user with short-lived link codes.
// Docs: docs/modules/users.md

const crypto = require('crypto');
const prisma = require('../db');
const { emit, KINDS } = require('../interactions');
const { log } = require('../logger');

const LINK_CODE_TTL_MINUTES = 10;
// Unambiguous alphabet (no 0/O, 1/I/L): 31^8 ≈ 8.5e11 combinations.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Find or create the user behind an inbound message and record activity.
 * Concurrency-safe: if two first messages race, the unique (channel,
 * externalId) constraint makes one create fail; we then read the winner.
 * @param {import('../channels/types').InboundMessage} inbound
 * @returns {Promise<{ user: import('@prisma/client').User, isNew: boolean }>}
 */
async function resolveUser(inbound) {
  const where = { channel_externalId: { channel: inbound.channel, externalId: inbound.externalId } };
  const now = new Date();

  const existing = await prisma.channelIdentity.findUnique({ where, include: { user: true } });
  if (existing) {
    await prisma.channelIdentity.update({
      where: { id: existing.id },
      data: { lastInboundAt: now, ...(inbound.name ? { displayName: inbound.name } : {}) },
    });
    return { user: existing.user, isNew: false };
  }

  try {
    const user = await prisma.user.create({
      data: {
        phone: inbound.channel === 'whatsapp' ? inbound.externalId : null,
        identities: {
          create: { channel: inbound.channel, externalId: inbound.externalId, displayName: inbound.name || null, lastInboundAt: now },
        },
      },
    });
    emit({ kind: KINDS.USER_CREATED, userId: user.id, channel: inbound.channel });
    return { user, isNew: true };
  } catch (err) {
    if (/** @type {any} */ (err).code !== 'P2002') throw err;
    const winner = await prisma.channelIdentity.findUnique({ where, include: { user: true } });
    if (!winner) throw err;
    return { user: winner.user, isNew: false };
  }
}

/** @returns {string} e.g. "K7PM-Q2XD" */
function generateLinkCode() {
  const bytes = crypto.randomBytes(8);
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** Normalise user input: case-insensitive, dash and spaces optional. */
function normaliseLinkCode(/** @type {string} */ input) {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : null;
}

const hash = (/** @type {string} */ code) => crypto.createHash('sha256').update(code).digest('hex');

/**
 * Create a code the user types on another channel to join it to this account.
 * @param {string} userId
 */
async function createLinkCode(userId) {
  const code = generateLinkCode();
  await prisma.linkCode.deleteMany({ where: { userId } }); // one active code per user
  await prisma.linkCode.create({
    data: { userId, codeHash: hash(code), expiresAt: new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60 * 1000) },
  });
  return { code, ttlMinutes: LINK_CODE_TTL_MINUTES };
}

/**
 * Attach the sender's channel identity to the account that issued `input`.
 * The sender's current account is merged away only if it holds no data, so
 * linking can never silently destroy notes.
 * @param {string} input
 * @param {{ id: string }} currentUser
 * @param {import('../channels/types').InboundMessage} inbound
 * @returns {Promise<'linked' | 'invalid' | 'same_account' | 'has_data'>}
 */
async function consumeLinkCode(input, currentUser, inbound) {
  const code = normaliseLinkCode(input);
  if (!code) return 'invalid';

  const record = await prisma.linkCode.findUnique({ where: { codeHash: hash(code) } });
  if (!record || record.expiresAt <= new Date()) return 'invalid';
  if (record.userId === currentUser.id) return 'same_account';

  const [notes, tasks, reminders] = await Promise.all([
    prisma.note.count({ where: { userId: currentUser.id } }),
    prisma.task.count({ where: { userId: currentUser.id } }),
    prisma.reminder.count({ where: { userId: currentUser.id } }),
  ]);
  if (notes + tasks + reminders > 0) return 'has_data';

  await prisma.$transaction([
    prisma.linkCode.delete({ where: { id: record.id } }),
    prisma.channelIdentity.update({
      where: { channel_externalId: { channel: inbound.channel, externalId: inbound.externalId } },
      data: { userId: record.userId },
    }),
    prisma.interaction.deleteMany({ where: { userId: currentUser.id } }),
    prisma.pendingAction.deleteMany({ where: { userId: currentUser.id } }),
    prisma.session.deleteMany({ where: { userId: currentUser.id } }),
    prisma.loginToken.deleteMany({ where: { userId: currentUser.id } }),
    prisma.user.delete({ where: { id: currentUser.id } }),
  ]);

  emit({ kind: KINDS.CHANNEL_LINKED, userId: record.userId, channel: inbound.channel });
  log('identity.linked', { userId: record.userId, channel: inbound.channel });
  return 'linked';
}

module.exports = { resolveUser, createLinkCode, consumeLinkCode, normaliseLinkCode, generateLinkCode };
