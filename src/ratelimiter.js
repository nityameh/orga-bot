// @ts-check
// src/ratelimiter.js
// In-memory fixed-window rate limiters.
//   - isRateLimited(phone): inbound chat messages, 20 per user per minute
//   - createRateLimiter(): factory for other limits (e.g. login exchange per IP)
// State resets on restart and is per-process; acceptable for a single instance.
// Docs: docs/modules/platform.md

/**
 * @param {{ limit: number, windowMs: number, maxKeys?: number }} opts
 * @returns {(key: string, now?: number) => boolean} returns true when the key is over the limit
 */
function createRateLimiter({ limit, windowMs, maxKeys = 10_000 }) {
  /** @type {Map<string, {count: number, resetAt: number}>} */
  const counts = new Map();

  return function isLimited(key, now = Date.now()) {
    const entry = counts.get(key);

    if (!entry || now > entry.resetAt) {
      // Bound memory: drop the oldest key if an attacker sprays unique keys.
      if (counts.size >= maxKeys) {
        const oldest = counts.keys().next().value;
        if (oldest !== undefined) counts.delete(oldest);
      }
      counts.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    }

    if (entry.count >= limit) return true;

    entry.count++;
    return false;
  };
}

const isRateLimited = createRateLimiter({ limit: 20, windowMs: 60 * 1000 });

module.exports = { isRateLimited, createRateLimiter };
