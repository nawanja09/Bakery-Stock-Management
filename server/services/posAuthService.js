// server/services/posAuthService.js
//
// Background authentication against the Ravon Bakers POS API.
// ----------------------------------------------------------------------
// Users never log in to the POS. The BACKEND logs in with its POS integration
// account (for Collection this must be the POS "finance" account, which sees
// every branch) from the environment
//   POST {RAVON_POS_API_URL}/api/login   { username, password }
// and calls the POS with `Authorization: Bearer <token>`. The token and the
// credentials stay in this process: they are never sent to the browser,
// never returned by any BSMS endpoint and never logged.
//
// Verified against the live POS (no credentials needed to see this):
//   * /api/login requires `username` and `password` (422 lists both when absent)
//     and is rate limited to 5 requests per minute.
//   * Protected endpoints answer 401 {"error":true,"message":"Unauthenticated.","status":401}
//     without a valid token.
// NOT verified (needs real credentials): the exact JSON of a successful login.
// extractToken() therefore accepts the usual Laravel/Sanctum/Passport shapes.
//
// Token handling
//   * The token is cached in memory and reused until it expires (when the login
//     response says when) or until the POS rejects it with 401.
//   * Concurrent callers share ONE login request (single flight), so a burst of
//     requests cannot exhaust the 5-per-minute login limit.
//   * A 401 on a data call invalidates the token, logs in again ONCE and retries
//     the call ONCE. A second 401 is reported as an authentication error.
//   * A rejected login (wrong credentials) is not retried for LOGIN_COOLDOWN_MS,
//     so a misconfiguration cannot lock the POS account by hammering /api/login.
//
// POS sessions from Stock Management logins (preferred token sources)
//   At login every user's username / password is checked against the POS
//   (authController.loginUser -> authenticateUser). When the POS accepts it,
//   the POS token is kept on the server (memory + encrypted in pos_sessions, see
//   posSessionStore.js; the password is never stored). Token used for a POS call
//   (/api/items-list, /api/completed-shifts/collection,
//   /api/credit-payments/collection, /api/employee-deductions), in order:
//     1. the Finance user's POS session - an all-branch account, shared by
//        every user (Collection needs every branch);
//     2. the requesting user's own POS session (runWithUser, set per request by
//        middleware/authenticate);
//     3. the RAVON_POS_USERNAME / RAVON_POS_PASSWORD service login described above;
//     4. the legacy static RAVON_POS_API_KEY (no login).
//   A session the POS rejects (401) is dropped and the next source is tried;
//   with none left the error asks for a new login.
//
// Branch scope: the POS limits every data endpoint to the branches of the
// account that owns the token (GET /api/me -> branch_ids); asking for another
// branch returns nothing. getIntegrationScope() reports that scope so the
// Collection screen can warn when the account cannot see every department.
// ----------------------------------------------------------------------

const sessionStore = require('./posSessionStore');

const DEFAULT_TIMEOUT_MS = 8000;
const SESSION_RELOAD_MS = 15 * 1000; // re-check pos_sessions for a newer Finance login (other server process)
const LOGIN_COOLDOWN_MS = 60 * 1000;
const EXPIRY_SAFETY_MS = 60 * 1000; // refresh a little before the POS says the token expires

class PosConfigError extends Error {
  constructor(message) { super(message); this.name = 'PosConfigError'; }
}
class PosAuthError extends Error {
  constructor(message) { super(message); this.name = 'PosAuthError'; }
}
class PosUnavailableError extends Error {
  constructor(message) { super(message); this.name = 'PosUnavailableError'; }
}
class PosResponseError extends Error {
  constructor(message, status) { super(message); this.name = 'PosResponseError'; this.status = status; }
}

