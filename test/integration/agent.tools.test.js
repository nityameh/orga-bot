// test/integration/agent.tools.test.js
// Agent tools against a real database, called through the registry exactly as
// the agent loop calls them (validation → permission → execute).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const prisma = require('../../src/db');
const { tools, selectProvider } = require('../../src/agent');

const NOW = new Date();
const inHours = (h) => new Date(NOW.getTime() + h * 3600_000);
const ist = (d) => new Date(d.getTime() + 330 * 60_000).toISOString().replace(/\.\d{3}Z$/, '+05:30');
let me, other;
const call = (name, input, user = me) => tools.execute(name, input, { user, now: NOW });

beforeAll(async () => {
  [me, other] = await Promise.all(['910000000030', '910000000031'].map((phone) =>
    prisma.user.upsert({ where: { phone }, update: {}, create: { phone } })));
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [me.id, other.id] } } });
  await prisma.$disconnect();
});

describe('notes', () => {
  it('save_note stores the note and search_notes finds it by keyword and by person', async () => {
    const saved = await call('save_note', { title: 'Acme wants a dark logo', body: 'minimal, serif', tags: ['#acme', '#design'], person: 'acme' });
    expect(saved.ok).toBe(true);

    const byWord = await call('search_notes', { query: 'logo' });
    expect(byWord.result.matches.map((m) => m.title)).toContain('Acme wants a dark logo');

    const byPerson = await call('search_notes', { person: 'acme' });
    expect(byPerson.result.matches).toHaveLength(1);
  });

  it("search never returns another user's notes", async () => {
    await prisma.note.create({ data: { userId: other.id, title: 'Other secret logo', tags: [] } });
    const res = await call('search_notes', { query: 'secret logo' });
    expect(res.result.matches.map((m) => m.title)).not.toContain('Other secret logo');
  });

  it('rejects malformed tags', async () => {
    expect(await call('save_note', { title: 'x', tags: ['Not A Tag'] })).toMatchObject({ ok: false });
  });
});

describe('tasks', () => {
  it('create → list → complete an item', async () => {
    const created = await call('create_task_list', { title: 'Launch', items: ['Send invoice', 'Review brief'] });
    const { taskId } = created.result;

    const done = await call('complete_task_item', { taskId, itemId: 2 });
    expect(done.result).toMatchObject({ done: 'Review brief', remaining: 1 });

    const listed = await call('list_tasks', {});
    const launch = listed.result.lists.find((l) => l.taskId === taskId);
    expect(launch.items.map((i) => i.text)).toEqual(['Send invoice']);
  });

  it("cannot complete another user's task", async () => {
    const theirs = await prisma.task.create({ data: { userId: other.id, title: 'theirs', tags: [], items: [{ id: 1, text: 'x', done: false }] } });
    expect(await call('complete_task_item', { taskId: theirs.id, itemId: 1 })).toMatchObject({ ok: false, error: 'No such task list for this user.' });
  });
});

describe('reminders', () => {
  it('creates a future reminder and rejects past or invalid times', async () => {
    const ok = await call('create_reminder', { title: 'Call Ravi', fireAt: ist(inHours(3)) });
    expect(ok.ok).toBe(true);

    const past = await call('create_reminder', { title: 'Too late', fireAt: ist(inHours(-1)) });
    expect(past).toMatchObject({ ok: false });
    expect(past.error).toMatch(/in the past/);

    expect(await call('create_reminder', { title: 'x', fireAt: 'tomorrow 9am' })).toMatchObject({ ok: false });
  });

  it('lists and cancels reminders, scoped to the user', async () => {
    const theirs = await prisma.reminder.create({ data: { userId: other.id, title: 'their reminder', fireAt: inHours(2) } });

    const listed = await call('list_reminders', {});
    expect(listed.result.reminders.map((r) => r.title)).toEqual(['Call Ravi']);

    expect(await call('cancel_reminder', { reminderId: theirs.id })).toMatchObject({ ok: false });
    expect(await prisma.reminder.findUnique({ where: { id: theirs.id } })).not.toBeNull();

    const mine = listed.result.reminders[0].reminderId;
    expect((await call('cancel_reminder', { reminderId: mine })).result.cancelled).toBe('Call Ravi');
  });

  it('get_today summarises open items', async () => {
    const res = await call('get_today', {});
    expect(res.result.openTaskCount).toBeGreaterThanOrEqual(1);
    expect(res.result.now).toBeTruthy();
  });
});

describe('provider selection', () => {
  const base = { AGENT_PROVIDER: 'auto' };
  it('prefers Anthropic, falls back to Groq, and can be turned off', () => {
    expect(selectProvider({ ...base, ANTHROPIC_API_KEY: 'a', GROQ_API_KEY: 'g' })).toMatchObject({ name: 'anthropic', model: 'claude-opus-5-5' });
    expect(selectProvider({ ...base, GROQ_API_KEY: 'g' })).toMatchObject({ name: 'groq', model: 'llama-3.3-70b-versatile' });
    expect(selectProvider({ ...base, ANTHROPIC_API_KEY: 'a', AGENT_MODEL: 'claude-sonnet-5-5' })).toMatchObject({ model: 'claude-sonnet-5-5' });
    expect(selectProvider({ AGENT_PROVIDER: 'off', ANTHROPIC_API_KEY: 'a' })).toBeNull();
    expect(selectProvider(base)).toBeNull();
  });
});
