# Module: platform

> **Path:** `src/index.js`, `src/app.js`, `src/config.js`, `src/db.js`, `src/logger.js`, `src/ratelimiter.js`, `src/ical.js`
> **Status:** Stable  ·  **Related ADRs:** [ADR-007](../adr/ADR-007-typescript-migration.md), [ADR-012](../adr/ADR-012-observability.md)

## Summary (read this first)
The shared plumbing every other module stands on: starting the server,
validating configuration, the database client, logging, rate limiting and
calendar-file generation. Nothing here knows about notes, tasks or chat.

## Files
| File | What it contains |
|---|---|
| `index.js` | Process entry. Validates config (exits on error), starts HTTP server + scheduler, graceful shutdown on SIGTERM/SIGINT |
| `app.js` | `createApp()` builds the Express app: security headers, CORS, body parsing (raw body kept for webhook HMAC), cookies, routes, central error handler. No `listen()`, so tests can mount it |
| `config.js` | Zod schema for environment variables. `getConfig()` (cached) / `parseConfig(env)` (pure, for tests). Production requires WhatsApp secrets and an https dashboard URL |
| `db.js` | The single `PrismaClient` instance. Never create another |
| `logger.js` | `log/warn/error(event, data)`: one JSON line per event, searchable in Railway |
| `ratelimiter.js` | `createRateLimiter({limit, windowMs})` fixed-window limiter with bounded memory; `isRateLimited(phone)` for chat (20/min) |
| `ical.js` | `.ics` generation and Google Calendar "add event" links |

## HTTP surface (from `app.js`)
| Route | Auth | Purpose |
|---|---|---|
| `GET /webhook`, `POST /webhook` | Meta verify token / HMAC | WhatsApp ([messaging-pipeline.md](messaging-pipeline.md)) |
| `/api/v1/auth/*` | public | Login exchange, logout, me ([auth.md](auth.md)) |
| `/api/v1/*` | session cookie | Dashboard API ([api.md](api.md)) |
| `GET /ical/:id.ics` | none (unguessable id) | Calendar download |
| `GET /` | none | Liveness (Railway health check) |
| `GET /health/ready` | none | Readiness: checks DB with `SELECT 1` |

## Configuration
See `.env.example` for every variable. Adding a variable means adding it to the
schema in `config.js` and to `.env.example` in the same PR.

## Edge Cases & Failure Modes
| Situation | Behaviour |
|---|---|
| Missing/invalid env var | Process exits at boot with a list of every problem |
| Unhandled error in a route | Logged as `http.unhandled_error`; client gets a generic 500 (no internals leaked) |
| SIGTERM during deploy | Stops accepting connections, finishes in-flight requests, disconnects DB; force-exit after 10s |
| Port in use | Logged as `server.port_in_use`, exit 1 |

## Testing
`test/unit/config.test.js`, `test/unit/ratelimiter.test.js`; `app.js` is
exercised by every integration test.
