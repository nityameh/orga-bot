// test/unit/channels.test.js
// Channel adapters (ADR-003): authenticity checks, payload parsing, outbound
// payload shapes, and proactive delivery planning. No network: HTTP is faked.

import { describe, it, expect, vi } from 'vitest';
const crypto = require('crypto');
const { createWhatsAppAdapter } = require('../../src/channels/whatsapp');
const { createTelegramAdapter } = require('../../src/channels/telegram');
const { createChannelRegistry } = require('../../src/channels/registry');

const fakeReq = ({ headers = {}, rawBody, query = {} } = {}) => ({
  get: (h) => headers[h.toLowerCase()],
  rawBody,
  query,
});

describe('WhatsApp adapter', () => {
  const secret = 'app-secret';
  const sign = (body) => 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

  it('accepts a correctly signed request and rejects tampering', () => {
    const wa = createWhatsAppAdapter({ appSecret: secret, allowUnsigned: false });
    const body = Buffer.from('{"a":1}');
    expect(wa.verifyRequest(fakeReq({ headers: { 'x-hub-signature-256': sign(body) }, rawBody: body }))).toBe(true);
    expect(wa.verifyRequest(fakeReq({ headers: { 'x-hub-signature-256': sign(body) }, rawBody: Buffer.from('{"a":2}') }))).toBe(false);
    expect(wa.verifyRequest(fakeReq({ rawBody: body }))).toBe(false);
    expect(wa.verifyRequest(fakeReq({ headers: { 'x-hub-signature-256': 'sha256=short' }, rawBody: body }))).toBe(false);
  });

  it('only skips verification when explicitly allowed and no secret is set', () => {
    expect(createWhatsAppAdapter({ allowUnsigned: true }).verifyRequest(fakeReq())).toBe(true);
    expect(createWhatsAppAdapter({ allowUnsigned: false }).verifyRequest(fakeReq())).toBe(false);
  });

  it('answers the Meta verification handshake only with the right token', () => {
    const wa = createWhatsAppAdapter({ verifyToken: 'vt', allowUnsigned: false });
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn(), sendStatus: vi.fn() };
    wa.handleVerification(fakeReq({ query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'vt', 'hub.challenge': 'c1' } }), res);
    expect(res.send).toHaveBeenCalledWith('c1');
    wa.handleVerification(fakeReq({ query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'nope' } }), res);
    expect(res.sendStatus).toHaveBeenCalledWith(403);
  });

  const envelope = (msg) => ({ entry: [{ changes: [{ value: { messages: [msg], contacts: [{ profile: { name: 'Ravi' } }] } }] }] });

  it('parses text and button replies into InboundMessages', () => {
    const wa = createWhatsAppAdapter({ allowUnsigned: true });
    expect(wa.parseInbound(envelope({ from: '91999', id: 'wamid.1', type: 'text', text: { body: '  hi  ' } }))).toEqual([
      { channel: 'whatsapp', externalId: '91999', from: '91999', id: 'wamid.1', text: 'hi', name: 'Ravi' },
    ]);
    const [btn] = wa.parseInbound(envelope({ from: '91999', id: 'wamid.2', type: 'interactive', interactive: { button_reply: { id: 'reminder_snooze' } } }));
    expect(btn.text).toBe('SNOOZE');
  });

  it('ignores status updates, media and unknown buttons', () => {
    const wa = createWhatsAppAdapter({ allowUnsigned: true });
    expect(wa.parseInbound({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] })).toEqual([]);
    expect(wa.parseInbound(envelope({ from: '1', id: 'x', type: 'image' }))).toEqual([]);
    expect(wa.parseInbound(envelope({ from: '1', id: 'x', type: 'interactive', interactive: { button_reply: { id: 'evil' } } }))).toEqual([]);
    expect(wa.parseInbound(undefined)).toEqual([]);
  });

  it('sends text, buttons (max 3, titles ≤ 20 chars) and templates', async () => {
    const httpPost = vi.fn().mockResolvedValue({});
    const wa = createWhatsAppAdapter({ token: 't', phoneNumberId: 'P', allowUnsigned: false, httpPost });

    await wa.send('91999', { text: 'hello' });
    expect(httpPost.mock.calls[0][1]).toMatchObject({ messaging_product: 'whatsapp', to: '91999', type: 'text', text: { body: 'hello' } });
    expect(httpPost.mock.calls[0][2].headers.Authorization).toBe('Bearer t');

    await wa.send('91999', { text: 'pick', buttons: [1, 2, 3, 4].map((n) => ({ id: `b${n}`, title: 'x'.repeat(30) })) });
    const buttons = httpPost.mock.calls[1][1].interactive.action.buttons;
    expect(buttons).toHaveLength(3);
    expect(buttons[0].reply.title).toHaveLength(20);

    await wa.sendTemplate('91999', { name: 'reminder_fire', params: ['Call Ravi'] });
    expect(httpPost.mock.calls[2][1].template).toMatchObject({ name: 'reminder_fire', components: [{ parameters: [{ text: 'Call Ravi' }] }] });
  });

  it('returns false (does not throw) when Meta rejects a send', async () => {
    const httpPost = vi.fn().mockRejectedValue(Object.assign(new Error('400'), { response: { data: { error: { code: 131047, message: 're-engagement' } } } }));
    const wa = createWhatsAppAdapter({ token: 't', phoneNumberId: 'P', allowUnsigned: false, httpPost });
    expect(await wa.send('91999', { text: 'x' })).toBe(false);
  });
});

