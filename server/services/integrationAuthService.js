// server/services/integrationAuthService.js
//
// Authentication against the two RAVON systems the Collection module reads:
//   provider 'pos'         RAVON POS         RAVON_POS_API_URL         (https://pos.ravonbakers.lk)
//   provider 'restaurant'  RAVON Restaurant  RAVON_RESTAURANT_API_URL  (https://restaurant.ravonbakers.lk)
// Both run the same Laravel API: POST /api/login { username, password } ->
// Bearer token; GET /api/completed-shifts/collection,
// /api/credit-payments/collection, /api/employee-deductions, /api/me.
// ----------------------------------------------------------------------
// TWO MODES, chosen per system by the server .env:
//
// 1. SERVER KEY (no login) - RAVON_POS_INTEGRATION_PRIVATE_KEY /
//    RAVON_RESTAURANT_INTEGRATION_PRIVATE_KEY set (see "server key" below):
//    every call goes to {base}/api/integration/... SIGNED with that private
//    key (the key itself is never sent; each signature works once). No user
//    password is sent there and no session is kept; the Collection page loads
//    for every BSMS role that has it (config/rolePermissions.js), all branches.
//
// 2. PER-USER (key not set) - everything below.
//
// In per-user mode NO credentials of either system exist anywhere in BSMS: not
// in .env, not in the code, not in the database, not in logs. A token is
// obtained ONLY from a Stock Management user's OWN typed username / password:
//   * at the BSMS login (authController.loginUser -> loginAll): the same typed
//     username / password are also sent - in parallel, once - to POS and
//     Restaurant /api/login. Each outcome is independent; neither can block
//     or change the BSMS login. The password is used for those calls only and
//     then discarded.
//   * through the one-time "Connect" action of the Collection page
//     (POST /api/collections/integrations/:provider/connect -> connect()), for
//     a user whose POS / Restaurant password differs from their BSMS password,
//     or to reconnect after a session expired.
// Only the resulting token is kept: in memory, and encrypted (AES-256-GCM) in
// pos_sessions through posSessionStore.js so a restart does not lose it.
//
// PER-USER ACCESS - every call is made with the REQUESTING user's OWN session.
// There is no shared session and no service account: a BSMS user
// can only read POS / Restaurant data that their own account there may read.
// (The former shared "Finance session" source - any user reading with the
// latest Finance login's token - was removed for that reason.)
//
// Privileges: /api/login and /api/me of each system return the user's
// `abilities` (collection.shifts, collection.credit_payments,
// collection.employee_deductions, items.view), derived there from the same
// permissions that open those pages in that system, which also enforces them
// on every data route. getUserAccess() keeps them per session, re-reads
// /api/me every ABILITY_TTL_MS so a permission removed there takes effect
// here, and FAILS CLOSED: unknown abilities (old API, session missing /
// rejected, /api/me unreachable beyond ABILITY_STALE_MS) = no access.
// integrationAccess.js turns them into what the Collection / FG pages may show.
//
// No background / unattended sync: a token can only come from the user logging
// in (or Connect). Sessions are capped at RAVON_INTEGRATION_SESSION_HOURS
// (default 24 h, the BSMS login lifetime).
//
// Kept from the original POS-only service (posAuthService.js, which now only
// re-exports this module for provider 'pos'):
//   * in-memory token cache;
//   * single-flight login: concurrent logins with the same typed credentials
//     share ONE request;
//   * 401 Unauthenticated -> the user's token is invalidated; the call is
//     retried only if a new login replaced it meanwhile, else the user must log
//     in again (a re-login with a password is impossible by design);
//   * login cool-down: credentials a system refused are not re-sent for
//     LOGIN_COOLDOWN_MS; at most maxLoginsPerMinute() login requests per
//     provider per minute (RAVON_LOGIN_MAX_PER_MINUTE, default 30 - the login
//     endpoints allow 5 per account and 60 per IP per minute); a 429 pauses
//     that account's logins (retry-after). Every user logs in from this one
//     server, so nothing pauses the logins of OTHER accounts; also
//     x-ratelimit-remaining: 0 also pauses logins);
//   * tokens / passwords are never logged, never returned, never put in an
//     error message (scrub()).
//
// Verified WITHOUT credentials (scripts/posCollectionProbe.js --unauth), on both
// hosts: /api/login answers 422 {"message", "errors": {"username": [...],
// "password": [...]}} for an empty body and is limited to 5 requests/minute
// (x-ratelimit-limit: 5); the data endpoints and /api/me answer 401
// {"error":true,"message":"Unauthenticated.","status":401} (limit 60/minute).
// NOT verifiable without a real login: the success JSON of /api/login (token
// field, expiry), /api/me, and the record JSON of the three endpoints on the
// Restaurant host - extractToken() / extractExpiry() therefore accept the usual
// Laravel Sanctum / Passport / JWT envelopes.
// ----------------------------------------------------------------------
const crypto = require('crypto');
const store = require('./posSessionStore');
const { normalizeRole, ROLES, hasModule, MODULES } = require('../config/rolePermissions');

const ABILITY_TTL_MS = 5 * 60 * 1000; // re-read the user's privileges at least this often
const ABILITY_STALE_MS = 30 * 60 * 1000; // /api/me unreachable: keep last known privileges at most this long
const DEFAULT_TIMEOUT_MS = 8000;
const LOGIN_COOLDOWN_MS = 60 * 1000;
const LOGIN_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX_LOGINS_PER_MINUTE = 30; // the systems allow 60 per IP (this server) and 5 per account
const maxLoginsPerMinute = () => {
  const n = Number(process.env.RAVON_LOGIN_MAX_PER_MINUTE);
  return Number.isInteger(n) && n > 0 && n <= 55 ? n : DEFAULT_MAX_LOGINS_PER_MINUTE;
};
const EXPIRY_SAFETY_MS = 60 * 1000; // stop using a token a little before it expires
const SESSION_RELOAD_MS = 15 * 1000; // re-check pos_sessions (another process / restart)
const DEFAULT_SESSION_HOURS = 24;

