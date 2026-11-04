// src/db.js
// Single Prisma client instance shared across the app.
// Never instantiate PrismaClient anywhere else — import from here.

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'warn', 'error']
    : ['warn', 'error'],
});

module.exports = prisma;
