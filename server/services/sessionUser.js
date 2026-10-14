// server/services/sessionUser.js
//
// The CURRENT state of a signed-in user, read from the database - used by
// middleware/authenticate.js on every request so that:
//   * a deactivated user (users.status <> 1) is refused at once,
//   * a changed role takes effect at once (the role in the token is ignored),
//   * bumping users.token_version (password change, forced sign-out) revokes
//     every token issued before it.
// A short in-memory cache keeps this to about one query per user per TTL_MS;
// a change therefore takes effect within TTL_MS (call forget() to apply it now).
const TTL_MS = 30 * 1000;
const MAX_ENTRIES = 5000;
const cache = new Map(); // userId -> { at, user }

// Required lazily: unit tests can load authenticate without opening a DB pool.
const db = () => require('../config/db');

/** { id, username, role, token_version } of an ACTIVE user, or null (unknown / inactive). */
const loadActiveUser = async (userId) => {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.user;

  const [rows] = await db().query(
    'SELECT id, username, role, status, token_version FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  const row = rows[0];
  const user = row && Number(row.status) === 1
    ? { id: row.id, username: row.username, role: row.role, token_version: Number(row.token_version) || 0 }
    : null;
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(id, { at: Date.now(), user });
  return user;
};

/** Drops the cached state of a user (after a password / role / status change). */
const forget = (userId) => { cache.delete(Number(userId)); };

/** Test helper. */
const clear = () => cache.clear();

module.exports = { loadActiveUser, forget, clear, TTL_MS };
