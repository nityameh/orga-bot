// test/unit/delivery.test.js
// planDelivery(): which channel a proactive message goes to, and whether a
// WhatsApp template is required (24-hour customer-service window).
// Also covers link-code helpers from src/users/identity.js.

import { describe, it, expect } from 'vitest';

// planDelivery and the identity helpers are pure, but their modules wire up
// Prisma and config at import time. Provide a minimal env first.
process.env.DATABASE_URL ||= 'postgresql://u:p@localhost:5432/db';
const { planDelivery } = require('../../src/channels');
const { normaliseLinkCode, generateLinkCode } = require('../../src/users/identity');

const HOUR = 60 * 60 * 1000;
const now = new Date('2026-11-05T12:00:00Z');
const caps = (name) => ({ whatsapp: { maxButtons: 3, freeformWindowHours: 24 }, telegram: { maxButtons: 8, freeformWindowHours: null } })[name];
const at = (hoursAgo) => new Date(now.getTime() - hoursAgo * HOUR);

describe('planDelivery', () => {
  it('returns null when the user has no identities', () => {
    expect(planDelivery([], caps, now)).toBeNull();
  });

  it('uses the most recently active channel', () => {
    const plan = planDelivery([
      { channel: 'whatsapp', externalId: '91', lastInboundAt: at(5) },
      { channel: 'telegram', externalId: '42', lastInboundAt: at(1) },
    ], caps, now);
    expect(plan).toEqual({ identity: expect.objectContaining({ channel: 'telegram' }), mode: 'freeform' });
  });

  it('WhatsApp inside 24h → free-form; outside → template', () => {
    expect(planDelivery([{ channel: 'whatsapp', externalId: '91', lastInboundAt: at(23) }], caps, now).mode).toBe('freeform');
    expect(planDelivery([{ channel: 'whatsapp', externalId: '91', lastInboundAt: at(25) }], caps, now).mode).toBe('template');
  });

  it('treats a never-active identity as outside the window', () => {
    expect(planDelivery([{ channel: 'whatsapp', externalId: '91', lastInboundAt: null }], caps, now).mode).toBe('template');
  });

  it('Telegram never needs a template', () => {
    expect(planDelivery([{ channel: 'telegram', externalId: '42', lastInboundAt: null }], caps, now).mode).toBe('freeform');
  });
});

describe('link codes', () => {
  it('generates XXXX-XXXX codes from an unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) expect(generateLinkCode()).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
  });

  it('normalises case, spaces and missing dash; rejects wrong length', () => {
    expect(normaliseLinkCode('k7pm q2xd')).toBe('K7PM-Q2XD');
    expect(normaliseLinkCode('K7PMQ2XD')).toBe('K7PM-Q2XD');
    expect(normaliseLinkCode('K7PM-Q2X')).toBeNull();
    expect(normaliseLinkCode('')).toBeNull();
  });
});
