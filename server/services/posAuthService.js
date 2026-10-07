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
// Legacy: if RAVON_POS_USERNAME / RAVON_POS_PASSWORD are not set but
// RAVON_POS_API_KEY is, that static token is used as before (no login).
//
// Branch scope: the POS limits every data endpoint to the branches of the
// account that owns the token (GET /api/me -> branch_ids); asking for another
// branch returns nothing. getIntegrationScope() reports that scope so the
// Collection screen can warn when the account cannot see every department.
// ----------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 8000;
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
    return `POS login was rejected${posMessage ? ` (${posMessage})` : ''}. Check RAVON_POS_USERNAME / RAVON_POS_PASSWORD on the server.`;
  }
  return `POS login failed with status ${status}`;
};

const performLogin = async () => {
  const { username, password, loginPath } = config();
  const response = await timedFetch(buildUrl(loginPath), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const payload = await readJson(response);
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
 * Handles token reuse, expiry, one re-login on 401, and one retry on a
 * transient failure. Every other failure is thrown with a meaningful message;
 * nothing loops.
 */
const posGet = async (pathOrUrl) => {
  const url = buildUrl(pathOrUrl);
  const usingLogin = hasCredentials();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await getToken({ forceRefresh: attempt > 0 });
    const response = await fetchWithTransientRetry(url, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }
    });
    const payload = await readJson(response);

    if (isUnauthenticated(response.status, payload)) {
      if (usingLogin && attempt === 0) {
        invalidateToken(token);
        continue; // log in again and retry once
      }
      throw new PosAuthError(usingLogin
        ? 'The POS rejected the token even after logging in again (Unauthenticated)'
        : 'The POS rejected RAVON_POS_API_KEY (Unauthenticated). Configure RAVON_POS_USERNAME / RAVON_POS_PASSWORD instead.');
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
    const token = await getToken();
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
const getAuthStatus = () => ({
  configured: hasCredentials() || Boolean(config().staticToken),
  mode: hasCredentials() ? 'login' : (config().staticToken ? 'static-token' : 'none'),
  hasToken: tokenIsFresh(),
  lastError: state.lastLoginFailure ? state.lastLoginFailure.message : null
});

// Test helper.
const resetAuthState = () => {
  integrationScope = { token: null, scope: null };
  state.token = null;
  state.expiresAt = null;
  state.loginPromise = null;
  state.lastLoginFailure = null;
};

module.exports = {
  posGet,
  getIntegrationScope,
  warmUp,
  getToken,
  invalidateToken,
  getAuthStatus,
  extractToken,
  extractExpiry,
  resetAuthState,
  PosConfigError,
  PosAuthError,
  PosUnavailableError,
  PosResponseError
};
