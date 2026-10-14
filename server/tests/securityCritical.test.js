// Regression tests for the critical security fixes (docs/security-financial-audit-2026-10-12.md):
//   C1 - secrets: HS256 pinned, start-up refuses weak / shared secrets, POS session
//        key never falls back to JWT_SECRET
//   C2 - RBAC cannot be bypassed by changing the case of (or encoding) the URL
//   C3 - multi-statement writes run in a real transaction on one connection
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const { evaluateApiAccess, toApiPath } = require('../config/rolePermissions');
const secrets = require('../config/secrets');

const withEnv = (vars, fn) => {
  const previous = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  try { return fn(); } finally {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
};

// ---------------------------------------------------------------- C2
test('C2: changing URL case never reaches a stricter rule\'s endpoint', () => {
  const cases = [
    ['Store Keeper', 'PUT', '/api/purchases/PAYMENTS/5/adjust'],
    ['Store Keeper', 'PUT', '/api/Purchases/Payments/5/adjust'],
    ['Store Keeper', 'GET', '/api/purchases/PAYMENT-ADJUSTMENTS'],
    ['Store Keeper', 'GET', '/api/reports/Expenses-Report'],
    ['Store Keeper', 'GET', '/api/reports/EXPENSE-SUMMARY/details'],
    ['Store Keeper', 'GET', '/api/purchase-returns/REPORTS/x'],
    ['Store Keeper', 'POST', '/api/FINANCE/Bank/Accounts'], // read-only grant must not become write
    ['Finance', 'GET', '/api/DASHBOARD'],
    ['Finance', 'GET', '/api/Analyst/balance-sheet']
  ];
  for (const [role, method, url] of cases) {
    assert.equal(evaluateApiAccess(role, method, url).allowed, false, `${role} ${method} ${url}`);
  }
});

test('C2: legitimate access is unchanged by the normalisation', () => {
  assert.equal(evaluateApiAccess('Store Keeper', 'GET', '/api/purchases/12').allowed, true);
  assert.equal(evaluateApiAccess('Store Keeper', 'GET', '/api/Items').allowed, true);
  assert.equal(evaluateApiAccess('Admin', 'PUT', '/api/purchases/PAYMENTS/5/adjust').allowed, true);
  assert.equal(evaluateApiAccess('Accountant', 'GET', '/api/reports/Expenses-Report').allowed, true);
});

test('C2: encoded path separators are rejected', () => {
  assert.equal(toApiPath('/api/purchases%2Fpayments/5/adjust'), '/__rejected__');
  assert.equal(toApiPath('/api/purchases%5cpayments'), '/__rejected__');
  assert.equal(evaluateApiAccess('Admin', 'GET', '/api/purchases%2F12').allowed, false);
});

test('C2: end-to-end - Store Keeper cannot hit the payment-adjustment route via upper case', async () => {
  const authorizeApi = require('../middleware/authorizeApi');
  const app = express();
  app.use((req, res, next) => { req.user = { userId: 9, role: req.get('x-test-role') }; next(); });
  app.use('/api', authorizeApi);
  const router = express.Router(); // default, case-insensitive - like routes/paymentRoutes.js
  router.put('/payments/:id/adjust', (req, res) => res.status(200).json({ reached: true }));
  app.use('/api/purchases', router);

  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  try {
    const call = async (role, path) => {
      const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: 'PUT', headers: { 'x-test-role': role } });
      return r.status;
    };
    assert.equal(await call('Store Keeper', '/api/purchases/payments/5/adjust'), 403);
    assert.equal(await call('Store Keeper', '/api/purchases/PAYMENTS/5/adjust'), 403);
    assert.equal(await call('Store Keeper', '/api/PURCHASES/Payments/5/adjust'), 403);
    assert.equal(await call('Admin', '/api/purchases/PAYMENTS/5/adjust'), 200);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

// ---------------------------------------------------------------- C3
const fakeDb = () => {
  const log = [];
  const connection = {
    beginTransaction: async () => log.push('begin'),
    query: async (sql) => { log.push(sql); return [{ insertId: 1, affectedRows: 1 }]; },
    commit: async () => log.push('commit'),
    rollback: async () => log.push('rollback'),
    release: () => log.push('release')
  };
  return { log, db: { getConnection: async () => connection } };
};

test('C3: withTransaction runs everything on one connection and commits', async () => {
  const withTransaction = require('../utils/withTransaction');
  const { log, db } = fakeDb();
  const result = await withTransaction(async (conn) => {
    await conn.query('INSERT header');
    await conn.query('INSERT line');
    return 42;
  }, { db });
  assert.equal(result, 42);
  assert.deepEqual(log, ['begin', 'INSERT header', 'INSERT line', 'commit', 'release']);
});

test('C3: withTransaction rolls back and releases on error', async () => {
  const withTransaction = require('../utils/withTransaction');
  const { log, db } = fakeDb();
  await assert.rejects(withTransaction(async (conn) => {
    await conn.query('INSERT header');
    throw new Error('line failed');
  }, { db }), /line failed/);
  assert.deepEqual(log, ['begin', 'INSERT header', 'rollback', 'release']);
});

test('C3: no code issues transaction control statements through the pool', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '..');
  const offenders = [];
  const pattern = /\b(pool|db)\s*\.\s*(query|execute)\(\s*['"`]\s*(START\s+TRANSACTION|BEGIN|COMMIT|ROLLBACK)\b/i;
  for (const dir of ['controllers', 'services', 'routes', 'utils', 'middleware']) {
    for (const file of fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.js'))) {
      const lines = fs.readFileSync(path.join(root, dir, file), 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!line.trim().startsWith('//') && pattern.test(line)) offenders.push(`${dir}/${file}:${i + 1}`);
      });
    }
  }
  assert.deepEqual(offenders, [], 'use utils/withTransaction.js instead');
});

