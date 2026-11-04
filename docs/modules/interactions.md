# Module: interactions (event bus + Interaction log)

> **Path:** `src/interactions/`, `src/context.js`  ·  **Status:** Stable (Phase 1)  ·  **Related ADRs:** [ADR-005](../adr/ADR-005-interaction-event-log.md)

## Summary (read this first)
Every meaningful thing that happens (a message arrives, a note is saved, a
reminder fires, someone logs in) is recorded as one row in the `Interaction`
table. This log is what the analytics dashboard, the audit trail and, later,
proactive suggestions are built on. Code that does the work only *announces*
the event; it never writes analytics itself.

## Public Interface (`src/interactions/index.js`)
| Export | Purpose |
|---|---|
| `emit({ kind, userId, person?, summary?, payload?, usage? })` | Announce a domain event. Never throws; awaiting is optional |
| `KINDS` | The allowed event kinds (below) |
| `subscribe(fn)` | Register another listener (e.g. the proactive engine in Phase 4) |

From `src/context.js`: `runWithContext`, `getContext`, `setContext`. Each inbound
message runs in its own context holding a `traceId`, so its log lines and
Interaction rows can be joined.

## Event kinds
| Kind | Emitted by | Typical payload |
|---|---|---|
| `message.received` | pipeline | `{ chars }` (never the text) |
| `message.sent` | channels | `{ chars }` or `{ template }` |
| `user.created` | users/identity | none |
| `channel.linked` | users/identity | none |
| `note.created` / `note.deleted` | handlers | `{ noteId, tags }` |
| `task.created` / `task.item_completed` | handlers | `{ taskId, itemCount, appended? }` |
| `reminder.created` / `.fired` / `.completed` / `.snoozed` / `.cancelled` | handlers, scheduler | `{ reminderId, fireAt?, until? }` |
| `query.answered` | handlers | `{ docsUsed }` |
| `digest.sent` | scheduler | `{ noteCount, tasksDone, upcomingCount }` |
| `auth.login` | auth (via `onLogin` hook) | none; channel = `dashboard` |

Adding a kind: add it to `kinds.js` and to this table. Never rename a kind; analytics depend on the strings.

## Files
| File | What it contains |
|---|---|
| `kinds.js` | Frozen list of kinds |
| `eventBus.js` | `createEventBus()`: Observer pattern; subscriber errors are caught and logged |
| `recorder.js` | `createInteractionRecorder(store)` subscriber; `toRow()` validation/mapping |
| `index.js` | Process-wide bus with the Prisma recorder attached |
| `../context.js` | AsyncLocalStorage request context (`traceId`, `userId`, `channel`) |

## Data model (`Interaction`)
`userId, kind, channel, person, summary (≤200), payload (JSON), traceId,
tokensIn, tokensOut, costMicros, createdAt`. Indexed by
`(userId, createdAt)`, `(userId, kind, createdAt)`, `(userId, person, createdAt)`
for the dashboard's timeline, per-kind and per-person queries.

## Design rules
- **Single write path:** only `recorder.js` writes Interaction rows.
- **Analytics can't break replies:** subscriber failures are isolated.
- **Privacy:** payloads hold ids and counts, not message text. Summaries hold
  titles the user already sees in their own dashboard.
- **Append-only:** rows are never updated; deleted only with the user (cascade).

## Testing
`test/unit/interactions.test.js` (bus isolation, row mapping, context propagation
across concurrent requests, log redaction); `test/integration/pipeline.test.js`
(one `traceId` across received → created → sent).
