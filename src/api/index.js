// src/api/index.js — Dashboard REST API mount point.
// Authentication is applied by the caller (src/app.js) via the session
// middleware, so every handler here can rely on req.user being set.
// Docs: docs/modules/api.md

const express = require('express');
const router = express.Router();

router.use('/notes', require('./notes'));
router.use('/tasks', require('./tasks'));
router.use('/reminders', require('./reminders'));
router.use('/clients', require('./clients'));
router.use('/query', require('./query'));

module.exports = router;
