// test/fakes/inMemoryAuthRepository.js
// In-memory implementation of the AuthRepository port (src/auth/authService.js).
// Lets the auth service be tested fast and deterministically without Postgres.

function createInMemoryAuthRepository() {
  const loginTokens = new Map(); // tokenHash → record
  const sessions = new Map();    // tokenHash → record
  let seq = 0;

  return {
    loginTokens,
    sessions,

    async createLoginToken({ userId, tokenHash, expiresAt }) {
      loginTokens.set(tokenHash, { id: `lt_${++seq}`, userId, tokenHash, expiresAt, usedAt: null });
    },

    async consumeLoginToken(tokenHash, now) {
      const t = loginTokens.get(tokenHash);
      if (!t || t.usedAt || t.expiresAt <= now) return null;
      t.usedAt = now;
      return t;
    },

    async createSession({ userId, tokenHash, expiresAt, userAgent }) {
      sessions.set(tokenHash, {
        id: `s_${++seq}`, userId, tokenHash, expiresAt, userAgent,
        revokedAt: null, lastSeenAt: new Date(0),
      });
    },

    async findSession(tokenHash) {
      return sessions.get(tokenHash) || null;
    },

    async touchSession(id, now) {
      for (const s of sessions.values()) if (s.id === id) s.lastSeenAt = now;
    },

    async revokeSession(tokenHash, now) {
      const s = sessions.get(tokenHash);
      if (s && !s.revokedAt) s.revokedAt = now;
    },
  };
}

module.exports = { createInMemoryAuthRepository };
