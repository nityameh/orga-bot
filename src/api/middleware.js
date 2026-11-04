// src/api/middleware.js
// Simple phone-based auth for MVP — no JWT, no OTP.
// Dashboard sends ?phone=919876543210 or X-User-Phone header.
// Middleware resolves user from DB and attaches to req.user.

const prisma = require('../db');

async function authenticate(req, res, next) {
  const phone = req.query.phone || req.headers['x-user-phone'];

  if (!phone) {
    return res.status(401).json({ error: 'Phone number required. Pass ?phone=919876543210 or X-User-Phone header.' });
  }

  const user = await prisma.user.findUnique({ where: { phone } });

  if (!user) {
    return res.status(404).json({ error: 'User not found. Send a message to Orga on WhatsApp first.' });
  }

  req.user = user;
  next();
}

module.exports = { authenticate };
