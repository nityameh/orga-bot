// @ts-check
// src/auth/index.js
// Composition root for the auth module: wires the service to Prisma and config.
// Other modules import from here, never from the internal files.
// Docs: docs/modules/auth.md

const prisma = require('../db');
const { getConfig } = require('../config');
const { createAuthService } = require('./authService');
const { createPrismaAuthRepository } = require('./prismaAuthRepository');
const { createAuthHttp, SESSION_COOKIE } = require('./http');

const config = getConfig();

const authService = createAuthService({
  repo: createPrismaAuthRepository(prisma),
  dashboardUrl: config.DASHBOARD_URL,
  loginTokenTtlMinutes: config.LOGIN_TOKEN_TTL_MINUTES,
  sessionTtlDays: config.SESSION_TTL_DAYS,
});

const authHttp = createAuthHttp({
  authService,
  findUser: (userId) => prisma.user.findUnique({ where: { id: userId } }),
  secureCookies: config.NODE_ENV === 'production',
});

module.exports = { authService, authHttp, SESSION_COOKIE };
