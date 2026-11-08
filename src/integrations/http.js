// src/integrations/http.js
// HTTP routes for connecting accounts:
//   GET    /api/v1/integrations                 status (session)
//   POST   /api/v1/integrations/google/start    → { url } to open (session)
//   DELETE /api/v1/integrations/google          disconnect + revoke (session)
//   GET    /oauth/google/callback               Google redirects here (public; state-authenticated)
// Docs: docs/modules/integrations.md

const express = require('express');
const prisma = require('../db');
const { getConfig } = require('../config');
const { googleEnabled, oauth, completeGoogleConnect, disconnectGoogle } = require('./index');
const { error, warn } = require('../logger');

function createIntegrationsRouter() {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const rows = await prisma.integration.findMany({
        where: { userId: req.user.id },
        select: { provider: true, status: true, accountEmail: true, scopes: true, createdAt: true }, // never tokens
      });
      res.json({ available: { google: googleEnabled }, integrations: rows });
    } catch (err) {
      next(err);
    }
  });

  router.post('/google/start', (req, res) => {
    if (!googleEnabled) return res.status(501).json({ error: 'Google integration is not configured on this server.' });
    res.json({ url: oauth.buildAuthUrl(req.user.id) });
  });

  router.delete('/google', async (req, res, next) => {
    try {
      const removed = await disconnectGoogle(req.user.id);
      if (!removed) return res.status(404).json({ error: 'Google is not connected' });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/** Public callback. Authenticated by the encrypted `state`, not by cookies. */
function createOAuthCallbackRouter() {
  const router = express.Router();
  const settingsUrl = (status) => `${getConfig().DASHBOARD_URL}/dashboard/settings?google=${status}`;

  router.get('/google/callback', async (req, res) => {
    if (req.query.error) {
      warn('integrations.google_denied', { error: String(req.query.error).slice(0, 50) });
      return res.redirect(settingsUrl('denied'));
    }
    try {
      const result = await completeGoogleConnect(req.query.code, req.query.state);
      res.redirect(settingsUrl(result.ok ? 'connected' : 'error'));
    } catch (err) {
      error('integrations.google_connect_failed', { err: err.message });
      res.redirect(settingsUrl('error'));
    }
  });

  return router;
}

module.exports = { createIntegrationsRouter, createOAuthCallbackRouter };
