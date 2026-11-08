// @ts-check
// src/runtime/dedupe.js
// "Process this webhook message once", even across many serverless instances.
// A small in-memory cache answers repeat deliveries to the same instance for
// free; the source of truth is a primary-key insert into ProcessedMessage:
// the first insert wins, and a unique violation (P2002) means "already seen".
// Exports: createDeduper
// Docs: docs/modules/messaging-pipeline.md → De-duplication

const { warn } = require('../logger');

const LOCAL_MAX = 1000;

/**
 * @param {{ prisma: { processedMessage: { create: (args: { data: { key: string } }) => Promise<unknown> } } }} deps
 */
function createDeduper({ prisma }) {
  /** @type {Set<string>} */
  const local = new Set();

  /** @param {string} key */
  function remember(key) {
    local.add(key);
    if (local.size > LOCAL_MAX) local.delete(/** @type {string} */ (local.values().next().value));
  }

  /**
   * Claim a message key. Resolves true for the first caller only.
   * Fails OPEN on database errors: losing a user's message is worse than
   * rarely processing a retry twice (handlers are mostly idempotent).
   * @param {string} key  `${channel}:${messageId}`
   * @returns {Promise<boolean>}
   */
  async function claim(key) {
    if (local.has(key)) return false;
    remember(key);
    try {
      await prisma.processedMessage.create({ data: { key } });
      return true;
    } catch (err) {
      if (/** @type {{ code?: string }} */ (err)?.code === 'P2002') return false;
      warn('dedupe.store_unavailable', { err: /** @type {Error} */ (err)?.message });
      return true;
    }
  }

  return { claim };
}

module.exports = { createDeduper };
