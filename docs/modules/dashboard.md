# Module: dashboard

> **Path:** `dashboard/` (Next.js 16, App Router, Tailwind)  ·  **Status:** Stable; analytics in Phase 5

## Summary (read this first)
The web app where users see and organise everything Orga stored for them.
It is a separate Next.js app that talks to the backend through a same-origin
proxy, so the login cookie stays secure.

## Structure
| Path | What it contains |
|---|---|
| `src/app/login/page.tsx` | Instructions: send `/login` in chat |
| `src/app/auth/callback/page.tsx` | Reads `#token`, clears it from the URL, exchanges it for a session |
| `src/app/dashboard/layout.tsx` | Session gate (`GET /auth/me`) + sidebar |
| `src/app/dashboard/{notes,tasks,reminders,clients}/` | Feature pages |
| `src/app/globals.css` | Design tokens (`@theme`: brand violet, ink neutrals, shadows, animations) and component classes (`.card`, `.btn-*`, `.input`, `.chip`, `.skeleton`) |
| `src/components/ui.tsx` | Presentational building blocks: `PageHeader`, `StatCard`, `Section`, `EmptyState`, `Segmented`, `SkeletonCards`, `Avatar`, `Tag`, date helpers |
| `src/components/icons.tsx` | Inline SVG icon set (no icon dependency) |
| `src/components/Sidebar.tsx` | Grouped sidebar (desktop) and `MobileNav` top bar (below `md`) |
| `src/components/AuthShell.tsx` | Shared layout for login, invite and auth callback |
| `src/lib/api.ts` | Typed API client; `credentials: 'same-origin'`; redirects to `/login` on 401 |
| `src/lib/types.ts` | Shared response types |
| `next.config.ts` | Rewrites `/api/v1/*` → `API_ORIGIN` (backend) |

## Why a proxy instead of calling the backend directly
The dashboard and backend run on different domains. A cookie set by the backend
domain would be third-party from the dashboard's point of view and blocked or
forced to `SameSite=None`. Proxying makes the API same-origin: cookies are
first-party, `SameSite=Lax` works, and there is no CORS in the browser path.

## Design system
Pages use the shared tokens and components instead of one-off Tailwind strings,
so colours, spacing and states stay consistent. Charts on the Insights page are
plain SVG (area chart with hover tooltip, heatmap via `color-mix`, bar lists), so
the dashboard adds no charting or icon dependencies. The font is Geist via
`next/font/google`, which self-hosts it at build time. Every list page has a
skeleton loading state and an empty state that says what to send in chat.

## Environment
| Variable | Where | Purpose |
|---|---|---|
| `API_ORIGIN` | dashboard (server-side) | Backend base URL, e.g. `https://orga-api.up.railway.app` |
| `DASHBOARD_URL` | backend | Used to build magic links and the CORS allowlist |

## Commands
`npm run dev` (port 3001 recommended: `npx next dev -p 3001`), `npm run typecheck`, `npm run build`.