const PROVIDERS = Object.freeze({
  pos: Object.freeze({
    id: 'pos', system: 'POS', prefix: 'POS', label: 'RAVON POS', account: 'RAVON POS',
    urlEnv: ['RAVON_POS_API_URL', 'POS_BASE_URL'], loginEnv: 'RAVON_POS_LOGIN_ENDPOINT', timeoutEnv: 'RAVON_POS_TIMEOUT_MS'
  }),
  restaurant: Object.freeze({
    id: 'restaurant', system: 'RESTAURANT', prefix: 'RESTAURANT', label: 'RAVON Restaurant', account: 'RAVON Restaurant',
    urlEnv: ['RAVON_RESTAURANT_API_URL'], loginEnv: 'RAVON_RESTAURANT_LOGIN_ENDPOINT', timeoutEnv: 'RAVON_RESTAURANT_TIMEOUT_MS'
  })
});
const PROVIDER_IDS = Object.keys(PROVIDERS);

const KINDS = ['NOT_CONFIGURED', 'NOT_CONNECTED', 'CREDENTIALS_INVALID', 'AUTH_UNAVAILABLE', 'RATE_LIMITED'];
const codeOf = (P, kind) => `${P.prefix}_${kind}`;
const POS_NOT_CONFIGURED = 'POS_NOT_CONFIGURED';
const POS_NOT_CONNECTED = 'POS_NOT_CONNECTED';
const POS_CREDENTIALS_INVALID = 'POS_CREDENTIALS_INVALID';
const POS_AUTH_UNAVAILABLE = 'POS_AUTH_UNAVAILABLE';

/** Provider definition from 'pos' / 'restaurant' / 'POS' / 'RESTAURANT'. */
const providerOf = (value) => {
  const key = String(value ?? '').trim().toLowerCase();
  if (PROVIDERS[key]) return PROVIDERS[key];
  const bySystem = Object.values(PROVIDERS).find((p) => p.system.toLowerCase() === key);
  if (bySystem) return bySystem;
  throw new Error(`Unknown integration provider "${String(value).slice(0, 30)}"`);
};

// Error classes keep their original names (ravonPosService / tests use them);
// each carries the provider it is about.
class PosConfigError extends Error {
  constructor(message, code = POS_NOT_CONFIGURED, provider = 'pos') { super(message); this.name = 'PosConfigError'; this.code = code; this.provider = provider; }
}
class PosAuthError extends Error {
  constructor(message, code = POS_CREDENTIALS_INVALID, provider = 'pos') { super(message); this.name = 'PosAuthError'; this.code = code; this.provider = provider; }
}
// `code` is set only when the *login* could not be reached / was rate limited.
class PosUnavailableError extends Error {
  constructor(message, code = null, provider = 'pos') { super(message); this.name = 'PosUnavailableError'; this.code = code; this.provider = provider; }
}
class PosResponseError extends Error {
  constructor(message, status, provider = 'pos') { super(message); this.name = 'PosResponseError'; this.status = status; this.provider = provider; }
}

