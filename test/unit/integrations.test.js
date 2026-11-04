// test/unit/integrations.test.js
// Token vault, Google OAuth (PKCE + encrypted state), token refresh/expiry,
// the approval gate in the tool registry, and the Google agent tools.

import { describe, it, expect, vi } from 'vitest';
const crypto = require('crypto');
const { z } = require('zod');
const { createTokenVault } = require('../../src/integrations/tokenVault');
const { createGoogleOAuth, GoogleAuthExpiredError } = require('../../src/integrations/google/oauth');
const { createGoogleClient, GoogleNotConnectedError } = require('../../src/integrations/google/client');
const { createToolRegistry } = require('../../src/agent/toolRegistry');
const { createGoogleTools } = require('../../src/agent/tools/google');

const KEY = crypto.randomBytes(32).toString('base64');
const vault = createTokenVault(KEY);

describe('token vault (AES-256-GCM)', () => {
  it('round-trips and uses a fresh IV every time', () => {
    const a = vault.encrypt('ya29.secret');
    expect(vault.decrypt(a)).toBe('ya29.secret');
    expect(vault.encrypt('ya29.secret')).not.toBe(a);
    expect(a.startsWith('v1:')).toBe(true);
    expect(a).not.toContain('secret');
  });

  it('detects tampering and wrong keys', () => {
    const sealed = vault.encrypt('token');
    const parts = sealed.split(':');
    const flipped = Buffer.from(parts[3], 'base64');
    flipped[0] ^= 1;
    expect(() => vault.decrypt([...parts.slice(0, 3), flipped.toString('base64')].join(':'))).toThrow();
    expect(() => createTokenVault(crypto.randomBytes(32).toString('base64')).decrypt(sealed)).toThrow();
    expect(() => vault.decrypt('v2:a:b:c')).toThrow(/format/);
  });

  it('rejects keys that are not 32 bytes', () => {
    expect(() => createTokenVault(Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
  });
});

describe('Google OAuth', () => {
  let now = 1_000_000;
  const postForm = vi.fn();
  const oauth = createGoogleOAuth({ clientId: 'cid', clientSecret: 'sec', redirectUri: 'https://api/cb', vault, postForm, clock: () => now });

  it('builds a consent URL with PKCE S256, offline access and least-privilege scopes', () => {
    const url = new URL(oauth.buildAuthUrl('user_1'));
    const p = url.searchParams;
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('access_type')).toBe('offline');
    expect(p.get('scope')).toContain('gmail.readonly');
    expect(p.get('scope')).not.toMatch(/gmail\.(modify|send)|auth\/gmail(\s|$)/);
    expect(oauth.parseState(p.get('state'))).toMatchObject({ userId: 'user_1' });
  });

  it('the PKCE challenge matches the verifier carried in state', () => {
    const p = new URL(oauth.buildAuthUrl('u')).searchParams;
    const { verifier } = oauth.parseState(p.get('state'));
    expect(crypto.createHash('sha256').update(verifier).digest('base64url')).toBe(p.get('code_challenge'));
  });

  it('rejects forged, tampered and expired state', () => {
    const state = new URL(oauth.buildAuthUrl('u')).searchParams.get('state');
    expect(oauth.parseState('forged')).toBeNull();
    expect(oauth.parseState(state.slice(0, -4) + 'AAAA')).toBeNull();
    expect(oauth.parseState(undefined)).toBeNull();
    now += 11 * 60 * 1000;
    expect(oauth.parseState(state)).toBeNull();
  });

  it('exchanges the code with the verifier and reads the account email', async () => {
    const idToken = `x.${Buffer.from(JSON.stringify({ email: 'me@gmail.com' })).toString('base64url')}.sig`;
    postForm.mockResolvedValueOnce({ access_token: 'at', refresh_token: 'rt', expires_in: 3599, scope: 'openid email', id_token: idToken });
    const tokens = await oauth.exchangeCode('code123', 'verifier123');
    const body = postForm.mock.calls.at(-1)[1];
    expect(body.get('code_verifier')).toBe('verifier123');
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(tokens).toMatchObject({ accessToken: 'at', refreshToken: 'rt', email: 'me@gmail.com' });
  });

  it('refreshes without an id_token and revokes best-effort (never throws)', async () => {
    postForm.mockResolvedValueOnce({ access_token: 'at2', expires_in: 3600 });
    expect(await oauth.refresh('rt')).toMatchObject({ accessToken: 'at2', email: null, refreshToken: undefined });
    postForm.mockRejectedValueOnce(new Error('network'));
    await expect(oauth.revoke('rt')).resolves.toBeUndefined();
    expect(postForm.mock.calls.at(-1)[0]).toBe('https://oauth2.googleapis.com/revoke');
  });

  it('propagates refresh errors other than invalid_grant', async () => {
    postForm.mockRejectedValueOnce({ response: { data: { error: 'server_error' } } });
    await expect(oauth.refresh('rt')).rejects.toMatchObject({ response: { data: { error: 'server_error' } } });
  });

  it('maps invalid_grant on refresh to GoogleAuthExpiredError', async () => {
    postForm.mockRejectedValueOnce({ response: { data: { error: 'invalid_grant' } } });
    await expect(oauth.refresh('rt')).rejects.toBeInstanceOf(GoogleAuthExpiredError);
  });
});

describe('Google client: refresh and expiry', () => {
  function setup({ expiresInMs = 3600_000, refresh, httpImpl } = {}) {
    const now = 5_000_000;
    const row = { id: 'i1', userId: 'u1', accessTokenEnc: vault.encrypt('old'), refreshTokenEnc: vault.encrypt('rt'), expiresAt: new Date(now + expiresInMs) };
    const store = { find: vi.fn().mockResolvedValue(row), update: vi.fn() };
    const oauth = { refresh: refresh ?? vi.fn().mockResolvedValue({ accessToken: 'new', expiresAt: new Date(now + 3600_000) }) };
    const http = vi.fn(httpImpl ?? (async ({ token }) => ({ token })));
    const onExpired = vi.fn();
    const client = createGoogleClient({ store, vault, oauth, http, onExpired, clock: () => now });
    return { client, store, oauth, http, onExpired };
  }

  it('uses the stored token while it is valid', async () => {
    const { client, oauth } = setup();
    expect(await client.request('u1', { url: 'x' })).toEqual({ token: 'old' });
    expect(oauth.refresh).not.toHaveBeenCalled();
  });

  it('refreshes shortly before expiry and stores the new token encrypted', async () => {
    const { client, store } = setup({ expiresInMs: 30_000 });
    expect(await client.request('u1', { url: 'x' })).toEqual({ token: 'new' });
    const saved = store.update.mock.calls[0][1];
    expect(vault.decrypt(saved.accessTokenEnc)).toBe('new');
  });

  it('retries once with a refreshed token after a 401', async () => {
    let calls = 0;
    const { client } = setup({ httpImpl: async ({ token }) => { if (calls++ === 0) throw { response: { status: 401 } }; return { token }; } });
    expect(await client.request('u1', { url: 'x' })).toEqual({ token: 'new' });
  });

  it('marks the integration expired and notifies when Google rejects the refresh token', async () => {
    const { client, store, onExpired } = setup({ expiresInMs: 0, refresh: vi.fn().mockRejectedValue(new GoogleAuthExpiredError('x')) });
    await expect(client.request('u1', { url: 'x' })).rejects.toBeInstanceOf(GoogleNotConnectedError);
    expect(store.update).toHaveBeenCalledWith('i1', { status: 'expired' });
    expect(onExpired).toHaveBeenCalledWith('u1');
  });

  it('throws GoogleNotConnectedError when there is no active integration', async () => {
    const client = createGoogleClient({ store: { find: async () => null, update: vi.fn() }, vault, oauth: {}, http: vi.fn() });
    await expect(client.request('u1', { url: 'x' })).rejects.toBeInstanceOf(GoogleNotConnectedError);
  });
});

describe('approval gate (external tools)', () => {
  const run = vi.fn(async () => ({ sent: true }));
  const registry = createToolRegistry([{
    name: 'invite', description: 'd', permission: 'external',
    inputSchema: z.strictObject({ email: z.string().email() }),
    describe: ({ email }) => `Invite ${email}`,
    execute: run,
  }]);
  const ctx = { user: { id: 'u' }, now: new Date() };

  it('parks the validated call for approval instead of running it', async () => {
    const requests = [];
    const res = await registry.execute('invite', { email: 'a@b.co' }, { ...ctx, requestApproval: (r) => requests.push(r) });
    expect(run).not.toHaveBeenCalled();
    expect(res).toMatchObject({ ok: true, result: { status: 'awaiting_user_approval', action: 'Invite a@b.co' } });
    expect(requests).toEqual([{ toolName: 'invite', input: { email: 'a@b.co' }, summary: 'Invite a@b.co' }]);
  });

  it('does not park invalid input', async () => {
    const requests = [];
    expect(await registry.execute('invite', { email: 'nope' }, { ...ctx, requestApproval: (r) => requests.push(r) })).toMatchObject({ ok: false });
    expect(requests).toHaveLength(0);
  });

  it('executeApproved re-validates and runs', async () => {
    expect(await registry.executeApproved('invite', { email: 'a@b.co' }, ctx)).toEqual({ ok: true, result: { sent: true } });
    expect(await registry.executeApproved('invite', { email: 'tampered' }, ctx)).toMatchObject({ ok: false });
  });
});

describe('Google agent tools', () => {
  const api = {
    listEvents: vi.fn().mockResolvedValue([{ title: 'Acme sync', start: '2026-11-06T10:00:00+05:30', allDay: false, attendees: ['r@acme.com'], location: null }]),
    createEvent: vi.fn().mockResolvedValue({ id: 'e1', link: 'https://cal/e1' }),
    searchEmail: vi.fn().mockResolvedValue([{ id: 'm1', from: 'Ravi', subject: 'Invoice', date: 'x', snippet: 'Please pay' }]),
  };
  const registry = createToolRegistry(createGoogleTools(api));
  const ctx = { user: { id: 'u1' }, now: new Date('2026-11-05T04:30:00Z') };

  it('lists calendar events formatted in IST', async () => {
    const res = await registry.execute('list_calendar_events', {}, ctx);
    expect(res.result.events[0]).toMatchObject({ title: 'Acme sync', attendees: ['r@acme.com'] });
    expect(api.listEvents.mock.calls[0][0]).toBe('u1');
  });

  it('marks email results as untrusted third-party content', async () => {
    const res = await registry.execute('search_email', { query: 'from:ravi' }, ctx);
    expect(res.result.untrusted_third_party_content).toBe(true);
    expect(api.searchEmail).toHaveBeenCalledWith('u1', 'from:ravi', 5);
  });

  it('creating an event requires approval; once approved it validates times', async () => {
    const requests = [];
    const input = { title: 'Acme review', start: '2026-11-09T15:00:00+05:30', end: '2026-11-09T15:30:00+05:30', attendees: ['r@acme.com'] };
    await registry.execute('create_calendar_event', input, { ...ctx, requestApproval: (r) => requests.push(r) });
    expect(api.createEvent).not.toHaveBeenCalled();
    expect(requests[0].summary).toMatch(/Acme review.*invite r@acme\.com/);

    expect((await registry.executeApproved('create_calendar_event', input, ctx)).ok).toBe(true);
    expect(await registry.executeApproved('create_calendar_event', { ...input, end: input.start }, ctx)).toMatchObject({ ok: false, error: 'End must be after start.' });
  });

  it('explains to the model when Google is not connected', async () => {
    api.listEvents.mockRejectedValueOnce(new GoogleNotConnectedError("Google isn't connected."));
    expect(await registry.execute('list_calendar_events', {}, ctx)).toEqual({ ok: false, error: "Google isn't connected." });
  });
});
