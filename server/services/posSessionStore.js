// server/services/posSessionStore.js
//
// Server-side storage of the POS sessions obtained when users log in to BSMS
// with their Ravon POS username / password (authController.loginUser).
// ----------------------------------------------------------------------
// * One row per BSMS user. `finance` marks a Finance user's session: that POS
//   account sees every branch, so it is the one shared for every POS call.
// * Only the POS Bearer token is kept - NEVER the POS password.
// * The token is held in memory (posAuthService) and persisted here encrypted
//   with AES-256-GCM (key derived from POS_SESSION_SECRET, or JWT_SECRET when
//   that is not set), so a server restart does not force a new login.
// * Nothing here is ever sent to the browser or logged.
// * Database problems are logged and ignored: the in-memory session still works.
// ----------------------------------------------------------------------
const crypto = require('crypto');

let pool = null;
const db = () => {
  if (!pool) pool = require('../config/db');
  return pool;
};

const keyOf = () => {
  const secret = process.env.POS_SESSION_SECRET || process.env.JWT_SECRET || '';
  if (!secret) return null;
  return crypto.createHash('sha256').update(`bsms-pos-session:${secret}`).digest();
};

const encrypt = (plain) => {
  const key = keyOf();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
};

const decrypt = (blob) => {
  const key = keyOf();
  if (!key || typeof blob !== 'string') return null;
  const [version, iv, tag, data] = blob.split(':');
  if (version !== 'v1' || !iv || !tag || !data) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch (error) {
    return null; // secret changed or row tampered with - treat as no session
  }
};

let schemaReady = null;
const ensureSchema = () => {
  if (!schemaReady) {
    schemaReady = db().query(`
      CREATE TABLE IF NOT EXISTS pos_sessions (
        user_id INT NOT NULL PRIMARY KEY,
        pos_username VARCHAR(150) NOT NULL,
        token_enc TEXT NOT NULL,
        expires_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        invalidated_at DATETIME NULL,
        finance TINYINT(1) NOT NULL DEFAULT 0
      )
    `)
      // Tables created before the finance flag existed.
      .then(() => db().query('ALTER TABLE pos_sessions ADD COLUMN IF NOT EXISTS finance TINYINT(1) NOT NULL DEFAULT 0'))
      .catch((error) => { schemaReady = null; throw error; });
  }
  return schemaReady;
};

// Persistence can be switched off (unit tests without MySQL).
const persistenceEnabled = () => process.env.POS_SESSION_PERSIST !== '0';

/** Stores (replaces) the POS session of a BSMS user. */
const save = async ({ userId, posUsername, token, expiresAt, finance = false }) => {
  if (!persistenceEnabled()) return;
  const tokenEnc = encrypt(token);
  if (!tokenEnc) {
    console.warn('POS session not persisted: JWT_SECRET / POS_SESSION_SECRET is not set');
    return;
  }
  try {
    await ensureSchema();
    await db().query(
      `REPLACE INTO pos_sessions (user_id, pos_username, token_enc, expires_at, created_at, invalidated_at, finance)
       VALUES (?, ?, ?, ?, NOW(), NULL, ?)`,
      [userId, posUsername, tokenEnc, expiresAt ? new Date(expiresAt) : null, finance ? 1 : 0]
    );
  } catch (error) {
    console.warn('POS session could not be persisted:', error.message);
  }
};

/**
 * The most recent still-valid POS session, or null.
 * { finance: true } -> of a Finance user; { userId } -> of that BSMS user.
 */
const loadLatest = async ({ finance = false, userId = null } = {}) => {
  if (!persistenceEnabled()) return null;
  try {
    await ensureSchema();
    const [rows] = await db().query(
      `SELECT user_id, pos_username, token_enc, expires_at, created_at, finance
         FROM pos_sessions
        WHERE invalidated_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())
          AND (? = 0 OR finance = 1) AND (? IS NULL OR user_id = ?)
        ORDER BY created_at DESC
        LIMIT 5`,
      [finance ? 1 : 0, userId, userId]
    );
    for (const row of rows) {
      const token = decrypt(row.token_enc);
      if (token) {
        return {
          userId: row.user_id,
          posUsername: row.pos_username,
          token,
          expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null,
          createdAt: row.created_at ? new Date(row.created_at).getTime() : null,
          finance: Boolean(row.finance)
        };
      }
    }
  } catch (error) {
    console.warn('POS session could not be loaded:', error.message);
  }
  return null;
};

/** Marks a user's stored POS session as no longer usable (POS answered 401). */
const invalidate = async (userId) => {
  if (!persistenceEnabled()) return;
  try {
    await ensureSchema();
    await db().query('UPDATE pos_sessions SET invalidated_at = NOW() WHERE user_id = ? AND invalidated_at IS NULL', [userId]);
  } catch (error) {
    console.warn('POS session could not be invalidated:', error.message);
  }
};

module.exports = { save, loadLatest, invalidate, encrypt, decrypt };
