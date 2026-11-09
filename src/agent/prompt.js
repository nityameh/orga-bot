// @ts-check
// src/agent/prompt.js
// Loads the versioned system prompt from prompts/ (prompts are code: reviewed
// in PRs, evaluated before merge — ADR-013) and builds the per-request context.
// Docs: docs/modules/agent.md

const fs = require('fs');
const path = require('path');
const { formatIST, toISTISOString, startOfDayIST, IST_OFFSET_MS } = require('./time');

const PROMPT_VERSION = 'agent.system.v2'; // v2: also a general-purpose assistant (ADR-021)

/** Read a prompt file and strip its YAML front matter (metadata for humans). */
function loadPrompt(name = PROMPT_VERSION) {
  const raw = fs.readFileSync(path.join(__dirname, '..', '..', 'prompts', `${name}.md`), 'utf8');
  return raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
}

/**
 * The next 8 IST dates with weekdays, e.g. "today Thu 2026-11-05 · tomorrow Fri
 * 2026-11-06 · Sat 2026-11-07 · …". Models are unreliable at calendar arithmetic
 * ("next Friday", "kal"); a lookup table makes it a copy instead of a calculation.
 * @param {Date} now
 */
function upcomingDays(now) {
  const days = [];
  for (let i = 0; i < 8; i++) {
    const d = new Date(startOfDayIST(now).getTime() + i * 24 * 60 * 60 * 1000 + IST_OFFSET_MS); // shifted: UTC fields = IST
    const label = `${WEEKDAYS[d.getUTCDay()]} ${d.toISOString().slice(0, 10)}`;
    days.push(i === 0 ? `today ${label}` : i === 1 ? `tomorrow ${label}` : label);
  }
  return days.join(' · ');
}
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Per-request context. Kept separate from the static prompt so the static part
 * stays byte-identical across requests and remains cacheable.
 * @param {{ now: Date, name?: string, channel?: string }} ctx
 */
function buildDynamicContext({ now, name, channel }) {
  return [
    `Current time: ${formatIST(now)} IST (${toISTISOString(now)}).`,
    `Calendar (IST): ${upcomingDays(now)}. Use this for weekday and relative dates; don't calculate them.`,
    name ? `User's name: ${name}.` : null,
    channel ? `They are messaging on ${channel}.` : null,
  ].filter(Boolean).join('\n');
}

module.exports = { loadPrompt, buildDynamicContext, upcomingDays, PROMPT_VERSION };
