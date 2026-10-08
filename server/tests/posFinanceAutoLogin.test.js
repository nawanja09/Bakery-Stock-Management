// Automatic RAVON POS Finance session -> every POS API, for every BSMS user.
// Runs against a local mock POS server; MySQL is replaced by a fake pool so no
// database is needed.
//   * BSMS login is unchanged (BSMS username / password); nobody needs POS credentials
//   * the backend logs in by itself with RAVON_POS_USERNAME / RAVON_POS_PASSWORD
//     (at start-up / after a BSMS login) and uses that ONE session for
//     /api/items-list, /api/completed-shifts/collection,
//     /api/credit-payments/collection and /api/employee-deductions
//   * an expired / revoked session is renewed automatically
//   * a failed automatic login says whether the credentials are invalid or the
//     POS login is unavailable
//   * the token and the password never reach the browser
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'pos-finance-test-secret';

// ---- fake MySQL pool (only the users lookup of loginUser) -------------------
const bcrypt = require('bcrypt');
const USERS = [
  { id: 11, username: 'finance', name: 'Finance', role: 'Finance', status: 1, password: bcrypt.hashSync('finance-bsms', 4) },
  { id: 8, username: 'accountant', name: 'Accountant', role: 'Accountant', status: 1, password: bcrypt.hashSync('bsms-pass', 4) },
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

const POS_ENDPOINTS = ['/api/items-list', '/api/completed-shifts/collection', '/api/credit-payments/collection', '/api/employee-deductions'];
const FINANCE_ENV = { RAVON_POS_USERNAME: 'pos-finance', RAVON_POS_PASSWORD: 'pos-pass' };

const json = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

// The only POS account is the Finance one; no BSMS user has a POS account.
const startMockPos = ({ loginStatus = null } = {}) => new Promise((resolve) => {
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
        if (!(username === 'pos-finance' && password === 'pos-pass')) return json(res, 401, { message: 'Invalid credentials' });
        seq += 1;
        const token = `pos-finance-tok-${seq}`;
        stats.valid.add(token);
        return json(res, 200, { status: true, data: { token } });
      }
      const auth = (req.headers.authorization || '').replace(/^Bearer /, '');
      stats.tokensSeen.push(`${req.url.split('?')[0]} ${auth}`);
      if (!stats.valid.has(auth)) return json(res, 401, { error: true, message: 'Unauthenticated.', status: 401 });
      return json(res, 200, { data: [] });
    });
  });
  server.listen(0, '127.0.0.1', () => {
    process.env.RAVON_POS_API_URL = `http://127.0.0.1:${server.address().port}`;
    resolve({ server, stats, close: () => new Promise((r) => server.close(r)) });
  });
});

const auth = require('../services/posAuthService');
const { loginUser } = require('../controllers/authController');

const callLogin = (body) => new Promise((resolve) => {
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { resolve({ status: this.statusCode, body: payload }); return this; }
  };
  loginUser({ body }, res);
});

