// @ts-check
// src/interactions/recorder.js
// Subscriber that persists every domain event as an Interaction row: the
// single write path into the append-only log (ADR-005).
// Docs: docs/modules/interactions.md

const { KIND_VALUES } = require('./kinds');
const { getContext } = require('../context');
const { warn } = require('../logger');

const MAX_SUMMARY = 200;

/**
 * @typedef {Object} InteractionRow
 * @property {string} userId
 * @property {string} kind
 * @property {string | null} channel
 * @property {string | null} person
 * @property {string | null} summary
 * @property {Record<string, unknown> | undefined} payload
 * @property {string | null} traceId
 * @property {number | null} tokensIn
 * @property {number | null} tokensOut
 * @property {number | null} costMicros
 */

/**
 * Convert an event into a row. Pure; exported for tests.
 * @param {import('./eventBus').DomainEvent} event
 * @param {string | undefined} traceId
 * @returns {InteractionRow | null} null when the event is invalid
 */
function toRow(event, traceId) {
  if (!event?.userId || !KIND_VALUES.has(event.kind)) return null;
  return {
    userId: event.userId,
    kind: event.kind,
    channel: event.channel ?? null,
    person: event.person ? event.person.toLowerCase().slice(0, 100) : null,
    summary: event.summary ? event.summary.slice(0, MAX_SUMMARY) : null,
    payload: event.payload,
    traceId: traceId ?? null,
    tokensIn: event.usage?.tokensIn ?? null,
    tokensOut: event.usage?.tokensOut ?? null,
    costMicros: event.usage?.costMicros ?? null,
  };
}

/**
 * @param {{ create: (row: InteractionRow) => Promise<unknown> }} store
 * @returns {import('./eventBus').Subscriber}
 */
function createInteractionRecorder(store) {
  return async (event) => {
    const row = toRow(event, getContext()?.traceId);
    if (!row) {
      warn('interaction.invalid_event', { kind: event?.kind });
      return;
    }
    await store.create(row);
  };
}

module.exports = { createInteractionRecorder, toRow };
