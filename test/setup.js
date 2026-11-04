// test/setup.js — Vitest global setup
// Loads .env and sets up test environment

const dotenv = require('dotenv');
dotenv.config();

// Override NODE_ENV for tests
process.env.NODE_ENV = 'test';
