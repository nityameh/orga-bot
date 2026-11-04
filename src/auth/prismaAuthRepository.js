// @ts-check
// src/auth/prismaAuthRepository.js
// Prisma implementation of the AuthRepository port defined in authService.js.
// Docs: docs/modules/auth.md

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {import('./authService').AuthRepository}
 */
function createPrismaAuthRepository(prisma) {
  return {
    async createLoginToken({ userId, tokenHash, expiresAt }) {
      await prisma.loginToken.create({ data: { userId, tokenHash, expiresAt } });
    },

    async consumeLoginToken(tokenHash, now) {
      // Conditional update = atomic compare-and-set. Two concurrent exchanges of
      // the same token cannot both succeed: only one sees count === 1.
      const { count } = await prisma.loginToken.updateMany({
        where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (count !== 1) return null;
      return prisma.loginToken.findUnique({ where: { tokenHash } });
    },

    async createSession({ userId, tokenHash, expiresAt, userAgent }) {
      await prisma.session.create({ data: { userId, tokenHash, expiresAt, userAgent } });
    },

    async findSession(tokenHash) {
      return prisma.session.findUnique({ where: { tokenHash } });
    },

    async touchSession(id, now) {
      await prisma.session.update({ where: { id }, data: { lastSeenAt: now } });
    },

    async revokeSession(tokenHash, now) {
      await prisma.session.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: now } });
    },
  };
}

module.exports = { createPrismaAuthRepository };
