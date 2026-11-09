// test/unit/onboarding.test.js
// Invite-only chat onboarding (ADR-021): parsing what an unknown chat sent,
// the handler's decisions with injected fakes, long-reply splitting, and the
// config rules that keep production invite-only.

import { describe, it, expect, vi } from 'vitest';
const { parseOnboarding, createOnboarding, MESSAGES } = require('../../src/invites/onboarding');
const { parseConfig } = require('../../src/config');

describe('parseOnboarding', () => {
  it.each([
    ['/start ORGA-K7PM-Q2XD', { kind: 'invite', code: 'ORGA-K7PM-Q2XD' }],      // Telegram deep link
    ['/start@OrgaBot ORGA-K7PM-Q2XD', { kind: 'invite', code: 'ORGA-K7PM-Q2XD' }],
    ['join ORGA-K7PM-Q2XD', { kind: 'invite', code: 'ORGA-K7PM-Q2XD' }],        // WhatsApp pre-filled text
    ['Join orga-k7pm-q2xd', { kind: 'invite', code: 'orga-k7pm-q2xd' }],
    ['  ORGA K7PM Q2XD ', { kind: 'invite', code: 'ORGA K7PM Q2XD' }],          // pasted on its own
    ['/link K7PM-Q2XD', { kind: 'link', code: 'K7PM-Q2XD' }],
    ['/start', { kind: 'none' }],                                               // Start button, no invite
    ['hello', { kind: 'none' }],
    ['what is GST?', { kind: 'none' }],
    ['join the meeting at 5', { kind: 'invite', code: 'the meeting at 5' }],   // rejected later as an invalid code
    ['', { kind: 'none' }],
  ])('%j', (text, expected) => {
    expect(parseOnboarding(text)).toEqual(expected);
  });
});

function setup(overrides = {}) {
  const deps = {
    redeemInviteForChannel: vi.fn(async () => ({ ok: true, userId: 'u1' })),
    linkNewIdentity: vi.fn(async () => ({ ok: true, userId: 'u2' })),
    reply: vi.fn(async () => true),
    welcome: vi.fn(async () => true),
    isAttemptLimited: vi.fn(() => false),
    log: vi.fn(),
    ...overrides,
  };
  return { deps, onboard: createOnboarding(deps) };
}
const msg = (text) => ({ channel: 'telegram', externalId: '42', from: '42', id: 'm1', text, name: 'Asha' });

describe('createOnboarding', () => {
  it('a plain message gets the invite-only reply and never touches invites', async () => {
    const { deps, onboard } = setup();
    expect(await onboard(msg('hi'))).toBe('rejected');
    expect(deps.reply).toHaveBeenCalledWith(expect.anything(), MESSAGES.inviteOnly);
    expect(deps.redeemInviteForChannel).not.toHaveBeenCalled();
    expect(deps.isAttemptLimited).not.toHaveBeenCalled(); // plain chatter doesn't count as a guess
  });

  it('a valid invite creates the account for this chat and welcomes them', async () => {
    const { deps, onboard } = setup();
    expect(await onboard(msg('/start ORGA-K7PM-Q2XD'))).toBe('joined');
    expect(deps.redeemInviteForChannel).toHaveBeenCalledWith('ORGA-K7PM-Q2XD', { channel: 'telegram', externalId: '42', name: 'Asha' });
    expect(deps.welcome).toHaveBeenCalledWith('u1', expect.objectContaining({ externalId: '42' }));
  });

  it.each(['invalid', 'expired', 'used_up'])('explains a %s invite', async (reason) => {
    const { deps, onboard } = setup({ redeemInviteForChannel: vi.fn(async () => ({ ok: false, reason })) });
    expect(await onboard(msg('join ORGA-K7PM-Q2XD'))).toBe('rejected');
    expect(deps.reply).toHaveBeenCalledWith(expect.anything(), MESSAGES[reason]);
    expect(deps.welcome).not.toHaveBeenCalled();
  });

  it('stays silent for a duplicate delivery of the joining message', async () => {
    const { deps, onboard } = setup({ redeemInviteForChannel: vi.fn(async () => ({ ok: false, reason: 'already_joined' })) });
    expect(await onboard(msg('join ORGA-K7PM-Q2XD'))).toBe('ignored');
    expect(deps.reply).not.toHaveBeenCalled();
  });

  it('/link CODE attaches the chat to the existing account', async () => {
    const { deps, onboard } = setup();
    expect(await onboard(msg('/link K7PM-Q2XD'))).toBe('linked');
    expect(deps.reply).toHaveBeenCalledWith(expect.anything(), MESSAGES.linked);
  });

  it('a bad link code is refused', async () => {
    const { deps, onboard } = setup({ linkNewIdentity: vi.fn(async () => ({ ok: false })) });
    expect(await onboard(msg('/link AAAA-BBBB'))).toBe('rejected');
    expect(deps.reply).toHaveBeenCalledWith(expect.anything(), MESSAGES.linkFailed);
  });

  it('rate limits code attempts per chat before checking anything', async () => {
    const { deps, onboard } = setup({ isAttemptLimited: vi.fn(() => true) });
    expect(await onboard(msg('join ORGA-K7PM-Q2XD'))).toBe('rejected');
    expect(deps.isAttemptLimited).toHaveBeenCalledWith('telegram:42');
    expect(deps.redeemInviteForChannel).not.toHaveBeenCalled();
    expect(deps.reply).toHaveBeenCalledWith(expect.anything(), MESSAGES.limited);
  });
});

