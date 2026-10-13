// Per-user POS / Restaurant authorization (integrationAccess.js + the
// abilities kept by integrationAuthService). Against a mock POS and a mock
// Restaurant whose /api/login and /api/me report each user's abilities; the
// database is a fake pool (no MySQL).
//   * a user sees only the sources their OWN account may read there; nothing
//     when not connected, or when the system does not report abilities
//   * branch-restricted POS accounts only see their branches
//   * a privilege removed in POS / Restaurant takes effect at the next check
//   * /api/me unreachable: last known privileges for a while, then denied
//   * FG item list: only with the user's own items.view
//   * approve / reject / restore refuse records the user may not see
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-access-secret';
process.env.POS_SESSION_PERSIST = '0';

// ---------------------------------------------------------------- fake database
const queries = [];
const hiddenIds = new Set(); // ids the "collections" table says are outside the user's access
const fakeConnection = {
  beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
  query: async (sql, params = []) => {
    queries.push({ sql: sql.replace(/\s+/g, ' '), params });
    if (/NOT COALESCE/.test(sql)) return [params[0].filter((id) => hiddenIds.has(id)).map((id) => ({ id }))];
    return [[]];
  }
};
const fakePool = {
  collectionsSchemaReady: Promise.resolve(),
  getConnection: async () => fakeConnection,
  query: async (sql, params = []) => {
    queries.push({ sql: sql.replace(/\s+/g, ' '), params });
    if (/COUNT\(\*\) AS count/.test(sql)) return [[{ count: 0, unmapped: 0 }]];
    return [[]];
  }
};
const dbPath = require.resolve('../config/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakePool };

// ---------------------------------------------------------------- mock systems
const ALL = ['items.view', 'collection.shifts', 'collection.credit_payments', 'collection.employee_deductions'];
const json = (res, status, payload) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)); };

const startSystem = (prefix) => new Promise((resolve) => {
  const sys = {
    users: {}, // username -> { password, abilities (undefined = not reported), branch_ids }
    tokens: new Map(), meCalls: 0, meDown: false, dataCalls: []
  };
  let seq = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      if (req.method === 'POST' && url.pathname === '/api/login') {
        const { username, password } = JSON.parse(body || '{}');
        const user = sys.users[username];
        if (!user || user.password !== password) return json(res, 401, { message: 'Invalid username or password.' });
        seq += 1;
        const token = `${prefix}-tok-${seq}`;
        sys.tokens.set(token, username);
        return json(res, 200, { token, user: { username, abilities: user.abilities, branch_ids: user.branch_ids ?? null } });
      }
      const username = sys.tokens.get((req.headers.authorization || '').replace(/^Bearer /, ''));
      if (!username) return json(res, 401, { error: true, message: 'Unauthenticated.', status: 401 });
      const user = sys.users[username];
      if (url.pathname === '/api/me') {
        sys.meCalls += 1;
        if (sys.meDown) return json(res, 500, { message: 'Server Error' });
        return json(res, 200, { user: { username, abilities: user.abilities, branch_ids: user.branch_ids ?? null } });
      }
      sys.dataCalls.push(url.pathname);
      if (url.pathname === '/api/items-list') {
        if (!(user.abilities || []).includes('items.view')) return json(res, 403, { message: 'Forbidden' });
        return json(res, 200, { data: [{ id: 5, item_name: 'Fish Bun', price: '180.00', is_active: true }] });
      }
      return json(res, 200, { data: [], meta: { current_page: 1, last_page: 1 } });
    });
  });
  server.listen(0, '127.0.0.1', () => {
    sys.url = `http://127.0.0.1:${server.address().port}`;
    sys.close = () => new Promise((r) => server.close(r));
    resolve(sys);
  });
});

let posSys;
let rstSys;
const auth = require('../services/integrationAuthService');
const access = require('../services/integrationAccess');
const collectionController = require('../controllers/collectionController');
const fgController = require('../controllers/fgProductionController');

