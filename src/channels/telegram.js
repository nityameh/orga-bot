// @ts-check
// src/channels/telegram.js
// Telegram Bot API adapter: secret-token webhook check, update parsing
// (messages and inline-button taps), sending with inline keyboards.
// Docs: docs/modules/channels.md

const crypto = require('crypto');
const axios = require('axios').default; // .default: typed CJS access to the axios instance
const { log, error } = require('../logger');

const BUTTON_TEXT = /** @type {Record<string, string>} */ ({
  reminder_done: 'DONE',
  reminder_snooze: 'SNOOZE',
});

/**
 * @param {Object} cfg
 * @param {string} [cfg.botToken]
 * @param {string} [cfg.webhookSecret]  Sent by Telegram in X-Telegram-Bot-Api-Secret-Token
 * @param {boolean} cfg.allowUnsigned
 * @param {(url: string, data?: any, config?: any) => Promise<any>} [cfg.httpPost]
 * @returns {import('./types').ChannelAdapter}
 */
function createTelegramAdapter({ botToken, webhookSecret, allowUnsigned, httpPost = axios.post }) {
  const api = (/** @type {string} */ method) => `https://api.telegram.org/bot${botToken}/${method}`;

  /**
   * @param {string} method
   * @param {object} payload
   * @returns {Promise<boolean>}
   */
  async function call(method, payload) {
    if (!botToken) {
      console.log(`\n[DEV telegram] ${method} ${JSON.stringify(payload, null, 2)}\n`);
      return true;
    }
    try {
      await httpPost(api(method), payload, { timeout: 10_000 });
      return true;
    } catch (err) {
      const description = /** @type {any} */ (err).response?.data?.description || /** @type {Error} */ (err).message;
      // Our messages use *bold*/_italic_ markup; if Telegram can't parse it
      // (e.g. an underscore inside a URL), resend as plain text rather than fail.
      if (/** @type {any} */ (payload).parse_mode && /can't parse entities/i.test(description)) {
        const { parse_mode: _ignored, ...plain } = /** @type {any} */ (payload);
        return call(method, plain);
      }
      error('telegram.call_failed', { method, err: description });
      return false;
    }
  }

  return {
    name: 'telegram',
    webhookPath: '/webhooks/telegram',
    capabilities: { maxButtons: 8, freeformWindowHours: null },

    isConfigured: () => Boolean(botToken),

    verifyRequest(req) {
      if (!webhookSecret) return allowUnsigned;
      const received = Buffer.from(req.get('x-telegram-bot-api-secret-token') || '');
      const expected = Buffer.from(webhookSecret);
      return received.length === expected.length && crypto.timingSafeEqual(received, expected);
    },

    parseInbound(body) {
      if (body?.message?.text !== undefined && body.message.chat?.type === 'private') {
        const m = body.message;
        const externalId = String(m.chat.id);
        return [{
          channel: 'telegram',
          externalId,
          from: externalId,
          id: `tg_${body.update_id}`,
          text: String(m.text).trim(),
          name: [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' '),
        }];
      }

      if (body?.callback_query) {
        const q = body.callback_query;
        const text = BUTTON_TEXT[q.data];
        if (!text || !q.message?.chat?.id) return [];
        const externalId = String(q.message.chat.id);
        return [{
          channel: 'telegram',
          externalId,
          from: externalId,
          id: `tg_${body.update_id}`,
          text,
          name: q.from?.first_name || '',
          meta: { callbackQueryId: q.id },
        }];
      }

      log('telegram.update_ignored', { keys: Object.keys(body || {}).join(',') });
      return [];
    },

    async send(externalId, { text, buttons }) {
      /** @type {Record<string, unknown>} */
      const payload = { chat_id: externalId, text, parse_mode: 'Markdown', disable_web_page_preview: true };
      if (buttons?.length) {
        payload.reply_markup = { inline_keyboard: [buttons.slice(0, 8).map((b) => ({ text: b.title, callback_data: b.id }))] };
      }
      return call('sendMessage', payload);
    },

    async acknowledge(message) {
      const id = message.meta?.callbackQueryId;
      if (id) await call('answerCallbackQuery', { callback_query_id: id });
    },
  };
}

module.exports = { createTelegramAdapter };
