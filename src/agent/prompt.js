// @ts-check
// src/agent/prompt.js
// Loads the versioned system prompt from prompts/ (prompts are code: reviewed
// in PRs, evaluated before merge — ADR-013) and builds the per-request context.
// Docs: docs/modules/agent.md

const fs = require('fs');
const path = require('path');
const { formatIST, toISTISOString } = require('./time');

const PROMPT_VERSION = 'agent.system.v1';

/** Read a prompt file and strip its YAML front matter (metadata for humans). */
function loadPrompt(name = PROMPT_VERSION) {
  const raw = fs.readFileSync(path.join(__dirname, '..', '..', 'prompts', `${name}.md`), 'utf8');
  return raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
}

/**
 * Per-request context. Kept separate from the static prompt so the static part
 * stays byte-identical across requests and remains cacheable.
 * @param {{ now: Date, name?: string, channel?: string }} ctx
 */
function buildDynamicContext({ now, name, channel }) {
  return [
    `Current time: ${formatIST(now)} IST (${toISTISOString(now)}).`,
    name ? `User's name: ${name}.` : null,
    channel ? `They are messaging on ${channel}.` : null,
  ].filter(Boolean).join('\n');
}

module.exports = { loadPrompt, buildDynamicContext, PROMPT_VERSION };
