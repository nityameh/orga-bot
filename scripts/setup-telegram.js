#!/usr/bin/env node
// scripts/setup-telegram.js
// Registers (or inspects) the Telegram webhook for the bot.
//
//   node scripts/setup-telegram.js https://your-api.up.railway.app   → set webhook
//   node scripts/setup-telegram.js --info                            → show current webhook
//
// Needs TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in .env.
// Docs: docs/modules/channels.md → "Telegram setup"

require('dotenv').config();
const axios = require('axios');

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const arg = process.argv[2];

async function main() {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  const api = (method) => `https://api.telegram.org/bot${token}/${method}`;

  if (!arg || arg === '--info') {
    const { data } = await axios.get(api('getWebhookInfo'));
    const { url, pending_update_count: pending, last_error_message: lastError } = data.result;
    console.log({ url: url || '(none)', pending, lastError: lastError || null });
    return;
  }

  if (!secret || secret.length < 16) throw new Error('Set TELEGRAM_WEBHOOK_SECRET to a random string of 16+ characters');
  const base = arg.replace(/\/+$/, '');
  if (!base.startsWith('https://')) throw new Error('Telegram requires an https:// URL');

  const { data } = await axios.post(api('setWebhook'), {
    url: `${base}/webhooks/telegram`,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  });
  console.log(data.ok ? `✓ Webhook set to ${base}/webhooks/telegram` : data);

  // The invite page's "Continue on Telegram" button needs the bot's username (ADR-021).
  const { data: me } = await axios.get(api('getMe'));
  if (me.ok) console.log(`  Set TELEGRAM_BOT_USERNAME=${me.result.username} on the API for invite deep links.`);
}

main().catch((err) => {
  console.error(`✗ ${err.response?.data?.description || err.message}`);
  process.exit(1);
});