// Read at call time so tests (and a changed .env after restart) are honoured.
// POS_BASE_URL / POS_USERNAME / POS_PASSWORD are accepted as alternative names.
// These are the POS service account - unrelated to any Stock Management login.
const config = () => ({
  baseUrl: (process.env.RAVON_POS_API_URL || process.env.POS_BASE_URL || '').replace(/\/+$/, ''),
  loginPath: process.env.RAVON_POS_LOGIN_ENDPOINT || '/api/login',
  username: process.env.RAVON_POS_USERNAME || process.env.POS_USERNAME || '',
  password: process.env.RAVON_POS_PASSWORD || process.env.POS_PASSWORD || '',
  staticToken: process.env.RAVON_POS_API_KEY || '',
  timeoutMs: Number(process.env.RAVON_POS_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
});

const state = {
  token: null,
  expiresAt: null, // ms epoch, or null when the POS did not say
  loginPromise: null,
  lastLoginFailure: null // { at, message }
};

const buildUrl = (pathOrUrl) => {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const { baseUrl } = config();
  if (!baseUrl) throw new PosConfigError('RAVON_POS_API_URL is not configured');
  return `${baseUrl}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
};

const timedFetch = async (url, options) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config().timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') throw new PosUnavailableError('POS request timed out');
    throw new PosUnavailableError(`Unable to connect to the POS: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
};

const readJson = async (response) => {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Bearer token from a login response (Sanctum / Passport / JWT style envelopes). */
const extractToken = (payload) => {
  if (!isPlainObject(payload)) return null;
  const candidates = [
    payload.token, payload.access_token, payload.accessToken, payload.plainTextToken,
    payload.data?.token, payload.data?.access_token, payload.data?.accessToken, payload.data?.plainTextToken,
    payload.authorisation?.token, payload.authorization?.token, payload.data?.authorisation?.token,
    payload.user?.token, payload.data?.user?.token
  ];
  const token = candidates.find((value) => typeof value === 'string' && value.trim() !== '');
  return token ? token.trim() : null;
};

/** Expiry (ms epoch) from a login response, or null when it does not say. */
const extractExpiry = (payload, now = Date.now()) => {
  if (!isPlainObject(payload)) return null;
  const seconds = Number(payload.expires_in ?? payload.data?.expires_in);
  if (Number.isFinite(seconds) && seconds > 0) return now + seconds * 1000;
  const at = payload.expires_at ?? payload.data?.expires_at;
  if (typeof at === 'string' && at.trim()) {
    const parsed = Date.parse(at);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
};

const describeLoginFailure = (status, payload) => {
  const posMessage = isPlainObject(payload) && typeof payload.message === 'string' ? payload.message : '';
  if (status === 429) return 'POS login is rate limited (5 per minute). Try again in a minute.';
  if (status === 401 || status === 403 || status === 422) {
    return `POS login was rejected${posMessage ? ` (${posMessage})` : ''}. No POS session from a Stock Management login is available - log in as the Finance user with the POS username / password, or check RAVON_POS_USERNAME / RAVON_POS_PASSWORD on the server.`;
  }
  return `POS login failed with status ${status}`;
};

const requestLogin = async (username, password) => {
  const response = await timedFetch(buildUrl(config().loginPath), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  return { response, payload: await readJson(response) };
};

const performLogin = async () => {
  const { username, password } = config();
  const { response, payload } = await requestLogin(username, password);
  if (!response.ok) {
    const message = describeLoginFailure(response.status, payload);
    // Only rejected credentials start the cool-down; 429 / 5xx may be retried next time.
    if ([401, 403, 422].includes(response.status)) state.lastLoginFailure = { at: Date.now(), message };
    throw new PosAuthError(message);
  }
  const token = extractToken(payload);
  if (!token) {
    const keys = isPlainObject(payload) ? Object.keys(payload).join(', ') : typeof payload;
    const message = `POS login succeeded but no token was found in the response (fields: ${keys})`;
    state.lastLoginFailure = { at: Date.now(), message };
    throw new PosAuthError(message);
  }
  state.token = token;
  state.expiresAt = extractExpiry(payload);
  state.lastLoginFailure = null;
  return token;
};

const hasCredentials = () => {
  const { username, password } = config();
  return Boolean(username && password);
};

const tokenIsFresh = () =>
  Boolean(state.token) && (state.expiresAt === null || Date.now() < state.expiresAt - EXPIRY_SAFETY_MS);

/**
 * A usable POS token: the cached one while it is valid, otherwise a new login
 * (shared by every concurrent caller).
 */
const getToken = async ({ forceRefresh = false } = {}) => {
  if (!hasCredentials()) {
    const { staticToken } = config();
    if (staticToken) return staticToken;
    throw new PosConfigError('POS credentials are not configured (set RAVON_POS_USERNAME and RAVON_POS_PASSWORD on the server)');
  }
  if (!forceRefresh && tokenIsFresh()) return state.token;

  if (state.lastLoginFailure && Date.now() - state.lastLoginFailure.at < LOGIN_COOLDOWN_MS) {
    throw new PosAuthError(state.lastLoginFailure.message);
  }

  if (!state.loginPromise) {
    state.token = null;
    state.loginPromise = performLogin().finally(() => { state.loginPromise = null; });
  }
  return state.loginPromise;
};

// ---- POS sessions from BSMS logins ------------------------------------------
// A user whose BSMS login was accepted by the POS (authController.loginUser)
// gets a POS session here. The Finance user's session (an all-branch POS account)
// is shared for every POS call; every other user's session is used for the POS
// calls of their own requests (requestContext, set by middleware/authenticate).
const { AsyncLocalStorage } = require('async_hooks');

const requestContext = new AsyncLocalStorage();

/** Runs `fn` (the rest of an API request) with the BSMS user id available to posGet. */
const runWithUser = (userId, fn) => requestContext.run({ userId: userId ?? null }, fn);
const currentUserId = () => requestContext.getStore()?.userId ?? null;

const finance = {
  session: null, // { userId, posUsername, token, expiresAt, createdAt, finance }
  lastLoadAt: 0,
  loadPromise: null,
  expired: null // { at, posUsername } - the last Finance session the POS rejected
};
const userSessions = new Map(); // BSMS userId -> session
const userLoads = new Map(); // BSMS userId -> { at, promise }

const sessionUsable = (s) =>
  Boolean(s && s.token) && (s.expiresAt === null || Date.now() < s.expiresAt - EXPIRY_SAFETY_MS);

/** The current Finance POS session (memory, else the latest one in pos_sessions), or null. */
const getFinanceSession = async () => {
  if (sessionUsable(finance.session)) return finance.session;
  if (Date.now() - finance.lastLoadAt >= SESSION_RELOAD_MS) {
    if (!finance.loadPromise) {
      finance.loadPromise = sessionStore.loadLatest({ finance: true })
        .then((stored) => {
          finance.lastLoadAt = Date.now();
          if (sessionUsable(stored) && !sessionUsable(finance.session)) finance.session = stored;
        })
        .finally(() => { finance.loadPromise = null; });
    }
    await finance.loadPromise;
  }
  return sessionUsable(finance.session) ? finance.session : null;
};

/** A BSMS user's own POS session (memory, else pos_sessions), or null. */
const getUserSession = async (userId) => {
  if (userId === null || userId === undefined) return null;
  const key = String(userId);
  if (sessionUsable(userSessions.get(key))) return userSessions.get(key);
  const load = userLoads.get(key) || { at: 0, promise: null };
  if (Date.now() - load.at >= SESSION_RELOAD_MS) {
    if (!load.promise) {
      load.promise = sessionStore.loadLatest({ userId })
        .then((stored) => {
          load.at = Date.now();
          if (sessionUsable(stored) && !sessionUsable(userSessions.get(key))) userSessions.set(key, stored);
        })
        .finally(() => { load.promise = null; });
      userLoads.set(key, load);
    }
    await load.promise;
  }
  return sessionUsable(userSessions.get(key)) ? userSessions.get(key) : null;
};

/**
 * Checks a user's POS username / password against POST /api/login.
 * Returns { token, expiresAt }; never stores the password. Throws PosAuthError
 * when the POS rejects the credentials, PosUnavailableError / PosResponseError
 * when the POS cannot answer, PosConfigError when the POS URL is not set.
 */
const authenticateUser = async (username, password) => {
  const { response, payload } = await requestLogin(username, password);
  if (!response.ok) {
    if ([401, 403, 422].includes(response.status)) throw new PosAuthError('Invalid POS username or password');
    if (response.status === 429) {
      throw new PosResponseError('Too many POS login attempts (5 per minute). Try again in a minute.', 429);
    }
    throw new PosUnavailableError(`The POS login is not available right now (status ${response.status}). Try again later.`);
  }
  const token = extractToken(payload);
  if (!token) throw new PosResponseError('The POS login succeeded but returned no token', response.status);
  return { token, expiresAt: extractExpiry(payload) };
};

/**
 * Keeps the POS token of a user whose login the POS accepted (memory + encrypted
 * in pos_sessions). `finance: true` also makes it the shared token for every POS call.
 */
const startPosSession = async ({ userId, posUsername, token, expiresAt = null, finance: isFinance = false }) => {
  const session = { userId, posUsername, token, expiresAt, createdAt: Date.now(), finance: isFinance };
  userSessions.set(String(userId), session);
  if (isFinance) {
    finance.session = session;
    finance.expired = null;
  }
  await sessionStore.save({ userId, posUsername, token, expiresAt, finance: isFinance });
};

/** Forgets a session the POS rejected (401), in memory and in pos_sessions. */
const dropSession = async (session) => {
  const key = String(session.userId);
  if (userSessions.get(key)?.token === session.token) userSessions.delete(key);
  userLoads.set(key, { at: Date.now(), promise: null }); // do not immediately reload the row being invalidated
  if (finance.session && finance.session.token === session.token) {
    finance.session = null;
    finance.expired = { at: Date.now(), posUsername: session.posUsername };
    finance.lastLoadAt = Date.now();
  }
  await sessionStore.invalidate(session.userId);
};

/**
 * Token for the next POS call, in order: the Finance session (all branches),
 * the requesting user's own POS session, the service login, the static key.
 * `skip` lists sessions already rejected during this call.
 */
const resolveCredential = async ({ forceRefresh = false, skip = [] } = {}) => {
  const rejected = (session) => skip.some((s) => s.token === session.token);
  const shared = await getFinanceSession();
  if (shared && !rejected(shared)) return { token: shared.token, source: 'session', session: shared };
  const own = await getUserSession(currentUserId());
  if (own && !rejected(own)) return { token: own.token, source: 'session', session: own };
  if (hasCredentials()) return { token: await getToken({ forceRefresh }), source: 'login' };
  if (config().staticToken) return { token: config().staticToken, source: 'static' };
  if (skip.length || finance.expired) {
    throw new PosAuthError('The POS session has expired or was rejected by the POS. Log in to Stock Management again with your POS username and password.');
  }
  throw new PosConfigError('No POS session: log in to Stock Management with a POS username and password (or set RAVON_POS_USERNAME and RAVON_POS_PASSWORD on the server)');
};

const invalidateToken = (rejectedToken) => {
  // Only drop the token that was actually rejected; another request may already
  // have replaced it with a fresh one.
  if (!rejectedToken || state.token === rejectedToken) {
    state.token = null;
    state.expiresAt = null;
  }
};

const isUnauthenticated = (status, payload) =>
  status === 401
  || (isPlainObject(payload) && typeof payload.message === 'string' && /^unauthenticated\.?$/i.test(payload.message.trim()));

const TRANSIENT_STATUSES = [502, 503, 504];
const TRANSIENT_RETRY_DELAY_MS = 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const posMessage = (payload) =>
  (isPlainObject(payload) && typeof payload.message === 'string' && payload.message.trim() ? payload.message.trim() : '');

/** Meaningful error for a non-2xx POS data response (401 is handled separately). */
const describeDataFailure = (status, payload, response) => {
  const detail = posMessage(payload);
  if (status === 403) return `The POS service account is not allowed to read this data (403${detail ? `: ${detail}` : ''})`;
  if (status === 404) return 'The POS endpoint was not found (404) - check the POS URL';
  if (status === 422) return `The POS rejected the request parameters (422${detail ? `: ${detail}` : ''})`;
  if (status === 429) {
    const after = response.headers.get('retry-after');
    return `The POS rate limit was reached (429). Try again${after ? ` in ${after} seconds` : ' in a minute'}.`;
  }
  if (status >= 500) return `The POS server had an error (${status})${detail ? `: ${detail}` : ''}. Try again later.`;
  return `POS responded with status ${status}${detail ? `: ${detail}` : ''}`;
};

/** One GET, retried ONCE after a pause on a network error / timeout / 502-504 (GET is safe to repeat). */
const fetchWithTransientRetry = async (url, options) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await timedFetch(url, options);
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
 * Authenticated GET against the POS. Returns the parsed JSON body.
 * Uses the Finance POS session, else the requesting user's own POS session; a
 * 401 on one drops that session and falls back to the next source
 * (resolveCredential). The service login gets one re-login on 401, and every
 * request one retry on a transient failure. Every other failure is thrown with
 * a meaningful message; nothing loops.
 */
const posGet = async (pathOrUrl) => {
  const url = buildUrl(pathOrUrl);
  const skip = [];
  let reloggedIn = false;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const credential = await resolveCredential({ forceRefresh: reloggedIn, skip });
    const { token, source } = credential;
    const response = await fetchWithTransientRetry(url, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }
    });
    const payload = await readJson(response);

    if (isUnauthenticated(response.status, payload)) {
      if (source === 'session') {
        await dropSession(credential.session);
        skip.push(credential.session);
        continue; // try the next token source, if any
      }
      if (source === 'login' && !reloggedIn) {
        invalidateToken(token);
        reloggedIn = true;
        continue; // log in again and retry once
      }
      throw new PosAuthError(source === 'login'
        ? 'The POS rejected the token even after logging in again (Unauthenticated)'
        : 'The POS rejected RAVON_POS_API_KEY (Unauthenticated). A Finance user must log in to BSMS with their POS username and password, or configure RAVON_POS_USERNAME / RAVON_POS_PASSWORD.');
    }
    if (!response.ok) {
      throw new PosResponseError(describeDataFailure(response.status, payload, response), response.status);
    }
    if (payload === null) throw new PosResponseError('POS returned a response that is not valid JSON', response.status);
    return payload;
  }
  /* istanbul ignore next - loop always returns or throws */
  throw new PosAuthError('POS authentication failed');
};

/** { id, name, role, branchIds, allBranches } from a /api/me response (never the token). */
const toPosUser = (me) => {
  const user = isPlainObject(me?.user) ? me.user : (isPlainObject(me?.data) ? me.data : me);
  if (!isPlainObject(user)) return null;
  const ids = Array.isArray(user.branch_ids) ? user.branch_ids.map(Number).filter(Number.isFinite) : null;
  return {
    id: user.id ?? null,
    name: user.name || user.username || null,
    role: user.role || null,
    branchIds: ids && ids.length ? ids : null,
    allBranches: !(ids && ids.length)
  };
};

// Branch scope of the integration account, read once per token.
let integrationScope = { token: null, scope: null };

/**
 * { name, branchIds: number[] | null, allBranches: boolean | null } of the POS
 * integration account (branchIds null = not restricted). Never throws.
 */
const getIntegrationScope = async () => {
  try {
    const { token } = await resolveCredential();
    if (integrationScope.token === token && integrationScope.scope) return integrationScope.scope;
    const user = toPosUser(await posGet('/api/me'));
    const scope = { name: user?.name ?? null, branchIds: user?.branchIds ?? null, allBranches: user ? user.allBranches : null };
    integrationScope = { token, scope };
    return scope;
  } catch (error) {
    return { name: null, branchIds: null, allBranches: null, error: error.message };
  }
};

/**
 * Logs the integration account in ahead of time (called after a Stock
 * Management login) so the first Collection request does not wait for it.
 * Shares the cached token / single-flight login; never throws.
 */
const warmUp = () => {
  if (!hasCredentials()) return Promise.resolve(false);
  return getToken().then(() => true, () => false);
};

/** Safe-to-display status (never includes the token or credentials). */
const getAuthStatus = () => {
  const financeActive = sessionUsable(finance.session);
  const ownActive = sessionUsable(userSessions.get(String(currentUserId())));
  const fallbackMode = hasCredentials() ? 'login' : (config().staticToken ? 'static-token' : 'none');
  return {
    configured: financeActive || ownActive || hasCredentials() || Boolean(config().staticToken),
    mode: financeActive ? 'finance-session' : (ownActive ? 'user-session' : fallbackMode),
    financeUser: financeActive ? finance.session.posUsername : null,
    hasToken: financeActive || ownActive || tokenIsFresh(),
    lastError: (!financeActive && !ownActive && finance.expired)
      ? 'The Finance POS session has expired. A Finance user must log in to Stock Management again.'
      : (state.lastLoginFailure ? state.lastLoginFailure.message : null)
  };
};

// Test helper.
const resetAuthState = () => {
  integrationScope = { token: null, scope: null };
  state.token = null;
  state.expiresAt = null;
  state.loginPromise = null;
  state.lastLoginFailure = null;
  finance.session = null;
  finance.lastLoadAt = 0;
  finance.loadPromise = null;
  finance.expired = null;
  userSessions.clear();
  userLoads.clear();
};

module.exports = {
  posGet,
  getIntegrationScope,
  warmUp,
  getToken,
  invalidateToken,
  getAuthStatus,
  authenticateUser,
  startPosSession,
  runWithUser,
  getFinanceSession,
  extractToken,
  extractExpiry,
  resetAuthState,
  PosConfigError,
  PosAuthError,
  PosUnavailableError,
  PosResponseError
};
