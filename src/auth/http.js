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
 * @param {(userId: string) => void} [deps.onLogin]  Hook for audit/analytics (keeps this module decoupled)
 * @param {(code: unknown) => Promise<{ ok: true, userId: string } | { ok: false, reason: string }>} [deps.redeemInvite]
 *   Invite redemption (src/invites), injected so auth doesn't depend on invites
 * @param {() => { telegram: string | null, whatsapp: string | null }} [deps.inviteChannels]
 *   Chat apps a new user can join from (public handles for deep links, ADR-021)
 */
function createAuthHttp({ authService, findUser, secureCookies, onLogin, redeemInvite, inviteChannels }) {
  const isExchangeLimited = createRateLimiter({ limit: 10, windowMs: 60 * 1000 });
  const isInviteLimited = createRateLimiter({ limit: 10, windowMs: 60 * 1000 });

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
   * Second CSRF layer: state-changing requests must declare JSON. Browsers cannot
   * send a cross-site request with `Content-Type: application/json` without a CORS
   * preflight, which our CORS policy only allows for the dashboard origin.
   * Checks the header, not the parsed body: bodiless DELETEs are legitimate, and
   * `req.is()` returns null when there is no body.
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {express.NextFunction} next
   */
  function requireJsonForMutations(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const contentType = (req.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('application/json')) {
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
      onLogin?.(result.userId);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Which "Continue on…" buttons the invite page shows (ADR-021). Public: these are
  // the bot's username and the business number, never secrets or invite data.
  router.get('/invite/channels', (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json(inviteChannels?.() ?? { telegram: null, whatsapp: null });
  });

  // Invite link → new account + session (ADR-018).
  router.post('/invite', async (req, res, next) => {
    try {
      if (!redeemInvite) return res.status(404).json({ error: 'Invites are not enabled' });
      const ip = req.ip || 'unknown';
      if (isInviteLimited(ip)) {
        warn('auth.invite_rate_limited', { ip });
        return res.status(429).json({ error: 'Too many attempts. Try again in a minute.' });
      }
      const result = await redeemInvite(req.body?.code);
      if (!result.ok) {
        const messages = /** @type {Record<string, string>} */ ({
          invalid: 'This invite link is not valid.',
          expired: 'This invite has expired. Ask for a new one.',
          used_up: 'This invite has already been used.',
        });
        return res.status(result.reason === 'invalid' ? 404 : 410).json({ error: messages[result.reason] ?? messages.invalid, reason: result.reason });
      }
      const session = await authService.createSessionFor(result.userId, req.get('user-agent'));
      res.cookie(SESSION_COOKIE, session.sessionToken, { ...cookieOptions, expires: session.expiresAt });
      log('auth.invite_redeemed', { userId: result.userId });
      onLogin?.(result.userId);
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
