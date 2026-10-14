// BSMS login -> RAVON POS + RAVON Restaurant sessions from the user's OWN typed
// credentials. Runs against two local mock servers; MySQL is replaced by a fake
// pool so no database is needed.
//   * BSMS login is decided by the BSMS password only; POS / Restaurant outcomes
//     never block it or change each other
//   * the typed username / password are tried on both systems in parallel, once,
//     only for roles with a page that reads them (Collection / FG Production:
//     Store Keeper, Accountant, QB, Admin, Super Admin), only after the BSMS
//     password matched; nothing is configured in the environment
//   * each session serves ONLY that user's calls (FG items too) - there is no
//     shared Finance session; without their own session the error is
//     POS_NOT_CONNECTED (no background login)
//   * no token / password reaches the response or the log
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'pos-finance-test-secret';
process.env.POS_SESSION_PERSIST = '0';
for (const name of ['RAVON_POS_USERNAME', 'RAVON_POS_PASSWORD', 'RAVON_POS_API_KEY', 'POS_USERNAME', 'POS_PASSWORD']) delete process.env[name];

// ---- fake MySQL pool (only the users lookup of loginUser) -------------------
const bcrypt = require('bcrypt');
const USERS = [
  { id: 11, username: 'finance', name: 'Finance', role: 'Finance', status: 1, password: bcrypt.hashSync('finance-bsms', 4) },
  { id: 8, username: 'accountant2', name: 'Accountant 2', role: 'Accountant', status: 1, password: bcrypt.hashSync('bsms-pass', 4) },
  { id: 7, username: 'stores', name: 'Stores', role: 'Store Keeper', status: 1, password: bcrypt.hashSync('stores-bsms', 4) },
  { id: 2, username: 'admin', name: 'Admin', role: 'Admin', status: 1, password: bcrypt.hashSync('admin-bsms', 4) }
];
const fakePool = {
  query: async (sql, params) => {
    if (/FROM users WHERE username/i.test(sql)) return [USERS.filter((u) => u.username === params[0])];
    throw new Error(`unexpected query in test: ${sql}`);
  }
};
require.cache[path.resolve(__dirname, '../config/db.js')] = {
  id: 'fake-db', filename: 'fake-db', loaded: true, exports: fakePool
};

const json = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

// One mock RAVON system. `accounts` = { username: password } it accepts.
const startMock = ({ accounts, loginStatus = null, prefix }) => new Promise((resolve) => {
  const stats = { logins: [], tokensSeen: [], valid: new Set() };
  let seq = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.method === 'POST' && req.url === '/api/login') {
        const { username, password } = JSON.parse(body || '{}');
        stats.logins.push(username);
        if (loginStatus) return json(res, loginStatus, { message: 'Service Unavailable' });
        if (accounts[username] !== password) return json(res, 401, { message: 'These credentials do not match our records.' });
        seq += 1;
        const token = `${prefix}-tok-${seq}`;
        stats.valid.add(token);
        return json(res, 200, { status: true, data: { token, user: { username } } });
      }
      const auth = (req.headers.authorization || '').replace(/^Bearer /, '');
      stats.tokensSeen.push(`${req.url.split('?')[0]} ${auth}`);
      if (!stats.valid.has(auth)) return json(res, 401, { error: true, message: 'Unauthenticated.', status: 401 });
      if (req.url === '/api/me') return json(res, 200, { user: { id: 1, name: 'finance', branch_ids: [] } });
      return json(res, 200, { data: [] });
    });
  });
  server.listen(0, '127.0.0.1', () => resolve({
    server, stats, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r))
  }));
});

const auth = require('../services/integrationAuthService');
const pos = require('../services/posAuthService');
const { loginUser } = require('../controllers/authController');

const callLogin = (body) => new Promise((resolve) => {
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { resolve({ status: this.statusCode, body: payload }); return this; }
  };
  loginUser({ body }, res);
});

