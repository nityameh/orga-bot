# Module Documentation

One file per `src/` module, written from [`../templates/MODULE_DOC_TEMPLATE.md`](../templates/MODULE_DOC_TEMPLATE.md).
Each starts with a plain-language summary, then goes into detail.

| Module | Doc | Source |
|---|---|---|
| Auth (dashboard login, sessions) | [auth.md](auth.md) | `src/auth/` |
| Channels (WhatsApp, Telegram adapters; reply, notifyUser) | [channels.md](channels.md) | `src/channels/` |
| Messaging pipeline (webhooks → classify → route) | [messaging-pipeline.md](messaging-pipeline.md) | `src/pipeline.js`, `src/classifier.js`, `src/router.js`, `src/pending.js` |
| Agent (LLM loop, tools, providers, prompts, evals) | [agent.md](agent.md) | `src/agent/`, `src/llm/`, `prompts/`, `evals/` |
| Integrations (Google OAuth, token vault, Calendar/Gmail, approvals) | [integrations.md](integrations.md) | `src/integrations/`, `src/agent/approvals.js` |
| Memory (semantic search, local embeddings, RRF) | [memory.md](memory.md) | `src/memory/` |
| Proactive (rules engine, guards, schedules) | [proactive.md](proactive.md) | `src/proactive/` |
| Analytics (insights dashboard, timeline, people) | [analytics.md](analytics.md) | `src/analytics/`, `src/api/analytics.js` |
| Interactions (event bus, Interaction log, trace context) | [interactions.md](interactions.md) | `src/interactions/`, `src/context.js` |
| Users (identity, channel linking) | [users.md](users.md) | `src/users/` |
| Handlers (notes, tasks, reminders, queries, commands, account) | [handlers.md](handlers.md) | `src/handlers/` |
| Scheduler | [scheduler.md](scheduler.md) | `src/scheduler.js` |
| Dashboard REST API | [api.md](api.md) | `src/api/` |
| Platform (entry, app, config, db, logger, rate limit, iCal) | [platform.md](platform.md) | `src/index.js`, `src/app.js`, `src/config.js`, … |
| Dashboard (Next.js) | [dashboard.md](dashboard.md) | `dashboard/` |
