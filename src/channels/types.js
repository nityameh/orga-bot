// @ts-check
// src/channels/types.js
// Shared types for the channel layer (Ports and Adapters, ADR-003).
// The core never sees WhatsApp or Telegram payloads, only these shapes.
// Docs: docs/modules/channels.md

/**
 * @typedef {'whatsapp' | 'telegram' | 'web'} ChannelName
 */

/**
 * A message received from any chat channel, normalised.
 * @typedef {Object} InboundMessage
 * @property {ChannelName} channel
 * @property {string} externalId  Sender id within the channel (WhatsApp phone, Telegram chat id)
 * @property {string} id          Channel message id (used for de-duplication)
 * @property {string} text        Message text; button taps are mapped to text (e.g. "DONE")
 * @property {string} name        Sender display name, '' if unknown
 * @property {string} [from]      Alias of externalId kept for logging compatibility
 * @property {Record<string, unknown>} [meta]  Channel-specific extras (e.g. Telegram callback id)
 */

/**
 * @typedef {Object} Button
 * @property {string} id     Stable id returned when tapped
 * @property {string} title  Label (WhatsApp limit: 20 chars)
 */

/**
 * @typedef {Object} OutboundMessage
 * @property {string} text
 * @property {Button[]} [buttons]
 * @property {{ name: string, params: string[] }} [template]
 *   Pre-approved template to use when the channel forbids free-form proactive
 *   messages (WhatsApp outside the 24h window). Ignored by channels that don't need it.
 */

/**
 * What a channel can do. The core asks capabilities instead of checking names
 * (no `if (channel === 'whatsapp')` outside adapters).
 * @typedef {Object} ChannelCapabilities
 * @property {number} maxButtons
 * @property {number | null} freeformWindowHours  null = bot may message any time
 */

/**
 * Port every channel implements.
 * @typedef {Object} ChannelAdapter
 * @property {ChannelName} name
 * @property {string | null} webhookPath    Express path for inbound webhooks; null = no webhook (web chat)
 * @property {ChannelCapabilities} capabilities
 * @property {() => boolean} isConfigured   false → messages are printed to the console (dev mode)
 * @property {(req: import('express').Request) => boolean} verifyRequest  Authenticity check for POSTs
 * @property {(req: import('express').Request, res: import('express').Response) => void} [handleVerification]
 *   Optional GET handshake (WhatsApp)
 * @property {(body: any) => InboundMessage[]} parseInbound
 * @property {(externalId: string, message: OutboundMessage) => Promise<boolean>} send
 * @property {(externalId: string, template: {name: string, params: string[]}) => Promise<boolean>} [sendTemplate]
 * @property {(message: InboundMessage) => Promise<void>} [acknowledge]  e.g. Telegram answerCallbackQuery
 */

module.exports = {};
