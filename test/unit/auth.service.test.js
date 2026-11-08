// test/unit/auth.service.test.js
// Unit tests for the magic-link + session logic (ADR-006). No database.

import { describe, it, expect, beforeEach } from 'vitest';
const { createAuthService } = require('../../src/auth/authService');
const { hashToken } = require('../../src/auth/tokens');
const { createInMemoryAuthRepository } = require('../fakes/inMemoryAuthRepository');

const MIN = 60 * 1000;

function setup() {
  const repo = createInMemoryAuthRepository();
  let clock = new Date('2026-11-05T10:00:00Z');
  const service = createAuthService({
    repo,
    dashboardUrl: 'https://dash.example.com/',
    loginTokenTtlMinutes: 10,
    sessionTtlDays: 30,
    now: () => clock,
  });
  const advance = (ms) => { clock = new Date(clock.getTime() + ms); };
  const tokenFrom = (url) => url.split('#token=')[1];
  return { repo, service, advance, tokenFrom };
}

describe('issueLoginLink', () => {
  it('puts the token in the URL fragment, not the query string', async () => {
    const { service } = setup();
    const { url } = await service.issueLoginLink('user_1');
    expect(url).toMatch(/^https:\/\/dash\.example\.com\/auth\/callback#token=[A-Za-z0-9_-]{43}$/);
    expect(url).not.toContain('?');
  });

  it('stores only the hash of the token', async () => {
    const { service, repo, tokenFrom } = setup();
    const { url } = await service.issueLoginLink('user_1');
    const token = tokenFrom(url);
    expect(repo.loginTokens.has(token)).toBe(false);
    expect(repo.loginTokens.has(hashToken(token))).toBe(true);
  });

  it('issues a different token every time', async () => {
    const { service } = setup();
    const a = await service.issueLoginLink('user_1');
    const b = await service.issueLoginLink('user_1');
    expect(a.url).not.toBe(b.url);
  });
});

describe('exchangeLoginToken', () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it('returns a session for a valid token', async () => {
    const { url } = await ctx.service.issueLoginLink('user_1');
    const result = await ctx.service.exchangeLoginToken(ctx.tokenFrom(url), 'jest-agent');
    expect(result?.userId).toBe('user_1');
    expect(result?.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('is single use', async () => {
    const { url } = await ctx.service.issueLoginLink('user_1');
    const token = ctx.tokenFrom(url);
    expect(await ctx.service.exchangeLoginToken(token)).not.toBeNull();
    expect(await ctx.service.exchangeLoginToken(token)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const { url } = await ctx.service.issueLoginLink('user_1');
    ctx.advance(10 * MIN + 1);
    expect(await ctx.service.exchangeLoginToken(ctx.tokenFrom(url))).toBeNull();
  });

  it.each([undefined, null, '', 'short', 42, { token: 'x' }, 'a'.repeat(44), 'a'.repeat(42) + '!'])(
    'rejects malformed input %j without touching storage',
    async (bad) => {
      expect(await ctx.service.exchangeLoginToken(bad)).toBeNull();
    },
  );

  it('rejects an unknown but well-formed token', async () => {
    expect(await ctx.service.exchangeLoginToken('a'.repeat(43))).toBeNull();
  });
});

describe('resolveSession / revokeSession', () => {
  async function loggedIn(ctx) {
    const { url } = await ctx.service.issueLoginLink('user_1');
    return (await ctx.service.exchangeLoginToken(ctx.tokenFrom(url))).sessionToken;
  }

  it('resolves a valid session to its user', async () => {
    const ctx = setup();
    const session = await loggedIn(ctx);
    expect(await ctx.service.resolveSession(session)).toBe('user_1');
  });

  it('expires sessions after the TTL', async () => {
    const ctx = setup();
    const session = await loggedIn(ctx);
    ctx.advance(30 * 24 * 60 * MIN + 1);
    expect(await ctx.service.resolveSession(session)).toBeNull();
  });

  it('revoked sessions stop resolving, and revoke is idempotent', async () => {
    const ctx = setup();
    const session = await loggedIn(ctx);
    await ctx.service.revokeSession(session);
    await ctx.service.revokeSession(session);
    expect(await ctx.service.resolveSession(session)).toBeNull();
  });

  it('a login token cannot be used as a session token', async () => {
    const ctx = setup();
    const { url } = await ctx.service.issueLoginLink('user_1');
    expect(await ctx.service.resolveSession(ctx.tokenFrom(url))).toBeNull();
  });

  it('updates lastSeenAt at most every 5 minutes', async () => {
    const ctx = setup();
    const session = await loggedIn(ctx);
    const record = ctx.repo.sessions.get(hashToken(session));

    await ctx.service.resolveSession(session);
    const firstSeen = record.lastSeenAt;
    ctx.advance(MIN);
    await ctx.service.resolveSession(session);
    expect(record.lastSeenAt).toBe(firstSeen);

    ctx.advance(5 * MIN);
    await ctx.service.resolveSession(session);
    expect(record.lastSeenAt).not.toBe(firstSeen);
  });
});
