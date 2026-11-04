// Enforces Conventional Commits (feat:, fix:, docs:, refactor:, test:, chore:, ...).
// Run by .githooks/commit-msg and in CI.
module.exports = { extends: ['@commitlint/config-conventional'] };
