// scripts/promote-evals.js
// Merge reviewer-approved candidates (review.approved = true) from
// evals/review/candidates.json into evals/agent/cases.json (ADR-017).
//   npm run evals:promote
// Docs: docs/modules/evals.md

const fs = require('fs');
const path = require('path');
const { promote } = require('../src/evals/harvest');

const CANDIDATES = path.join(__dirname, '..', 'evals', 'review', 'candidates.json');
const CASES = path.join(__dirname, '..', 'evals', 'agent', 'cases.json');

if (!fs.existsSync(CANDIDATES)) {
  console.log('No candidates file. Run npm run evals:harvest first.');
  process.exit(0);
}
const { spec, remaining, promoted } = promote(JSON.parse(fs.readFileSync(CASES, 'utf8')), JSON.parse(fs.readFileSync(CANDIDATES, 'utf8')));
fs.writeFileSync(CASES, JSON.stringify(spec, null, 2) + '\n');
fs.writeFileSync(CANDIDATES, JSON.stringify(remaining, null, 2) + '\n');
console.log(`✓ Promoted ${promoted} reviewed case(s); ${remaining.length} still awaiting review.`);
