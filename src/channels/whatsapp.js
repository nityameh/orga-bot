// @ts-check
// src/channels/whatsapp.js
// WhatsApp adapter (Meta Cloud API): webhook verification handshake, HMAC
// signature check, payload parsing, and sending text / buttons / templates.
// The only file that talks to the Meta API.
// Docs: docs/modules/channels.md

const crypto = require('crypto');
const axios = require('axios').default; // .default: typed CJS access to the axios instance
const { log, warn, error } = require('../logger');

const GRAPH_VERSION = 'v19.0';

/** Button ids that map to text commands the router understands. */
const BUTTON_TEXT = /** @type {Record<string, string>} */ ({
  reminder_done: 'DONE',
  reminder_snooze: 'SNOOZE',
  approval_yes: 'APPROVE',
  approval_no: 'REJECT',
});

/**
 * @param {Object} cfg
 * @param {string} [cfg.token]
 * @param {string} [cfg.phoneNumberId]
 * @param {string} [cfg.verifyToken]
 * @param {string} [cfg.appSecret]
 * @param {boolean} cfg.allowUnsigned  Only true in development without APP_SECRET
 * @param {(url: string, data?: any, config?: any) => Promise<any>} [cfg.httpPost]  Injectable for tests
 * @returns {import('./types').ChannelAdapter}
 */
function createWhatsAppAdapter({ token, phoneNumberId, verifyToken, appSecret, allowUnsigned, httpPost = axios.post }) {
  const apiUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;

  /** @param {object} payload */
  async function post(payload) {
    if (!token) return devPrint(payload);
    try {
      await httpPost(apiUrl, { messaging_product: 'whatsapp', ...payload }, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 10_000,
      });
      return true;
    } catch (err) {
      const metaError = /** @type {any} */ (err).response?.data?.error;
      error('whatsapp.send_failed', { code: metaError?.code, err: metaError?.message || /** @type {Error} */ (err).message });
      return false;
    }
  }

  return {
    name: 'whatsapp',
    webhookPath: '/webhook', // path registered in the Meta portal; kept for compatibility
    capabilities: { maxButtons: 3, freeformWindowHours: 24 },

    isConfigured: () => Boolean(token),

    handleVerification(req, res) {
      const mode = req.query['hub.mode'];
      const challenge = req.query['hub.challenge'];
      if (mode === 'subscribe' && verifyToken && req.query['hub.verify_token'] === verifyToken) {
        log('whatsapp.webhook_verified');
        res.status(200).send(challenge);
        return;
      }
      warn('whatsapp.webhook_verify_failed', { mode });
      res.sendStatus(403);
    },

    verifyRequest(req) {
      if (!appSecret) return allowUnsigned;
      const signature = req.get('x-hub-signature-256');
      const rawBody = /** @type {any} */ (req).rawBody;
      if (!signature || !rawBody) return false;
      const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
      const a = Buffer.from(signature);
      const b = Buffer.from(expected);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    },

    parseInbound(body) {
      const value = body?.entry?.[0]?.changes?.[0]?.value;
      const msg = value?.messages?.[0];
      if (!msg) return []; // status updates (delivered/read) have no messages

      const name = value?.contacts?.[0]?.profile?.name || '';
      let text = null;

      if (msg.type === 'text') text = msg.text?.body?.trim() || '';
      if (msg.type === 'interactive') text = BUTTON_TEXT[msg.interactive?.button_reply?.id] || null;

      if (text === null) {
        log('whatsapp.message_ignored', { type: msg.type });
        return [];
      }
      return [{ channel: 'whatsapp', externalId: msg.from, from: msg.from, id: msg.id, text, name }];
    },

    async send(externalId, { text, buttons }) {
      if (buttons?.length) {
        return post({
          to: externalId,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text },
            action: {
              buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title.slice(0, 20) } })),
            },
          },
        });
      }
      return post({ to: externalId, type: 'text', text: { body: text } });
    },

    async sendTemplate(externalId, { name, params }) {
      return post({
        to: externalId,
        type: 'template',
        template: {
          name,
          language: { code: 'en' },
          components: [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: p })) }],
        },
      });
    },
  };
}

/** Development mode: print instead of calling Meta. */
function devPrint(/** @type {any} */ payload) {
  const text = payload.text?.body || payload.interactive?.body?.text || `[template ${payload.template?.name}]`;
  const buttons = payload.interactive?.action?.buttons?.map((/** @type {any} */ b) => b.reply.title);
  console.log(`\n[DEV whatsapp] → ${payload.to}\n─────────────────────\n${text}${buttons ? `\n  Buttons: [${buttons.join('] [')}]` : ''}\n─────────────────────\n`);
  return true;
}

module.exports = { createWhatsAppAdapter };
