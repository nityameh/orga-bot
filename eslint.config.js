// eslint.config.js — ESLint flat config for the backend.
// The dashboard has its own config in dashboard/.

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/**', 'dashboard/**', 'coverage/**', 'docs/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_|^(req|res|next|intent|user|message)$', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: false }],
      eqeqeq: ['error', 'always'],
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    files: ['test/**/*.js', 'evals/**/*.js', 'vitest.config.js', 'vitest.evals.config.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node, ...globals.vitest },
    },
  },
  {
    files: ['scripts/**/*.js', 'test/manual.js', 'test/curl-test.js', 'evals/**/*.js'],
    rules: { 'no-unused-vars': 'warn' },
  },
];
