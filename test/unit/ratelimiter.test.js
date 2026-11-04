// test/unit/ratelimiter.test.js

import { describe, it, expect } from 'vitest';
const { createRateLimiter } = require('../../src/ratelimiter');

describe('createRateLimiter', () => {
  it('allows up to the limit within a window, then blocks', () => {
    const limited = createRateLimiter({ limit: 3, windowMs: 1000 });
    expect([limited('k', 0), limited('k', 1), limited('k', 2)]).toEqual([false, false, false]);
    expect(limited('k', 3)).toBe(true);
  });

  it('resets after the window', () => {
    const limited = createRateLimiter({ limit: 1, windowMs: 1000 });
    limited('k', 0);
    expect(limited('k', 500)).toBe(true);
    expect(limited('k', 1001)).toBe(false);
  });

  it('tracks keys independently', () => {
    const limited = createRateLimiter({ limit: 1, windowMs: 1000 });
    limited('a', 0);
    expect(limited('b', 0)).toBe(false);
  });

  it('bounds memory under key spraying', () => {
    const limited = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 2 });
    limited('a', 0);
    limited('b', 0);
    limited('c', 0); // evicts "a"
    expect(limited('a', 1)).toBe(false); // "a" starts fresh
  });
});
