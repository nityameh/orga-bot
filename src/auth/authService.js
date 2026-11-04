// @ts-check
// src/auth/authService.js
// Business logic for dashboard login (ADR-006): issue magic links, exchange them
// for sessions, resolve and revoke sessions.
//
// Depends on an AuthRepository interface (Dependency Inversion), so it can be
// unit-tested with an in-memory repository and backed by Prisma in production.
// Docs: docs/modules/auth.md

const { generateToken, hashToken, isWellFormedToken } = require('./tokens');

/**
 * @typedef {Object} LoginTokenRecord
 * @property {string} id
 * @property {string} userId
 * @property {Date} expiresAt
 * @property {Date | null} usedAt
 */

/**
 * @typedef {Object} SessionRecord
 * @property {string} id
 * @property {string} userId
 * @property {Date} expiresAt
 * @property {Date | null} revokedAt
 * @property {Date} lastSeenAt
 */

/**
 * Storage port for auth. Implementations: prismaAuthRepository (prod),
 * an in-memory fake (tests).
 * @typedef {Object} AuthRepository
 * @property {(data: {userId: string, tokenHash: string, expiresAt: Date}) => Promise<void>} createLoginToken
 * @property {(tokenHash: string, now: Date) => Promise<LoginTokenRecord | null>} consumeLoginToken
 *   Atomically marks an unused, unexpired token as used and returns it; null otherwise.
 * @property {(data: {userId: string, tokenHash: string, expiresAt: Date, userAgent?: string}) => Promise<void>} createSession
 * @property {(tokenHash: string) => Promise<SessionRecord | null>} findSession
 * @property {(id: string, now: Date) => Promise<void>} touchSession
 * @property {(tokenHash: string, now: Date) => Promise<void>} revokeSession
 */

const TOUCH_INTERVAL_MS = 5 * 60 * 1000; // avoid a DB write on every request

/**
 * @param {Object} deps
 * @param {AuthRepository} deps.repo
 * @param {string} deps.dashboardUrl  Base URL of the dashboard (no trailing slash needed)
 * @param {number} deps.loginTokenTtlMinutes
 * @param {number} deps.sessionTtlDays
 * @param {() => Date} [deps.now]  Injectable clock for tests
 */
function createAuthService({ repo, dashboardUrl, loginTokenTtlMinutes, sessionTtlDays, now = () => new Date() }) {
  const base = dashboardUrl.replace(/\/+$/, '');

  /**
   * Create a one-time login link for a user who proved identity by messaging
   * us from their chat account. The token goes in the URL fragment (#) so it is
   * never sent to any server in a request line, access log or Referer header.
   * @param {string} userId
   * @returns {Promise<{url: string, expiresAt: Date}>}
   */
  async function issueLoginLink(userId) {
    const token = generateToken();
    const expiresAt = new Date(now().getTime() + loginTokenTtlMinutes * 60 * 1000);
    await repo.createLoginToken({ userId, tokenHash: hashToken(token), expiresAt });
    return { url: `${base}/auth/callback#token=${token}`, expiresAt };
  }

  /**
   * Exchange a login token for a new session. Single use: a second exchange of
   * the same token fails even within the expiry window.
   * @param {unknown} token
   * @param {string} [userAgent]
   * @returns {Promise<{sessionToken: string, userId: string, expiresAt: Date} | null>}
   */
  async function exchangeLoginToken(token, userAgent) {
    if (!isWellFormedToken(token)) return null;

    const record = await repo.consumeLoginToken(hashToken(token), now());
    if (!record) return null;

    const sessionToken = generateToken();
    const expiresAt = new Date(now().getTime() + sessionTtlDays * 24 * 60 * 60 * 1000);
    await repo.createSession({
      userId: record.userId,
      tokenHash: hashToken(sessionToken),
      expiresAt,
      userAgent: userAgent?.slice(0, 256),
    });
    return { sessionToken, userId: record.userId, expiresAt };
  }

  /**
   * Resolve a session cookie value to a userId, or null if invalid/expired/revoked.
   * @param {unknown} sessionToken
   * @returns {Promise<string | null>}
   */
  async function resolveSession(sessionToken) {
    if (!isWellFormedToken(sessionToken)) return null;

    const session = await repo.findSession(hashToken(sessionToken));
    const at = now();
    if (!session || session.revokedAt || session.expiresAt <= at) return null;

    if (at.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await repo.touchSession(session.id, at);
    }
    return session.userId;
  }

  /**
   * Revoke a session (logout). Idempotent; unknown tokens are ignored.
   * @param {unknown} sessionToken
   */
  async function revokeSession(sessionToken) {
    if (!isWellFormedToken(sessionToken)) return;
    await repo.revokeSession(hashToken(sessionToken), now());
  }

  return { issueLoginLink, exchangeLoginToken, resolveSession, revokeSession };
}

/** @typedef {ReturnType<typeof createAuthService>} AuthService */

module.exports = { createAuthService };
