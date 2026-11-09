// @ts-check
// src/invites/service.js
// Invite-only access (ADR-018), Instinct-style. An admin creates an invite link;
// opening it creates an account and signs the person in, with web chat ready,
// so nobody needs a particular phone number to try Orga.
//   createInvite()  → { code: "ORGA-K7PM-Q2XD", url, expiresAt }
//   redeemInvite()           → new user + web identity, or a reason it failed
//   redeemInviteForChannel() → new user already linked to a Telegram/WhatsApp chat (ADR-021)
// Codes are stored hashed; uses are claimed atomically.
// Docs: docs/modules/invites.md

const crypto = require('crypto');

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/O/1/I/L: easy to read aloud
const hash = (/** @type {string} */ code) => crypto.createHash('sha256').update(code).digest('hex');

/** @returns {string} e.g. "ORGA-K7PM-Q2XD" (~8.5e11 combinations) */
function generateInviteCode() {
  const chars = [...crypto.randomBytes(8)].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `ORGA-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** Accept "orga k7pm q2xd", "K7PMQ2XD", etc. @param {unknown} input @returns {string | null} */
function normaliseInviteCode(input) {
  if (typeof input !== 'string' || input.length > 40) return null;
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^ORGA/, '');
  return raw.length === 8 && [...raw].every((c) => ALPHABET.includes(c)) ? `ORGA-${raw.slice(0, 4)}-${raw.slice(4)}` : null;
}

/**
 * @param {Object} deps
 * @param {import('@prisma/client').PrismaClient} deps.prisma
 * @param {string} deps.dashboardUrl
 * @param {() => Date} [deps.now]
 */
function createInviteService({ prisma, dashboardUrl, now = () => new Date() }) {
  const base = dashboardUrl.replace(/\/+$/, '');

  /**
   * @param {{ label?: string, maxUses?: number, days?: number, createdById?: string }} [opts]
   */
  async function createInvite({ label, maxUses = 1, days = 7, createdById } = {}) {
    const code = generateInviteCode();
    const expiresAt = new Date(now().getTime() + days * 24 * 60 * 60 * 1000);
    await prisma.invite.create({ data: { codeHash: hash(code), label: label?.slice(0, 80), maxUses, expiresAt, createdById } });
    // Code in the URL fragment: never sent to servers, so it can't leak via logs/Referer.
    return { code, url: `${base}/invite#code=${code}`, expiresAt, maxUses };
  }

  /**
   * Atomically claim one use of an invite.
   * @param {unknown} input
   * @returns {Promise<{ ok: true } | { ok: false, reason: 'invalid' | 'expired' | 'used_up' }>}
   */
  async function claimUse(input) {
    const code = normaliseInviteCode(input);
    if (!code) return { ok: false, reason: 'invalid' };
    const invite = await prisma.invite.findUnique({ where: { codeHash: hash(code) } });
    if (!invite || invite.revokedAt) return { ok: false, reason: 'invalid' };
    if (invite.expiresAt <= now()) return { ok: false, reason: 'expired' };

    // Conditional increment = compare-and-set: concurrent redemptions of the
    // last remaining use can't both succeed.
    const claimed = await prisma.$executeRaw`
      UPDATE "Invite" SET "uses" = "uses" + 1
      WHERE "id" = ${invite.id} AND "uses" < "maxUses" AND "revokedAt" IS NULL AND "expiresAt" > ${now()}`;
    return claimed === 1 ? { ok: true } : { ok: false, reason: 'used_up' };
  }

  /**
   * Redeem an invite from the web: create the account with a web-chat identity
   * (the web channel's externalId is the user id).
   * @param {unknown} input
   * @returns {Promise<{ ok: true, userId: string } | { ok: false, reason: 'invalid' | 'expired' | 'used_up' }>}
   */
  async function redeemInvite(input) {
    const claim = await claimUse(input);
    if (!claim.ok) return claim;
    const user = await prisma.user.create({ data: { phone: null } });
    await prisma.channelIdentity.create({ data: { userId: user.id, channel: 'web', externalId: user.id, lastInboundAt: now() } });
    return { ok: true, userId: user.id };
  }

  /**
   * Redeem an invite from a chat app (ADR-021): the person tapped "Continue on
   * Telegram/WhatsApp" and their first message carries the code, so the account
   * is created already linked to that chat. A message from a WhatsApp number
   * proves the sender owns it, so it is stored as the user's phone.
   * @param {unknown} input
   * @param {{ channel: string, externalId: string, name?: string }} identity
   * @returns {Promise<{ ok: true, userId: string } | { ok: false, reason: 'invalid' | 'expired' | 'used_up' | 'already_joined' }>}
   */
  async function redeemInviteForChannel(input, identity) {
    const where = { channel_externalId: { channel: identity.channel, externalId: identity.externalId } };
    // Checked before claiming so a duplicate delivery doesn't burn another use.
    if (await prisma.channelIdentity.findUnique({ where })) return { ok: false, reason: 'already_joined' };

    const claim = await claimUse(input);
    if (!claim.ok) return claim;
    try {
      // Nested create: user and identity are written in one transaction.
      const user = await prisma.user.create({
        data: {
          phone: identity.channel === 'whatsapp' ? identity.externalId : null,
          identities: { create: { channel: identity.channel, externalId: identity.externalId, displayName: identity.name || null, lastInboundAt: now() } },
        },
      });
      return { ok: true, userId: user.id };
    } catch (err) {
      // Two deliveries of the same first message raced; the other created the account.
      if (/** @type {any} */ (err).code === 'P2002') return { ok: false, reason: 'already_joined' };
      throw err;
    }
  }

  /** @param {string} code */
  async function revokeInvite(code) {
    const normalised = normaliseInviteCode(code);
    if (!normalised) return false;
    const { count } = await prisma.invite.updateMany({ where: { codeHash: hash(normalised), revokedAt: null }, data: { revokedAt: now() } });
    return count === 1;
  }

  return { createInvite, redeemInvite, redeemInviteForChannel, revokeInvite };
}

module.exports = { createInviteService, generateInviteCode, normaliseInviteCode };
