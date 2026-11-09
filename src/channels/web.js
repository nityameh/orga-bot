// @ts-check
// src/channels/web.js
// Web chat adapter (ADR-018): lets people use Orga in the browser with no phone
// number, which is how invited users and interviewers try it. Inbound messages
// arrive through the authenticated dashboard API (src/api/chat.js), not a
// webhook; "sending" stores the reply in WebMessage, which the browser polls.
// Docs: docs/modules/channels.md

/**
 * @param {{ prisma: import('@prisma/client').PrismaClient }} deps
 * @returns {import('./types').ChannelAdapter}
 */
function createWebAdapter({ prisma }) {
  return {
    name: 'web',
    webhookPath: null,                                   // inbound via /api/v1/chat (session-authenticated)
    capabilities: { maxButtons: 3, freeformWindowHours: null, maxTextLength: null },
    isConfigured: () => true,
    verifyRequest: () => false,                          // no webhook to verify
    parseInbound: () => [],

    // externalId for the web channel is the user's id.
    async send(externalId, { text, buttons }) {
      await prisma.webMessage.create({
        data: { userId: externalId, direction: 'out', text, buttons: buttons?.length ? /** @type {any} */ (buttons.slice(0, 3)) : undefined },
      });
      return true;
    },
  };
}

module.exports = { createWebAdapter };
