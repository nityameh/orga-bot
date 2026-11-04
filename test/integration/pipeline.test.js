// test/integration/pipeline.test.js
// End-to-end inbound pipeline on a real database: channel webhook → user and
// identity resolution → routing → Interaction log; plus cross-channel linking.
// Replies go to the console (no channel tokens in test). Without GROQ_API_KEY
// the classifier uses keyword fallback, which keeps these tests deterministic.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const prisma = require('../../src/db');
const { processInbound } = require('../../src/pipeline');
const { runWithContext } = require('../../src/context');
const { createLinkCode } = require('../../src/users/identity');

const TG_ID = '990000001';
const WA_ID = '910000000020';
const TG_LINKER = '990000002';
let server, baseUrl;

const tg = (text, externalId = TG_ID) => ({
  channel: 'telegram', externalId, from: externalId, id: `t_${Math.random()}`, text, name: 'Test',
});
const send = (message) => runWithContext({ channel: message.channel }, () => processInbound(message));

async function userFor(channel, externalId) {
  const identity = await prisma.channelIdentity.findUnique({
    where: { channel_externalId: { channel, externalId } },
  });
  return identity?.userId;
}

async function waitFor(fn, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

beforeAll(async () => {
  const { createApp } = require('../../src/app');
  await new Promise((resolve) => {
    server = createApp().listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  server?.close();
  const ids = await prisma.channelIdentity.findMany({
    where: { externalId: { in: [TG_ID, WA_ID, TG_LINKER] } }, select: { userId: true },
  });
  await prisma.user.deleteMany({ where: { id: { in: ids.map((i) => i.userId) } } }); // cascades
  await prisma.$disconnect();
});

describe('Telegram webhook', () => {
  it('accepts an update over HTTP and creates the user + identity', async () => {
    const res = await fetch(`${baseUrl}/webhooks/telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ update_id: 1, message: { text: 'hello', chat: { id: Number(TG_ID), type: 'private' }, from: { first_name: 'Tess' } } }),
    });
    expect(res.status).toBe(200);
    const userId = await waitFor(() => userFor('telegram', TG_ID));
    expect(userId).toBeTruthy();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user.phone).toBeNull(); // Telegram users have no phone number
  });

  it('returns 200 for non-message updates without creating anything', async () => {
    const res = await fetch(`${baseUrl}/webhooks/telegram`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ update_id: 2, edited_message: {} }),
    });
    expect(res.status).toBe(200);
  });
});

describe('processing and the Interaction log', () => {
  it('saves a note from Telegram and records the full event trail with one traceId', async () => {
    const userId = await waitFor(() => userFor('telegram', TG_ID));
    await send(tg('note: logo concepts for acme'));

    const note = await prisma.note.findFirst({ where: { userId } });
    expect(note).toBeTruthy();

    const rows = await waitFor(async () => {
      const r = await prisma.interaction.findMany({ where: { userId, kind: { in: ['message.received', 'note.created', 'message.sent'] } }, orderBy: { createdAt: 'asc' } });
      // Events are written asynchronously: wait for the specific row, not a count.
      return r.some((x) => x.kind === 'note.created') ? r : null;
    });
    expect(rows).toBeTruthy();
    const lastTrace = rows.at(-1).traceId;
    expect(lastTrace).toMatch(/^[0-9a-f]{16}$/);
    const sameTrace = rows.filter((r) => r.traceId === lastTrace).map((r) => r.kind);
    expect(sameTrace).toEqual(expect.arrayContaining(['message.received', 'note.created', 'message.sent']));
    expect(rows.every((r) => r.channel === 'telegram')).toBe(true);
  });

  it('records lastInboundAt on the identity', async () => {
    const identity = await prisma.channelIdentity.findUnique({ where: { channel_externalId: { channel: 'telegram', externalId: TG_ID } } });
    expect(identity.lastInboundAt).toBeInstanceOf(Date);
  });
});

describe('cross-channel linking', () => {
  it('links a fresh Telegram chat to an existing WhatsApp account', async () => {
    // WhatsApp user with data
    await send({ channel: 'whatsapp', externalId: WA_ID, from: WA_ID, id: 'w1', text: 'hi', name: 'W' });
    const waUserId = await userFor('whatsapp', WA_ID);
    await prisma.note.create({ data: { userId: waUserId, title: 'existing note', tags: [] } });

    // New Telegram chat: first message creates a throwaway user
    await send(tg('hi', TG_LINKER));
    const throwaway = await userFor('telegram', TG_LINKER);
    expect(throwaway).not.toBe(waUserId);

    const { code } = await createLinkCode(waUserId);
    await send(tg(`/link ${code.toLowerCase()}`, TG_LINKER));

    expect(await userFor('telegram', TG_LINKER)).toBe(waUserId);
    expect(await prisma.user.findUnique({ where: { id: throwaway } })).toBeNull();
    expect(await prisma.interaction.count({ where: { userId: waUserId, kind: 'channel.linked' } })).toBe(1);
  });

  it('refuses to merge a chat that already has its own data', async () => {
    const tgUserId = await userFor('telegram', TG_ID); // has a note from the test above
    const waUserId = await userFor('whatsapp', WA_ID);
    const { code } = await createLinkCode(waUserId);
    await send(tg(`/link ${code}`));
    expect(await userFor('telegram', TG_ID)).toBe(tgUserId);
  });

  it('rejects an invalid code without changing anything', async () => {
    const before = await userFor('telegram', TG_ID);
    await send(tg('/link AAAA-BBBB'));
    expect(await userFor('telegram', TG_ID)).toBe(before);
  });
});
