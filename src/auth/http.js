// @ts-check
// src/auth/http.js
// Express adapters for the auth service: session middleware, CSRF guard and
// the /auth routes (exchange, logout, me).
// Docs: docs/modules/auth.md

const express = require('express');
const { createRateLimiter } = require('../ratelimiter');
const { warn, log } = require('../logger');

const SESSION_COOKIE = 'orga_session';

/**
 * @param {Object} deps
 * @param {import('./authService').AuthService} deps.authService
 * @param {(userId: string) => Promise<unknown | null>} deps.findUser
 * @param {boolean} deps.secureCookies  true in production (HTTPS only)
 */
function createAuthHttp({ authService, findUser, secureCookies }) {
  const isExchangeLimited = createRateLimiter({ limit: 10, windowMs: 60 * 1000 });

  /** @type {express.CookieOptions} */
  const cookieOptions = {
    httpOnly: true, // not readable from JavaScript → XSS cannot steal it
    secure: secureCookies,
    sameSite: 'lax', // not sent on cross-site POSTs → first CSRF layer
    path: '/',
  };

  /**
   * Requires a valid session cookie; attaches req.user. userId always comes from
   * the session, never from query params or headers (ADR-006).
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {express.NextFunction} next
   */
  async function requireSession(req, res, next) {
    try {
      const userId = await authService.resolveSession(req.cookies?.[SESSION_COOKIE]);
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });

      const user = await findUser(userId);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });

      // @ts-ignore — augmenting Express request
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  }

  /**
   * Second CSRF layer: state-changing requests must be JSON. Browsers cannot send
   * a cross-site `application/json` request without a CORS preflight, which our
   * CORS policy only allows for the dashboard origin.
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {express.NextFunction} next
   */
  function requireJsonForMutations(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (!req.is('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json' });
    }
    next();
  }

  const router = express.Router();

  router.post('/exchange', async (req, res, next) => {
    try {
      const ip = req.ip || 'unknown';
      if (isExchangeLimited(ip)) {
        warn('auth.exchange_rate_limited', { ip });
        return res.status(429).json({ error: 'Too many attempts. Try again in a minute.' });
      }

      const result = await authService.exchangeLoginToken(req.body?.token, req.get('user-agent'));
      if (!result) {
        warn('auth.exchange_failed', { ip });
        return res.status(401).json({ error: 'This login link is invalid or has expired. Send /login again.' });
      }

      res.cookie(SESSION_COOKIE, result.sessionToken, { ...cookieOptions, expires: result.expiresAt });
      log('auth.login', { userId: result.userId });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', async (req, res, next) => {
    try {
      await authService.revokeSession(req.cookies?.[SESSION_COOKIE]);
      res.clearCookie(SESSION_COOKIE, cookieOptions);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', requireSession, (req, res) => {
    // @ts-ignore
    const { id, tier, lang, createdAt } = req.user;
    res.json({ id, tier, lang, createdAt });
  });

  return { router, requireSession, requireJsonForMutations };
}

module.exports = { createAuthHttp, SESSION_COOKIE };