// Captures everything logged while fn runs.
const captureLogs = async (fn) => {
  const lines = [];
  const originals = {};
  for (const level of ['log', 'warn', 'error', 'info']) {
    originals[level] = console[level];
    console[level] = (...a) => { lines.push(a.map((x) => (x instanceof Error ? `${x.message} ${x.stack}` : String(x))).join(' ')); };
  }
  try { await fn(); } finally { Object.assign(console, originals); }
  return lines.join('\n');
};

const ACCOUNTS = { finance: 'finance-bsms', accountant2: 'bsms-pass', stores: 'stores-bsms', admin: 'admin-bsms' };

const withSystems = async (options, fn) => {
  auth.resetAuthState();
  const posMock = await startMock({ prefix: 'pos', accounts: ACCOUNTS, ...(options.pos || {}) });
  const restMock = await startMock({ prefix: 'rst', accounts: ACCOUNTS, ...(options.restaurant || {}) });
  process.env.RAVON_POS_API_URL = posMock.url;
  process.env.RAVON_RESTAURANT_API_URL = restMock.url;
  try {
    await fn(posMock, restMock);
  } finally {
    await posMock.close();
    await restMock.close();
    delete process.env.RAVON_RESTAURANT_API_URL;
  }
};

const ADMIN = 2;
const ACCOUNTANT = 8;
const STORES = 7;
const FINANCE = 11;

test('BSMS login: the typed credentials are tried on POS and Restaurant (once each) as that user\'s own session', async () => {
  await withSystems({}, async (posMock, restMock) => {
    const logs = await captureLogs(async () => {
      for (const [username, password, role] of [
        ['finance', 'finance-bsms', 'Finance'], ['accountant2', 'bsms-pass', 'Accountant'],
        ['stores', 'stores-bsms', 'Store Keeper'], ['admin', 'admin-bsms', 'Admin']
      ]) {
        const { status, body } = await callLogin({ username, password });
        assert.equal(status, 200, username);
        assert.equal(body.user.role, role);
        assert.doesNotMatch(JSON.stringify(body), /pos-tok|rst-tok|finance-bsms/, 'nothing POS-related reaches the browser');
        await auth.whenIdle();
      }
      assert.equal((await callLogin({ username: 'finance', password: 'wrong' })).status, 401);
    });
    // Every role with a page reading POS / Restaurant (Finance has Collection) is forwarded once;
    // a wrong BSMS password is never forwarded.
    assert.deepEqual(posMock.stats.logins, ['finance', 'accountant2', 'stores', 'admin']);
    assert.deepEqual(restMock.stats.logins, ['finance', 'accountant2', 'stores', 'admin']);
    for (const userId of [FINANCE, ACCOUNTANT, STORES, ADMIN]) {
      assert.equal(auth.getAuthStatus('pos', { userId }).connected, true, String(userId));
      assert.equal(auth.getAuthStatus('restaurant', { userId }).source, 'own');
    }
    assert.equal(auth.getAuthStatus('pos').connected, false, 'no user -> no session');
    assert.doesNotMatch(logs, /finance-bsms|bsms-pass|admin-bsms|stores-bsms|pos-tok|rst-tok/, 'no password / token in the log');
  });
});

test('Restaurant refuses the login -> BSMS login and the POS session are unaffected', async () => {
  await withSystems({ restaurant: { accounts: { admin: 'other-restaurant-pass' } } }, async (posMock, restMock) => {
    const { status } = await callLogin({ username: 'admin', password: 'admin-bsms' });
    assert.equal(status, 200);
    await auth.whenIdle();
    assert.equal(auth.getAuthStatus('pos', { userId: ADMIN }).connected, true);
    const rest = auth.getAuthStatus('restaurant', { userId: ADMIN });
    assert.equal(rest.connected, false);
    assert.equal(rest.code, 'RESTAURANT_CREDENTIALS_INVALID');
    assert.doesNotMatch(JSON.stringify(rest), /admin-bsms/);
    assert.deepEqual(await pos.posGet('/api/completed-shifts/collection', null, { userId: ADMIN }), { data: [] });
    assert.equal(restMock.stats.logins.length, 1);
  });
});

