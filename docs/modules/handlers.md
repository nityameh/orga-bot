# Module: handlers

> **Path:** `src/handlers/`  ·  **Status:** Stable; become agent tools in Phase 2 ([ADR-004](../adr/ADR-004-agent-loop-and-llm-providers.md))

## Summary (read this first)
Each handler does one user-visible job: save a note, create a task list, set a
reminder, answer a question, list things, delete things. A handler receives the
user, the classified intent and the original message, writes to the database,
and sends one reply.

## Files
| File | Handles | Key functions |
|---|---|---|
| `note.js` | Saving notes; free-tier limit (50/month, warning at 80%) | `handleNote` |
| `task.js` | Task lists: create, append to existing ("add to acme tasks: …"), tick off ("done 2") | `handleTask`, `handleTaskDone`, `parseTaskItems` |
| `reminder.js` | Creating reminders with a Google Calendar link; rejects past times | `handleReminder`, `snoozeReminder`, `markReminderDone` |
| `query.js` | Questions answered from saved data (keyword retrieval → LLM answer with sources) | `handleQuery`, `retrieveContext` |
| `commands.js` | `/today`, `/notes`, `/list`, `/schedule`, `/search`, `/client`, `/export`, `/privacy`, `/help`, edit flow, unknown/greeting | `handleToday`, `handleSearch`, `handleClient`, `handleEditInit/Complete`, … |
| `delete.js` | Delete/cancel by number or text, confirmations, 5-minute undo for notes (soft delete) | `handleDelete`, `handleCancel`, `handleConfirmAction`, `handleUndo` |
| `account.js` | `/login` magic link; `delete my data` → `confirm delete` (transactional hard delete) | `handleLogin`, `handleDeleteMyDataRequest`, `handleDeleteMyDataConfirm` |

## Contract every handler follows
1. Signature `(user, intent, message)` or `(user, message)`; returns nothing, or
   `true/false` when used as an interceptor ("did I handle it?").
2. All queries filter by `user.id`.
3. Exactly one user-facing reply per message (≤ 4 lines, see CLAUDE.md §9).
4. Log one `domain.action` event with ids, never message bodies.

## Edge Cases
| Situation | Behaviour |
|---|---|
| Reminder without a time | Asks for a time with examples |
| Reminder time in the past | Explains and asks for a future time |
| "done 7" where 7 doesn't exist | Says so and suggests `/list` |
| Query with no matching data | "I don't have notes about that"; no LLM call |
| LLM failure during query | Falls back to a plain list of matching items |
| `confirm delete` without a pending request (or after 5 min) | Not handled as deletion; continues normal routing |

## Testing
`test/integration/handlers.test.js` (real DB, console sender).
