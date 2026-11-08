// @ts-check
// src/integrations/google/client.js
// Authenticated Google API access for one user: loads the encrypted tokens,
// refreshes them shortly before expiry (and once more on a 401), and marks the
// integration expired when Google rejects the refresh token, so the user can be
// asked to reconnect. Calendar and Gmail helpers live in calendar.js / gmail.js.
// Docs: docs/modules/integrations.md

const { GoogleAuthExpiredError } = require('./oauth');

const REFRESH_MARGIN_MS = 60 * 1000;

/** The user has no usable Google connection. Message is safe to show the model/user. */
class GoogleNotConnectedError extends Error {}

/**
 * @typedef {Object} IntegrationStore
 * @property {(userId: string) => Promise<any | null>} find                          active Integration row
 * @property {(id: string, data: Record<string, unknown>) => Promise<void>} update
 */

/**
 * @param {Object} deps
 * @param {IntegrationStore} deps.store
 * @param {import('../tokenVault').TokenVault} deps.vault
 * @param {{ refresh: (refreshToken: string) => Promise<{accessToken: string, refreshToken?: string, expiresAt: Date}> }} deps.oauth
 * @param {(req: { method: string, url: string, token: string, params?: any, data?: any }) => Promise<any>} deps.http
 *   returns response data; throws with err.response.status on HTTP errors
 * @param {(userId: string) => void} [deps.onExpired]
 * @param {() => number} [deps.clock]
 */
function createGoogleClient({ store, vault, oauth, http, onExpired, clock = Date.now }) {
  /** @param {any} integration */
  async function refreshTokens(integration) {
    if (!integration.refreshTokenEnc) throw await expire(integration);
    try {
      const fresh = await oauth.refresh(vault.decrypt(integration.refreshTokenEnc));
      const data = {
        accessTokenEnc: vault.encrypt(fresh.accessToken),
        expiresAt: fresh.expiresAt,
        ...(fresh.refreshToken ? { refreshTokenEnc: vault.encrypt(fresh.refreshToken) } : {}),
      };
      await store.update(integration.id, data);
      return fresh.accessToken;
    } catch (err) {
      if (err instanceof GoogleAuthExpiredError) throw await expire(integration);
      throw err;
    }
  }

  /** @param {any} integration */
  async function expire(integration) {
    await store.update(integration.id, { status: 'expired' });
    onExpired?.(integration.userId);
    return new GoogleNotConnectedError('Google access has expired. Ask the user to reconnect Google from the dashboard (send /login).');
  }

  /**
   * Call a Google API as the user.
   * @param {string} userId
   * @param {{ method?: string, url: string, params?: any, data?: any }} req
   */
  async function request(userId, { method = 'GET', url, params, data }) {
    const integration = await store.find(userId);
    if (!integration) throw new GoogleNotConnectedError("Google isn't connected. The user can connect it from the dashboard (send /login).");

    let token = integration.expiresAt.getTime() - clock() < REFRESH_MARGIN_MS
      ? await refreshTokens(integration)
      : vault.decrypt(integration.accessTokenEnc);

    try {
      return await http({ method, url, token, params, data });
    } catch (err) {
      if (/** @type {any} */ (err).response?.status !== 401) throw err;
      token = await refreshTokens(integration); // token revoked early or clock skew: retry once
      return http({ method, url, token, params, data });
    }
  }

  return { request };
}

/** @typedef {ReturnType<typeof createGoogleClient>} GoogleClient */

module.exports = { createGoogleClient, GoogleNotConnectedError };
