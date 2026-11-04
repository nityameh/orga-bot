// src/logger.js
// Structured JSON logger — every event emits { ts, event, ...data }
// Searchable in Railway logs. Replace all console.log with log().

function log(event, data = {}) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    event,
    ...data,
  }));
}

function warn(event, data = {}) {
  console.warn(JSON.stringify({
    ts:    new Date().toISOString(),
    level: 'warn',
    event,
    ...data,
  }));
}

function error(event, data = {}) {
  console.error(JSON.stringify({
    ts:    new Date().toISOString(),
    level: 'error',
    event,
    ...data,
  }));
}

module.exports = { log, warn, error };
