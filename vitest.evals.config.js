import { defineConfig } from 'vitest/config';

// Legacy classifier checks that call the live Groq API. They are evals, not tests:
// they need GROQ_API_KEY and their results vary. Replaced by the eval harness in Phase 2.
export default defineConfig({
  test: { include: ['evals/**/*.eval.js'], testTimeout: 30000, setupFiles: ['./test/setup.js'] },
});