// ---------------------------------------------------------------- config
// Read at call time so tests (and a changed .env after restart) are honoured.
const envFirst = (names) => names.map((n) => process.env[n]).find((v) => v && String(v).trim()) || '';
const config = (P) => ({
  baseUrl: envFirst(P.urlEnv).trim().replace(/\/+$/, ''),
  loginPath: process.env[P.loginEnv] || '/api/login',
  timeoutMs: Number(process.env[P.timeoutEnv]) || Number(process.env.RAVON_POS_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
});
const isConfigured = (provider) => Boolean(config(providerOf(provider)).baseUrl);

// ---------------------------------------------------------------- server key
// Server-to-server mode (no user login), per system: when
// RAVON_POS_INTEGRATION_PRIVATE_KEY / RAVON_RESTAURANT_INTEGRATION_PRIVATE_KEY
// is set (an ECDSA P-256 private key, base64 PKCS#8 DER - see
// scripts/generateIntegrationKeys.js), every call goes to
// {base}/api/integration/... SIGNED with it. The key is never sent: each
// request carries a timestamp, a random nonce and the signature of
//   "BSMS-SIG-1\n{METHOD}\n{path}\n{query}\n{timestamp}\n{nonce}"
// which that system checks with the matching PUBLIC key
// (BSMS_INTEGRATION_PUBLIC_KEYS, VerifyBsmsSignature) and accepts only once,
// for a few minutes, for that exact path + query - a captured request cannot
// be replayed or changed. No password is sent to that system and no session
// is needed. What a user may see is then decided by the BSMS role rules alone
// (config/rolePermissions.js) and every branch is visible.
const SIGNATURE_VERSION = 'BSMS-SIG-1';
const serviceKeyEnv = (P) => `RAVON_${P.prefix}_INTEGRATION_PRIVATE_KEY`;
const parsedKeys = new Map(); // env value -> KeyObject | null
const serviceKey = (P) => {
  const raw = String(process.env[serviceKeyEnv(P)] || '').trim();
  if (!raw) return null;
  if (!parsedKeys.has(raw)) {
    let key = null;
    try {
      key = crypto.createPrivateKey({ key: Buffer.from(raw, 'base64'), format: 'der', type: 'pkcs8' });
      if (key.asymmetricKeyType !== 'ec') key = null;
    } catch (error) {
      key = null;
    }
    if (!key) console.warn(`${serviceKeyEnv(P)} is not a valid ECDSA private key - ${P.label} is read with per-user logins`);
    parsedKeys.set(raw, key);
  }
  return parsedKeys.get(raw);
};
/** The headers that authenticate ONE request (new nonce and signature every time). */
const signedHeaders = (P, url) => {
  const u = new URL(url);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(18).toString('base64url');
  const payload = [SIGNATURE_VERSION, 'GET', u.pathname, u.search.replace(/^\?/, ''), timestamp, nonce].join('\n');
  const signature = crypto.sign('sha256', Buffer.from(payload), serviceKey(P)).toString('base64');
  return { Accept: 'application/json', 'X-BSMS-Timestamp': timestamp, 'X-BSMS-Nonce': nonce, 'X-BSMS-Signature': signature };
};
const usesServiceKey = (provider) => {
  const P = providerOf(provider);
  return Boolean(config(P).baseUrl && serviceKey(P));
};
const INTEGRATION_PREFIX = '/api/integration/';
/** /api/<path> -> /api/integration/<path> (idempotent; next-page links already have it). */
const integrationUrl = (url) => {
  const u = new URL(url);
  if (u.pathname.startsWith('/api/') && !u.pathname.startsWith(INTEGRATION_PREFIX)) {
    u.pathname = `${INTEGRATION_PREFIX}${u.pathname.slice('/api/'.length)}`;
  }
  return u.toString();
};

const sessionMaxMs = () => {
  const hours = Number(process.env.RAVON_INTEGRATION_SESSION_HOURS);
  return (Number.isFinite(hours) && hours > 0 && hours <= 168 ? hours : DEFAULT_SESSION_HOURS) * 3600 * 1000;
};

// Roles whose BSMS login is also tried on POS / Restaurant and who may use
// Connect: every role that has a page reading them (Collection, FG Production).
const INTEGRATION_ROLES = Object.values(ROLES)
  .filter((role) => hasModule(role, MODULES.COLLECTION) || hasModule(role, MODULES.FG_PRODUCTION));
const isIntegrationRole = (role) => INTEGRATION_ROLES.includes(normalizeRole(role));
const isFinanceRole = (role) => normalizeRole(role) === ROLES.FINANCE_USER;

const ABILITIES = Object.freeze({
  SHIFTS: 'collection.shifts',
  CREDIT_PAYMENTS: 'collection.credit_payments',
  EMPLOYEE_DEDUCTIONS: 'collection.employee_deductions',
  ITEMS: 'items.view'
});
const KNOWN_ABILITIES = Object.values(ABILITIES);
/** Known ability names from an API user object; null when it does not say (= no access). */
// What the server key reads in each system (its /api/integration/* routes).
const SERVICE_KEY_ABILITIES = Object.freeze({
  pos: Object.freeze([ABILITIES.ITEMS, ABILITIES.SHIFTS, ABILITIES.CREDIT_PAYMENTS, ABILITIES.EMPLOYEE_DEDUCTIONS]),
  restaurant: Object.freeze([ABILITIES.SHIFTS, ABILITIES.CREDIT_PAYMENTS, ABILITIES.EMPLOYEE_DEDUCTIONS])
});
const abilitiesOf = (user) => (Array.isArray(user?.abilities)
  ? [...new Set(user.abilities.filter((a) => KNOWN_ABILITIES.includes(a)))]
  : null);

// ---------------------------------------------------------------- state
const newState = () => ({
  sessions: new Map(), // userId -> { userId, username, token, expiresAt, createdAt, allBranches, abilities, abilitiesAt }
  lastLoad: new Map(), // 'user:<id>' -> ms of the last pos_sessions read
  loginFlights: new Map(), // single-flight key -> Promise
  loginTimes: [], // ms of recent login requests (rate limiter)
  blockedUntil: new Map(), // username (lower case) -> ms: that account's logins paused after a 429
  cooldowns: new Map(), // username (lower case) -> { at, message }
  lastErrors: new Map(), // userId -> { at, message, code } - that user's last failed login / rejected session
  expired: new Map(), // userId -> ms the system rejected that user's session
  scope: new Map(), // token -> scope
  meFlights: new Map() // token -> in-flight /api/me
});
const states = Object.fromEntries(PROVIDER_IDS.map((id) => [id, newState()]));
const st = (P) => states[P.id];
const pendingLogins = new Set(); // in-flight loginAll() promises

// Every token currently held, so it can be scrubbed from any text.
const liveTokens = () => {
  const out = [];
  for (const s of Object.values(states)) for (const session of s.sessions.values()) out.push(session.token);
  for (const P of Object.values(PROVIDERS)) if (process.env[serviceKeyEnv(P)]) out.push(String(process.env[serviceKeyEnv(P)]).trim());
  return out;
};

/** Text with Bearer values, live tokens and the given secrets removed. */
const scrub = (text, extraSecrets = []) => {
  let out = String(text ?? '').replace(/Bearer\s+[^\s"',;]+/gi, 'Bearer [redacted]');
  for (const secret of [...liveTokens(), ...extraSecrets]) {
    if (typeof secret === 'string' && secret.length >= 4) out = out.split(secret).join('[redacted]');
  }
  return out;
};

// ---------------------------------------------------------------- http
// Every request (token or signature) may only go to the configured origin of
// that system. A string-prefix check is NOT enough: "https://pos.x.lk.evil.tld"
// and "https://pos.x.lk@evil.tld" both start with "https://pos.x.lk". A URL taken
// from a response (next_page_url) is therefore compared by parsed origin, and
// userinfo is refused outright.
const expectedOrigin = (P) => {
  const { baseUrl } = config(P);
  if (!baseUrl) throw new PosConfigError(notConfiguredMessage(P), codeOf(P, 'NOT_CONFIGURED'), P.id);
  return new URL(baseUrl).origin;
};

/** True only for a URL on the configured origin of P, without user:password@. */
const sameOrigin = (P, candidate) => {
  try {
    const u = new URL(candidate);
    return u.origin === expectedOrigin(P) && u.username === '' && u.password === '';
  } catch (error) {
    return false;
  }
};

const buildUrl = (P, pathOrUrl, params) => {
  let url;
  if (/^https?:\/\//i.test(pathOrUrl)) {
    url = pathOrUrl;
  } else {
    const { baseUrl } = config(P);
    if (!baseUrl) throw new PosConfigError(notConfiguredMessage(P), codeOf(P, 'NOT_CONFIGURED'), P.id);
    url = `${baseUrl}${String(pathOrUrl).startsWith('/') ? '' : '/'}${pathOrUrl}`;
  }
  if (!sameOrigin(P, url)) {
    throw new PosConfigError(`Refused a ${P.label} request to a host other than ${P.urlEnv[0]}`, codeOf(P, 'NOT_CONFIGURED'), P.id);
  }
  // Tokens and signatures must never travel in clear text in production.
  if (process.env.NODE_ENV === 'production' && new URL(url).protocol !== 'https:') {
    throw new PosConfigError(`${P.label} must be reached over https (${P.urlEnv[0]})`, codeOf(P, 'NOT_CONFIGURED'), P.id);
  }
  if (params && typeof params === 'object') {
    const u = new URL(url);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && !u.searchParams.has(k)) u.searchParams.set(k, v);
    url = u.toString();
  }
  return url;
};

const timedFetch = async (P, url, options) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config(P).timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    // The fetch error never contains the headers; scrubbed anyway.
    if (error.name === 'AbortError') throw new PosUnavailableError(`${P.label} request timed out`, null, P.id);
    throw new PosUnavailableError(scrub(`Unable to connect to ${P.label}: ${error.cause?.code || error.message}`), null, P.id);
  } finally {
    clearTimeout(timer);
  }
};

