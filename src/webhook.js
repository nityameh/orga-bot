// src/webhook.js
const crypto  = require('crypto');
const prisma  = require('./db');
const { sendMessage }   = require('./sender');
const { classify }      = require('./classifier');
const { route }         = require('./router');
const { isRateLimited } = require('./ratelimiter');
const { log, warn, error } = require('./logger');

const WELCOME_MESSAGE = (name) => [
  `*Welcome${name ? `, ${name}` : ''}*`,
  ``,
  `Orga keeps your notes, tasks and reminders organised — right here in WhatsApp.`,
  ``,
  `Send me anything to get started:`,
  `1. A note — "meeting with Rahul went well"`,
  `2. A task — "tasks: send invoice, call bank"`,
  `3. A reminder — "remind me at 6pm to follow up"`,
  ``,
  `Type /help for the full list of commands.`,
].join('\n');

// ─── In-memory dedup store ─────────────────────────────────────────────────
const processedIds = new Set();
const MAX_IDS = 100;

function isDuplicate(messageId) {
  if (processedIds.has(messageId)) return true;
  processedIds.add(messageId);
  if (processedIds.size > MAX_IDS) {
    const first = processedIds.values().next().value;
    processedIds.delete(first);
  }
  return false;
}

// ─── GET /webhook — Meta verification handshake ────────────────────────────
function handleWebhookVerify(req, res) {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    log('webhook.verified');
    return res.status(200).send(challenge);
  }

  warn('webhook.verify_failed', { mode });
  res.sendStatus(403);
}

// ─── POST /webhook — inbound messages ──────────────────────────────────────
function handleWebhookMessage(req, res) {
  if (!verifySignature(req)) {
    warn('webhook.signature_rejected');
    return res.sendStatus(403);
  }

  // Acknowledge Meta IMMEDIATELY — must happen within 3s
  res.sendStatus(200);

  const message = extractMessage(req.body);
  if (!message) return;

  if (isDuplicate(message.id)) {
    log('message.duplicate', { id: message.id });
    return;
  }

  // GAP 8: wrap in catch that sends user-facing error reply
  processMessage(message).catch(async (err) => {
    error('message.fatal_error', { from: message.from, id: message.id, err: err.message });
    try {
      await sendMessage(
        message.from,
        `Something went wrong on my end. Try again in a moment.`
      );
    } catch { /* if even the error reply fails, just log it — already logged above */ }
  });
}

// ─── processMessage — the async pipeline ───────────────────────────────────
async function processMessage(message) {
  log('message.received', { from: message.from, id: message.id, text: message.text?.substring(0, 60) });

  // GAP 9: rate limit check
  if (isRateLimited(message.from)) {
    warn('message.rate_limited', { from: message.from });
    return; // silent drop — don't reply, don't classify
  }

  // Get or create user — returns { user, isNew }
  const { user, isNew } = await upsertUser(message.from, message.name);

  // GAP 2: welcome new users instead of classifying their first message
  if (isNew) {
    log('user.new', { phone: message.from, name: message.name });
    await sendMessage(message.from, WELCOME_MESSAGE(message.name));
    return;
  }

  // Classify intent with Groq
  const start  = Date.now();
  const intent = await classify(message.text);
  log('intent.classified', { type: intent.type, from: message.from, ms: Date.now() - start });

  // Route to correct handler
  await route(user, intent, message);
}

// ─── upsertUser ─────────────────────────────────────────────────────────────
async function upsertUser(phone, name = '') {
  // Check if user exists first so we can detect new users
  const existing = await prisma.user.findUnique({ where: { phone } });

  if (existing) {
    return { user: existing, isNew: false };
  }

  const user = await prisma.user.create({
    data: { phone, tier: 'free', lang: 'en' },
  });

  return { user, isNew: true };
}

// ─── verifySignature ────────────────────────────────────────────────────────
function verifySignature(req) {
  if (process.env.NODE_ENV === 'development' && !process.env.APP_SECRET) {
    return true;
  }

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.APP_SECRET)
    .update(req.rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ─── extractMessage ─────────────────────────────────────────────────────────
function extractMessage(body) {
  try {
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const msg   = value?.messages?.[0];

    if (!msg) return null;

    // Handle interactive button replies (Done / Snooze buttons)
    if (msg.type === 'interactive') {
      const buttonId = msg.interactive?.button_reply?.id;
      const buttonText = buttonId === 'reminder_done' ? 'DONE'
                       : buttonId === 'reminder_snooze' ? 'SNOOZE'
                       : null;

      if (!buttonText) return null;

      return {
        from:      msg.from,
        id:        msg.id,
        text:      buttonText,
        type:      'text',
        timestamp: msg.timestamp,
        name:      value?.contacts?.[0]?.profile?.name || '',
      };
    }

    if (msg.type !== 'text') {
      log('message.ignored', { type: msg.type });
      return null;
    }

    return {
      from:      msg.from,
      id:        msg.id,
      text:      msg.text?.body?.trim() || '',
      type:      msg.type,
      timestamp: msg.timestamp,
      name:      value?.contacts?.[0]?.profile?.name || '',
    };
  } catch (err) {
    error('message.extract_error', { err: err.message });
    return null;
  }
}

module.exports = { handleWebhookVerify, handleWebhookMessage };
