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

    // Onboarding (ADR-021). 'invite': an unknown chat becomes an account only by
    // sending a valid invite code (or /link CODE). 'open': any chat gets an account
    // (local development only; refused in production).
    SIGNUP_MODE: z.enum(['invite', 'open']).default('invite'),
    // Public handles for the invite page's "Continue on…" buttons (not secrets).
    TELEGRAM_BOT_USERNAME: optionalString
      .transform((v) => v?.replace(/^@/, ''))
      .refine((v) => v === undefined || /^[A-Za-z0-9_]{5,32}$/.test(v), 'must be a Telegram bot username, e.g. OrgaAssistBot'),
    WHATSAPP_NUMBER: optionalString
      .transform((v) => v?.replace(/[^\d]/g, ''))
      .refine((v) => v === undefined || /^\d{8,15}$/.test(v), 'must be the full number with country code, digits only, e.g. 919876543210'),

    // Google (Phase 3, ADR-010) — all three plus TOKEN_ENC_KEY enable the integration
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    GOOGLE_REDIRECT_URI: optionalString,   // https://<api-domain>/oauth/google/callback
    TOKEN_ENC_KEY: optionalString,         // openssl rand -base64 32

    // Memory / semantic search (ADR-011) — local open-source embeddings, no API cost
    EMBEDDINGS: z.enum(['local', 'off']).optional(),          // default: local (off under NODE_ENV=test)
    EMBEDDING_MODEL: z.string().default('Xenova/multilingual-e5-small'),
    MODEL_CACHE_DIR: z.string().default('.cache/models'),

    // Database pools beyond Prisma's (set Prisma's via ?connection_limit= in DATABASE_URL).
    // Free poolers (e.g. Supabase) allow few connections, so keep these small.
    DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(3),

    // Background jobs (ADR-009): pg-boss durable queue in Postgres, or node-cron fallback
    JOBS: z.enum(['pgboss', 'cron']).optional(),                  // default: pgboss (cron under NODE_ENV=test)

    // Runtime (ADR-020): 'server' = long-running process (Render, VM, local);
    // 'serverless' = Vercel functions, where an external cron calls /internal/tick.
    RUNTIME: z.enum(['server', 'serverless']).optional(),         // default: serverless when VERCEL is set
    VERCEL: optionalString,                                        // set by Vercel itself
    CRON_SECRET: z.string().min(16, 'must be at least 16 characters (openssl rand -hex 24)').optional()
      .or(z.literal('').transform(() => undefined)),

    // Proactive messages (Phase 4)
    PROACTIVE_DAILY_LIMIT: z.coerce.number().int().min(0).max(10).default(3),

    // LLM / agent (ADR-004)
    GROQ_API_KEY: optionalString,
    ANTHROPIC_API_KEY: optionalString,
    AGENT_PROVIDER: z.enum(['auto', 'anthropic', 'groq', 'off']).default('auto'),
    AGENT_MODEL: optionalString,           // default per provider (see src/agent/index.js)
    // Groq model for the agent (unless AGENT_MODEL), the classifier and note Q&A.
    // Providers retire models (llama-3.3-70b-versatile was removed in 2026), so it is config, not code.
    GROQ_MODEL: z.string().trim().min(1).default('openai/gpt-oss-120b'),
    // Tried in order when GROQ_MODEL fails or hits its limit (limits are per model). Comma-separated; "" = none.
    GROQ_FALLBACK_MODELS: z.string().default('openai/gpt-oss-20b')
      .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
    AGENT_EFFORT: z.enum(['low', 'medium', 'high']).default('low'),
    AGENT_MAX_STEPS: z.coerce.number().int().min(1).max(12).default(6),
    AGENT_LLM_TIMEOUT_MS: z.coerce.number().int().min(2000).max(120_000).default(25_000), // per model call, then fail over
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
    // WhatsApp is optional (Telegram + web chat work without it), but all-or-nothing:
    // if any WhatsApp variable is set, all are required so webhooks are verified
    // and replies can send. With none set, the WhatsApp webhook rejects everything.
    const whatsappKeys = /** @type {const} */ (['WHATSAPP_TOKEN', 'PHONE_NUMBER_ID', 'WEBHOOK_VERIFY_TOKEN', 'APP_SECRET']);
    if (whatsappKeys.some((key) => env[key])) {
      for (const key of whatsappKeys) {
        if (!env[key]) {
          ctx.addIssue({ code: 'custom', path: [key], message: 'required in production when WhatsApp is configured' });
        }
      }
    }
    if (env.TELEGRAM_BOT_TOKEN && !env.TELEGRAM_WEBHOOK_SECRET) {
      ctx.addIssue({ code: 'custom', path: ['TELEGRAM_WEBHOOK_SECRET'], message: 'required in production when TELEGRAM_BOT_TOKEN is set' });
    }
    if (resolveRuntime(env) === 'serverless' && !env.CRON_SECRET) {
      ctx.addIssue({ code: 'custom', path: ['CRON_SECRET'], message: 'required in production on serverless (reminders and scheduled jobs run via /internal/tick)' });
    }
    if (env.DASHBOARD_URL.startsWith('http://')) {
      ctx.addIssue({ code: 'custom', path: ['DASHBOARD_URL'], message: 'must be https in production' });
    }
    // Open signup lets anyone who finds the bot create an account and spend the LLM budget.
    if (env.SIGNUP_MODE === 'open') {
      ctx.addIssue({ code: 'custom', path: ['SIGNUP_MODE'], message: "'open' is for local development only; production is invite-only (ADR-021)" });
    }
  });

/** @typedef {z.infer<typeof EnvSchema>} Config */

/**
 * Which runtime we are on. Explicit RUNTIME wins; otherwise Vercel implies serverless.
 * @param {{ RUNTIME?: 'server' | 'serverless', VERCEL?: string }} env
 * @returns {'server' | 'serverless'}
 */
function resolveRuntime(env) {
  return env.RUNTIME ?? (env.VERCEL ? 'serverless' : 'server');
}

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

module.exports = { parseConfig, getConfig, resolveRuntime };