describe('splitText (long replies on chat apps)', () => {
  // Requiring channels loads adapters but sends nothing without tokens.
  const { splitText } = require('../../src/channels');

  it('leaves short text and unlimited channels alone', () => {
    expect(splitText('hello', 4096)).toEqual(['hello']);
    expect(splitText('x'.repeat(10_000), null)).toEqual(['x'.repeat(10_000)]);
  });

  it('splits at paragraph boundaries and never exceeds the limit', () => {
    const para = 'word '.repeat(150).trim(); // 749 chars
    const text = Array.from({ length: 8 }, () => para).join('\n\n');
    const parts = splitText(text, 2000);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 2000)).toBe(true);
    expect(parts.every((p) => p.startsWith('word') && p.endsWith('word'))).toBe(true); // no cut words
    expect(parts.join(' ').replace(/\s+/g, ' ')).toBe(text.replace(/\s+/g, ' '));
  });

  it('hard-cuts text with no spaces', () => {
    const parts = splitText('y'.repeat(9000), 4096);
    expect(parts.map((p) => p.length)).toEqual([4096, 4096, 808]);
  });
});

describe('onboarding config', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };
  const prod = { ...base, NODE_ENV: 'production', DASHBOARD_URL: 'https://orga.vercel.app' };

  it('is invite-only by default and refuses open signup in production', () => {
    expect(parseConfig(base).SIGNUP_MODE).toBe('invite');
    expect(parseConfig({ ...base, SIGNUP_MODE: 'open' }).SIGNUP_MODE).toBe('open');
    expect(() => parseConfig({ ...prod, SIGNUP_MODE: 'open' })).toThrow(/SIGNUP_MODE/);
  });

  it('normalises the public channel handles and rejects junk', () => {
    const c = parseConfig({ ...base, TELEGRAM_BOT_USERNAME: '@OrgaAssistBot', WHATSAPP_NUMBER: '+91 98765 43210' });
    expect(c.TELEGRAM_BOT_USERNAME).toBe('OrgaAssistBot');
    expect(c.WHATSAPP_NUMBER).toBe('919876543210');
    expect(() => parseConfig({ ...base, TELEGRAM_BOT_USERNAME: 'a b' })).toThrow(/TELEGRAM_BOT_USERNAME/);
    expect(() => parseConfig({ ...base, WHATSAPP_NUMBER: '123' })).toThrow(/WHATSAPP_NUMBER/);
  });
});
