// src/app.js
// Builds the Express application (routes + middleware) without starting a server.
// Keeping construction separate from listening lets tests mount the real app.
// Docs: docs/modules/platform.md

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { getConfig } = require('./config');
const { createWebhookRouter } = require('./pipeline');
const { authHttp } = require('./auth');
const { createIntegrationsRouter, createOAuthCallbackRouter } = require('./integrations/http');
const prisma = require('./db');
const { generateIcsContent } = require('./ical');
const { error } = require('./logger');

function createApp() {
  const config = getConfig();
  const app = express();

  // Behind Railway's proxy: trust X-Forwarded-* so req.ip and secure cookies work.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  app.use(cors({ origin: config.DASHBOARD_URL, credentials: true }));

  // Raw body is captured for webhook signature verification before JSON parsing.
  app.use(express.json({
    limit: '1mb',
    verify: (req, res, buf) => { req.rawBody = buf; },
  }));
  app.use(cookieParser());

  // Chat channel webhooks: one route set per registered adapter (ADR-003).
  app.use(createWebhookRouter());

  // Dashboard API: /auth is public (exchange/logout), everything else needs a session.
  app.use('/api/v1/auth', authHttp.requireJsonForMutations, authHttp.router);
  app.use('/api/v1/integrations', authHttp.requireJsonForMutations, authHttp.requireSession, createIntegrationsRouter());
  app.use('/api/v1', authHttp.requireJsonForMutations, authHttp.requireSession, require('./api'));
  app.use('/oauth', createOAuthCallbackRouter()); // Google redirects here; authenticated by encrypted state

  // iCal download — unauthenticated by design (opened from chat apps); the cuid is unguessable.
  app.get('/ical/:id.ics', async (req, res) => {
    try {
      const reminder = await prisma.reminder.findUnique({ where: { id: req.params.id } });
      if (!reminder) return res.status(404).send('Not found');
      const ics = generateIcsContent(reminder.title, reminder.fireAt);
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${reminder.id}.ics"`);
      res.send(ics);
    } catch (err) {
      error('ical.error', { err: err.message });
      res.status(500).send('Error');
    }
  });

  // Liveness: process is up. Railway health check.
  app.get('/', (req, res) => res.json({ status: 'ok', service: 'orga-bot' }));

  // Readiness: dependencies reachable.
  app.get('/health/ready', async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  // Central error handler: log details, return a safe message.
  app.use((err, req, res, next) => {
    error('http.unhandled_error', { path: req.path, err: err.message });
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
