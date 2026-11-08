// @ts-check
// src/runtime/background.js
// Runs work after the HTTP response has been sent. On a long-running server a
// floating promise is enough. On Vercel the function may be frozen once the
// response ends, so the promise is handed to `waitUntil`, which keeps the
// instance alive until it settles (ADR-020).
// Exports: runInBackground, isServerless
// Docs: docs/modules/platform.md → Runtime modes

const { error } = require('../logger');
const { resolveRuntime } = require('../config');

/** True when running as a serverless function (Vercel sets VERCEL=1). */
function isServerless() {
  const env = /** @type {{ RUNTIME?: 'server' | 'serverless', VERCEL?: string }} */ (process.env);
  return resolveRuntime(env) === 'serverless';
}

/** @type {((p: Promise<unknown>) => void) | null | undefined} */
let waitUntilFn;

function getWaitUntil() {
  if (waitUntilFn === undefined) {
    waitUntilFn = null;
    if (isServerless()) {
      try {
        waitUntilFn = require('@vercel/functions').waitUntil;
      } catch {
        // Not on Vercel's runtime (e.g. RUNTIME=serverless locally): fall back to a floating promise.
      }
    }
  }
  return waitUntilFn;
}

/**
 * Start `task` without awaiting it. The task must handle its own errors; a
 * rejection that escapes is logged here, never left unhandled.
 * Callers send the HTTP response first, then call this.
 * @param {() => Promise<unknown>} task
 * @returns {Promise<void>} settles when the task does (useful in tests)
 */
function runInBackground(task) {
  const promise = Promise.resolve()
    .then(task)
    .then(() => undefined, (err) => {
      error('background.task_failed', { err: /** @type {Error} */ (err)?.message });
    });
  getWaitUntil()?.(promise);
  return promise;
}

/** Test hook: forget the cached waitUntil so env changes take effect. */
function _resetForTests() {
  waitUntilFn = undefined;
}

module.exports = { runInBackground, isServerless, _resetForTests };
