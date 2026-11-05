// test/unit/invites.webchat.test.js
// Invite codes and the web chat adapter (ADR-018).

import { describe, it, expect, vi } from 'vitest';
const { generateInviteCode, normaliseInviteCode } = require('../../src/invites/service');
const { createWebAdapter } = require('../../src/channels/web');

describe('invite codes', () => {
  it('look like ORGA-XXXX-XXXX from an unambiguous alphabet and are unique', () => {
    const codes = new Set(Array.from({ length: 200 }, generateInviteCode));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^ORGA-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
  });

  it('normalise case, spaces and a missing prefix; reject bad input', () => {
    expect(normaliseInviteCode('orga k7pm q2xd')).toBe('ORGA-K7PM-Q2XD');
    expect(normaliseInviteCode('K7PMQ2XD')).toBe('ORGA-K7PM-Q2XD');
    expect(normaliseInviteCode('ORGA-K7PM-Q2X0')).toBeNull(); // 0 is not in the alphabet
    expect(normaliseInviteCode('ORGA-K7PM')).toBeNull();
    expect(normaliseInviteCode(42)).toBeNull();
    expect(normaliseInviteCode('x'.repeat(100))).toBeNull();
  });
});

describe('web chat adapter', () => {
  it('has no webhook and never needs templates', () => {
    const web = createWebAdapter({ prisma: {} });
    expect(web.webhookPath).toBeNull();
    expect(web.capabilities.freeformWindowHours).toBeNull();
    expect(web.verifyRequest({})).toBe(false);
  });

  it('"sends" by writing to the user\'s outbox, keeping up to 3 buttons', async () => {
    const create = vi.fn().mockResolvedValue({});
    const web = createWebAdapter({ prisma: { webMessage: { create } } });
    const buttons = [1, 2, 3, 4].map((n) => ({ id: `b${n}`, title: `B${n}` }));
    expect(await web.send('user_1', { text: 'hi', buttons })).toBe(true);
    expect(create).toHaveBeenCalledWith({ data: { userId: 'user_1', direction: 'out', text: 'hi', buttons: buttons.slice(0, 3) } });
  });
});
