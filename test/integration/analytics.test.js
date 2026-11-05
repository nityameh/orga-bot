// test/integration/analytics.test.js
// Analytics API on real Postgres: user scoping, filters, pagination, validation.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const prisma = require('../../src/db');

let server, baseUrl, me, other, cookie;

async function login(userId) {
  const { authService } = require('../../src/auth');
  const { url } = await authService.issueLoginLink(userId);
  const res = await fetch(`${baseUrl}/api/v1/auth/exchange`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: url.split('#token=')[1] }),
  });
  return res.headers.get('set-cookie').split(';')[0];
}

const get = async (path) => {
  const res = await fetch(`${baseUrl}/api/v1/analytics${path}`, { headers: { Cookie: cookie } });
  return { status: res.status, body: await res.json() };
};

beforeAll(async () => {
  [me, other] = await Promise.all(['910000000060', '910000000061'].map((phone) =>
    prisma.user.upsert({ where: { phone }, update: {}, create: { phone } })));

  const minutesAgo = (m) => new Date(Date.now() - m * 60_000);
  await prisma.interaction.createMany({
    data: [
      { userId: me.id, kind: 'message.received', channel: 'telegram', createdAt: minutesAgo(30) },
      { userId: me.id, kind: 'agent.turn', summary: 'save_note', tokensIn: 1000, tokensOut: 50, costMicros: 4000, payload: { outcome: 'answered', latencyMs: 1800, model: 'claude-opus-5-5', tools: [{ name: 'save_note', ok: true }], secret: 'x' }, createdAt: minutesAgo(29) },
      { userId: me.id, kind: 'note.created', person: 'acme', summary: 'Logo brief', createdAt: minutesAgo(28) },
      { userId: me.id, kind: 'reminder.created', person: 'ravi', summary: 'Call Ravi', createdAt: new Date(Date.now() - 20 * 86400_000) },
      { userId: me.id, kind: 'nudge.sent', summary: '2 reminders today', payload: { rule: 'morning_brief', dedupeKey: 'k' }, createdAt: minutesAgo(10) },
      { userId: other.id, kind: 'note.created', person: 'secretclient', summary: 'Other user note', createdAt: minutesAgo(5) },
    ],
  });

  const { createApp } = require('../../src/app');
  await new Promise((resolve) => { server = createApp().listen(0, () => { baseUrl = `http://localhost:${server.address().port}`; resolve(); }); });
  cookie = await login(me.id);
});

afterAll(async () => {
  server?.close();
  await prisma.user.deleteMany({ where: { id: { in: [me.id, other.id] } } });
  await prisma.$disconnect();
});

describe('analytics API', () => {
  it('requires a session', async () => {
    expect((await fetch(`${baseUrl}/api/v1/analytics/overview`)).status).toBe(401);
  });

  it('overview aggregates only the caller\'s data', async () => {
    const { status, body } = await get('/overview?days=7');
    expect(status).toBe(200);
    expect(body.messages).toBe(1);
    expect(body.agent).toMatchObject({ turns: 1, latencyMs: { p50: 1800, p95: 1800 }, toolUse: { save_note: 1 } });
    expect(body.nudges.byRule).toEqual({ morning_brief: 1 });
    expect(body.series).toHaveLength(7);
    expect(body.heatmap).toHaveLength(7);
  });

  it('people lists the caller\'s people with the long-silent one flagged first', async () => {
    const { body } = await get('/people');
    expect(body.people.map((p) => p.person)).toEqual(['ravi', 'acme']);
    expect(body.people[0].goneQuiet).toBe(true);
    expect(JSON.stringify(body)).not.toContain('secretclient');
  });

  it('timeline filters by kind prefix and person, and never leaks raw payloads', async () => {
    const all = (await get('/timeline')).body;
    expect(all.items.map((i) => i.kind)).toContain('agent.turn');
    expect(JSON.stringify(all)).not.toContain('Other user note');
    const turn = all.items.find((i) => i.kind === 'agent.turn');
    expect(turn.details).toEqual({ outcome: 'answered', tools: [{ name: 'save_note', ok: true }], model: 'claude-opus-5-5', latencyMs: 1800 });

    expect((await get('/timeline?kind=reminder.*')).body.items.map((i) => i.summary)).toEqual(['Call Ravi']);
    expect((await get('/timeline?person=Acme')).body.items.map((i) => i.summary)).toEqual(['Logo brief']);
  });

  it('paginates with nextBefore', async () => {
    const first = (await get('/timeline?limit=2')).body;
    expect(first.items).toHaveLength(2);
    expect(first.nextBefore).toBeTruthy();
    const second = (await get(`/timeline?limit=2&before=${encodeURIComponent(first.nextBefore)}`)).body;
    expect(second.items[0].id).not.toBe(first.items[1].id);
  });

  it('rejects invalid query params with 400', async () => {
    expect((await get('/overview?days=9999')).status).toBe(400);
    expect((await get('/timeline?kind=drop.table')).status).toBe(400);
  });
});
