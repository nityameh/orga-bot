// test/unit/config.test.js
// Env validation must fail fast with a readable message (src/config.js).

import { describe, it, expect } from 'vitest';
const { parseConfig } = require('../../src/config');

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

describe('parseConfig', () => {
  it('applies defaults in development', () => {
    const c = parseConfig(base);
    expect(c.NODE_ENV).toBe('development');
    expect(c.PORT).toBe(3000);
    expect(c.LOGIN_TOKEN_TTL_MINUTES).toBe(10);
  });

  it('treats empty strings as missing', () => {
    expect(parseConfig({ ...base, WHATSAPP_TOKEN: '   ' }).WHATSAPP_TOKEN).toBeUndefined();
  });

  it('requires DATABASE_URL', () => {
    expect(() => parseConfig({})).toThrow(/DATABASE_URL/);
  });

  it('requires all WhatsApp secrets once any is set, and an https dashboard, in production', () => {
    let message = '';
    try {
      parseConfig({ ...base, NODE_ENV: 'production', DASHBOARD_URL: 'http://dash.example.com', WHATSAPP_TOKEN: 't' });
    } catch (err) {
      message = err.message;
    }
    for (const key of ['APP_SECRET', 'PHONE_NUMBER_ID', 'WEBHOOK_VERIFY_TOKEN', 'DASHBOARD_URL']) {
      expect(message).toContain(key);
    }
  });

  it('allows a production deploy without WhatsApp (Telegram + web chat only)', () => {
    const c = parseConfig({ ...base, NODE_ENV: 'production', DASHBOARD_URL: 'https://orga.vercel.app' });
    expect(c.WHATSAPP_TOKEN).toBeUndefined();
  });

  it('accepts a complete production config', () => {
    const c = parseConfig({
      ...base,
      NODE_ENV: 'production',
      DASHBOARD_URL: 'https://dash.example.com',
      WHATSAPP_TOKEN: 't', PHONE_NUMBER_ID: '1', WEBHOOK_VERIFY_TOKEN: 'v', APP_SECRET: 's',
    });
    expect(c.NODE_ENV).toBe('production');
  });

  it('requires a Telegram webhook secret in production when a bot token is set', () => {
    expect(() => parseConfig({
      ...base, NODE_ENV: 'production', DASHBOARD_URL: 'https://d.example.com',
      WHATSAPP_TOKEN: 't', PHONE_NUMBER_ID: '1', WEBHOOK_VERIFY_TOKEN: 'v', APP_SECRET: 's',
      TELEGRAM_BOT_TOKEN: 'bot',
    })).toThrow(/TELEGRAM_WEBHOOK_SECRET/);
  });

  it('requires TOKEN_ENC_KEY whenever Google is configured', () => {
    expect(() => parseConfig({ ...base, GOOGLE_CLIENT_ID: 'id' })).toThrow(/TOKEN_ENC_KEY/);
  });
});
