# Module: evals (agent quality measurement)

> **Path:** `evals/`, `src/evals/`, `scripts/{harvest,promote}-evals.js`  ·  **Status:** Stable
> **Related ADRs:** [ADR-013](../adr/ADR-013-evals-as-ci-gate.md), [ADR-017](../adr/ADR-017-eval-set-from-real-messages.md)

## Summary (read this first)
Evals check that the AI agent still makes the right decisions (which tool,
which arguments, what reply) whenever its prompt, tools or model change. The
case set grows from **real messages of users who opted in**, after personal
data is removed and **a person reviews every case**.

## Running evals
See [agent.md → Evals](agent.md#evals): `npm run evals`, `--suite`, `--case`, `--update-baseline`.

## Growing the set from real messages
```
user sends /improve on                      (consent, User.evalOptIn)
   ↓  normal use: messages stored with traceId, agent.turn logged
npm run evals:harvest [days]                → evals/review/candidates.json  (git-ignored)
   ↓  reviewer: check anonymisation, write the CORRECT expectation, set review.approved = true
npm run evals:promote                       → evals/agent/cases.json (suite "real")
   ↓
npm run evals -- --update-baseline          (new cases join the CI gate)
```

| File | What it contains |
|---|---|
| `src/evals/anonymize.js` | Masks emails, URLs, Indian phones, long numbers, PAN, Aadhaar-like ids; known people → `PersonN` |
| `src/evals/harvest.js` | `buildCandidates()` (drafts from observed behaviour, stable ids, dedupe), `promote()` (approved → cases) |
| `scripts/harvest-evals.js` | Reads opted-in users' messages + agent turns from the DB |
| `scripts/promote-evals.js` | Merges approved candidates |

## Reviewer checklist
- [ ] No remaining personal data (names not in the known list, addresses, company secrets)
- [ ] `expect` describes the **correct** behaviour, not just what the agent did
- [ ] Add argument matchers where they matter (times: `startsWith`, tags: `includesAll`)
- [ ] Add `fixtures` if the case needs tool results (e.g. search hits)

## Testing
`test/unit/evals.harvest.test.js` (masking, consistent placeholders, word boundaries,
Hinglish untouched, dedupe, promote keeps unapproved), `test/unit/evals.grader.test.js`.
