// src/index.js
// Process entry point: load env, validate config (fail fast), start the HTTP
// server and scheduler, and shut down gracefully on SIGTERM/SIGINT.
// Docs: docs/modules/platform.md

require('dotenv').config();
const { getConfig } = require('./config');

let config;
try {
  config = getConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const { createApp } = require('./app');
const { startScheduler } = require('./scheduler');
const prisma = require('./db');
const { log, error } = require('./logger');

const app = createApp();

const server = app.listen(config.PORT, () => {
  log('server.started', { port: config.PORT, env: config.NODE_ENV });
  startScheduler();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    error('server.port_in_use', { port: config.PORT });
    process.exit(1);
  }
  throw err;
});

// Railway sends SIGTERM on redeploy: stop accepting connections, finish in-flight
// requests, close the DB pool, then exit. Force-exit if it takes too long.
function shutdown(signal) {
  log('server.shutdown', { signal });
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
