// test/integration/invites.webchat.test.js
// Invite-only access + web chat end to end on real Postgres (ADR-018):
// redeem → session cookie → chat in the browser → reply through the same
// pipeline as WhatsApp/Telegram (legacy classifier path in CI: no LLM key).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const prisma = require('../../src/db');
const { invites } = require('../../src/invites');

let server, baseUrl;
const createdUserIds = [];
let visitor = 0;

// Each simulated visitor gets its own client IP (the app trusts X-Forwarded-For
// from its proxy, as on Railway), so the per-IP rate limit doesn't interfere.
async function redeem(code, ip = `10.0.0.${++visitor}`) {
  const res = await fetch(`${baseUrl}/api/v1/auth/invite`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ code }),
  });
  const body = await res.json();
  const cookie = res.headers.get('set-cookie')?.split(';')[0];
  if (res.ok) {
    const me = await (await fetch(`${baseUrl}/api/v1/auth/me`, { headers: { Cookie: cookie } })).json();
    createdUserIds.push(me.id);
    return { status: res.status, body, cookie, userId: me.id };
  }
  return { status: res.status, body };
}

const chat = (cookie) => ({
  send: (text) => fetch(`${baseUrl}/api/v1/chat/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ text }) }),
  list: async (after) => (await (await fetch(`${baseUrl}/api/v1/chat/messages${after ? `?after=${encodeURIComponent(after)}` : ''}`, { headers: { Cookie: cookie } })).json()).messages,
});

async function waitFor(fn, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

beforeAll(async () => {
  const { createApp } = require('../../src/app');
  await new Promise((resolve) => { server = createApp().listen(0, () => { baseUrl = `http://localhost:${server.address().port}`; resolve(); }); });
});

afterAll(async () => {
  server?.close();
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.invite.deleteMany({ where: { label: { startsWith: 'test:' } } });
  await prisma.$disconnect();
});

describe('invites', () => {
  it('redeeming creates an account with a web identity, a session, and a welcome message', async () => {
    const { url, code } = await invites.createInvite({ label: 'test:single' });
    expect(url).toMatch(/\/invite#code=ORGA-/);
    const r = await redeem(code);
    expect(r.status).toBe(200);
    expect(r.cookie).toMatch(/^orga_session=/);
    const identity = await prisma.channelIdentity.findFirst({ where: { userId: r.userId, channel: 'web' } });
    expect(identity.externalId).toBe(r.userId);
    const welcome = await chat(r.cookie).list();
    expect(welcome[0]).toMatchObject({ direction: 'out' });
    expect(welcome[0].text).toMatch(/Welcome to Orga/);
  });

  it('is single-use by default, and rejects invalid, expired and revoked codes', async () => {
    const { code } = await invites.createInvite({ label: 'test:once' });
    expect((await redeem(code)).status).toBe(200);
    expect(await redeem(code)).toMatchObject({ status: 410, body: { reason: 'used_up' } });

    expect(await redeem('ORGA-2222-2222')).toMatchObject({ status: 404, body: { reason: 'invalid' } });

    const expired = await invites.createInvite({ label: 'test:expired', days: 1 });
    await prisma.invite.updateMany({ where: { label: 'test:expired' }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await redeem(expired.code)).toMatchObject({ status: 410, body: { reason: 'expired' } });

    const revoked = await invites.createInvite({ label: 'test:revoked' });
    expect(await invites.revokeInvite(revoked.code)).toBe(true);
    expect((await redeem(revoked.code)).status).toBe(404);
  });

  it('rate limits redemption attempts per IP (10 per minute)', async () => {
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await redeem('ORGA-2222-2222', '10.9.9.9')).status);
    expect(statuses.slice(0, 10).every((s) => s === 404)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('a 2-use invite admits exactly 2 people even when 3 redeem at once', async () => {
    const { code } = await invites.createInvite({ label: 'test:race', maxUses: 2 });
    const results = await Promise.all([redeem(code), redeem(code), redeem(code)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(2);
    expect((await prisma.invite.findFirst({ where: { label: 'test:race' } })).uses).toBe(2);
  });
});

describe('web chat', () => {
  it('a message gets a reply through the normal pipeline; users only see their own chat', async () => {
    const a = await redeem((await invites.createInvite({ label: 'test:chat-a' })).code);
    const b = await redeem((await invites.createInvite({ label: 'test:chat-b' })).code);
    const before = (await chat(a.cookie).list()).at(-1).createdAt;

    expect((await chat(a.cookie).send('note: logo concepts for acme')).status).toBe(202);
    const replies = await waitFor(async () => {
      const msgs = await chat(a.cookie).list(before);
      return msgs.some((m) => m.direction === 'out') ? msgs : null;
    });
    expect(replies.map((m) => m.direction)).toEqual(['in', 'out']);
    expect(replies[1].text).toMatch(/Note saved/i);
    expect(await prisma.note.count({ where: { userId: a.userId } })).toBe(1);

    const bView = await chat(b.cookie).list();
    expect(JSON.stringify(bView)).not.toContain('logo concepts');
  });

  it('validates input and requires a session', async () => {
    const a = await redeem((await invites.createInvite({ label: 'test:chat-v' })).code);
    expect((await chat(a.cookie).send('')).status).toBe(400);
    expect((await chat(a.cookie).send('x'.repeat(2001))).status).toBe(400);
    expect((await fetch(`${baseUrl}/api/v1/chat/messages`)).status).toBe(401);
  });

  it('/invite creates links for admins only', async () => {
    const user = await redeem((await invites.createInvite({ label: 'test:admin' })).code);
    const before = (await chat(user.cookie).list()).at(-1).createdAt;
    await chat(user.cookie).send('/invite 3');
    const refused = await waitFor(async () => (await chat(user.cookie).list(before)).find((m) => m.direction === 'out'));
    expect(refused.text).toMatch(/created by the Orga admin/);

    await prisma.user.update({ where: { id: user.userId }, data: { role: 'admin' } });
    const before2 = refused.createdAt;
    await chat(user.cookie).send('/invite 3');
    const created = await waitFor(async () => (await chat(user.cookie).list(before2)).find((m) => m.direction === 'out'));
    expect(created.text).toMatch(/Invite created[\s\S]*\/invite#code=ORGA-[\s\S]*3 people/);
    await prisma.invite.updateMany({ where: { createdById: user.userId }, data: { label: 'test:created-by-admin' } });
  });
});
