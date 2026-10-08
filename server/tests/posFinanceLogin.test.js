// Finance login -> Ravon POS authentication -> POS token used for every POS API.
// Runs against a local mock POS server; MySQL is replaced by a fake pool so no
// database is needed.
//   * a Finance user logs in to BSMS with their POS username / password
//   * the POS token is kept on the server and used for /api/items-list,
//     /api/completed-shifts/collection, /api/credit-payments/collection and
//     /api/employee-deductions
//   * a rejected Finance login is not let in; the password is never stored
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'pos-finance-test-secret';
process.env.POS_SESSION_PERSIST = '0';

// ---- fake MySQL pool (only the users lookup of loginUser) -------------------
const bcrypt = require('bcrypt');
const ACCOUNTANT_HASH = bcrypt.hashSync('bsms-pass', 4);
const USERS = [
  { id: 11, username: 'finance', name: 'Finance', role: 'Finance', status: 1, password: bcrypt.hashSync('old-bsms-pass', 4) },
  { id: 8, username: 'accountant', name: 'Accountant', role: 'Accountant', status: 1, password: ACCOUNTANT_HASH },
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

const json = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

// POS accounts: finance / pos-pass (Finance user), stores / stores-pos (a POS
// account with the same username as a BSMS user) and svc-user / svc-pass (env
// service login). 'accountant' and 'admin' have no POS account.
const POS_ACCOUNTS = { finance: 'pos-pass', stores: 'stores-pos', 'svc-user': 'svc-pass' };
const startMockPos = () => new Promise((resolve) => {
  const stats = { logins: [], tokensSeen: [], valid: new Set() };
  let seq = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.method === 'POST' && req.url === '/api/login') {
        const { username, password } = JSON.parse(body || '{}');
        stats.logins.push(username);
        const ok = Boolean(POS_ACCOUNTS[username]) && POS_ACCOUNTS[username] === password;
        if (!ok) return json(res, 401, { message: 'Invalid credentials' });
        seq += 1;
        const token = `${username}-tok-${seq}`;
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

const withPos = async (env, fn) => {
  const saved = { u: process.env.RAVON_POS_USERNAME, p: process.env.RAVON_POS_PASSWORD, k: process.env.RAVON_POS_API_KEY };
  delete process.env.RAVON_POS_USERNAME; delete process.env.RAVON_POS_PASSWORD; delete process.env.RAVON_POS_API_KEY;
  Object.assign(process.env, env);
  auth.resetAuthState();
  const pos = await startMockPos();
  try { await fn(pos); } finally {
    await pos.close();
    for (const [name, value] of [['RAVON_POS_USERNAME', saved.u], ['RAVON_POS_PASSWORD', saved.p], ['RAVON_POS_API_KEY', saved.k]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
};

test('Finance login is checked against the POS and its token drives every POS API', async () => {
  await withPos({}, async (pos) => {
    const { status, body } = await callLogin({ username: 'finance', password: 'pos-pass' });
    assert.equal(status, 200);
    assert.ok(body.token);
    assert.equal(body.user.role, 'Finance');
    assert.deepEqual(pos.stats.logins, ['finance']);

    // Nothing POS-related reaches the browser.
    const text = JSON.stringify(body);
    assert.doesNotMatch(text, /finance-tok|pos-pass/);

    for (const endpoint of POS_ENDPOINTS) await auth.posGet(endpoint);
    assert.deepEqual(pos.stats.tokensSeen, POS_ENDPOINTS.map((e) => `${e} finance-tok-1`));
    assert.equal(pos.stats.logins.length, 1, 'no further POS logins');

    const status2 = auth.getAuthStatus();
    assert.equal(status2.mode, 'finance-session');
    assert.equal(status2.financeUser, 'finance');
    assert.doesNotMatch(JSON.stringify(status2), /finance-tok/);
  });
});

test('Finance login is refused when the POS rejects the credentials (BSMS password is not accepted)', async () => {
  await withPos({}, async (pos) => {
    const wrong = await callLogin({ username: 'finance', password: 'nope' });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.token, undefined);
    const oldBsmsPassword = await callLogin({ username: 'finance', password: 'old-bsms-pass' });
    assert.equal(oldBsmsPassword.status, 401);
    assert.equal(pos.stats.logins.length, 2);
    await assert.rejects(auth.posGet('/api/items-list'), { name: 'PosConfigError' });
  });
});

test('Finance login fails cleanly when the POS cannot be reached', async () => {
  await withPos({}, async (pos) => {
    await pos.close();
    const { status, body } = await callLogin({ username: 'finance', password: 'pos-pass' });
    assert.equal(status, 503);
    assert.equal(body.token, undefined);
  });
});

test('every login is checked against the POS; users without a POS account fall back to their BSMS password', async () => {
  await withPos({}, async (pos) => {
    const { status, body } = await callLogin({ username: 'accountant', password: 'bsms-pass' });
    assert.equal(status, 200);
    assert.ok(body.token);
    assert.equal(body.user.role, 'Accountant');
    assert.deepEqual(pos.stats.logins, ['accountant']);
    const wrong = await callLogin({ username: 'accountant', password: 'nope' });
    assert.equal(wrong.status, 401);
  });
});

test('a non-Finance user accepted by the POS uses their own POS token for their requests', async () => {
  await withPos({}, async (pos) => {
    const { status, body } = await callLogin({ username: 'stores', password: 'stores-pos' });
    assert.equal(status, 200);
    assert.equal(body.user.role, 'Store Keeper', 'role and permissions come from BSMS, unchanged');
    assert.doesNotMatch(JSON.stringify(body), /stores-tok|stores-pos/);

    await auth.runWithUser(7, async () => {
      for (const endpoint of POS_ENDPOINTS) await auth.posGet(endpoint);
      assert.equal(auth.getAuthStatus().mode, 'user-session');
    });
    assert.deepEqual(pos.stats.tokensSeen, POS_ENDPOINTS.map((e) => `${e} stores-tok-1`));
    // Another user (no POS session of their own, no Finance session) does not borrow it.
    await auth.runWithUser(2, () => assert.rejects(auth.posGet('/api/items-list'), { name: 'PosConfigError' }));
  });
});

test('every logged-in user (Admin, Accountant, Stores, QB...) reaches the POS APIs through the Finance session', async () => {
  await withPos({}, async (pos) => {
    await callLogin({ username: 'finance', password: 'pos-pass' });
    const admin = await callLogin({ username: 'admin', password: 'admin-bsms' });
    assert.equal(admin.status, 200);
    await callLogin({ username: 'stores', password: 'stores-pos' });
    pos.stats.tokensSeen.length = 0;

    for (const userId of [2, 7, 8, 9, 10]) {
      await auth.runWithUser(userId, async () => {
        for (const endpoint of POS_ENDPOINTS) await auth.posGet(endpoint);
      });
    }
    // The all-branch Finance token is preferred, even over a user's own POS token.
    assert.ok(pos.stats.tokensSeen.every((t) => t.endsWith(' finance-tok-1')));
    assert.equal(pos.stats.tokensSeen.length, 5 * POS_ENDPOINTS.length);
  });
});

test('a rejected Finance token falls back to the user\'s own POS session', async () => {
  await withPos({}, async (pos) => {
    await callLogin({ username: 'finance', password: 'pos-pass' });
    await callLogin({ username: 'stores', password: 'stores-pos' });
    pos.stats.valid.delete('finance-tok-1');
    await auth.runWithUser(7, () => auth.posGet('/api/items-list'));
    assert.deepEqual(pos.stats.tokensSeen.slice(-2), ['/api/items-list finance-tok-1', '/api/items-list stores-tok-2']);
  });
});

test('an expired Finance POS token falls back to the service login, or asks for a new Finance login', async () => {
  await withPos({ RAVON_POS_USERNAME: 'svc-user', RAVON_POS_PASSWORD: 'svc-pass' }, async (pos) => {
    await callLogin({ username: 'finance', password: 'pos-pass' });
    pos.stats.valid.clear(); // POS revokes the Finance token
    await auth.posGet('/api/employee-deductions');
    assert.deepEqual(pos.stats.logins, ['finance', 'svc-user']);
    assert.equal(auth.getAuthStatus().mode, 'login');
  });

  await withPos({}, async (pos) => {
    await callLogin({ username: 'finance', password: 'pos-pass' });
    pos.stats.valid.clear();
    await assert.rejects(auth.posGet('/api/items-list'), (e) => e.name === 'PosAuthError' && /log in to Stock Management again/i.test(e.message));
    // A new Finance login restores access.
    await callLogin({ username: 'finance', password: 'pos-pass' });
    assert.deepEqual(await auth.posGet('/api/items-list'), { data: [] });
  });
});

test('the stored POS token is encrypted and the password is never part of it', () => {
  const store = require('../services/posSessionStore');
  const blob = store.encrypt('finance-tok-secret');
  assert.doesNotMatch(blob, /finance-tok-secret/);
  assert.equal(store.decrypt(blob), 'finance-tok-secret');
  const tampered = blob.slice(0, -4) + (blob.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  assert.equal(store.decrypt(tampered), null);
});
