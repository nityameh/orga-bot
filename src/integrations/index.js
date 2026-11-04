// @ts-check
// src/integrations/index.js
// Composition root for third-party integrations. Google is enabled only when
// GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI and TOKEN_ENC_KEY are all configured.
// Docs: docs/modules/integrations.md

const axios = require('axios').default; // .default: typed CJS access
const prisma = require('../db');
const { getConfig } = require('../config');
const { createTokenVault } = require('./tokenVault');
const { createGoogleOAuth } = require('./google/oauth');
const { createGoogleClient } = require('./google/client');
const { createGoogleApi } = require('./google/api');
const { emit, KINDS } = require('../interactions');
const { notifyUser } = require('../channels');
const { log } = require('../logger');

const config = getConfig();
const googleEnabled = Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_REDIRECT_URI && config.TOKEN_ENC_KEY);

/** Repeated keys for arrays (Google expects ?h=From&h=Subject, not h[]=...). */
function toQuery(/** @type {Record<string, unknown>} */ params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    for (const item of Array.isArray(v) ? v : [v]) if (item !== undefined) q.append(k, String(item));
  }
  return q.toString();
}

/** @type {any} */
let oauth = null;
/** @type {import('./google/api').GoogleApi | null} */
let googleApi = null;
/** @type {import('./tokenVault').TokenVault | null} */
let vault = null;

if (googleEnabled) {
  vault = createTokenVault(/** @type {string} */ (config.TOKEN_ENC_KEY));
  oauth = createGoogleOAuth({
    clientId: /** @type {string} */ (config.GOOGLE_CLIENT_ID),
    clientSecret: /** @type {string} */ (config.GOOGLE_CLIENT_SECRET),
    redirectUri: /** @type {string} */ (config.GOOGLE_REDIRECT_URI),
    vault,
    postForm: async (url, body) => (await axios.post(url, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10_000,
    })).data,
  });
  const client = createGoogleClient({
    vault,
    oauth,
    store: {
      find: (userId) => prisma.integration.findFirst({ where: { userId, provider: 'google', status: 'active' } }),
      update: async (id, data) => { await prisma.integration.update({ where: { id }, data }); },
    },
    http: async ({ method, url, token, params, data }) => (await axios.request({
      method, url: params ? `${url}?${toQuery(params)}` : url, data,
      headers: { Authorization: `Bearer ${token}` }, timeout: 15_000,
    })).data,
    onExpired: (userId) => {
      emit({ kind: KINDS.INTEGRATION_EXPIRED, userId, payload: { provider: 'google' } });
      notifyUser({ id: userId }, {
        text: '*Google disconnected*\n\nYour Google access expired. Send /login and reconnect it under Settings to keep calendar and email features working.',
      }).catch(() => {});
    },
  });
  googleApi = createGoogleApi(client);
  log('integrations.google_enabled');
}

/**
 * Finish the OAuth flow: validate state, exchange the code, store encrypted tokens.
 * @param {unknown} code @param {unknown} state
 * @returns {Promise<{ ok: true, userId: string } | { ok: false, reason: string }>}
 */
async function completeGoogleConnect(code, state) {
  if (!oauth || !vault) return { ok: false, reason: 'not_configured' };
  const parsed = oauth.parseState(state);
  if (!parsed || typeof code !== 'string' || !code) return { ok: false, reason: 'invalid_state' };

  const tokens = await oauth.exchangeCode(code, parsed.verifier);
  const data = {
    accessTokenEnc: vault.encrypt(tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? vault.encrypt(tokens.refreshToken) : null,
    expiresAt: tokens.expiresAt,
    scopes: tokens.scopes,
    accountEmail: tokens.email,
    status: 'active',
  };
  await prisma.integration.upsert({
    where: { userId_provider: { userId: parsed.userId, provider: 'google' } },
    create: { userId: parsed.userId, provider: 'google', ...data },
    update: data,
  });
  emit({ kind: KINDS.INTEGRATION_CONNECTED, userId: parsed.userId, payload: { provider: 'google', scopes: tokens.scopes } });
  return { ok: true, userId: parsed.userId };
}

/** Revoke at Google (best effort) and delete stored tokens. @param {string} userId */
async function disconnectGoogle(userId) {
  const row = await prisma.integration.findUnique({ where: { userId_provider: { userId, provider: 'google' } } });
  if (!row) return false;
  if (oauth && vault && row.refreshTokenEnc) await oauth.revoke(vault.decrypt(row.refreshTokenEnc));
  await prisma.integration.delete({ where: { id: row.id } });
  emit({ kind: KINDS.INTEGRATION_DISCONNECTED, userId, payload: { provider: 'google' } });
  return true;
}

module.exports = { googleEnabled, googleApi, oauth, completeGoogleConnect, disconnectGoogle, toQuery };
