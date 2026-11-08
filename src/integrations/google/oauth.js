// @ts-check
// src/integrations/google/oauth.js
// Google OAuth 2.0 authorization-code flow with PKCE (RFC 7636).
// The `state` parameter is the vault-encrypted {userId, PKCE verifier, expiry}:
// tamper-proof (GCM tag), short-lived, and needs no server-side session table.
// Docs: docs/modules/integrations.md

const crypto = require('crypto');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const STATE_TTL_MS = 10 * 60 * 1000;

// Least privilege (ADR-010): read/write calendar events only, read-only Gmail.
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
];

/** Raised when Google refuses a refresh token (revoked, or 7-day Testing-mode expiry). */
class GoogleAuthExpiredError extends Error {}

/**
 * @param {Object} deps
 * @param {string} deps.clientId
 * @param {string} deps.clientSecret
 * @param {string} deps.redirectUri
 * @param {import('../tokenVault').TokenVault} deps.vault
 * @param {(url: string, body: URLSearchParams) => Promise<any>} deps.postForm  returns parsed JSON; throws with err.response.data on HTTP errors
 * @param {() => number} [deps.clock]
 */
function createGoogleOAuth({ clientId, clientSecret, redirectUri, vault, postForm, clock = Date.now }) {
  /** @param {string} userId */
  function buildAuthUrl(userId) {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const state = vault.encrypt(JSON.stringify({ u: userId, v: verifier, exp: clock() + STATE_TTL_MS }));

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',        // we need a refresh token
      prompt: 'consent',             // ...even if the user connected before
      include_granted_scopes: 'true',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: Buffer.from(state).toString('base64url'),
    });
    return `${AUTH_URL}?${params}`;
  }

  /**
   * Validate the callback state. Returns null for tampered, malformed or expired state.
   * @param {unknown} state
   * @returns {{ userId: string, verifier: string } | null}
   */
  function parseState(state) {
    if (typeof state !== 'string' || state.length > 2000) return null;
    try {
      const data = JSON.parse(vault.decrypt(Buffer.from(state, 'base64url').toString('utf8')));
      if (typeof data.u !== 'string' || typeof data.v !== 'string' || typeof data.exp !== 'number') return null;
      if (data.exp < clock()) return null;
      return { userId: data.u, verifier: data.v };
    } catch {
      return null;
    }
  }

  /**
   * Exchange the authorization code for tokens.
   * @param {string} code @param {string} verifier
   */
  async function exchangeCode(code, verifier) {
    const data = await postForm(TOKEN_URL, new URLSearchParams({
      code, code_verifier: verifier, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    }));
    return normaliseTokens(data);
  }

  /** @param {string} refreshToken */
  async function refresh(refreshToken) {
    try {
      const data = await postForm(TOKEN_URL, new URLSearchParams({
        refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token',
      }));
      return normaliseTokens(data);
    } catch (err) {
      if (/** @type {any} */ (err).response?.data?.error === 'invalid_grant') throw new GoogleAuthExpiredError('Google access expired or was revoked');
      throw err;
    }
  }

  /** Best effort: revoke at Google when the user disconnects. @param {string} token */
  async function revoke(token) {
    await postForm(REVOKE_URL, new URLSearchParams({ token })).catch(() => {});
  }

  /** @param {any} data */
  function normaliseTokens(data) {
    let email = null;
    if (data.id_token) {
      // We received the ID token directly from Google's token endpoint over TLS,
      // so reading its payload without signature verification is acceptable here.
      try { email = JSON.parse(Buffer.from(data.id_token.split('.')[1], 'base64url').toString()).email ?? null; } catch { /* no email */ }
    }
    return {
      accessToken: /** @type {string} */ (data.access_token),
      refreshToken: /** @type {string | undefined} */ (data.refresh_token),
      expiresAt: new Date(clock() + (Number(data.expires_in) || 3600) * 1000),
      scopes: typeof data.scope === 'string' ? data.scope.split(' ') : SCOPES,
      email,
    };
  }

  return { buildAuthUrl, parseState, exchangeCode, refresh, revoke };
}

module.exports = { createGoogleOAuth, GoogleAuthExpiredError, SCOPES };
