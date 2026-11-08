// src/api/analytics.js — Analytics endpoints for the dashboard (Phase 5).
//   GET /analytics/overview?days=30   charts, heatmap, follow-through, agent cost/latency
//   GET /analytics/people             people/clients, most neglected first
//   GET /analytics/timeline?kind=&person=&before=&limit=   audit trail ("what did Orga do and why")
// Session-authenticated by the caller; everything is scoped to req.user.id.
// Docs: docs/modules/analytics.md

const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { createAnalyticsService } = require('../analytics/service');
const { KIND_VALUES } = require('../interactions/kinds');

const router = express.Router();
const analytics = createAnalyticsService(prisma);

const OverviewQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });
const TimelineQuery = z.object({
  kind: z.string().refine((k) => KIND_VALUES.has(k) || /^[a-z_]+\.\*$/.test(k), 'unknown kind').optional(),
  person: z.string().max(60).optional(),
  before: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Validate query params at the boundary; 400 with the reasons on failure. */
function parse(schema, req, res) {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid query', issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    return null;
  }
  return result.data;
}

router.get('/overview', async (req, res, next) => {
  try {
    const q = parse(OverviewQuery, req, res);
    if (q) res.json(await analytics.overview(req.user.id, q.days));
  } catch (err) {
    next(err);
  }
});

router.get('/people', async (req, res, next) => {
  try {
    res.json({ people: await analytics.people(req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.get('/timeline', async (req, res, next) => {
  try {
    const q = parse(TimelineQuery, req, res);
    if (q) res.json(await analytics.timeline(req.user.id, q));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
