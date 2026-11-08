# Module: api (dashboard REST API)

> **Path:** `src/api/`  ·  **Status:** Stable  ·  **Related ADRs:** [ADR-006](../adr/ADR-006-dashboard-authentication.md)

## Summary (read this first)
The JSON API the dashboard uses to show and edit a user's notes, tasks,
reminders and clients. Every route requires a logged-in session, and every
query is limited to that user's own data.

## Routes (all under `/api/v1`, session required)
| Method & path | Purpose |
|---|---|
| `GET /notes` | List (filters: tag, client, search, pinned, archived; paginated) |
| `GET /notes/:id` · `POST /notes` · `PUT /notes/:id` · `DELETE /notes/:id` | Read, create, update, soft delete |
| `POST /notes/:id/pin` · `POST /notes/:id/archive` | Toggle |
| `GET /tasks` · `GET /tasks/:id` · `POST /tasks` · `PUT /tasks/:id` · `DELETE /tasks/:id` | Task lists |
| `PUT /tasks/:id/items` | Replace items (reorder, toggle, edit) |
| `GET /reminders` · `POST /reminders` · `PUT /reminders/:id` · `DELETE /reminders/:id` | Reminders |
| `GET /clients` · `GET /clients/:name` | Client roll-up across notes/tasks/reminders |
| `POST /query` | Ask a question over your data (same retrieval as chat) |
| `GET /analytics/overview` · `/analytics/people` · `/analytics/timeline` | Insights dashboard (see [analytics.md](analytics.md)) |
| `GET/POST/DELETE /integrations/...` | Google connect/disconnect (see [integrations.md](integrations.md)) |

Auth routes (`/api/v1/auth/*`) are documented in [auth.md](auth.md).

## Rules for every route (security-critical)
1. **Ownership in the query itself:** `where: { id, userId: req.user.id }`. For
   updates/deletes use `updateMany`/`deleteMany` with both conditions and return
   404 when `count === 0`. Never `update({ where: { id } })` alone. That was an
   IDOR bug fixed in Phase 0.
2. **404, not 403**, for other users' rows, so ids can't be probed for existence.
3. **Errors go to `next(err)`**: the central handler logs them and returns a
   generic 500. Never send `err.message` to the client.
4. Mutations must be `Content-Type: application/json` (CSRF guard in `src/auth/http.js`).

## Testing
`test/integration/api.test.js` (behaviour) and
`test/integration/api.authorization.test.js` (cross-user access returns 404 for
every mutating route). **Add a row there for every new route that takes an id.**