test.before(async () => {
  posSys = await startSystem('pos');
  rstSys = await startSystem('rst');
  process.env.RAVON_POS_API_URL = posSys.url;
  process.env.RAVON_RESTAURANT_API_URL = rstSys.url;
});
test.after(async () => { await posSys.close(); await rstSys.close(); });

const USER = 5;
// Each test: fresh sessions; the user logs in to BSMS (credentials forwarded to both).
const login = async ({ pos = ALL, restaurant = ALL, posBranches = null } = {}) => {
  auth.resetAuthState();
  queries.length = 0;
  hiddenIds.clear();
  for (const sys of [posSys, rstSys]) { sys.tokens.clear(); sys.meCalls = 0; sys.meDown = false; sys.dataCalls.length = 0; }
  posSys.users = { kamal: { password: 'pw', abilities: pos, branch_ids: posBranches } };
  rstSys.users = { kamal: { password: 'pw', abilities: restaurant } };
  await auth.loginAll({ userId: USER, role: 'Accountant', username: 'kamal', password: 'pw' });
};

const fakeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};
const req = (extra = {}) => ({ user: { userId: USER, role: 'Accountant' }, query: {}, body: {}, params: {}, ...extra });

test('full privileges in both systems -> every Collection source and the FG item list', async () => {
  await login();
  const a = await access.getAccess(USER);
  assert.equal(a.canCollection, true);
  assert.equal(a.canFgItems, true);
  assert.deepEqual(a.collection.POS.sources, ['SHIFT', 'CREDIT_PAYMENT', 'EMPLOYEE_DEDUCTION']);
  assert.deepEqual(a.collection.RESTAURANT.sources, ['SHIFT', 'CREDIT_PAYMENT', 'EMPLOYEE_DEDUCTION']);
  const summary = JSON.stringify(access.getAccessSummary(a));
  assert.doesNotMatch(summary, /tok-|"pw"/, 'no token / password in what the browser gets');
});

test('partial privileges -> only those sources, in SQL and in the sync', async () => {
  await login({ pos: ['collection.shifts'], restaurant: ['collection.credit_payments'] });
  const a = await access.getAccess(USER);
  assert.equal(a.canFgItems, false);
  assert.deepEqual(access.allowedSources(a), { POS: ['SHIFT'], RESTAURANT: ['CREDIT_PAYMENT'] });
  const where = access.collectionWhere(a);
  assert.equal(where.sql, '((c.source_system = ? AND c.source_type IN (?)) OR (c.source_system = ? AND c.source_type IN (?)))');
  assert.deepEqual(where.params, ['POS', ['SHIFT'], 'RESTAURANT', ['CREDIT_PAYMENT']]);

  // The list query carries the same restriction.
  const res = fakeRes();
  await collectionController.getCompleted(req(), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const list = queries.find((q) => /COUNT\(\*\) AS count/.test(q.sql));
  assert.match(list.sql, /c\.source_system = \? AND c\.source_type IN \(\?\)/);
  assert.ok(list.params.some((p) => Array.isArray(p) && p.includes('SHIFT')));
});

test('no privileges / not connected / abilities not reported -> 403, nothing read', async () => {
  await login({ pos: [], restaurant: [] });
  const res = fakeRes();
  await collectionController.getPending(req({ query: { refresh: '1' } }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'INTEGRATION_ACCESS_DENIED');
  assert.equal(posSys.dataCalls.length + rstSys.dataCalls.length, 0);

  // An older API that does not report abilities: fail closed.
  await login({ pos: null, restaurant: null });
  const a = await access.getAccess(USER);
  assert.equal(a.canCollection, false);
  assert.equal(a.canFgItems, false);

  // Another user (never logged in) gets nothing, even though user 5 is connected.
  await login();
  const other = await access.getAccess(999);
  assert.equal(other.canCollection, false);
  assert.equal(other.systems.pos.state, 'not_connected');
});

test('branch-restricted POS account -> POS rows of its branches only', async () => {
  await login({ posBranches: [6] });
  const a = await access.getAccess(USER);
  assert.deepEqual(a.collection.POS.branchIds, [6]);
  const where = access.collectionWhere(a);
  assert.match(where.sql, /c\.pos_branch_id IN \(\?\)/);
  assert.ok(where.params.some((p) => Array.isArray(p) && p.length === 1 && p[0] === '6'));
  assert.equal(access.getAccessSummary(a).systems.pos.branchRestricted, true);
});

test('a privilege removed in the POS takes effect at the next check (TTL)', async () => {
  await login();
  assert.equal((await access.getAccess(USER)).canFgItems, true);
  assert.equal(posSys.meCalls, 0, 'the login already reported the privileges');

  posSys.users.kamal.abilities = ['collection.shifts'];
  // Let the 5-minute TTL pass.
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 6 * 60 * 1000;
    const a = await access.getAccess(USER);
    assert.equal(posSys.meCalls, 1);
    assert.equal(a.canFgItems, false);
    assert.deepEqual(a.collection.POS.sources, ['SHIFT']);
  } finally {
    Date.now = realNow;
  }
});

test('/api/me unreachable: last known privileges for a while, then denied (fail closed)', async () => {
  await login();
  posSys.meDown = true;
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 6 * 60 * 1000; // stale (> 5 min) but within 30 min
    assert.equal((await access.getAccess(USER)).canFgItems, true);
    Date.now = () => realNow() + 31 * 60 * 1000; // beyond the grace period
    const a = await access.getAccess(USER);
    assert.equal(a.canFgItems, false);
    assert.equal(a.systems.pos.state, 'unverified');
  } finally {
    Date.now = realNow;
  }
});