const readJson = async (response) => {
  try { return await response.json(); } catch (error) { return null; }
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Bearer token from a login response (Sanctum / Passport / JWT style envelopes). */
const extractToken = (payload) => {
  if (!isPlainObject(payload)) return null;
  const candidates = [
    payload.token, payload.access_token, payload.accessToken, payload.plainTextToken,
    payload.data?.token, payload.data?.access_token, payload.data?.accessToken, payload.data?.plainTextToken,
    payload.authorisation?.token, payload.authorization?.token, payload.data?.authorisation?.token,
    payload.data?.authorization?.token, payload.token?.plainTextToken, payload.data?.token?.plainTextToken,
    payload.user?.token, payload.data?.user?.token
  ];
  const token = candidates.find((value) => typeof value === 'string' && value.trim() !== '');
  return token ? token.trim() : null;
};

/** Expiry (ms epoch) from a login response, or null when it does not say. */
const extractExpiry = (payload, now = Date.now()) => {
  if (!isPlainObject(payload)) return null;
  const seconds = Number(payload.expires_in ?? payload.data?.expires_in ?? payload.authorisation?.expires_in ?? payload.authorization?.expires_in);
  if (Number.isFinite(seconds) && seconds > 0) return now + seconds * 1000;
  const at = payload.expires_at ?? payload.data?.expires_at ?? payload.token?.expires_at ?? payload.data?.token?.expires_at;
  if (typeof at === 'string' && at.trim()) {
    const parsed = Date.parse(at);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
};

const serverMessage = (payload, secrets = []) =>
  (isPlainObject(payload) && typeof payload.message === 'string' && payload.message.trim()
    ? scrub(payload.message.trim(), secrets).slice(0, 200) : '');

function notConfiguredMessage(P) {
  return `${P.label} is not configured on the server (${P.urlEnv[0]} is not set) - its collections are skipped`;
}
const notConnectedMessage = (P) =>
  `Not connected to ${P.label}. Log in to Stock Management with your own ${P.label} username and password.`;
const expiredMessage = (P) =>
  `Your ${P.label} session has expired or was revoked. Log in again with your own ${P.label} account.`;

// ---------------------------------------------------------------- login
const recordError = (P, error, userId = null) => {
  if (userId) st(P).lastErrors.set(userId, { at: Date.now(), message: error.message, code: error.code || null });
};

const rateLimited = (P, key) => {
  const s = st(P);
  const now = Date.now();
  s.loginTimes = s.loginTimes.filter((t) => now - t < LOGIN_WINDOW_MS);
  return now < (s.blockedUntil.get(key) || 0) || s.loginTimes.length >= maxLoginsPerMinute();
};

// A 429 pauses only that account (the systems limit logins per account).
const pauseFromHeaders = (P, response, key) => {
  if (response.status !== 429) return;
  const after = Number(response.headers.get('retry-after'));
  st(P).blockedUntil.set(key, Date.now() + (Number.isFinite(after) && after > 0 ? after * 1000 : LOGIN_WINDOW_MS));
};

const performLogin = async (P, username, password) => {
  let response;
  let payload;
  try {
    response = await timedFetch(P, buildUrl(P, config(P).loginPath), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    payload = await readJson(response);
  } catch (error) {
    if (error instanceof PosUnavailableError) {
      throw new PosUnavailableError(`The ${P.label} login service is unavailable (${scrub(error.message, [password])})`, codeOf(P, 'AUTH_UNAVAILABLE'), P.id);
    }
    throw error;
  }
  pauseFromHeaders(P, response, String(username).toLowerCase());
  if (!response.ok) {
    const detail = serverMessage(payload, [password]);
    if ([401, 403, 422].includes(response.status)) {
      throw new PosAuthError(
        `${P.label} refused the login for "${username}"${detail ? ` (${detail})` : ''}`, codeOf(P, 'CREDENTIALS_INVALID'), P.id
      );
    }
    if (response.status === 429) {
      throw new PosUnavailableError(`${P.label} login rate limit reached for "${username}" - try again in a minute`, codeOf(P, 'RATE_LIMITED'), P.id);
    }
    throw new PosUnavailableError(`The ${P.label} login service is unavailable (status ${response.status})`, codeOf(P, 'AUTH_UNAVAILABLE'), P.id);
  }
  const token = extractToken(payload);
  if (!token) {
    const keys = isPlainObject(payload) ? Object.keys(payload).slice(0, 20).join(', ') : typeof payload;
    throw new PosUnavailableError(`${P.label} accepted the login but returned no token (fields: ${keys})`, codeOf(P, 'AUTH_UNAVAILABLE'), P.id);
  }
  const now = Date.now();
  const cap = now + sessionMaxMs();
  const said = extractExpiry(payload, now);
  const user = isPlainObject(payload.user) ? payload.user : (isPlainObject(payload.data?.user) ? payload.data.user : null);
  return {
    token,
    expiresAt: said ? Math.min(said, cap) : cap,
    username: (user && typeof user.username === 'string' && user.username.trim()) || username,
    // The user's privileges in that system (null = it did not say -> no access)
    abilities: abilitiesOf(user),
    apiUser: user ? toApiUser({ user }) : null
  };
};

/**
 * POST /api/login with the typed credentials (never stored). Cool-down,
 * rate limit and single flight are applied. Resolves { token, expiresAt, username }.
 */
const login = async (provider, { username, password }, { respectCooldown = true } = {}) => {
  const P = providerOf(provider);
  if (!config(P).baseUrl) throw new PosConfigError(notConfiguredMessage(P), codeOf(P, 'NOT_CONFIGURED'), P.id);
  const name = String(username ?? '').trim();
  if (!name || typeof password !== 'string' || password === '') {
    throw new PosAuthError(`${P.label} username and password are required`, codeOf(P, 'CREDENTIALS_INVALID'), P.id);
  }
  const s = st(P);
  const key = name.toLowerCase();
  const cooling = s.cooldowns.get(key);
  if (respectCooldown && cooling && Date.now() - cooling.at < LOGIN_COOLDOWN_MS) {
    throw new PosAuthError(cooling.message, codeOf(P, 'CREDENTIALS_INVALID'), P.id);
  }
  // Same username AND password in flight -> share it. The password itself is
  // not part of the key (only whether it is the same one, compared in memory).
  const flight = s.loginFlights.get(key);
  if (flight && flight.password === password) return flight.promise;
  if (rateLimited(P, key)) {
    throw new PosUnavailableError(`${P.label} login paused to respect its login rate limit - try again in a minute`, codeOf(P, 'RATE_LIMITED'), P.id);
  }
  s.loginTimes.push(Date.now());
  const entry = { password, promise: null };
  entry.promise = performLogin(P, name, password)
    .then((result) => { s.cooldowns.delete(key); return result; }, (error) => {
      if (error instanceof PosAuthError) s.cooldowns.set(key, { at: Date.now(), message: error.message });
      throw error;
    })
    .finally(() => {
      entry.password = null; // drop the reference as soon as the call is over
      if (s.loginFlights.get(key) === entry) s.loginFlights.delete(key);
    });
  s.loginFlights.set(key, entry);
  return entry.promise;
};

// ---------------------------------------------------------------- sessions
const usable = (session) =>
  Boolean(session && session.token)
  && (session.expiresAt === null || session.expiresAt === undefined || Date.now() < session.expiresAt - EXPIRY_SAFETY_MS)
  && (!session.createdAt || Date.now() - session.createdAt < sessionMaxMs());

const remember = (P, session) => {
  const s = st(P);
  const current = s.sessions.get(session.userId);
  if (!usable(current) || current.token === session.token || (session.createdAt || 0) >= (current.createdAt || 0)) {
    s.sessions.set(session.userId, session);
  }
};

/**
 * Keeps a newly obtained token for a BSMS user (memory + encrypted in
 * pos_sessions) with the privileges the login reported. Used only for THAT
 * user's own requests.
 */
const startSession = async (provider, { userId, username, token, expiresAt = null, finance = false, abilities = null, apiUser = null }) => {
  const P = providerOf(provider);
  const session = { userId, username, token, expiresAt, createdAt: Date.now(), finance: Boolean(finance), allBranches: null };
  if (abilities) {
    session.abilities = abilities;
    session.abilitiesAt = Date.now();
  }
  if (apiUser) {
    st(P).scope.set(token, { name: apiUser.name ?? username, branchIds: apiUser.branchIds, allBranches: apiUser.allBranches });
    session.allBranches = apiUser.allBranches;
  }
  st(P).sessions.set(userId, session);
  st(P).lastErrors.delete(userId);
  st(P).expired.delete(userId);
  await store.save({ userId, provider: P.id, username, token, expiresAt, finance });
  return session;
};

const reloadFromStore = async (P, kind, query) => {
  const s = st(P);
  if (Date.now() - (s.lastLoad.get(kind) || 0) < SESSION_RELOAD_MS) return;
  s.lastLoad.set(kind, Date.now());
  const rows = await store.loadSessions({ provider: P.id, maxAgeMs: sessionMaxMs(), ...query });
  for (const row of rows) remember(P, row);
};

/** The user's OWN usable session (memory, else pos_sessions), or null. Never anyone else's. */
const ownSession = async (P, userId) => {
  if (!userId) return null;
  const s = st(P);
  let own = s.sessions.get(userId);
  if (!usable(own)) {
    await reloadFromStore(P, `user:${userId}`, { userId });
    own = s.sessions.get(userId);
  }
  return usable(own) ? own : null;
};

// The user may be logging in right now: wait for those logins (each is bounded
// by the request timeout) so the first request after a login finds the token.
const settleLogins = () => (pendingLogins.size ? Promise.allSettled([...pendingLogins]) : Promise.resolve());

const resolveSession = async (P, { userId = null, exclude = [] } = {}) => {
  if (!config(P).baseUrl) throw new PosConfigError(notConfiguredMessage(P), codeOf(P, 'NOT_CONFIGURED'), P.id);
  await settleLogins();
  const session = await ownSession(P, userId);
  if (session && !exclude.includes(session.token)) return session;
  const expired = (userId && st(P).expired.has(userId)) || exclude.length > 0;
  throw new PosAuthError(expired ? expiredMessage(P) : notConnectedMessage(P), codeOf(P, 'NOT_CONNECTED'), P.id);
};

/**
 * A usable token for the provider (never logged / returned to a client).
 * Server-key mode: resolves null (no session needed) - callers only use this
 * to find out whether the system can be read.
 */
const getToken = async (provider = 'pos', { userId = null } = {}) => {
  const P = providerOf(provider);
  if (config(P).baseUrl && serviceKey(P)) return null;
  return (await resolveSession(P, { userId })).token;
};

/** Drops a token the system rejected (memory + pos_sessions). */
const invalidateToken = (provider = 'pos', rejectedToken = null) => {
  // Legacy call shape: invalidateToken(token) for POS.
  if (rejectedToken === null && typeof provider === 'string' && !PROVIDERS[provider.toLowerCase()]) {
    rejectedToken = provider;
    provider = 'pos';
  }
  const P = providerOf(provider);
  const s = st(P);
  for (const [userId, session] of s.sessions) {
    if (!rejectedToken || session.token === rejectedToken) {
      s.sessions.delete(userId);
      s.scope.delete(session.token);
      s.expired.set(userId, Date.now());
      store.invalidate({ userId, provider: P.id });
    }
  }
};

// ---------------------------------------------------------------- data calls
const isUnauthenticated = (status, payload) =>
  status === 401
  || (isPlainObject(payload) && typeof payload.message === 'string' && /^unauthenticated\.?$/i.test(payload.message.trim()));

const TRANSIENT_STATUSES = [502, 503, 504];
const TRANSIENT_RETRY_DELAY_MS = 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Meaningful error for a non-2xx data response (401 is handled separately). */
const describeDataFailure = (P, status, payload, response) => {
  const detail = serverMessage(payload);
  if (status === 403) return `Your ${P.label} account is not allowed to read this data (403${detail ? `: ${detail}` : ''})`;
  if (status === 404) return `The ${P.label} endpoint was not found (404) - check ${P.urlEnv[0]}`;
  if (status === 422) return `${P.label} rejected the request parameters (422${detail ? `: ${detail}` : ''})`;
  if (status === 429) {
    const after = response.headers.get('retry-after');
    return `The ${P.label} rate limit was reached (429). Try again${after ? ` in ${after} seconds` : ' in a minute'}.`;
  }
  if (status >= 500) return `The ${P.label} server had an error (${status})${detail ? `: ${detail}` : ''}. Try again later.`;
  return `${P.label} responded with status ${status}${detail ? `: ${detail}` : ''}`;
};

/** One GET, retried ONCE after a pause on a network error / timeout / 502-504 (GET is safe to repeat). */
// `options` may be a function: called for every attempt (a signed request
// needs a new nonce / signature on the retry).
const fetchWithTransientRetry = async (P, url, options) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await timedFetch(P, url, typeof options === 'function' ? options() : options);
      if (attempt === 0 && TRANSIENT_STATUSES.includes(response.status)) {
        await sleep(TRANSIENT_RETRY_DELAY_MS);
        continue;
      }
      return response;
    } catch (error) {
      if (attempt === 0 && error instanceof PosUnavailableError) {
        await sleep(TRANSIENT_RETRY_DELAY_MS);
        continue;
      }
      throw error;
    }
  }
};

