import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 15000,
    hookTimeout: 10000,
    include: ['test/**/*.test.{js,mjs}'],
    exclude: ['test/classifier.test.js'],
    setupFiles: ['./test/setup.js'],
    pool: 'vmThreads',
  },
});