const withPos = async (env, fn, posOptions) => {
  const saved = { u: process.env.RAVON_POS_USERNAME, p: process.env.RAVON_POS_PASSWORD, k: process.env.RAVON_POS_API_KEY };
  delete process.env.RAVON_POS_USERNAME; delete process.env.RAVON_POS_PASSWORD; delete process.env.RAVON_POS_API_KEY;
  Object.assign(process.env, env);
  auth.resetAuthState();
  const pos = await startMockPos(posOptions);
  try { await fn(pos); } finally {
    await pos.close();
    for (const [name, value] of [['RAVON_POS_USERNAME', saved.u], ['RAVON_POS_PASSWORD', saved.p], ['RAVON_POS_API_KEY', saved.k]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
};

// warmUp runs after the login response; wait for its single-flight login.
const settle = () => auth.getToken().catch(() => null);

test('BSMS login is unchanged and only triggers the automatic POS Finance login', async () => {
  await withPos(FINANCE_ENV, async (pos) => {
    for (const [username, password, role] of [
      ['finance', 'finance-bsms', 'Finance'], ['accountant', 'bsms-pass', 'Accountant'],
      ['stores', 'stores-bsms', 'Store Keeper'], ['admin', 'admin-bsms', 'Admin']
    ]) {
      const { status, body } = await callLogin({ username, password });
      assert.equal(status, 200, username);
      assert.equal(body.user.role, role);
      assert.doesNotMatch(JSON.stringify(body), /pos-finance|pos-pass/, 'nothing POS-related reaches the browser');
      await settle();
    }
    assert.equal((await callLogin({ username: 'admin', password: 'pos-pass' })).status, 401, 'the POS password is not a BSMS password');
    assert.deepEqual(pos.stats.logins, ['pos-finance'], 'one automatic POS login, shared by every user');
  });
});

test('start-up warm-up logs in, then every POS API uses that one Finance session', async () => {
  await withPos(FINANCE_ENV, async (pos) => {
    assert.equal(await auth.warmUp(), true);
    for (let i = 0; i < 3; i += 1) {
      for (const endpoint of POS_ENDPOINTS) await auth.posGet(endpoint);
    }
    assert.deepEqual(pos.stats.logins, ['pos-finance']);
    assert.equal(pos.stats.tokensSeen.length, 3 * POS_ENDPOINTS.length);
    assert.ok(pos.stats.tokensSeen.every((t) => t.endsWith(' pos-finance-tok-1')));
    const status = auth.getAuthStatus();
    assert.deepEqual(status, { configured: true, authenticated: true, code: null, message: null });
  });
});

test('no warm-up needed: the first POS call logs in automatically', async () => {
  await withPos(FINANCE_ENV, async (pos) => {
    assert.deepEqual(await auth.posGet('/api/items-list'), { data: [] });
    assert.deepEqual(pos.stats.logins, ['pos-finance']);
  });
});

test('an expired / revoked POS session is renewed automatically - no manual reconnect', async () => {
  await withPos(FINANCE_ENV, async (pos) => {
    await auth.posGet('/api/items-list');
    pos.stats.valid.clear(); // the POS expires the token
    assert.deepEqual(await auth.posGet('/api/employee-deductions'), { data: [] });
    assert.deepEqual(pos.stats.logins, ['pos-finance', 'pos-finance']);
    assert.deepEqual(pos.stats.tokensSeen.slice(-2), [
      '/api/employee-deductions pos-finance-tok-1', '/api/employee-deductions pos-finance-tok-2'
    ]);
  });
});

test('invalid configured credentials -> clear POS_CREDENTIALS_INVALID error (FG items too), no retry storm', async () => {
  await withPos({ RAVON_POS_USERNAME: 'pos-finance', RAVON_POS_PASSWORD: 'wrong' }, async (pos) => {
    await assert.rejects(auth.posGet('/api/items-list'),
      (e) => e.code === auth.POS_CREDENTIALS_INVALID && /credentials are invalid/.test(e.message));
    const { RavonPosAuthError, fetchRavonPosItems } = require('../services/ravonPosService');
    await assert.rejects(fetchRavonPosItems(), (e) => e instanceof RavonPosAuthError && e.code === 'POS_CREDENTIALS_INVALID');
    assert.equal(pos.stats.logins.length, 1, 'cool-down: the POS login is not hammered');
    const status = auth.getAuthStatus();
    assert.equal(status.authenticated, false);
    assert.equal(status.code, 'POS_CREDENTIALS_INVALID');
    assert.doesNotMatch(JSON.stringify(status), /wrong|pos-finance/);
  });
});

test('POS login service unavailable -> clear POS_AUTH_UNAVAILABLE error', async () => {
  await withPos(FINANCE_ENV, async () => {
    await assert.rejects(auth.posGet('/api/items-list'),
      (e) => e.code === auth.POS_AUTH_UNAVAILABLE && /authentication service is unavailable/.test(e.message));
    assert.equal(auth.getAuthStatus().code, 'POS_AUTH_UNAVAILABLE');
  }, { loginStatus: 503 });

  await withPos(FINANCE_ENV, async (pos) => {
    await pos.close(); // nothing listening
    await assert.rejects(auth.posGet('/api/items-list'), { code: 'POS_AUTH_UNAVAILABLE' });
  });
});

test('credentials not configured -> POS_NOT_CONFIGURED, POS not called', async () => {
  await withPos({}, async (pos) => {
    await assert.rejects(auth.posGet('/api/items-list'), { name: 'PosConfigError', code: 'POS_NOT_CONFIGURED' });
    assert.equal(await auth.warmUp(), false);
    assert.equal(auth.getAuthStatus().configured, false);
    assert.deepEqual(pos.stats.logins, []);
  });
});