const keyRefusedMessage = (P) => `${P.label} refused the Stock Management signature - check that ${serviceKeyEnv(P)} here `
  + `matches BSMS_INTEGRATION_PUBLIC_KEYS on ${P.label}, and that both server clocks are correct`;

/**
 * Server-key GET: {base}/api/integration/..., signed here, on the server
 * (a new signature for every attempt). Same retry / error handling as a
 * user's call; a 401 means the signature was refused (wrong key / clock), a
 * 403 that this server's IP is not allowed.
 */
const serviceGet = async (P, url) => {
  const target = integrationUrl(url);
  const response = await fetchWithTransientRetry(P, target, () => ({ method: 'GET', headers: signedHeaders(P, target) }));
  const payload = await readJson(response);
  if (isUnauthenticated(response.status, payload)) {
    throw new PosAuthError(keyRefusedMessage(P), codeOf(P, 'CREDENTIALS_INVALID'), P.id);
  }
  if (response.status === 403) {
    throw new PosResponseError(`${P.label} does not allow this Stock Management server (403) - check BSMS_ALLOWED_IPS on ${P.label}`, 403, P.id);
  }
  if (!response.ok) {
    throw new PosResponseError(describeDataFailure(P, response.status, payload, response), response.status, P.id);
  }
  if (payload === null) throw new PosResponseError(`${P.label} returned a response that is not valid JSON`, response.status, P.id);
  return payload;
};

