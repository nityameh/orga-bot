// @ts-check
// src/channels/registry.js
// Registry of channel adapters (Registry pattern). Adding a channel = writing an
// adapter and registering it in src/channels/index.js. Nothing else changes.
// Docs: docs/modules/channels.md

/**
 * @typedef {import('./types').ChannelAdapter} ChannelAdapter
 */

function createChannelRegistry() {
  /** @type {Map<string, ChannelAdapter>} */
  const adapters = new Map();

  return {
    /** @param {ChannelAdapter} adapter */
    register(adapter) {
      if (adapters.has(adapter.name)) throw new Error(`Channel already registered: ${adapter.name}`);
      adapters.set(adapter.name, adapter);
    },

    /**
     * @param {string} name
     * @returns {ChannelAdapter}
     */
    get(name) {
      const adapter = adapters.get(name);
      if (!adapter) throw new Error(`Unknown channel: ${name}`);
      return adapter;
    },

    /** @param {string} name */
    has(name) {
      return adapters.has(name);
    },

    /** @returns {ChannelAdapter[]} */
    all() {
      return [...adapters.values()];
    },
  };
}

/** @typedef {ReturnType<typeof createChannelRegistry>} ChannelRegistry */

module.exports = { createChannelRegistry };
