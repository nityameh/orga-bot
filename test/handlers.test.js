// test/handlers.test.js
// Integration tests — uses real DB + real sender (dev mode logs to console).
// Verifies DB state after each operation.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const prisma = require('../src/db');
const { handleNote } = require('../src/handlers/note');
const { handleTask, handleTaskDone } = require('../src/handlers/task');
const { handleReminder } = require('../src/handlers/reminder');
const { handleUndo } = require('../src/handlers/delete');

const PHONE = '910000000001';
let testUser;
const msg = (text) => ({ from: PHONE, text, id: `test_${Date.now()}` });

beforeAll(async () => {
  testUser = await prisma.user.upsert({
    where: { phone: PHONE },
    update: {},
    create: { phone: PHONE, tier: 'free', lang: 'en' },
  });
});

afterAll(async () => {
  await prisma.reminder.deleteMany({ where: { userId: testUser.id } });
  await prisma.task.deleteMany({ where: { userId: testUser.id } });
  await prisma.note.deleteMany({ where: { userId: testUser.id } });
  await prisma.pendingAction.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.delete({ where: { id: testUser.id } });
  await prisma.$disconnect();
});

// ─── NOTE ─────────────────────────────────────────────────────────────────

describe('handleNote', () => {
  it('saves note to DB with correct fields', async () => {
    const intent = { title: 'Test meeting', body: 'met rahul about logo', tags: ['#rahul'], client: 'rahul', project: null };
    await handleNote(testUser, intent, msg('met rahul about logo'));

    const note = await prisma.note.findFirst({
      where: { userId: testUser.id, title: 'Test meeting' },
    });
    expect(note).toBeTruthy();
    expect(note.client).toBe('rahul');
    expect(note.tags).toContain('#rahul');
    expect(note.body).toBe('met rahul about logo');
    expect(note.deletedAt).toBeNull();
  });

  it('blocks at 50 notes for free tier', async () => {
    // Create 49 more notes (1 already exists from above)
    for (let i = 0; i < 49; i++) {
      await prisma.note.create({ data: { userId: testUser.id, title: `Fill ${i}`, tags: [] } });
    }

    const before = await prisma.note.count({ where: { userId: testUser.id, deletedAt: null } });
    expect(before).toBe(50);

    const intent = { title: 'Over limit', tags: [], client: null, project: null };
    await handleNote(testUser, intent, msg('over limit'));

    // Should NOT have created the 51st note
    const overNote = await prisma.note.findFirst({ where: { userId: testUser.id, title: 'Over limit' } });
    expect(overNote).toBeNull();

    // Cleanup fillers
    await prisma.note.deleteMany({ where: { userId: testUser.id, title: { startsWith: 'Fill' } } });
  });

  it('allows pro users past limit', async () => {
    const proUser = { ...testUser, tier: 'pro' };
    const intent = { title: 'Pro note', body: 'pro content', tags: [], client: null, project: null };
    await handleNote(proUser, intent, msg('pro content'));

    const note = await prisma.note.findFirst({ where: { userId: testUser.id, title: 'Pro note' } });
    expect(note).toBeTruthy();
  });
});

// ─── TASK ─────────────────────────────────────────────────────────────────

describe('handleTask', () => {
  it('creates task with correct items', async () => {
    const intent = { title: 'Test tasks', body: 'tasks: alpha, beta, gamma', tags: [], client: null };
    await handleTask(testUser, intent, msg('tasks: alpha, beta, gamma'));

    const task = await prisma.task.findFirst({ where: { userId: testUser.id, title: 'Test tasks' } });
    expect(task).toBeTruthy();
    expect(task.items).toHaveLength(3);
    expect(task.items[0].text).toBe('alpha');
    expect(task.items[0].done).toBe(false);
    expect(task.items[2].text).toBe('gamma');
  });

  it('appends to existing task list', async () => {
    const existing = await prisma.task.create({
      data: {
        userId: testUser.id, title: 'Append list', client: 'appendtest',
        items: [{ id: 1, text: 'old item', done: false, order: 0 }], tags: [],
      },
    });

    const intent = { title: 'T', body: 'add to appendtest tasks: new item', tags: [], client: 'appendtest', append: true, targetList: 'appendtest' };
    await handleTask(testUser, intent, msg('add to appendtest tasks: new item'));

    const updated = await prisma.task.findUnique({ where: { id: existing.id } });
    expect(updated.items).toHaveLength(2);
    expect(updated.items[1].text).toBe('new item');
    expect(updated.items[1].id).toBe(2);
  });
});

// ─── TASK DONE ────────────────────────────────────────────────────────────

describe('handleTaskDone', () => {
  it('marks item as done in DB', async () => {
    const task = await prisma.task.create({
      data: {
        userId: testUser.id, title: 'Done test',
        items: [{ id: 1, text: 'do this', done: false, order: 0 }, { id: 2, text: 'do that', done: false, order: 1 }],
        tags: [],
      },
    });

    await handleTaskDone(testUser, msg('done 1'));

    const updated = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updated.items[0].done).toBe(true);
    expect(updated.items[1].done).toBe(false);
  });

  it('returns false for non-done messages', async () => {
    expect(await handleTaskDone(testUser, msg('hello'))).toBe(false);
  });
});

// ─── REMINDER ─────────────────────────────────────────────────────────────

describe('handleReminder', () => {
  it('creates pending reminder in DB', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const intent = { title: 'Test reminder', datetime: tomorrow, tags: [], client: null };
    await handleReminder(testUser, intent, msg('remind me'));

    const rem = await prisma.reminder.findFirst({ where: { userId: testUser.id, title: 'Test reminder' } });
    expect(rem).toBeTruthy();
    expect(rem.status).toBe('pending');
  });

  it('does not create reminder with past datetime', async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const intent = { title: 'Past reminder', datetime: past, tags: [], client: null };
    await handleReminder(testUser, intent, msg('remind me yesterday'));

    const rem = await prisma.reminder.findFirst({ where: { userId: testUser.id, title: 'Past reminder' } });
    expect(rem).toBeNull();
  });
});

// ─── UNDO ─────────────────────────────────────────────────────────────────

describe('handleUndo', () => {
  it('restores soft-deleted note', async () => {
    const note = await prisma.note.create({
      data: { userId: testUser.id, title: 'Undo test', tags: [], deletedAt: new Date() },
    });

    await handleUndo(testUser, msg('undo'));

    const restored = await prisma.note.findUnique({ where: { id: note.id } });
    expect(restored.deletedAt).toBeNull();
  });
});