/**
 * Authenticated GET with the token of THAT user. posGet(provider, pathOrUrl,
 * params?, { userId }) - without a userId nothing is sent (NOT_CONNECTED).
 * Returns the parsed JSON body. The Authorization header is added here, on the
 * server, only. A 401 invalidates the token (the user must log in again);
 * every other failure is thrown with a meaningful message.
 */
const posGet = async (provider, pathOrUrl, params = null, { userId = null } = {}) => {
  const P = providerOf(provider);
  const url = buildUrl(P, pathOrUrl, params);
  if (serviceKey(P)) return serviceGet(P, url);
  const rejected = [];
  for (;;) {
    const session = await resolveSession(P, { userId, exclude: rejected });
    const response = await fetchWithTransientRetry(P, url, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${session.token}` }
    });
    const payload = await readJson(response);

    if (isUnauthenticated(response.status, payload)) {
      invalidateToken(P.id, session.token);
      rejected.push(session.token);
      if (rejected.length === 1) continue; // a login may have replaced it meanwhile - look once more
      const failure = new PosAuthError(expiredMessage(P), codeOf(P, 'NOT_CONNECTED'), P.id);
      recordError(P, failure, userId);
      throw failure;
    }
    if (!response.ok) {
      throw new PosResponseError(describeDataFailure(P, response.status, payload, response), response.status, P.id);
    }
    if (payload === null) throw new PosResponseError(`${P.label} returned a response that is not valid JSON`, response.status, P.id);
    return payload;
  }
};

// ---------------------------------------------------------------- scope / status
/** { id, name, branchIds, allBranches } from a /api/me response (never the token). */
const toApiUser = (me) => {
  const user = isPlainObject(me?.user) ? me.user : (isPlainObject(me?.data) ? me.data : me);
  if (!isPlainObject(user)) return null;
  const ids = Array.isArray(user.branch_ids) ? user.branch_ids.map(Number).filter(Number.isFinite) : null;
  return {
    id: user.id ?? null,
    name: user.name || user.username || null,
    branchIds: ids && ids.length ? ids : null,
    allBranches: !(ids && ids.length)
  };
};

const scopeWarning = (P, scope) => (scope && scope.allBranches === false && scope.branchIds
  ? `The ${P.label} account "${scope.name || 'unknown'}" can only see branch${scope.branchIds.length === 1 ? '' : 'es'} `
    + `${scope.branchIds.join(', ')} - collections of other branches are not shown to you.`
  : null);

/**
 * Re-reads /api/me with the session's token: branch scope + CURRENT abilities.
 * Cached per token for ABILITY_TTL_MS (force = always). A 401 drops the
 * session (no access); other failures throw (callers decide, fail closed).
 */
async function refreshMe(P, session, { force = false } = {}) {
  const s = st(P);
  const cached = s.scope.get(session.token);
  if (!force && cached && session.abilities && Date.now() - (session.abilitiesAt || 0) < ABILITY_TTL_MS) return cached;
  if (s.meFlights.has(session.token)) return s.meFlights.get(session.token);
  const flight = (async () => {
    const response = await fetchWithTransientRetry(P, buildUrl(P, '/api/me'), {
      method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${session.token}` }
    });
    const payload = await readJson(response);
    if (isUnauthenticated(response.status, payload)) {
      invalidateToken(P.id, session.token);
      throw new PosAuthError(expiredMessage(P), codeOf(P, 'NOT_CONNECTED'), P.id);
    }
    if (!response.ok) throw new PosResponseError(describeDataFailure(P, response.status, payload, response), response.status, P.id);
    const rawUser = isPlainObject(payload?.user) ? payload.user : (isPlainObject(payload?.data) ? payload.data : payload);
    const user = toApiUser(payload);
    const scope = { name: user?.name ?? session.username ?? null, branchIds: user?.branchIds ?? null, allBranches: user ? user.allBranches : null };
    scope.warning = scopeWarning(P, scope);
    s.scope.set(session.token, scope);
    session.abilities = abilitiesOf(rawUser) || [];
    session.abilitiesAt = Date.now();
    if (scope.allBranches !== null && session.allBranches !== scope.allBranches) {
      session.allBranches = scope.allBranches;
      store.setScope({ userId: session.userId, provider: P.id, allBranches: scope.allBranches });
    }
    return scope;
  })();
  s.meFlights.set(session.token, flight);
  try {
    return await flight;
  } finally {
    s.meFlights.delete(session.token);
  }
}

