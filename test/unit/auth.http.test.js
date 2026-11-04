// test/unit/auth.http.test.js
// HTTP-layer tests for src/auth/http.js using a fake AuthService: the error
// and edge paths that are hard to reach through the real database.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
const express = require('express');
const cookieParser = require('cookie-parser');
const { createAuthHttp } = require('../../src/auth/http');

const VALID = 'v'.repeat(43);

function fakeService(overrides = {}) {
  return {
    resolveSession: vi.fn(async (t) => (t === VALID ? 'user_1' : null)),
    exchangeLoginToken: vi.fn(async (t) => (t === VALID ? { sessionToken: VALID, userId: 'user_1', expiresAt: new Date(Date.now() + 1e6) } : null)),
    revokeSession: vi.fn(async () => {}),
    issueLoginLink: vi.fn(),
    ...overrides,
  };
}

async function startApp({ service = fakeService(), findUser = async (id) => ({ id, tier: 'free', lang: 'en', createdAt: new Date(0), phone: '91' }) } = {}) {
  const http = createAuthHttp({ authService: service, findUser, secureCookies: true });
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/auth', http.requireJsonForMutations, http.router);
  app.get('/private', http.requireSession, (req, res) => res.json({ id: req.user.id }));
  app.delete('/private', http.requireJsonForMutations, (req, res) => res.json({ ok: true }));
  app.use((err, req, res, _next) => res.status(500).json({ error: 'boom' }));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  return { server, url: `http://localhost:${server.address().port}`, service };
}

describe('requireSession', () => {
  let ctx;
  beforeAll(async () => { ctx = await startApp({ findUser: async () => null }); });
  afterAll(() => ctx.server.close());

  it('401 when the session is valid but the user no longer exists', async () => {
    const res = await fetch(`${ctx.url}/private`, { headers: { Cookie: `orga_session=${VALID}` } });
    expect(res.status).toBe(401);
  });
});

describe('error propagation', () => {
  let ctx;
  beforeAll(async () => {
    const failing = async () => { throw new Error('db down'); };
    ctx = await startApp({
      service: fakeService({ resolveSession: failing, exchangeLoginToken: failing, revokeSession: failing }),
    });
  });
  afterAll(() => ctx.server.close());

  it.each([
    ['GET', '/private'],
    ['POST', '/auth/exchange'],
    ['POST', '/auth/logout'],
  ])('%s %s → 500 via central handler, without leaking the error', async (method, path) => {
    const res = await fetch(`${ctx.url}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: `orga_session=${VALID}` },
      body: method === 'POST' ? JSON.stringify({ token: VALID }) : undefined,
    });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('db down');
  });
});

describe('exchange', () => {
  let ctx;
  beforeAll(async () => { ctx = await startApp(); });
  afterAll(() => ctx.server.close());

  it('sets a Secure HttpOnly cookie when secureCookies is on', async () => {
    const res = await fetch(`${ctx.url}/auth/exchange`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: VALID }),
    });
    const cookie = res.headers.get('set-cookie');
    expect(res.status).toBe(200);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/HttpOnly/);
  });

  it('rate limits after 10 attempts per minute from one IP', async () => {
    const statuses = [];
    for (let i = 0; i < 11; i++) {
      const res = await fetch(`${ctx.url}/auth/exchange`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'bad' }),
      });
      statuses.push(res.status);
    }
    expect(statuses.at(-1)).toBe(429);
  });
});

describe('requireJsonForMutations', () => {
  let ctx;
  beforeAll(async () => { ctx = await startApp(); });
  afterAll(() => ctx.server.close());

  it('allows a bodiless DELETE that declares JSON', async () => {
    const res = await fetch(`${ctx.url}/private`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } });
    expect(res.status).toBe(200);
  });

  it('rejects a DELETE without a JSON content type', async () => {
    const res = await fetch(`${ctx.url}/private`, { method: 'DELETE' });
    expect(res.status).toBe(415);
  });

  it('accepts JSON with a charset parameter', async () => {
    const res = await fetch(`${ctx.url}/private`, { method: 'DELETE', headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    expect(res.status).toBe(200);
  });
});

describe('logout and me', () => {
  let ctx;
  beforeAll(async () => { ctx = await startApp(); });
  afterAll(() => ctx.server.close());

  it('logout revokes the cookie session and clears the cookie', async () => {
    const res = await fetch(`${ctx.url}/auth/logout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `orga_session=${VALID}` }, body: '{}',
    });
    expect(res.status).toBe(200);
    expect(ctx.service.revokeSession).toHaveBeenCalledWith(VALID);
    expect(res.headers.get('set-cookie')).toMatch(/orga_session=;/);
  });

  it('logout without a cookie still succeeds', async () => {
    const res = await fetch(`${ctx.url}/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(200);
  });

  it('GET /me returns profile fields but never the phone number', async () => {
    const res = await fetch(`${ctx.url}/auth/me`, { headers: { Cookie: `orga_session=${VALID}` } });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ id: 'user_1', tier: 'free', lang: 'en', createdAt: new Date(0).toISOString() });
  });

  it('GET /me without a cookie → 401', async () => {
    const res = await fetch(`${ctx.url}/auth/me`);
    expect(res.status).toBe(401);
  });

  it('exchange with no body → 401 (not 500)', async () => {
    const res = await fetch(`${ctx.url}/auth/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(res.status).toBe(401);
  });
});
