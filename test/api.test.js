// test/api.test.js
// Integration tests for REST API endpoints using real DB.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const express = require('express');
const prisma = require('../src/db');

let baseUrl, server, testUser, testNote, testTask, testReminder;
const PHONE = '910000000002';

beforeAll(async () => {
  // Create test user
  testUser = await prisma.user.upsert({
    where: { phone: PHONE },
    update: {},
    create: { phone: PHONE, tier: 'free', lang: 'en' },
  });

  // Create test data
  testNote = await prisma.note.create({
    data: { userId: testUser.id, title: 'API test note', body: 'test body', tags: ['#test'], client: 'apiclient' },
  });
  testTask = await prisma.task.create({
    data: { userId: testUser.id, title: 'API test task', items: [{ id: 1, text: 'item', done: false }], tags: [] },
  });
  testReminder = await prisma.reminder.create({
    data: { userId: testUser.id, title: 'API test reminder', fireAt: new Date(Date.now() + 86400000), status: 'pending' },
  });

  // Start test server
  const app = express();
  app.use(express.json());
  app.use('/api/v1', require('../src/api'));
  return new Promise(resolve => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  server?.close();
  await prisma.reminder.deleteMany({ where: { userId: testUser.id } });
  await prisma.task.deleteMany({ where: { userId: testUser.id } });
  await prisma.note.deleteMany({ where: { userId: testUser.id } });
  await prisma.pendingAction.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.delete({ where: { id: testUser.id } });
  await prisma.$disconnect();
});

async function api(method, path, body) {
  const url = `${baseUrl}/api/v1${path}?phone=${PHONE}`;
  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(url, options);
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

describe('Auth middleware', () => {
  it('rejects requests without phone', async () => {
    const res = await fetch(`${baseUrl}/api/v1/notes`);
    expect(res.status).toBe(401);
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
