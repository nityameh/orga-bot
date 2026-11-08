// @ts-check
// src/evals/harvest.js
// Turns real, consented, anonymised conversations into DRAFT eval cases (ADR-017):
//   buildCandidates()  messages + the agent's observed tool calls → candidates
//   promote()          reviewer-approved candidates → merged into cases.json
// Drafts record what the agent DID; a reviewer decides what it SHOULD do
// (fixes expectations, adds argument matchers) before approving.
// Docs: docs/modules/evals.md

const crypto = require('crypto');
const { anonymize } = require('./anonymize');

/**
 * @typedef {Object} HarvestRow
 * @property {string} userId
 * @property {string} text          the user's message (raw; anonymised here)
 * @property {Date} createdAt
 * @property {{ tools?: Array<{ name: string, ok: boolean }>, outcome?: string } | null} turn  the agent.turn payload
 */

/**
 * @param {HarvestRow[]} rows
 * @param {Record<string, string[]>} peopleByUser  known people/clients per user
 * @param {Set<string>} [existingIds]              skip already-harvested/promoted cases
 */
function buildCandidates(rows, peopleByUser, existingIds = new Set()) {
  const candidates = [];
  for (const row of rows) {
    if (!row.turn || !row.text.trim()) continue;
    const { text, replacements } = anonymize(row.text, { people: peopleByUser[row.userId] ?? [] });
    // Stable id from the anonymised text: the same message never becomes two cases.
    const id = `real-${crypto.createHash('sha256').update(text.toLowerCase()).digest('hex').slice(0, 10)}`;
    if (existingIds.has(id)) continue;
    existingIds.add(id);

    const calledOk = (row.turn.tools ?? []).filter((t) => t.ok).map((t) => t.name);
    candidates.push({
      id,
      suite: 'real',
      input: text,
      observed: { tools: (row.turn.tools ?? []).map((t) => `${t.ok ? '✓' : '✗'} ${t.name}`), outcome: row.turn.outcome ?? null },
      // Draft expectation = what the agent did. The reviewer must confirm or correct it.
      expect: calledOk.length ? { tools: [...new Set(calledOk)].map((name) => ({ name })) } : { noTools: true },
      review: { approved: false, piiReplacements: replacements, harvestedAt: row.createdAt.toISOString().slice(0, 10), notes: '' },
    });
  }
  return candidates;
}

/**
 * Merge reviewer-approved candidates into the eval spec. Unapproved ones stay.
 * @param {{ cases: any[] }} spec @param {any[]} candidates
 * @returns {{ spec: { cases: any[] }, remaining: any[], promoted: number }}
 */
function promote(spec, candidates) {
  const ids = new Set(spec.cases.map((c) => c.id));
  const approved = candidates.filter((c) => c.review?.approved === true && !ids.has(c.id));
  const promotedCases = approved.map(({ id, suite, input, expect, fixtures, history }) => ({
    id, suite, input, ...(history ? { history } : {}), ...(fixtures ? { fixtures } : {}), expect,
  }));
  return {
    spec: { ...spec, cases: [...spec.cases, ...promotedCases] },
    remaining: candidates.filter((c) => c.review?.approved !== true),
    promoted: promotedCases.length,
  };
}

module.exports = { buildCandidates, promote };