/**
 * { name, branchIds: number[] | null, allBranches: boolean | null, warning }
 * of the user's own account (branchIds null = not restricted). Never throws.
 */
const getIntegrationScope = async (provider = 'pos', { userId = null } = {}) => {
  const P = providerOf(provider);
  if (usesServiceKey(P.id)) return { name: null, branchIds: null, allBranches: true, warning: null };
  try {
    const session = await resolveSession(P, { userId });
    const scope = await refreshMe(P, session);
    return { ...scope, warning: scopeWarning(P, scope) };
  } catch (error) {
    return { name: null, branchIds: null, allBranches: null, warning: null, error: scrub(error.message), code: error.code || null };
  }
};

/**
 * What THIS user may read in the provider, validated against that system:
 *   { provider, system, configured, connected, abilities: string[],
 *     branchIds: number[] | null, state, code, message }
 * Abilities are re-read from /api/me when older than ABILITY_TTL_MS. Fails
 * closed: not configured / not connected / session rejected / unknown
 * abilities -> abilities []. If /api/me cannot be reached, the last known
 * abilities are used for at most ABILITY_STALE_MS. Never throws.
 */
const getUserAccess = async (provider, { userId = null } = {}) => {
  const P = providerOf(provider);
  const base = { provider: P.id, system: P.system, label: P.label, configured: Boolean(config(P).baseUrl), connected: false, abilities: [], branchIds: null };
  if (!base.configured) return { ...base, state: 'not_configured', code: codeOf(P, 'NOT_CONFIGURED'), message: notConfiguredMessage(P) };
  if (serviceKey(P)) {
    // Server key: everything its /api/integration/* routes serve; the BSMS
    // role rules decide which pages the user may open.
    return { ...base, connected: true, state: 'connected', source: 'service_key', username: null,
      abilities: [...SERVICE_KEY_ABILITIES[P.id]], code: null, message: null };
  }
  let session;
  try {
    session = await resolveSession(P, { userId });
  } catch (error) {
    return { ...base, state: st(P).expired.has(userId) ? 'expired' : 'not_connected', code: error.code || codeOf(P, 'NOT_CONNECTED'), message: scrub(error.message) };
  }
  try {
    await refreshMe(P, session);
  } catch (error) {
    if (error instanceof PosAuthError) {
      return { ...base, state: 'expired', code: error.code, message: scrub(error.message) };
    }
    const fresh = session.abilities && Date.now() - (session.abilitiesAt || 0) < ABILITY_STALE_MS;
    if (!fresh) {
      return { ...base, connected: true, state: 'unverified', code: codeOf(P, 'AUTH_UNAVAILABLE'),
        message: `Your ${P.label} permissions could not be verified (${scrub(error.message)}). Try again shortly.` };
    }
  }
  const scope = st(P).scope.get(session.token);
  return {
    ...base,
    connected: true,
    state: 'connected',
    username: session.username || null,
    abilities: [...(session.abilities || [])],
    branchIds: scope?.branchIds ?? null,
    code: null,
    message: null
  };
};

const statusOf = (P, session, userId) => {
  const { baseUrl } = config(P);
  const s = st(P);
  const base = { provider: P.id, system: P.system, label: P.label, account: P.account, configured: Boolean(baseUrl) };
  if (!baseUrl) {
    return { ...base, connected: false, authenticated: false, state: 'not_configured', username: null, expiresAt: null,
      source: null, code: codeOf(P, 'NOT_CONFIGURED'), message: notConfiguredMessage(P) };
  }
  if (serviceKey(P)) {
    return { ...base, connected: true, authenticated: true, state: 'connected', username: null, expiresAt: null,
      source: 'service_key', code: null, message: null };
  }
  if (session) {
    return { ...base, connected: true, authenticated: true, state: 'connected', username: session.username || null,
      expiresAt: session.expiresAt ? new Date(session.expiresAt).toISOString() : null,
      source: 'own', code: null, message: null };
  }
  const expired = Boolean(userId && s.expired.has(userId));
  const lastError = userId ? s.lastErrors.get(userId) : null;
  const failed = lastError && lastError.code !== codeOf(P, 'NOT_CONNECTED') ? lastError : null;
  return { ...base, connected: false, authenticated: false, state: expired ? 'expired' : 'not_connected',
    username: null, expiresAt: null, source: null,
    code: failed ? failed.code : codeOf(P, 'NOT_CONNECTED'),
    message: failed ? failed.message : (expired ? expiredMessage(P) : notConnectedMessage(P)) };
};

/**
 * Safe-to-display status of the user's own session from memory (never the
 * token or a password): { configured, authenticated, connected, state,
 * username, expiresAt, source, code, message, ... }.
 */