// ---------------------------------------------------------------- C1
const STRONG_A = 'a'.repeat(48);
const STRONG_B = 'b'.repeat(48);

test('C1: start-up refuses missing, short or shared secrets', () => {
  const boot = (vars) => withEnv(vars, () => secrets.assertProductionSecrets());
  assert.throws(() => boot({ JWT_SECRET: undefined, POS_SESSION_SECRET: STRONG_B }), /JWT_SECRET is not set/);
  assert.throws(() => boot({ JWT_SECRET: 'fifteen-chars!!', POS_SESSION_SECRET: STRONG_B }), /JWT_SECRET must be at least 32 bytes/);
  assert.throws(() => boot({ JWT_SECRET: STRONG_A, POS_SESSION_SECRET: undefined }), /POS_SESSION_SECRET is not set/);
  assert.throws(() => boot({ JWT_SECRET: STRONG_A, POS_SESSION_SECRET: STRONG_A }), /must be different/);
  assert.doesNotThrow(() => boot({ JWT_SECRET: STRONG_A, POS_SESSION_SECRET: STRONG_B }));
});

test('C1: authenticate only accepts HS256 tokens signed with JWT_SECRET', async () => {
  // The user lookup is injected (no database); see securityHigh.test.js for the N3 checks.
  const { createAuthenticate } = require('../middleware/authenticate');
  const authenticate = createAuthenticate({
    loadUser: async (id) => (Number(id) === 1 ? { id: 1, username: 'admin', role: 'Admin', token_version: 0 } : null)
  });
  const run = async (token) => {
    let status = null; let user = null;
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { status(code) { status = code; return { json() {} }; } };
    await authenticate(req, res, () => { user = req.user; });
    return { status, user };
  };
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = STRONG_A;
  try {
    const good = jwt.sign({ userId: 1, role: 'Admin', tv: 0 }, STRONG_A, secrets.JWT_SIGN_OPTIONS);
    assert.equal((await run(good)).user.role, 'Admin');

    const otherSecret = jwt.sign({ userId: 1, role: 'Super Admin', tv: 0 }, 'fifteen-chars!!');
    assert.equal((await run(otherSecret)).status, 401);

    const hs512 = jwt.sign({ userId: 1, role: 'Super Admin', tv: 0 }, STRONG_A, { algorithm: 'HS512' });
    assert.equal((await run(hs512)).status, 401, 'non-HS256 algorithms are refused');

    const unsigned = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.`
      + `${Buffer.from('{"userId":1,"role":"Super Admin","tv":0}').toString('base64url')}.`;
    assert.equal((await run(unsigned)).status, 401, 'alg=none is refused');
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous;
  }
});

test('C1: POS session key never falls back to JWT_SECRET', () => {
  withEnv({ JWT_SECRET: STRONG_A, POS_SESSION_SECRET: undefined }, () => {
    assert.equal(secrets.getPosSessionSecret(), null);
  });
  withEnv({ JWT_SECRET: STRONG_A, POS_SESSION_SECRET: STRONG_B }, () => {
    assert.equal(secrets.getPosSessionSecret(), STRONG_B);
  });
});