test('POS session revoked there -> no access here', async () => {
  await login();
  posSys.tokens.clear();
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 6 * 60 * 1000;
    const a = await access.getAccess(USER);
    assert.equal(a.canFgItems, false);
    assert.deepEqual(a.collection.POS.sources, []);
    assert.equal(a.systems.pos.state, 'expired');
  } finally {
    Date.now = realNow;
  }
});

test('FG item list: with items.view 200; without it 403; not connected 409 - never 401', async () => {
  await login();
  let res = fakeRes();
  await fgController.getPosItems(req(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].fg_item_name, 'Fish Bun');

  await login({ pos: ['collection.shifts'] });
  res = fakeRes();
  await fgController.getPosItems(req(), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'POS_FORBIDDEN');
  assert.deepEqual(posSys.dataCalls, [], 'the POS item list is not even requested');

  res = fakeRes();
  await fgController.getPosItems({ ...req(), user: { userId: 999, role: 'Store Keeper' } }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'POS_NOT_CONNECTED');

  // Choosing an FG item needs the same privilege.
  await login({ pos: ['collection.shifts'] });
  res = fakeRes();
  await fgController.createFgProduction(req({
    body: { external_item_id: '5', fg_item_name: 'Fish Bun', department_id: 2, recipe_output_quantity: 10, utility_cost_percentage: 70 }
  }), res);
  assert.equal(res.statusCode, 403);
});

test('approve / reject / restore refuse records outside the user\'s access', async () => {
  await login({ pos: ['collection.shifts'], restaurant: [] });
  hiddenIds.add(42);
  for (const [handler, body] of [
    [collectionController.approve, { items: [{ id: 41 }, { id: 42 }] }],
    [collectionController.reject, { ids: [42], reason: 'x' }],
    [collectionController.restore, { ids: [42] }]
  ]) {
    queries.length = 0;
    const res = fakeRes();
    await handler(req({ body }), res);
    assert.equal(res.statusCode, 403, JSON.stringify(res.body));
    assert.match(res.body.error, /do not have permission/);
    assert.ok(!queries.some((q) => /^ ?(UPDATE|INSERT)/i.test(q.sql)), 'nothing written');
  }
});
