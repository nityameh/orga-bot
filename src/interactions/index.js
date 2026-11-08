// @ts-check
// src/interactions/index.js
// Composition root: one process-wide event bus with the Prisma-backed
// Interaction recorder subscribed. Producers import { emit, KINDS } from here.
// Docs: docs/modules/interactions.md

const prisma = require('../db');
const { createEventBus } = require('./eventBus');
const { createInteractionRecorder } = require('./recorder');
const { KINDS } = require('./kinds');
const { getContext } = require('../context');

const bus = createEventBus();

bus.subscribe(createInteractionRecorder({
  create: (row) => prisma.interaction.create({ data: /** @type {any} */ (row) }),
}));

/**
 * Emit a domain event. `channel` defaults to the current request's channel.
 * Awaiting is optional: the call never throws.
 * @param {import('./eventBus').DomainEvent} event
 */
function emit(event) {
  return bus.emit({ channel: getContext()?.channel, ...event });
}

module.exports = { emit, subscribe: bus.subscribe, KINDS };
