// @ts-check
// src/interactions/eventBus.js
// In-process domain event bus (Observer pattern, ADR-005). Producers call
// emit() and never know who listens; subscribers (the Interaction recorder
// today, the proactive engine later) register once at startup.
// Subscriber failures are isolated: they are logged and never reach the
// producer, so analytics can never break a user's reply.
// Docs: docs/modules/interactions.md

const { error } = require('../logger');

/**
 * @typedef {Object} DomainEvent
 * @property {string} kind        One of KINDS in ./kinds.js
 * @property {string} userId
 * @property {string} [channel]
 * @property {string} [person]    Client / person the event is about (lowercase)
 * @property {string} [summary]   Short human-readable description (≤ 200 chars)
 * @property {Record<string, unknown>} [payload]
 * @property {{ tokensIn?: number, tokensOut?: number, costMicros?: number }} [usage]
 */

/** @typedef {(event: DomainEvent) => Promise<void> | void} Subscriber */

function createEventBus() {
  /** @type {Subscriber[]} */
  const subscribers = [];

  return {
    /** @param {Subscriber} fn */
    subscribe(fn) {
      subscribers.push(fn);
      return () => {
        const i = subscribers.indexOf(fn);
        if (i >= 0) subscribers.splice(i, 1);
      };
    },

    /**
     * Deliver an event to all subscribers. Resolves when all have finished;
     * never rejects.
     * @param {DomainEvent} event
     */
    async emit(event) {
      await Promise.all(
        subscribers.map(async (fn) => {
          try {
            await fn(event);
          } catch (err) {
            error('eventbus.subscriber_failed', { kind: event.kind, err: /** @type {Error} */ (err).message });
          }
        }),
      );
    },
  };
}

/** @typedef {ReturnType<typeof createEventBus>} EventBus */

module.exports = { createEventBus };
