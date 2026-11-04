## What & why
<!-- One or two sentences. Link the roadmap item / issue. -->

## How it was tested
<!-- Commands run, test cases added, screenshots for UI. -->

## Checklist
- [ ] Tests added/updated (bug fix → regression test first)
- [ ] `npm run verify` passes locally
- [ ] Every query is scoped by `userId`; external input validated
- [ ] No secrets, tokens or message bodies logged
- [ ] Docs updated: module doc / HLD / ADR (if a decision was made) / ROADMAP checkbox
- [ ] Migration included if the schema changed (`npm run db:migrate`)
