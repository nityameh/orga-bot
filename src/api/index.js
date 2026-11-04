// src/api/index.js — API router mount point
// All dashboard API routes go through here.

const express = require('express');
const router = express.Router();
const { authenticate } = require('./middleware');

// All routes require phone-based auth
router.use(authenticate);

// Mount resource routes
router.use('/notes', require('./notes'));
router.use('/tasks', require('./tasks'));
router.use('/reminders', require('./reminders'));
router.use('/clients', require('./clients'));
router.use('/query', require('./query'));

module.exports = router;
