import { defineConfig } from 'vitest/config';

// Two test layers (see docs/CONTRIBUTING.md → Testing):
//   unit         — pure logic, no network, no database. Fast; runs everywhere.
//   integration  — real Postgres (DATABASE_URL), real Express app.
// LLM behaviour is NOT tested here; that is what evals/ is for (ADR-013).
export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./test/setup.js'],
    pool: 'vmThreads',
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['test/unit/**/*.test.{js,mjs}'], testTimeout: 5000 },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.{js,mjs}'],
          testTimeout: 15000,
          hookTimeout: 15000,
          fileParallelism: false, // shared database
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      reporter: ['text-summary', 'lcov'],
      // Ratchet: new modules held to a high bar; legacy code must not regress.
      thresholds: {
        // Branch % is lower than lines because V8 counts every `?.` / `||`
        // fallback as a branch; defensive defaults are intentionally untested.
        'src/auth/**': { lines: 90, functions: 90, branches: 70 },
        'src/config.js': { lines: 90 },
        'src/ratelimiter.js': { lines: 90 },
      },
    },
  },
});
