// server/services/loginThrottle.js
//
// Brute-force protection for POST /api/login and change-password, in memory
// (a restart clears it; that is acceptable - the limits only need to make
// online guessing slow, and each failure still costs a bcrypt compare).
//
//   * per ACCOUNT : LOGIN_MAX_FAILURES_PER_USER (default 5) failed passwords in
//                   WINDOW_MS lock that username for the rest of the window.
//                   This is the main guard: it works even when every user
//                   reaches the server through one proxy IP.
//   * per IP      : LOGIN_MAX_FAILURES_PER_IP (default 50) failures in
//                   WINDOW_MS from one address block that address (slows one
//                   machine guessing many usernames). Generous on purpose, so
//                   a shared office / proxy IP is not locked by normal typos.
// Only FAILURES count; a successful login clears that account's failures.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_KEYS = 10000;

const envLimit = (name, fallback) => {
  const n = Number.parseInt(process.env[name], 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};
const maxPerUser = () => envLimit('LOGIN_MAX_FAILURES_PER_USER', 5);
const maxPerIp = () => envLimit('LOGIN_MAX_FAILURES_PER_IP', 50);

const failures = new Map(); // key -> [ms of each failure]

const recent = (key, now) => {
  const list = (failures.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(key, list); else failures.delete(key);
  return list;
};

const userKey = (username) => `user:${String(username ?? '').trim().toLowerCase()}`;
const ipKey = (ip) => `ip:${String(ip ?? 'unknown')}`;

/**
 * { blocked: false } or { blocked: true, retryAfterSeconds } for this
 * username (any case) / IP. Call BEFORE checking the password.
 */
const check = ({ username, ip }, now = Date.now()) => {
  const checks = [[userKey(username), maxPerUser()], [ipKey(ip), maxPerIp()]];
  let waitMs = 0;
  for (const [key, max] of checks) {
    const list = recent(key, now);
    if (list.length >= max) waitMs = Math.max(waitMs, list[list.length - max] + WINDOW_MS - now);
  }
  return waitMs > 0 ? { blocked: true, retryAfterSeconds: Math.ceil(waitMs / 1000) } : { blocked: false };
};

const push = (key, now) => {
  if (!failures.has(key) && failures.size >= MAX_KEYS) failures.delete(failures.keys().next().value);
  failures.set(key, [...recent(key, now), now]);
};

/** A wrong password (or unknown username) for this username / IP. */
const recordFailure = ({ username, ip }, now = Date.now()) => {
  push(userKey(username), now);
  push(ipKey(ip), now);
};

/** A correct password: that account starts again from zero (the IP count stays). */
const recordSuccess = ({ username }) => { failures.delete(userKey(username)); };

/** "Too many ..." text for a 429. */
const blockedMessage = (retryAfterSeconds) =>
  `Too many failed attempts. Try again in ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} minute(s).`;

/** Test helper. */
const reset = () => failures.clear();

module.exports = { check, recordFailure, recordSuccess, blockedMessage, reset, WINDOW_MS };
