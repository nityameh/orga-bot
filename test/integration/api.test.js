// test/api.test.js
// Integration tests for REST API endpoints using real DB.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const prisma = require('../../src/db');

let baseUrl, server, testUser, testNote, testTask, sessionCookie;
const PHONE = '910000000002';

// Logs in through the real flow: issue link → POST /auth/exchange → session cookie.
async function login(userId) {
  const { authService } = require('../../src/auth');
  const { url } = await authService.issueLoginLink(userId);
  const token = url.split('#token=')[1];
  const res = await fetch(`${baseUrl}/api/v1/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return { res, token, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}

beforeAll(async () => {
  testUser = await prisma.user.upsert({
    where: { phone: PHONE },
    update: {},
    create: { phone: PHONE, tier: 'free', lang: 'en' },
  });

  testNote = await prisma.note.create({
    data: { userId: testUser.id, title: 'API test note', body: 'test body', tags: ['#test'], client: 'apiclient' },
  });
  testTask = await prisma.task.create({
    data: { userId: testUser.id, title: 'API test task', items: [{ id: 1, text: 'item', done: false }], tags: [] },
  });
  await prisma.reminder.create({
    data: { userId: testUser.id, title: 'API test reminder', fireAt: new Date(Date.now() + 86400000), status: 'pending' },
  });

  // Mount the real application (same middleware stack as production).
  const { createApp } = require('../../src/app');
  const app = createApp();
  await new Promise(resolve => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });

  sessionCookie = (await login(testUser.id)).cookie;
});

afterAll(async () => {
  server?.close();
  await prisma.session.deleteMany({ where: { userId: testUser.id } });
  await prisma.loginToken.deleteMany({ where: { userId: testUser.id } });
  await prisma.reminder.deleteMany({ where: { userId: testUser.id } });
  await prisma.task.deleteMany({ where: { userId: testUser.id } });
  await prisma.note.deleteMany({ where: { userId: testUser.id } });
  await prisma.pendingAction.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.delete({ where: { id: testUser.id } });
  await prisma.$disconnect();
});

async function api(method, path, body, cookie = sessionCookie) {
  const options = { method, headers: { 'Content-Type': 'application/json', Cookie: cookie } };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(`${baseUrl}/api/v1${path}`, options);
  return { status: res.status, data: await res.json() };
}

// ─── Notes ────────────────────────────────────────────────────────────────

describe('Notes API', () => {
  it('GET /notes returns notes', async () => {
    const { status, data } = await api('GET', '/notes');
    expect(status).toBe(200);
    expect(data.notes.length).toBeGreaterThanOrEqual(1);
    expect(data.total).toBeTypeOf('number');
  });

  it('POST /notes creates a note', async () => {
    const { status, data } = await api('POST', '/notes', { title: 'Created via API', tags: ['#api'] });
    expect(status).toBe(201);
    expect(data.title).toBe('Created via API');
  });

  it('POST /notes rejects without title', async () => {
    const { status } = await api('POST', '/notes', { body: 'no title' });
    expect(status).toBe(400);
  });

  it('POST /notes/:id/pin toggles pin', async () => {
    const { status, data } = await api('POST', `/notes/${testNote.id}/pin`);
    expect(status).toBe(200);
    expect(data.pinned).toBe(true);
  });

  it('POST /notes/:id/archive toggles archive', async () => {
    const { status, data } = await api('POST', `/notes/${testNote.id}/archive`);
    expect(status).toBe(200);
    expect(data.archivedAt).toBeTruthy();
  });

  it('PUT /notes/:id updates note', async () => {
    const { status, data } = await api('PUT', `/notes/${testNote.id}`, { title: 'Updated title' });
    expect(status).toBe(200);
    expect(data.title).toBe('Updated title');
  });

  it('DELETE /notes/:id soft deletes', async () => {
    // Create a note to delete
    const { data: created } = await api('POST', '/notes', { title: 'To delete', tags: [] });
    const { status, data } = await api('DELETE', `/notes/${created.id}`);
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });
});

// ─── Tasks ────────────────────────────────────────────────────────────────

describe('Tasks API', () => {
  it('GET /tasks returns tasks', async () => {
    const { status, data } = await api('GET', '/tasks');
    expect(status).toBe(200);
    expect(data.tasks.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /tasks creates a task list', async () => {
    const { status, data } = await api('POST', '/tasks', { title: 'API tasks', items: ['x', 'y'] });
    expect(status).toBe(201);
    expect(data.items).toHaveLength(2);
    expect(data.items[0].done).toBe(false);
  });

  it('POST /tasks rejects without items', async () => {
    const { status } = await api('POST', '/tasks', { title: 'Empty' });
    expect(status).toBe(400);
  });

  it('PUT /tasks/:id/items updates items', async () => {
    const newItems = [{ id: 1, text: 'updated', done: true, order: 0 }];
    const { status, data } = await api('PUT', `/tasks/${testTask.id}/items`, { items: newItems });
    expect(status).toBe(200);
    expect(data.items[0].done).toBe(true);
  });

  it('DELETE /tasks/:id deletes', async () => {
    const { data: created } = await api('POST', '/tasks', { title: 'To delete', items: ['a'] });
    const { status, data } = await api('DELETE', `/tasks/${created.id}`);
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });
});

// ─── Reminders ────────────────────────────────────────────────────────────

describe('Reminders API', () => {
  it('GET /reminders returns reminders', async () => {
    const { status, data } = await api('GET', '/reminders');
    expect(status).toBe(200);
    expect(data.reminders.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /reminders creates a reminder', async () => {
    const { status, data } = await api('POST', '/reminders', {
      title: 'API reminder', fireAt: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(status).toBe(201);
    expect(data.title).toBe('API reminder');
  });

  it('POST /reminders rejects past datetime', async () => {
    const { status } = await api('POST', '/reminders', {
      title: 'Past', fireAt: new Date(Date.now() - 86400000).toISOString(),
    });
    expect(status).toBe(400);
  });

  it('DELETE /reminders/:id deletes', async () => {
    const { data: created } = await api('POST', '/reminders', {
      title: 'To delete', fireAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const { status, data } = await api('DELETE', `/reminders/${created.id}`);
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });
});

// ─── Auth ─────────────────────────────────────────────────────────────────

describe('Auth (ADR-006)', () => {
  it('rejects requests without a session cookie', async () => {
    const res = await fetch(`${baseUrl}/api/v1/notes`);
    expect(res.status).toBe(401);
  });

  it('no longer accepts ?phone= as authentication', async () => {
    const res = await fetch(`${baseUrl}/api/v1/notes?phone=${PHONE}`, { headers: { 'X-User-Phone': PHONE } });
    expect(res.status).toBe(401);
  });

  it('rejects a forged session cookie', async () => {
    const { status } = await api('GET', '/notes', null, `orga_session=${'a'.repeat(43)}`);
    expect(status).toBe(401);
  });

  it('sets an HttpOnly SameSite cookie on exchange', async () => {
    const { res } = await login(testUser.id);
    const setCookie = res.headers.get('set-cookie');
    expect(res.status).toBe(200);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
  });

  it('rejects reuse of a login token', async () => {
    const { token } = await login(testUser.id);
    const res = await fetch(`${baseUrl}/api/v1/auth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    expect(res.status).toBe(401);
  });

  it('GET /auth/me returns the session user without the phone number', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/me`, { headers: { Cookie: sessionCookie } });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.id).toBe(testUser.id);
    expect(data.phone).toBeUndefined();
  });

  it('rejects non-JSON mutations (CSRF guard)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: sessionCookie },
      body: 'title=csrf',
    });
    expect(res.status).toBe(415);
  });

  it('logout revokes the session', async () => {
    const { cookie } = await login(testUser.id);
    await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: '{}',
    });
    const { status } = await api('GET', '/notes', null, cookie);
    expect(status).toBe(401);
  });
});

// ─── Clients ──────────────────────────────────────────────────────────────

describe('Clients API', () => {
  it('GET /clients returns client list', async () => {
    const { status, data } = await api('GET', '/clients');
    expect(status).toBe(200);
    expect(data.clients).toBeDefined();
  });
});
