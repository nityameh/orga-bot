// @ts-check
// src/evals/anonymize.js
// Removes personal data from a real message before it can become an eval case
// (ADR-017). Pattern-based masking for contact details and numbers, plus
// consistent placeholders for the people/clients Orga already knows about for
// that user ("Ravi" → "Person1" everywhere). Pure; unit-tested.
// Not perfect by design: every harvested case still goes through human review.
// Docs: docs/modules/evals.md

const RULES = /** @type {Array<[RegExp, string]>} */ ([
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, 'user@example.com'],
  [/\bhttps?:\/\/\S+/gi, 'https://example.com'],
  [/(?:\+?91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/g, '9XXXXXXXXX'],          // Indian mobile numbers
  [/\b\d{6,}\b/g, '000000'],                                           // account/order numbers, OTPs, pincodes
  [/\b[A-Z]{5}\d{4}[A-Z]\b/g, 'XXXXX0000X'],                           // PAN
  [/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '0000 0000 0000'],              // Aadhaar-like
]);

/** @param {string} s */
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {string} text
 * @param {{ people?: string[] }} [known]  names/clients from the user's own data (lowercase ok)
 * @returns {{ text: string, replacements: number }}
 */
function anonymize(text, { people = [] } = {}) {
  let out = text;
  let replacements = 0;

  for (const [pattern, replacement] of RULES) {
    out = out.replace(pattern, () => { replacements++; return replacement; });
  }

  // Longest names first so "ravi kumar" is replaced before "ravi".
  const unique = [...new Set(people.map((p) => p.trim().toLowerCase()).filter((p) => p.length > 1))].sort((a, b) => b.length - a.length);
  unique.forEach((name, i) => {
    const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'gi');
    out = out.replace(re, () => { replacements++; return `Person${i + 1}`; });
  });

  return { text: out, replacements };
}

module.exports = { anonymize };
