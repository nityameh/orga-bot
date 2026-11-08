// api/index.js
// Vercel serverless entry point (ADR-020). vercel.json rewrites every path here,
// and Vercel calls the exported Express app as a (req, res) handler. Nothing
// listens on a port and no background timers start: scheduled work runs when an
// external cron calls /internal/tick.
// Exports: the Express app
// Docs: docs/modules/platform.md → Runtime modes, docs/DEPLOY.md

// Serverless-safe defaults, unless set explicitly in the Vercel project:
process.env.RUNTIME ??= 'serverless';
process.env.DB_POOL_MAX ??= '1';     // many short-lived instances × a small free pooler
process.env.EMBEDDINGS ??= 'off';    // the local model doesn't fit a function bundle; search uses full-text

const { getConfig } = require('../src/config');

getConfig(); // fail fast: invalid env shows up as a clear error in the function logs

const { createApp } = require('../src/app');

module.exports = createApp();
