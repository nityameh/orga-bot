// test/integration/api.authorization.test.js
// Regression tests for IDOR (Insecure Direct Object Reference): a logged-in user
// must not read, modify or delete another user's rows by guessing ids.
// Threat model: T7 in docs/security/THREAT_MODEL.md.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const prisma = require('../../src/db');

const VICTIM_PHONE = '910000000010';
const ATTACKER_PHONE = '910000000011';
let server, baseUrl, victim, attacker, attackerCookie, note, task, reminder;

async function cookieFor(userId) {
  const { authService } = require('../../src/auth');
  const { url } = await authService.issueLoginLink(userId);
  const res = await fetch(`${baseUrl}/api/v1/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: url.split('#token=')[1] }),
  });
  return res.headers.get('set-cookie').split(';')[0];
}

function asAttacker(method, path, body) {
  return fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: attackerCookie },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeAll(async () => {
  [victim, attacker] = await Promise.all(
    [VICTIM_PHONE, ATTACKER_PHONE].map((phone) =>
      prisma.user.upsert({ where: { phone }, update: {}, create: { phone } }),
    ),
  );
  note = await prisma.note.create({ data: { userId: victim.id, title: 'secret', tags: [] } });
  task = await prisma.task.create({ data: { userId: victim.id, title: 'secret tasks', items: [], tags: [] } });
  reminder = await prisma.reminder.create({
    data: { userId: victim.id, title: 'secret reminder', fireAt: new Date(Date.now() + 86400000) },
  });

  const { createApp } = require('../../src/app');
  await new Promise((resolve) => {
    server = createApp().listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
  attackerCookie = await cookieFor(attacker.id);
});

afterAll(async () => {
  server?.close();
  const ids = [victim.id, attacker.id];
  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  await prisma.loginToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.note.deleteMany({ where: { userId: { in: ids } } });
  await prisma.task.deleteMany({ where: { userId: { in: ids } } });
  await prisma.reminder.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('cross-user access is denied', () => {
  it.each([
    ['GET', () => `/notes/${note.id}`],
    ['PUT', () => `/notes/${note.id}`, { title: 'pwned' }],
    ['DELETE', () => `/notes/${note.id}`],
    ['POST', () => `/notes/${note.id}/pin`, {}],
    ['GET', () => `/tasks/${task.id}`],
    ['PUT', () => `/tasks/${task.id}`, { title: 'pwned' }],
    ['PUT', () => `/tasks/${task.id}/items`, { items: [] }],
    ['DELETE', () => `/tasks/${task.id}`],
    ['PUT', () => `/reminders/${reminder.id}`, { title: 'pwned' }],
    ['DELETE', () => `/reminders/${reminder.id}`],
  ])('%s %s → 404', async (method, path, body) => {
    const res = await asAttacker(method, path(), body);
    expect(res.status).toBe(404);
  });

  it("leaves the victim's data untouched", async () => {
    const [n, t, r] = await Promise.all([
      prisma.note.findUnique({ where: { id: note.id } }),
      prisma.task.findUnique({ where: { id: task.id } }),
      prisma.reminder.findUnique({ where: { id: reminder.id } }),
    ]);
    expect(n.title).toBe('secret');
    expect(n.deletedAt).toBeNull();
    expect(n.pinned).toBe(false);
    expect(t.title).toBe('secret tasks');
    expect(r.title).toBe('secret reminder');
  });
});
