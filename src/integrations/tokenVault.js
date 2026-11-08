// @ts-check
// src/integrations/tokenVault.js
// Authenticated encryption for third-party secrets (OAuth tokens) at rest
// (ADR-010). AES-256-GCM with a random 96-bit IV per value; the GCM auth tag
// detects any tampering. Ciphertexts carry a key version ("v1:") so the key can
// be rotated: add v2, re-encrypt lazily, then retire v1.
// Docs: docs/modules/integrations.md

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

/**
 * @param {string} base64Key  32 random bytes, base64-encoded (TOKEN_ENC_KEY)
 */
function createTokenVault(base64Key) {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw new Error('TOKEN_ENC_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)');

  return {
    /** @param {string} plaintext @returns {string} "v1:<iv>:<tag>:<ciphertext>" (base64 parts) */
    encrypt(plaintext) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join(':');
    },

    /** @param {string} sealed @returns {string} throws if tampered, wrong key or unknown version */
    decrypt(sealed) {
      const [version, iv, tag, ciphertext] = sealed.split(':');
      if (version !== VERSION || !iv || !tag || ciphertext === undefined) throw new Error('Unrecognised ciphertext format');
      const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
    },
  };
}

/** @typedef {ReturnType<typeof createTokenVault>} TokenVault */

module.exports = { createTokenVault };
