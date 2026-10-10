// server/services/integrationAuthService.js
//
// Authentication against the two RAVON systems the Collection module reads:
//   provider 'pos'         RAVON POS         RAVON_POS_API_URL         (https://pos.ravonbakers.lk)
//   provider 'restaurant'  RAVON Restaurant  RAVON_RESTAURANT_API_URL  (https://restaurant.ravonbakers.lk)
// Both run the same Laravel API: POST /api/login { username, password } ->
// Bearer token; GET /api/completed-shifts/collection,
// /api/credit-payments/collection, /api/employee-deductions, /api/me.
// ----------------------------------------------------------------------
// NO credentials of either system exist anywhere in BSMS: not in .env, not in
// the code, not in the database, not in logs. A token is obtained ONLY from a
// Stock Management user's OWN typed username / password:
//   * at the BSMS login (authController.loginUser -> loginAll): the same typed
//     username / password are also sent - in parallel, once - to POS and
//     Restaurant /api/login. Each outcome is independent; neither can block
//     or change the BSMS login. The password is used for those calls only and
//     then discarded.
//   * through the one-time "Connect" action of the Collection page
//     (POST /api/collections/integrations/:provider/connect -> connect()), for
//     a Finance account whose POS / Restaurant password differs from its BSMS
//     password, or to reconnect after a session expired.
// Only the resulting token is kept: in memory, and encrypted (AES-256-GCM) in
// pos_sessions through posSessionStore.js so a restart does not lose it.
//
// Token sources for a call, in order (per provider):
//   1. the latest shared Finance session (a Finance user's login, or an explicit
//      "Connect ... Finance account"); all-branch accounts first;
//   2. the requesting user's own session.
// The old sources "service login with credentials from .env" and "static API
// key from .env" were removed.
//
// IMPORTANT - no background / unattended sync: because no password is stored,
// a token can only come from a person logging in. When every session has
// expired (or the system revoked it), nothing can be read until someone logs
// in with the Finance account again (or uses Connect). Sessions are also capped
// at RAVON_INTEGRATION_SESSION_HOURS (default 24 h, the BSMS login lifetime).
//
// Kept from the original POS-only service (posAuthService.js, which now only
// re-exports this module for provider 'pos'):
//   * in-memory token cache;
//   * single-flight login: concurrent logins with the same typed credentials
//     share ONE request;
//   * 401 Unauthenticated -> the token is invalidated and the call is retried
//     ONCE with a newly acquired token (the next session source - a re-login
//     with a password is impossible by design). A second 401 is an error;
//   * login cool-down: credentials a system refused are not re-sent for
//     LOGIN_COOLDOWN_MS; and at most MAX_LOGINS_PER_WINDOW login requests per
//     provider per minute (the login endpoint allows 5 per minute; a 429 or
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
const store = require('./posSessionStore');
const { normalizeRole, ROLES } = require('../config/rolePermissions');

const DEFAULT_TIMEOUT_MS = 8000;
const LOGIN_COOLDOWN_MS = 60 * 1000;
const LOGIN_WINDOW_MS = 60 * 1000;
const MAX_LOGINS_PER_WINDOW = 4; // the systems allow 5 per minute - keep one spare
const EXPIRY_SAFETY_MS = 60 * 1000; // stop using a token a little before it expires
const SESSION_RELOAD_MS = 15 * 1000; // re-check pos_sessions (another process / restart)
const DEFAULT_SESSION_HOURS = 24;