test('Restaurant unreachable / 503 -> BSMS login still succeeds at once, POS still connected', async () => {
  await withSystems({ restaurant: { loginStatus: 503 } }, async () => {
    const { status } = await callLogin({ username: 'admin', password: 'admin-bsms' });
    assert.equal(status, 200);
    await auth.whenIdle();
    assert.equal(auth.getAuthStatus('pos', { userId: ADMIN }).connected, true);
    assert.equal(auth.getAuthStatus('restaurant', { userId: ADMIN }).code, 'RESTAURANT_AUTH_UNAVAILABLE');
  });
  await withSystems({}, async (posMock, restMock) => {
    await restMock.close(); // nothing listening
    const { status } = await callLogin({ username: 'admin', password: 'admin-bsms' });
    assert.equal(status, 200);
    await auth.whenIdle();
    assert.equal(auth.getAuthStatus('pos', { userId: ADMIN }).connected, true);
    assert.equal(auth.getAuthStatus('restaurant', { userId: ADMIN }).connected, false);
  });
});

test('POS refuses but Restaurant accepts -> the Restaurant session is kept, the POS result is independent', async () => {
  await withSystems({ pos: { accounts: { admin: 'other-pos-pass' } } }, async () => {
    await callLogin({ username: 'admin', password: 'admin-bsms' });
    await auth.whenIdle();
    assert.equal(auth.getAuthStatus('pos', { userId: ADMIN }).code, 'POS_CREDENTIALS_INVALID');
    assert.equal(auth.getAuthStatus('restaurant', { userId: ADMIN }).connected, true);
  });
});

test('FG items and every POS API use the user\'s OWN session; another user\'s login never helps', async () => {
  await withSystems({}, async (posMock) => {
    const { RavonPosAuthError, fetchRavonPosItems } = require('../services/ravonPosService');
    await assert.rejects(fetchRavonPosItems({ userId: ADMIN }), (e) => e instanceof RavonPosAuthError && e.code === 'POS_NOT_CONNECTED');
    assert.deepEqual(posMock.stats.logins, []);

    await callLogin({ username: 'admin', password: 'admin-bsms' });
    await auth.whenIdle();
    for (const endpoint of ['/api/items-list', '/api/completed-shifts/collection', '/api/credit-payments/collection', '/api/employee-deductions']) {
      await pos.posGet(endpoint, null, { userId: ADMIN });
    }
    assert.deepEqual(posMock.stats.logins, ['admin']);
    assert.ok(posMock.stats.tokensSeen.filter((t) => !t.startsWith('/api/me')).every((t) => t.endsWith(' pos-tok-1')));

    // The Admin's session is NOT used for anyone else (or for a call without a user).
    const seen = posMock.stats.tokensSeen.length;
    await assert.rejects(fetchRavonPosItems({ userId: ACCOUNTANT }), (e) => e instanceof RavonPosAuthError && e.code === 'POS_NOT_CONNECTED');
    await assert.rejects(pos.posGet('/api/items-list'), (e) => e.code === 'POS_NOT_CONNECTED');
    assert.equal(posMock.stats.tokensSeen.length, seen, 'nothing was sent');
  });
});

test('Restaurant not configured -> skipped without any request; POS unaffected', async () => {
  await withSystems({}, async (posMock, restMock) => {
    delete process.env.RAVON_RESTAURANT_API_URL;
    const results = await auth.loginAll({ userId: ADMIN, role: 'Admin', username: 'admin', password: 'admin-bsms' });
    assert.equal(results.restaurant.skipped, true);
    assert.equal(results.restaurant.code, 'RESTAURANT_NOT_CONFIGURED');
    await auth.whenIdle();
    assert.deepEqual(restMock.stats.logins, []);
    assert.equal(auth.getAuthStatus('restaurant', { userId: ADMIN }).state, 'not_configured');
    assert.equal(auth.getAuthStatus('pos', { userId: ADMIN }).connected, true);
  });
});