describe('Telegram adapter', () => {
  it('verifies the secret-token header with constant-time comparison', () => {
    const tg = createTelegramAdapter({ webhookSecret: 's3cret', allowUnsigned: false });
    expect(tg.verifyRequest(fakeReq({ headers: { 'x-telegram-bot-api-secret-token': 's3cret' } }))).toBe(true);
    expect(tg.verifyRequest(fakeReq({ headers: { 'x-telegram-bot-api-secret-token': 'wrong!' } }))).toBe(false);
    expect(tg.verifyRequest(fakeReq())).toBe(false);
  });

  it('parses private text messages and inline-button taps', () => {
    const tg = createTelegramAdapter({ allowUnsigned: true });
    const [m] = tg.parseInbound({ update_id: 7, message: { text: ' hi ', chat: { id: 42, type: 'private' }, from: { first_name: 'Asha', last_name: 'K' } } });
    expect(m).toEqual({ channel: 'telegram', externalId: '42', from: '42', id: 'tg_7', text: 'hi', name: 'Asha K' });

    const [b] = tg.parseInbound({ update_id: 8, callback_query: { id: 'cq1', data: 'reminder_done', message: { chat: { id: 42 } }, from: { first_name: 'Asha' } } });
    expect(b).toMatchObject({ text: 'DONE', externalId: '42', meta: { callbackQueryId: 'cq1' } });
  });

  it('ignores group chats, unknown buttons and other update types', () => {
    const tg = createTelegramAdapter({ allowUnsigned: true });
    expect(tg.parseInbound({ update_id: 1, message: { text: 'hi', chat: { id: -5, type: 'group' } } })).toEqual([]);
    expect(tg.parseInbound({ update_id: 2, callback_query: { id: 'x', data: 'evil', message: { chat: { id: 1 } } } })).toEqual([]);
    expect(tg.parseInbound({ update_id: 3, edited_message: {} })).toEqual([]);
  });

  it('sends Markdown with an inline keyboard, and retries as plain text if Markdown is rejected', async () => {
    const httpPost = vi.fn()
      .mockRejectedValueOnce({ response: { data: { description: "Bad Request: can't parse entities" } } })
      .mockResolvedValue({});
    const tg = createTelegramAdapter({ botToken: 'BOT', allowUnsigned: false, httpPost });

    const ok = await tg.send('42', { text: 'a_b', buttons: [{ id: 'reminder_done', title: 'Done' }] });
    expect(ok).toBe(true);
    expect(httpPost.mock.calls[0][0]).toBe('https://api.telegram.org/botBOT/sendMessage');
    expect(httpPost.mock.calls[0][1]).toMatchObject({ chat_id: '42', parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: 'Done', callback_data: 'reminder_done' }]] } });
    expect(httpPost.mock.calls[1][1].parse_mode).toBeUndefined();
  });

  it('acknowledges button taps so the client stops its spinner', async () => {
    const httpPost = vi.fn().mockResolvedValue({});
    const tg = createTelegramAdapter({ botToken: 'BOT', allowUnsigned: false, httpPost });
    await tg.acknowledge({ meta: { callbackQueryId: 'cq1' } });
    expect(httpPost).toHaveBeenCalledWith('https://api.telegram.org/botBOT/answerCallbackQuery', { callback_query_id: 'cq1' }, expect.anything());
  });
});

describe('channel registry', () => {
  it('registers, looks up and rejects duplicates and unknown names', () => {
    const r = createChannelRegistry();
    const wa = createWhatsAppAdapter({ allowUnsigned: true });
    r.register(wa);
    expect(r.get('whatsapp')).toBe(wa);
    expect(r.has('telegram')).toBe(false);
    expect(() => r.register(wa)).toThrow(/already registered/);
    expect(() => r.get('sms')).toThrow(/Unknown channel/);
  });
});
