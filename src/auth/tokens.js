// @ts-check
// src/auth/tokens.js
// Cryptographic helpers for magic-link and session tokens.
// Tokens are 256-bit random values; the database only ever stores their SHA-256
// hash, so a database leak does not leak usable tokens.
// Docs: docs/modules/auth.md

const crypto = require('crypto');

const TOKEN_BYTES = 32;

/**
 * Generate a URL-safe random token (43 chars, 256 bits of entropy).
 * @returns {string}
 */
function generateToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * Hash a token for storage and lookup. SHA-256 (not bcrypt) is correct here:
 * the input is already high-entropy random data, so slow hashing adds nothing.
 * @param {string} token
 * @returns {string} hex digest
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Cheap shape check so obviously malformed input never reaches the database.
 * @param {unknown} token
 * @returns {token is string}
 */
function isWellFormedToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

module.exports = { generateToken, hashToken, isWellFormedToken };
