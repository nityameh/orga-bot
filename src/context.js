// @ts-check
// src/context.js
// Per-request context (traceId, userId, channel) carried implicitly through
// async calls with AsyncLocalStorage, so logs and Interaction rows from deep
// inside handlers can be tied to the inbound message that caused them.
// Docs: docs/modules/interactions.md

const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

/**
 * @typedef {Object} RequestContext
 * @property {string} traceId
 * @property {string} [userId]
 * @property {string} [channel]
 */

/** @type {AsyncLocalStorage<RequestContext>} */
const storage = new AsyncLocalStorage();

function newTraceId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Run `fn` with a context; everything it awaits sees the same context.
 * @template T
 * @param {Partial<RequestContext>} ctx
 * @param {() => T} fn
 * @returns {T}
 */
function runWithContext(ctx, fn) {
  return storage.run({ traceId: ctx.traceId || newTraceId(), ...ctx }, fn);
}

/** @returns {RequestContext | undefined} */
function getContext() {
  return storage.getStore();
}

/**
 * Add fields to the current context (e.g. userId once the user is resolved).
 * @param {Partial<RequestContext>} fields
 */
function setContext(fields) {
  const store = storage.getStore();
  if (store) Object.assign(store, fields);
}

module.exports = { runWithContext, getContext, setContext, newTraceId };
