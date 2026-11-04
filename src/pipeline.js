// src/pipeline.js
// Channel-agnostic inbound pipeline. For every channel adapter it exposes
// webhook routes that: verify authenticity → acknowledge immediately →
// normalise → de-duplicate → rate limit → resolve user → classify → route.
// Each message runs inside its own context (traceId) for logs and Interactions.
// Docs: docs/modules/messaging-pipeline.md

const express = require('express');
const { registry, reply } = require('./channels');
const { resolveUser } = require('./users/identity');
const { classify } = require('./classifier');
const { routeCommand, routeIntent } = require('./router');
const { handleWithAgent, isAvailableFor } = require('./agent');
const { isRateLimited } = require('./ratelimiter');
const { runWithContext, setContext } = require('./context');
const { emit, KINDS } = require('./interactions');
const { log, warn, error } = require('./logger');

const welcomeMessage = (name) => [
  `*Welcome${name ? `, ${name}` : ''}*`,
  ``,
  `Orga keeps your notes, tasks and reminders organised — right here in chat.`,
  ``,
  `Send me anything to get started:`,
  `1. A note — "meeting with Rahul went well"`,
  `2. A task — "tasks: send invoice, call bank"`,
  `3. A reminder — "remind me at 6pm to follow up"`,
  ``,
  `Already use Orga on another app? Send /link there, then send the code here.`,
  `Type /help for everything else.`,
].join('\n');

// ─── De-duplication ────────────────────────────────────────────────────────
// Channels retry webhooks; the same message id must be processed once.
const DEDUPE_MAX = 1000;
const seen = new Set();

function isDuplicate(key) {
  if (seen.has(key)) return true;
  seen.add(key);
  if (seen.size > DEDUPE_MAX) seen.delete(seen.values().next().value);
  return false;
}

// ─── Processing ────────────────────────────────────────────────────────────

/**
 * Process one normalised inbound message end to end.
 * @param {import('./channels/types').InboundMessage} message
 */
async function processInbound(message) {
  const rateKey = `${message.channel}:${message.externalId}`;
  if (isRateLimited(rateKey)) {
    warn('message.rate_limited', { channel: message.channel });
    return;
  }

  const { user, isNew } = await resolveUser(message);
  message.userId = user.id;
  setContext({ userId: user.id });

  emit({ kind: KINDS.MESSAGE_RECEIVED, userId: user.id, channel: message.channel, payload: { chars: message.text.length } });
  log('message.received', { channel: message.channel, userId: user.id, chars: message.text.length });

  if (isNew) {
    await reply(message, welcomeMessage(message.name));
    return;
  }

  // 1. Exact commands and pending confirmations: deterministic, no LLM.
  if (await routeCommand(user, message)) return;

  // 2. Free text → agent (tool use). 3. Fallback: legacy classifier + intent switch.
  if (await isAvailableFor(user.id)) {
    try {
      await reply(message, await handleWithAgent(user, message));
      return;
    } catch (err) {
      error('agent.failed', { err: err.message, toolCallsMade: err.toolCallsMade ?? 0 });
      // Falling back after a tool already ran could repeat its side effect.
      if (err.toolCallsMade > 0) throw err;
    }
  }

  const start = Date.now();
  const intent = await classify(message.text);
  log('intent.classified', { type: intent.type, ms: Date.now() - start });
  await routeIntent(user, intent, message);
}

/**
 * Build Express routes for every registered channel.
 * @returns {express.Router}
 */
function createWebhookRouter() {
  const router = express.Router();

  for (const adapter of registry.all()) {
    if (adapter.handleVerification) {
      router.get(adapter.webhookPath, (req, res) => adapter.handleVerification(req, res));
    }

    router.post(adapter.webhookPath, (req, res) => {
      if (!adapter.verifyRequest(req)) {
        warn('webhook.rejected', { channel: adapter.name });
        return res.sendStatus(403);
      }

      // Acknowledge first: channels retry if we're slow (Meta ~3s), and the
      // work below involves LLM calls.
      res.sendStatus(200);

      let messages;
      try {
        messages = adapter.parseInbound(req.body);
      } catch (err) {
        error('webhook.parse_failed', { channel: adapter.name, err: err.message });
        return;
      }

      for (const message of messages) {
        if (isDuplicate(`${message.channel}:${message.id}`)) {
          log('message.duplicate', { channel: message.channel });
          continue;
        }

        runWithContext({ channel: message.channel }, async () => {
          try {
            await adapter.acknowledge?.(message);
            await processInbound(message);
          } catch (err) {
            error('message.fatal_error', { channel: message.channel, err: err.message });
            await reply(message, 'Something went wrong on my end. Try again in a moment.').catch(() => {
              error('message.error_reply_failed', { channel: message.channel });
            });
          }
        });
      }
    });
  }

  return router;
}

module.exports = { createWebhookRouter, processInbound, isDuplicate };
