// @ts-check
// src/config.js
// Validates environment variables once at startup and exposes a typed config.
// The app refuses to boot with invalid config (fail fast) instead of failing
// later on the first request that needs a missing value.
// Docs: docs/modules/platform.md

const { z } = require('zod');

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().url(),

    // WhatsApp (Meta Cloud API) — optional in development (sender logs to console)
    WHATSAPP_TOKEN: optionalString,
    PHONE_NUMBER_ID: optionalString,
    WEBHOOK_VERIFY_TOKEN: optionalString,
    APP_SECRET: optionalString,

    // Telegram (optional channel) — ADR-003
    TELEGRAM_BOT_TOKEN: optionalString,
    TELEGRAM_WEBHOOK_SECRET: optionalString,

    // Google (Phase 3, ADR-010) — all three plus TOKEN_ENC_KEY enable the integration
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    GOOGLE_REDIRECT_URI: optionalString,   // https://<api-domain>/oauth/google/callback
    TOKEN_ENC_KEY: optionalString,         // openssl rand -base64 32

    // Memory / semantic search (ADR-011) — local open-source embeddings, no API cost
    EMBEDDINGS: z.enum(['local', 'off']).optional(),          // default: local (off under NODE_ENV=test)
    EMBEDDING_MODEL: z.string().default('Xenova/multilingual-e5-small'),
    MODEL_CACHE_DIR: z.string().default('.cache/models'),

    // Proactive messages (Phase 4)
    PROACTIVE_DAILY_LIMIT: z.coerce.number().int().min(0).max(10).default(3),

    // LLM / agent (ADR-004)
    GROQ_API_KEY: optionalString,
    ANTHROPIC_API_KEY: optionalString,
    AGENT_PROVIDER: z.enum(['auto', 'anthropic', 'groq', 'off']).default('auto'),
    AGENT_MODEL: optionalString,           // default per provider (see src/agent/index.js)
    AGENT_EFFORT: z.enum(['low', 'medium', 'high']).default('low'),
    AGENT_MAX_STEPS: z.coerce.number().int().min(1).max(12).default(6),
    AGENT_DAILY_TOKEN_BUDGET: z.coerce.number().int().min(1000).default(300_000),

    // Dashboard + auth (ADR-006)
    DASHBOARD_URL: z.string().url().default('http://localhost:3001'),
    LOGIN_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  })
  .superRefine((env, ctx) => {
    // Every environment: a half-configured Google integration must fail loudly,
    // not silently disable itself.
    if (env.GOOGLE_CLIENT_ID && !env.TOKEN_ENC_KEY) {
      ctx.addIssue({ code: 'custom', path: ['TOKEN_ENC_KEY'], message: 'required when Google is configured (tokens are stored encrypted)' });
    }

    if (env.NODE_ENV !== 'production') return;
    // In production, inbound webhooks must be signature-verified and replies must send.
    for (const key of /** @type {const} */ (['WHATSAPP_TOKEN', 'PHONE_NUMBER_ID', 'WEBHOOK_VERIFY_TOKEN', 'APP_SECRET'])) {
      if (!env[key]) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'required in production' });
      }
    }
    if (env.TELEGRAM_BOT_TOKEN && !env.TELEGRAM_WEBHOOK_SECRET) {
      ctx.addIssue({ code: 'custom', path: ['TELEGRAM_WEBHOOK_SECRET'], message: 'required in production when TELEGRAM_BOT_TOKEN is set' });
    }
    if (env.DASHBOARD_URL.startsWith('http://')) {
      ctx.addIssue({ code: 'custom', path: ['DASHBOARD_URL'], message: 'must be https in production' });
    }
  });

/** @typedef {z.infer<typeof EnvSchema>} Config */

/**
 * Parse and validate an environment object.
 * Exported separately from `config` so tests can validate arbitrary inputs.
 * @param {Record<string, string | undefined>} env
 * @returns {Config}
 */
function parseConfig(env) {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}

/** @type {Config | undefined} */
let cached;

/**
 * Validated config for the current process (parsed lazily, then cached).
 * @returns {Config}
 */
function getConfig() {
  if (!cached) cached = parseConfig(process.env);
  return cached;
}

module.exports = { parseConfig, getConfig };
