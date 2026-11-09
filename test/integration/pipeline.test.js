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
const { invites } = require('../../src/invites');

const TG_ID = '990000001';
const WA_ID = '910000000020';
const TG_LINKER = '990000002';
const TG_OTHER = '990000003';
const TG_STRANGER = '990000004';
const ALL_IDS = [TG_ID, WA_ID, TG_LINKER, TG_OTHER, TG_STRANGER];
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
    where: { externalId: { in: ALL_IDS } }, select: { userId: true },
  });
  await prisma.user.deleteMany({ where: { id: { in: ids.map((i) => i.userId) } } }); // cascades
  await prisma.invite.deleteMany({ where: { label: 'test:pipeline' } });
  await prisma.$disconnect();
});

const tgUpdate = (text, chatId = TG_ID) => fetch(`${baseUrl}/webhooks/telegram`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ update_id: Date.now(), message: { text, chat: { id: Number(chatId), type: 'private' }, from: { first_name: 'Tess' } } }),
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('Telegram webhook + invite-only onboarding (ADR-021)', () => {
  it('an unknown chat without an invite gets no account', async () => {
    const res = await tgUpdate('hello');
    expect(res.status).toBe(200);
    await sleep(800); // processing runs after the 200
    expect(await userFor('telegram', TG_ID)).toBeUndefined();
  });

  it('the invite deep link (/start CODE) creates the user + identity and uses the invite', async () => {
    const { code } = await invites.createInvite({ label: 'test:pipeline' });
    const res = await tgUpdate(`/start ${code}`);
    expect(res.status).toBe(200);
    const userId = await waitFor(() => userFor('telegram', TG_ID));
    expect(userId).toBeTruthy();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user.phone).toBeNull(); // Telegram users have no phone number
    const invite = await prisma.invite.findFirst({ where: { label: 'test:pipeline' }, orderBy: { createdAt: 'desc' } });
    expect(invite.uses).toBe(1);
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

    // Events are written asynchronously and in no guaranteed order: wait until the
    // note's trace has the COMPLETE trail (received → created → sent), not just one row.
    const trail = ['message.received', 'note.created', 'message.sent'];
    const result = await waitFor(async () => {
      const created = await prisma.interaction.findFirst({ where: { userId, kind: 'note.created' } });
      if (!created?.traceId) return null;
      const rows = await prisma.interaction.findMany({ where: { userId, traceId: created.traceId } });
      return trail.every((k) => rows.some((r) => r.kind === k)) ? { traceId: created.traceId, rows } : null;
    });
    expect(result).toBeTruthy();
    expect(result.traceId).toMatch(/^[0-9a-f]{16}$/);
    expect(result.rows.map((r) => r.kind)).toEqual(expect.arrayContaining(trail));
    expect(result.rows.every((r) => r.channel === 'telegram')).toBe(true);
  });

  it('records lastInboundAt on the identity', async () => {
    const identity = await prisma.channelIdentity.findUnique({ where: { channel_externalId: { channel: 'telegram', externalId: TG_ID } } });
    expect(identity.lastInboundAt).toBeInstanceOf(Date);
  });
});

describe('WhatsApp click-to-chat onboarding (ADR-021)', () => {
  const wa = (text, id = `w_${Math.random()}`) => ({ channel: 'whatsapp', externalId: WA_ID, from: WA_ID, id, text, name: 'W' });

  it('rejects an invalid code without creating anything', async () => {
    await send(wa('join ORGA-AAAA-BBBB'));
    expect(await userFor('whatsapp', WA_ID)).toBeUndefined();
  });

  it('"join CODE" creates the account with the verified number as phone; repeats don\'t use the invite again', async () => {
    const { code } = await invites.createInvite({ label: 'test:pipeline', maxUses: 2 });
    await send(wa(`join ${code.toLowerCase()}`));
    const userId = await userFor('whatsapp', WA_ID);
    expect((await prisma.user.findUnique({ where: { id: userId } })).phone).toBe(WA_ID);

    await send(wa(`join ${code}`)); // the chat already has an account: normal message now
    expect(await userFor('whatsapp', WA_ID)).toBe(userId);
    const invite = await prisma.invite.findFirst({ where: { label: 'test:pipeline', maxUses: 2 } });
    expect(invite.uses).toBe(1);
  });

  it('a used-up invite admits nobody else', async () => {
    const { code } = await invites.createInvite({ label: 'test:pipeline' });
    await send(tg(`/start ${code}`, TG_OTHER));
    expect(await userFor('telegram', TG_OTHER)).toBeTruthy();
    await send(tg(`/start ${code}`, TG_STRANGER));
    expect(await userFor('telegram', TG_STRANGER)).toBeUndefined();
  });
});

describe('cross-channel linking', () => {
  it('an unknown chat sending /link CODE joins the existing account directly (no throwaway user)', async () => {
    const waUserId = await userFor('whatsapp', WA_ID);
    await prisma.note.create({ data: { userId: waUserId, title: 'existing note', tags: [] } });
    const usersBefore = await prisma.user.count();

    const { code } = await createLinkCode(waUserId);
    await send(tg(`/link ${code.toLowerCase()}`, TG_LINKER));

    expect(await userFor('telegram', TG_LINKER)).toBe(waUserId);
    expect(await prisma.user.count()).toBe(usersBefore);
    expect(await prisma.linkCode.count({ where: { userId: waUserId } })).toBe(0); // single use
    expect(await prisma.interaction.count({ where: { userId: waUserId, kind: 'channel.linked' } })).toBe(1);
  });

  it('an unknown chat with an invalid link code gets nothing', async () => {
    await send(tg('/link AAAA-BBBB', TG_STRANGER));
    expect(await userFor('telegram', TG_STRANGER)).toBeUndefined();
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
