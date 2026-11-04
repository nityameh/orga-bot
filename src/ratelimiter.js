// src/ratelimiter.js
// In-memory rate limiter — max 20 messages per user per minute.
// Prevents a single user from flooding the webhook and spiking Groq API costs.
// Resets on server restart — good enough for MVP.

const counts = new Map(); // phone → { count, resetAt }

const WINDOW_MS = 60 * 1000; // 1 minute
const LIMIT     = 20;         // max messages per window

function isRateLimited(phone) {
  const now   = Date.now();
  const entry = counts.get(phone);

  if (!entry || now > entry.resetAt) {
    counts.set(phone, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  if (entry.count >= LIMIT) return true;

  entry.count++;
  return false;
}

module.exports = { isRateLimited };
