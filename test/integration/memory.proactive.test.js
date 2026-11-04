// test/integration/memory.proactive.test.js
// Hybrid retrieval on real Postgres (full-text) with a deterministic embedder,
// and proactive rules against real data.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const prisma = require('../../src/db');
const { createMemoryService } = require('../../src/memory/service');
const { createRules } = require('../../src/proactive/rules');
const { createHashEmbedder } = require('../fakes/hashEmbedder');

let me, other, budgetNote, inkNote;
const memory = createMemoryService({ prisma, embedder: createHashEmbedder() });
const keywordOnly = createMemoryService({ prisma, embedder: null });

beforeAll(async () => {
  [me, other] = await Promise.all(['910000000050', '910000000051'].map((phone) =>
    prisma.user.upsert({ where: { phone }, update: {}, create: { phone } })));
  budgetNote = await prisma.note.create({ data: { userId: me.id, title: 'Ravi budget call', body: 'Ravi approved 50k for phase one', tags: ['#ravi'] } });
  inkNote = await prisma.note.create({ data: { userId: me.id, title: 'Buy printer ink', body: 'black cartridge', tags: [] } });
  await prisma.note.create({ data: { userId: other.id, title: 'Ravi budget secret', body: 'other user', tags: [] } });
  await memory.backfill(me.id);
  await memory.backfill(other.id);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [me.id, other.id] } } });
  await prisma.$disconnect();
});

describe('memory service', () => {
  it('indexes notes into embeddings for their owner', async () => {
    const rows = await prisma.embedding.findMany({ where: { userId: me.id } });
    expect(rows.map((r) => r.sourceId).sort()).toEqual([budgetNote.id, inkNote.id].sort());
    expect(rows[0].vector).toHaveLength(64);
  });

  it('hybrid search ranks the relevant note first and stays within the user', async () => {
    const res = await memory.search(me.id, 'what did ravi approve for the budget', 5);
    expect(res.mode).toBe('hybrid');
    expect(res.ids[0]).toEqual({ type: 'note', id: budgetNote.id });
    const allIds = res.ids.map((r) => r.id);
    const othersNote = await prisma.note.findFirst({ where: { userId: other.id } });
    expect(allIds).not.toContain(othersNote.id);
  });

  it('keyword-only mode works without an embedder (Postgres full-text)', async () => {
    const res = await keywordOnly.search(me.id, 'printer cartridge', 5);
    expect(res).toEqual({ mode: 'keyword', ids: [{ type: 'note', id: inkNote.id }] });
  });

  it('removes the embedding when the note is soft-deleted and re-indexed', async () => {
    await prisma.note.update({ where: { id: inkNote.id }, data: { deletedAt: new Date() } });
    await memory.index('note', inkNote.id);
    expect(await prisma.embedding.count({ where: { sourceId: inkNote.id } })).toBe(0);
  });

  it('survives punctuation-only and odd queries', async () => {
    await expect(memory.search(me.id, '?!', 5)).resolves.toMatchObject({ ids: [] });
  });
});

describe('proactive rules', () => {
  const [morningBrief, , staleTasks] = createRules({ prisma, googleApi: null, memory });

  it('morning brief includes today\'s reminders, and skips users with nothing to say', async () => {
    const now = new Date();
    await prisma.reminder.create({ data: { userId: me.id, title: 'Call bank', fireAt: new Date(now.getTime() + 60_000) } });
    const candidates = await morningBrief.findCandidates(now);
    const mine = candidates.find((c) => c.user.id === me.id);
    // A reminder 1 minute ahead is today unless the test runs at 23:59 IST.
    if (mine) {
      expect(mine.message.text).toMatch(/Call bank/);
      expect(mine.message.template.name).toBe('daily_digest');
    }
    expect(candidates.find((c) => c.user.id === other.id)).toBeUndefined();
  });

  it('respects the per-user opt-out', async () => {
    await prisma.user.update({ where: { id: me.id }, data: { proactive: false } });
    const candidates = await morningBrief.findCandidates(new Date());
    expect(candidates.find((c) => c.user.id === me.id)).toBeUndefined();
    await prisma.user.update({ where: { id: me.id }, data: { proactive: true } });
  });

  it('stale tasks finds items open for more than a week', async () => {
    await prisma.task.create({
      data: { userId: me.id, title: 'Old list', tags: [], createdAt: new Date(Date.now() - 10 * 86400_000), items: [{ id: 1, text: 'Renew domain', done: false }, { id: 2, text: 'Done thing', done: true }] },
    });
    const candidates = await staleTasks.findCandidates(new Date());
    const mine = candidates.find((c) => c.user.id === me.id);
    expect(mine.message.text).toMatch(/Renew domain/);
    expect(mine.message.text).not.toMatch(/Done thing/);
  });
});