const PROVIDERS = Object.freeze({
  pos: Object.freeze({
    id: 'pos', system: 'POS', prefix: 'POS', label: 'RAVON POS', account: 'RAVON POS Finance',
    urlEnv: ['RAVON_POS_API_URL', 'POS_BASE_URL'], loginEnv: 'RAVON_POS_LOGIN_ENDPOINT', timeoutEnv: 'RAVON_POS_TIMEOUT_MS'
  }),
  restaurant: Object.freeze({
    id: 'restaurant', system: 'RESTAURANT', prefix: 'RESTAURANT', label: 'RAVON Restaurant', account: 'RAVON Restaurant Finance',
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

const sessionMaxMs = () => {
  const hours = Number(process.env.RAVON_INTEGRATION_SESSION_HOURS);
  return (Number.isFinite(hours) && hours > 0 && hours <= 168 ? hours : DEFAULT_SESSION_HOURS) * 3600 * 1000;
};

// Roles whose BSMS login is also tried on POS / Restaurant, and who may use Connect.
const INTEGRATION_ROLES = [ROLES.FINANCE_USER, ROLES.ACCOUNTANT, ROLES.ADMIN, ROLES.SUPER_ADMIN];
const isIntegrationRole = (role) => INTEGRATION_ROLES.includes(normalizeRole(role));
const isFinanceRole = (role) => normalizeRole(role) === ROLES.FINANCE_USER;

// ---------------------------------------------------------------- state
const newState = () => ({
  sessions: new Map(), // userId -> { userId, username, token, expiresAt, createdAt, finance, allBranches }
  lastLoad: new Map(), // 'finance' | 'user:<id>' -> ms of the last pos_sessions read
  loginFlights: new Map(), // single-flight key -> Promise
  loginTimes: [], // ms of recent login requests (rate limiter)
  blockedUntil: 0, // logins paused after 429 / x-ratelimit-remaining: 0
  cooldowns: new Map(), // username (lower case) -> { at, message }
  lastError: null, // { at, message, code } - last failed login / rejected session
  expired: null, // { at, username } - last session the system rejected
  scope: new Map() // token -> scope
});
const states = Object.fromEntries(PROVIDER_IDS.map((id) => [id, newState()]));
const st = (P) => states[P.id];
const pendingLogins = new Set(); // in-flight loginAll() promises

// Every token currently held, so it can be scrubbed from any text.
const liveTokens = () => {
  const out = [];
  for (const s of Object.values(states)) for (const session of s.sessions.values()) out.push(session.token);
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
const buildUrl = (P, pathOrUrl, params) => {
  let url;
  if (/^https?:\/\//i.test(pathOrUrl)) {
    url = pathOrUrl;
  } else {
    const { baseUrl } = config(P);
    if (!baseUrl) throw new PosConfigError(notConfiguredMessage(P), codeOf(P, 'NOT_CONFIGURED'), P.id);
    url = `${baseUrl}${String(pathOrUrl).startsWith('/') ? '' : '/'}${pathOrUrl}`;
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
  `Not connected to ${P.label}. Log in with the ${P.account} account to sync (or use "Connect ${P.account} account").`;
const expiredMessage = (P) =>
  `The ${P.label} session has expired or was revoked. Log in with the ${P.account} account to sync (or reconnect it).`;

// ---------------------------------------------------------------- login
const recordError = (P, error) => {
  st(P).lastError = { at: Date.now(), message: error.message, code: error.code || null };
};

const rateLimited = (P) => {
  const s = st(P);
  const now = Date.now();
  s.loginTimes = s.loginTimes.filter((t) => now - t < LOGIN_WINDOW_MS);
  return now < s.blockedUntil || s.loginTimes.length >= MAX_LOGINS_PER_WINDOW;
};

const pauseFromHeaders = (P, response) => {
  const remaining = response.headers.get('x-ratelimit-remaining');
  const after = Number(response.headers.get('retry-after'));
  if (response.status === 429 || remaining === '0') {
    st(P).blockedUntil = Date.now() + (Number.isFinite(after) && after > 0 ? after * 1000 : LOGIN_WINDOW_MS);
  }
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
  pauseFromHeaders(P, response);
  if (!response.ok) {
    const detail = serverMessage(payload, [password]);
    if ([401, 403, 422].includes(response.status)) {
      throw new PosAuthError(
        `${P.label} refused the login for "${username}"${detail ? ` (${detail})` : ''}`, codeOf(P, 'CREDENTIALS_INVALID'), P.id
      );
    }
    if (response.status === 429) {
      throw new PosUnavailableError(`${P.label} login rate limit reached (5 per minute) - try again in a minute`, codeOf(P, 'RATE_LIMITED'), P.id);
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
    username: (user && typeof user.username === 'string' && user.username.trim()) || username
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
  if (rateLimited(P)) {
    throw new PosUnavailableError(`${P.label} login paused to respect its limit of 5 logins per minute - try again in a minute`, codeOf(P, 'RATE_LIMITED'), P.id);
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

/** Keeps a newly obtained token for a BSMS user (memory + encrypted in pos_sessions). */
const startSession = async (provider, { userId, username, token, expiresAt = null, finance = false }) => {
  const P = providerOf(provider);
  const session = { userId, username, token, expiresAt, createdAt: Date.now(), finance: Boolean(finance), allBranches: null };
  st(P).sessions.set(userId, session);
  st(P).lastError = null;
  st(P).expired = null;
  await store.save({ userId, provider: P.id, username, token, expiresAt, finance });
  // Branch scope in the background (orders the shared sessions; never awaited by the login).
  refreshScope(P, session).catch(() => {});
  return session;
};

const reloadFromStore = async (P, kind, query) => {
  const s = st(P);
  if (Date.now() - (s.lastLoad.get(kind) || 0) < SESSION_RELOAD_MS) return;
  s.lastLoad.set(kind, Date.now());
  const rows = await store.loadSessions({ provider: P.id, maxAgeMs: sessionMaxMs(), ...query });
  for (const row of rows) remember(P, row);
};

const byPreference = (a, b) =>
  (Number(b.allBranches === true) - Number(a.allBranches === true)) || ((b.createdAt || 0) - (a.createdAt || 0));

/** Usable sessions for a call, in source order: shared Finance sessions, then the user's own. */
const candidateSessions = async (P, { userId = null } = {}) => {
  const s = st(P);
  let finance = [...s.sessions.values()].filter((x) => x.finance && usable(x));
  if (finance.length === 0) {
    await reloadFromStore(P, 'finance', { finance: true });
    finance = [...s.sessions.values()].filter((x) => x.finance && usable(x));
  }
  finance.sort(byPreference);
  const out = [...finance];
  if (userId) {
    let own = s.sessions.get(userId);
    if (!usable(own)) {
      await reloadFromStore(P, `user:${userId}`, { userId });
      own = s.sessions.get(userId);
    }
    if (usable(own) && !out.includes(own)) out.push(own);
  }
  return out;
};

// A Finance user may be logging in right now: wait for those logins (each is
// bounded by the request timeout) so the first sync after a login finds the token.
const settleLogins = () => (pendingLogins.size ? Promise.allSettled([...pendingLogins]) : Promise.resolve());

const resolveSession = async (P, { userId = null, exclude = [] } = {}) => {
  if (!config(P).baseUrl) throw new PosConfigError(notConfiguredMessage(P), codeOf(P, 'NOT_CONFIGURED'), P.id);
  await settleLogins();
  const session = (await candidateSessions(P, { userId })).find((x) => !exclude.includes(x.token));
  if (session) return session;
  const expired = Boolean(st(P).expired) || exclude.length > 0;
  throw new PosAuthError(expired ? expiredMessage(P) : notConnectedMessage(P), codeOf(P, 'NOT_CONNECTED'), P.id);
};

/** A usable token for the provider (never logged / returned to a client). */
const getToken = async (provider = 'pos', { userId = null } = {}) => (await resolveSession(providerOf(provider), { userId })).token;

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
      s.expired = { at: Date.now(), username: session.username };
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
  if (status === 403) return `The ${P.account} account is not allowed to read this data (403${detail ? `: ${detail}` : ''})`;
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
const fetchWithTransientRetry = async (P, url, options) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await timedFetch(P, url, options);
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

/**
 * Authenticated GET. posGet(provider, pathOrUrl, params?, { userId }?)
 * Returns the parsed JSON body. The Authorization header is added here, on the
 * server, only. A 401 invalidates the token and retries ONCE with the next
 * session source; every other failure is thrown with a meaningful message.
 */
const posGet = async (provider, pathOrUrl, params = null, { userId = null } = {}) => {
  const P = providerOf(provider);
  const url = buildUrl(P, pathOrUrl, params);
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
      if (rejected.length === 1) continue; // retry once with a newly acquired token
      const failure = new PosAuthError(expiredMessage(P), codeOf(P, 'NOT_CONNECTED'), P.id);
      recordError(P, failure);
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
    + `${scope.branchIds.join(', ')} - collections of other branches are not imported. Log in with the ${P.account} account (all branches).`
  : null);

async function refreshScope(P, session) {
  const s = st(P);
  if (s.scope.has(session.token)) return s.scope.get(session.token);
  const response = await fetchWithTransientRetry(P, buildUrl(P, '/api/me'), {
    method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${session.token}` }
  });
  const payload = await readJson(response);
  if (!response.ok) throw new PosResponseError(describeDataFailure(P, response.status, payload, response), response.status, P.id);
  const user = toApiUser(payload);
  const scope = { name: user?.name ?? session.username ?? null, branchIds: user?.branchIds ?? null, allBranches: user ? user.allBranches : null };
  scope.warning = scopeWarning(P, scope);
  s.scope.set(session.token, scope);
  if (scope.allBranches !== null && session.allBranches !== scope.allBranches) {
    session.allBranches = scope.allBranches;
    store.setScope({ userId: session.userId, provider: P.id, allBranches: scope.allBranches });
  }
  return scope;
}

/**
 * { name, branchIds: number[] | null, allBranches: boolean | null, warning }
 * of the account whose token a call would use (branchIds null = not
 * restricted). Never throws.
 */
const getIntegrationScope = async (provider = 'pos', { userId = null } = {}) => {
  const P = providerOf(provider);
  try {
    const session = await resolveSession(P, { userId });
    return await refreshScope(P, session);
  } catch (error) {
    return { name: null, branchIds: null, allBranches: null, warning: null, error: scrub(error.message), code: error.code || null };
  }
};

const statusOf = (P, session, ownUserId) => {
  const { baseUrl } = config(P);
  const s = st(P);
  const base = { provider: P.id, system: P.system, label: P.label, account: P.account, configured: Boolean(baseUrl) };
  if (!baseUrl) {
    return { ...base, connected: false, authenticated: false, state: 'not_configured', username: null, expiresAt: null,
      source: null, code: codeOf(P, 'NOT_CONFIGURED'), message: notConfiguredMessage(P) };
  }
  if (session) {
    return { ...base, connected: true, authenticated: true, state: 'connected', username: session.username || null,
      expiresAt: session.expiresAt ? new Date(session.expiresAt).toISOString() : null,
      source: session.finance ? 'finance' : (session.userId === ownUserId ? 'own' : 'shared'), code: null, message: null };
  }
  const expired = Boolean(s.expired);
  const failed = s.lastError && s.lastError.code !== codeOf(P, 'NOT_CONNECTED') ? s.lastError : null;
  return { ...base, connected: false, authenticated: false, state: expired ? 'expired' : 'not_connected',
    username: null, expiresAt: null, source: null,
    code: failed ? failed.code : codeOf(P, 'NOT_CONNECTED'),
    message: failed ? failed.message : (expired ? expiredMessage(P) : notConnectedMessage(P)) };
};

/**
 * Safe-to-display status of one provider from memory (never the token or a
 * password): { configured, authenticated, connected, state, username,
 * expiresAt, source, code, message, ... }. Sync, so it reflects sessions
 * already loaded; getIntegrationStatus() also reads pos_sessions.
 */
const getAuthStatus = (provider = 'pos', { userId = null } = {}) => {
  const P = providerOf(provider);
  const s = st(P);
  const sessions = [...s.sessions.values()].filter(usable);
  const session = sessions.filter((x) => x.finance).sort(byPreference)[0] || (userId ? sessions.find((x) => x.userId === userId) : null) || null;
  return statusOf(P, session, userId);
};

/** Status of every provider (+ branch scope of connected ones). Never throws. */
const getIntegrationStatus = async ({ userId = null, withScope = true } = {}) => {
  const out = {};
  for (const id of PROVIDER_IDS) {
    const P = PROVIDERS[id];
    let session = null;
    if (config(P).baseUrl) {
      try { session = (await candidateSessions(P, { userId }))[0] || null; } catch (error) { session = null; }
    }
    const status = statusOf(P, session, userId);
    if (session && withScope) status.scope = await getIntegrationScope(id, { userId });
    out[id] = status;
  }
  return out;
};

// ---------------------------------------------------------------- login entry points
/**
 * Called by the BSMS login with the typed credentials (integration roles only):
 * tries every configured provider IN PARALLEL, once each. Outcomes are
 * independent; never throws; the password is not kept after the calls.
 * Resolves { pos: {...}, restaurant: {...} } (safe to log: no secrets).
 */
const loginAll = ({ userId, role, username, password }) => {
  const finance = isFinanceRole(role);
  const attempt = async (id) => {
    const P = PROVIDERS[id];
    if (!config(P).baseUrl) return { provider: id, ok: false, skipped: true, code: codeOf(P, 'NOT_CONFIGURED') };
    try {
      const result = await login(id, { username, password });
      await startSession(id, { userId, username: result.username, token: result.token, expiresAt: result.expiresAt, finance });
      return { provider: id, ok: true, username: result.username };
    } catch (error) {
      const message = scrub(error.message, [password]);
      // Only a Finance login's failure explains why the shared session is missing.
      if (finance) recordError(P, { message, code: error.code });
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
 * One-time "Connect <provider> Finance account" (Collection page): logs in with
 * the typed credentials, keeps ONLY the encrypted token as the shared Finance
 * session, and resolves { connected: true, provider, username, expiresAt }.
 * Throws PosConfigError / PosAuthError / PosUnavailableError (scrubbed).
 */
const connect = async (provider, { userId, username, password }) => {
  const P = providerOf(provider);
  try {
    // A person retyping a password: no cool-down here (the connect endpoint has
    // its own per-user limit; the per-system login limit still applies).
    const result = await login(P.id, { username, password }, { respectCooldown: false });
    await startSession(P.id, { userId, username: result.username, token: result.token, expiresAt: result.expiresAt, finance: true });
    return {
      connected: true, provider: P.id, system: P.system, username: result.username,
      expiresAt: result.expiresAt ? new Date(result.expiresAt).toISOString() : null
    };
  } catch (error) {
    error.message = scrub(error.message, [password]);
    recordError(P, error);
    throw error;
  }
};

/**
 * Loads the stored sessions (server start). There are no credentials, so it
 * never logs in: it only reports whether a usable POS session exists.
 */
const warmUp = async () => {
  try {
    for (const id of PROVIDER_IDS) if (config(PROVIDERS[id]).baseUrl) await candidateSessions(PROVIDERS[id]);
    return (await candidateSessions(PROVIDERS.pos)).length > 0;
  } catch (error) {
    return false;
  }
};

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
  isConfigured,
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
