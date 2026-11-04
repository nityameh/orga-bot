// @ts-check
// src/agent/time.js
// India Standard Time helpers. IST is a fixed UTC+05:30 offset (no daylight
// saving), so arithmetic on the offset is exact.
// Docs: docs/modules/agent.md

const IST_OFFSET_MS = 330 * 60 * 1000;

/** Start of the IST calendar day containing `date`, as a UTC Date. */
function startOfDayIST(/** @type {Date} */ date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - IST_OFFSET_MS);
}

/** e.g. "Thu, 5 Nov 2026, 2:30 pm" */
function formatIST(/** @type {Date} */ date) {
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

/** ISO 8601 with the +05:30 offset, e.g. "2026-11-05T14:30:00+05:30" */
function toISTISOString(/** @type {Date} */ date) {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().replace(/\.\d{3}Z$/, '+05:30');
}

module.exports = { startOfDayIST, formatIST, toISTISOString, IST_OFFSET_MS };
