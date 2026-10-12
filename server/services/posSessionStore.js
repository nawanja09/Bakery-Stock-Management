// server/services/posSessionStore.js
//
// Server-side storage of the POS / Restaurant sessions obtained when a Stock
// Management user's OWN credentials were accepted by RAVON POS
// (pos.ravonbakers.lk) or RAVON Restaurant (restaurant.ravonbakers.lk) - at the
// BSMS login (authController.loginUser) or through the one-time "Connect"
// action of the Collection page (integrationAuthService.connect).
// ----------------------------------------------------------------------
// * One row per (BSMS user, provider); provider = 'pos' | 'restaurant'.
// * Only the Bearer token is kept - NEVER a password. No username / password of
//   either system exists in .env, in the code or in the database.
// * The token is encrypted with AES-256-GCM. The key is derived from
//   POS_SESSION_SECRET only - never from JWT_SECRET, so a leaked login secret
//   cannot decrypt the RAVON tokens (config/secrets.js). Without it, sessions
//   stay in memory only. Changing the secret simply invalidates every stored
//   session (they no longer decrypt) - users log in again.
// * `finance` = 1 marks the shared session: a Finance user's login, or an
//   explicit "Connect ... Finance account". It is used for every Collection
//   sync; a user's own non-finance session only for that user's requests.
// * Nothing here is ever sent to the browser or logged. Database problems are
//   logged (message only) and ignored: the in-memory session keeps working.
// * Schema: config/db.js (ensureIntegrationSessionsSchema) and
//   migrations/031_restaurant_collections_integration_sessions.sql.
// ----------------------------------------------------------------------
const crypto = require('crypto');
const { getPosSessionSecret } = require('../config/secrets');

let pool = null;
const db = () => {
  if (!pool) pool = require('../config/db');
  return pool;
};

const keyOf = () => {
  const secret = getPosSessionSecret();
  if (!secret) return null;
  return crypto.createHash('sha256').update(`bsms-pos-session:${secret}`).digest();
};

const encrypt = (plain) => {
  const key = keyOf();
  if (!key || typeof plain !== 'string' || plain === '') return null;
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

// Persistence can be switched off (unit tests without MySQL).
const persistenceEnabled = () => process.env.POS_SESSION_PERSIST !== '0';

const ready = async () => {
  if (db().integrationSessionsSchemaReady) await db().integrationSessionsSchemaReady;
};

const warn = (what, error) => console.warn(`Integration session could not be ${what}: ${error.message}`);

/** Stores (replaces) the session of a BSMS user for one provider. */
const save = async ({ userId, provider = 'pos', username, token, expiresAt = null, finance = false, allBranches = null }) => {
  if (!persistenceEnabled() || !userId) return;
  const tokenEnc = encrypt(token);
  if (!tokenEnc) {
    console.warn('Integration session not persisted: POS_SESSION_SECRET is not set');
    return;
  }
  try {
    await ready();
    await db().query(
      `REPLACE INTO pos_sessions (user_id, provider, pos_username, token_enc, expires_at, created_at, invalidated_at, finance, all_branches)
       VALUES (?, ?, ?, ?, ?, NOW(), NULL, ?, ?)`,
      [userId, provider, String(username || '').slice(0, 150), tokenEnc, expiresAt ? new Date(expiresAt) : null,
        finance ? 1 : 0, allBranches === null || allBranches === undefined ? null : (allBranches ? 1 : 0)]
    );
  } catch (error) {
    warn('persisted', error);
  }
};

/** Records the branch scope (GET /api/me) of a stored session. */
const setScope = async ({ userId, provider = 'pos', allBranches }) => {
  if (!persistenceEnabled() || !userId) return;
  try {
    await ready();
    await db().query('UPDATE pos_sessions SET all_branches = ? WHERE user_id = ? AND provider = ?',
      [allBranches ? 1 : 0, userId, provider]);
  } catch (error) {
    warn('updated', error);
  }
};

/**
 * Still-valid stored sessions of one provider, most useful first (all-branch
 * accounts, then the most recent). { finance: true } -> shared sessions only;
 * { userId } -> that BSMS user's own. maxAgeMs bounds sessions whose login did
 * not say when they expire (no unattended sync on an old token).
 */
const loadSessions = async ({ provider = 'pos', finance = false, userId = null, maxAgeMs, limit = 5 } = {}) => {
  if (!persistenceEnabled()) return [];
  try {
    await ready();
    const [rows] = await db().query(
      `SELECT user_id, provider, pos_username, token_enc, expires_at, created_at, finance, all_branches
         FROM pos_sessions
        WHERE provider = ? AND invalidated_at IS NULL
          AND (expires_at IS NULL OR expires_at > NOW())
          AND created_at > (NOW() - INTERVAL ? SECOND)
          AND (? = 0 OR finance = 1) AND (? IS NULL OR user_id = ?)
        ORDER BY COALESCE(all_branches, 0) DESC, created_at DESC
        LIMIT ?`,
      [provider, Math.max(1, Math.floor((maxAgeMs || 0) / 1000)), finance ? 1 : 0, userId, userId, limit]
    );
    const sessions = [];
    for (const row of rows || []) {
      const token = decrypt(row.token_enc);
      if (!token) continue;
      sessions.push({
        userId: row.user_id,
        provider: row.provider || provider,
        username: row.pos_username,
        token,
        expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null,
        createdAt: row.created_at ? new Date(row.created_at).getTime() : null,
        finance: Boolean(row.finance),
        allBranches: row.all_branches === null || row.all_branches === undefined ? null : Boolean(row.all_branches)
      });
    }
    return sessions;
  } catch (error) {
    warn('loaded', error);
    return [];
  }
};

/** Marks a user's stored session as no longer usable (the system answered 401). */
const invalidate = async ({ userId, provider = 'pos' }) => {
  if (!persistenceEnabled() || !userId) return;
  try {
    await ready();
    await db().query(
      'UPDATE pos_sessions SET invalidated_at = NOW() WHERE user_id = ? AND provider = ? AND invalidated_at IS NULL',
      [userId, provider]
    );
  } catch (error) {
    warn('invalidated', error);
  }
};

module.exports = { save, setScope, loadSessions, invalidate, encrypt, decrypt };