const getAuthStatus = (provider = 'pos', { userId = null } = {}) => {
  const P = providerOf(provider);
  const own = userId ? st(P).sessions.get(userId) : null;
  return statusOf(P, usable(own) ? own : null, userId);
};

/** Status of every provider for THIS user (+ abilities and branch scope). Never throws. */
const getIntegrationStatus = async ({ userId = null, withScope = true } = {}) => {
  const out = {};
  for (const id of PROVIDER_IDS) {
    const P = PROVIDERS[id];
    let session = null;
    if (config(P).baseUrl && !serviceKey(P)) {
      try { session = await ownSession(P, userId); } catch (error) { session = null; }
    }
    const status = statusOf(P, session, userId);
    if (status.source === 'service_key') {
      status.abilities = [...SERVICE_KEY_ABILITIES[id]];
      if (withScope) status.scope = await getIntegrationScope(id, { userId });
    } else if (session) {
      const access = await getUserAccess(id, { userId });
      status.abilities = access.abilities;
      if (access.state !== 'connected') Object.assign(status, { state: access.state, code: access.code, message: access.message });
      if (withScope) status.scope = await getIntegrationScope(id, { userId });
    } else {
      status.abilities = [];
    }
    out[id] = status;
  }
  return out;
};

// ---------------------------------------------------------------- login entry points
/**
 * Called by the BSMS login with the typed credentials (integration roles only):
 * tries every configured provider IN PARALLEL, once each, as THAT user. The
 * session it gets is used only for this user's own requests. Outcomes are
 * independent; never throws; the password is not kept after the calls.
 * A system read with the server key is skipped: no password is sent there.
 * Resolves { pos: {...}, restaurant: {...} } (safe to log: no secrets).
 */
const loginAll = ({ userId, role, username, password }) => {
  const attempt = async (id) => {
    const P = PROVIDERS[id];
    if (!config(P).baseUrl) return { provider: id, ok: false, skipped: true, code: codeOf(P, 'NOT_CONFIGURED') };
    if (serviceKey(P)) return { provider: id, ok: true, skipped: true, source: 'service_key' };
    try {
      const result = await login(id, { username, password });
      await startSession(id, {
        userId, username: result.username, token: result.token, expiresAt: result.expiresAt,
        finance: isFinanceRole(role), abilities: result.abilities, apiUser: result.apiUser
      });
      return { provider: id, ok: true, username: result.username, abilities: result.abilities || [] };
    } catch (error) {
      const message = scrub(error.message, [password]);
      recordError(P, { message, code: error.code }, userId);
      return { provider: id, ok: false, code: error.code || null, error: message };
    }
  };
  const run = Promise.allSettled(PROVIDER_IDS.map(attempt))
    .then((results) => Object.fromEntries(results.map((r, i) => [PROVIDER_IDS[i], r.status === 'fulfilled' ? r.value : { provider: PROVIDER_IDS[i], ok: false }])));
  pendingLogins.add(run);
  run.finally(() => pendingLogins.delete(run));
  return run;
};

/**
 * "Connect <provider>" (Collection page) for a user whose password there
 * differs from the BSMS one: logs in with the typed credentials, keeps ONLY
 * the encrypted token as THIS user's own session, and resolves
 * { connected: true, provider, username, expiresAt, abilities }.
 * Throws PosConfigError / PosAuthError / PosUnavailableError (scrubbed).
 * A system read with the server key needs no connect: resolves connected
 * without sending the password anywhere.
 */
const connect = async (provider, { userId, username, password, role = null }) => {
  const P = providerOf(provider);
  if (usesServiceKey(P.id)) {
    return { connected: true, provider: P.id, system: P.system, username: null, expiresAt: null,
      abilities: [...SERVICE_KEY_ABILITIES[P.id]], source: 'service_key' };
  }
  try {
    // A person retyping a password: no cool-down here (the connect endpoint has
    // its own per-user limit; the per-system login limit still applies).
    const result = await login(P.id, { username, password }, { respectCooldown: false });
    await startSession(P.id, {
      userId, username: result.username, token: result.token, expiresAt: result.expiresAt,
      finance: isFinanceRole(role), abilities: result.abilities, apiUser: result.apiUser
    });
    return {
      connected: true, provider: P.id, system: P.system, username: result.username,
      expiresAt: result.expiresAt ? new Date(result.expiresAt).toISOString() : null,
      abilities: result.abilities || []
    };
  } catch (error) {
    error.message = scrub(error.message, [password]);
    recordError(P, error, userId);
    throw error;
  }
};

/**
 * Server start. Sessions are per user and loaded on that user's first
 * request, so nothing is read or logged in here. Resolves whether any system
 * is configured. Never throws.
 */
const warmUp = async () => PROVIDER_IDS.some((id) => Boolean(config(PROVIDERS[id]).baseUrl));

/** Resolves once every login started by loginAll() has finished (tests / sync). */
const whenIdle = settleLogins;

// Test helper.
const resetAuthState = () => {
  for (const id of PROVIDER_IDS) states[id] = newState();
  pendingLogins.clear();
};

module.exports = {
  PROVIDERS,
  PROVIDER_IDS,
  KINDS,
  providerOf,
  codeOf: (provider, kind) => codeOf(providerOf(provider), kind),
  isSameOrigin: (provider, url) => sameOrigin(providerOf(provider), url),
  isConfigured,
  usesServiceKey,
  isIntegrationRole,
  isFinanceRole,
  INTEGRATION_ROLES,
  posGet,
  login,
  loginAll,
  connect,
  startSession,
  getToken,
  invalidateToken,
  getAuthStatus,
  getIntegrationStatus,
  getIntegrationScope,
  getUserAccess,
  ABILITIES,
  warmUp,
  whenIdle,
  scrub,
  extractToken,
  extractExpiry,
  resetAuthState,
  POS_NOT_CONFIGURED,
  POS_NOT_CONNECTED,
  POS_CREDENTIALS_INVALID,
  POS_AUTH_UNAVAILABLE,
  PosConfigError,
  PosAuthError,
  PosUnavailableError,
  PosResponseError
};
