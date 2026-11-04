# Module Documentation

One file per `src/` module, written from [`../templates/MODULE_DOC_TEMPLATE.md`](../templates/MODULE_DOC_TEMPLATE.md).
Each starts with a plain-language summary, then goes into detail.

| Module | Doc | Source |
|---|---|---|
| Auth (dashboard login, sessions) | [auth.md](auth.md) | `src/auth/` |
| Messaging pipeline (webhook, sender, classifier, router, pending) | [messaging-pipeline.md](messaging-pipeline.md) | `src/webhook.js`, `src/sender.js`, `src/classifier.js`, `src/router.js`, `src/pending.js` |
| Handlers (notes, tasks, reminders, queries, commands, account) | [handlers.md](handlers.md) | `src/handlers/` |
| Scheduler | [scheduler.md](scheduler.md) | `src/scheduler.js` |
| Dashboard REST API | [api.md](api.md) | `src/api/` |
| Platform (entry, app, config, db, logger, rate limit, iCal) | [platform.md](platform.md) | `src/index.js`, `src/app.js`, `src/config.js`, … |
| Dashboard (Next.js) | [dashboard.md](dashboard.md) | `dashboard/` |
