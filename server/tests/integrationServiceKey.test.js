// Server-key mode (RAVON_POS_INTEGRATION_PRIVATE_KEY /
// RAVON_RESTAURANT_INTEGRATION_PRIVATE_KEY): the Collection page and the FG
// item list read POS / Restaurant WITHOUT any user login. Against two mock
// systems that check every /api/integration/* request like their
// VerifyBsmsSignature middleware (public key, time window, one-time nonce)
// and a stateful fake `collections` table (no MySQL).
//   * every call goes to /api/integration/..., SIGNED - the private key is
//     never sent, every request has a new nonce / signature; never
//     /api/login, never an Authorization header
//   * a BSMS login sends no password to a system read with the key
//   * status / access: connected, all abilities, every branch
//   * a wrong key: clear error, the other system still imports, key never shown
//   * a system without a (valid) key keeps the per-user login
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-service-key-secret';
process.env.POS_SESSION_PERSIST = '0';

// ---------------------------------------------------------------- fake database
const DEPARTMENTS = [{ id: 7, name: 'Cafe' }, { id: 14, name: 'MAS Intimo' }, { id: 12, name: 'MAS Kreeda' }, { id: 4, name: 'Restaurant' }];
const db = { rows: [], nextId: 1 };
const fakePool = {
  collectionsSchemaReady: Promise.resolve(),
  collectionsSourceSystemOk: () => true,
  query: async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('SELECT id, name FROM departments')) return [DEPARTMENTS];
    if (s.startsWith('SELECT id, status, raw_payload')) {
      const [type, id, system] = params;
      return [db.rows.filter((r) => r.source_type === type && r.source_id === id && r.source_system === system)];
    }
    if (s.startsWith('INSERT INTO collections')) {
      const columns = s.slice(s.indexOf('(') + 1, s.indexOf(')')).split(',').map((c) => c.trim());
      const row = { id: db.nextId, status: 'pending' };
      columns.forEach((c, i) => { if (i < params.length) row[c] = params[i]; });
      db.nextId += 1;
      db.rows.push(row);
      return [{ affectedRows: 1, insertId: row.id }];
    }
    if (s.startsWith('UPDATE')) return [{ affectedRows: 0 }];
    if (s.includes('COUNT(*) AS count')) return [[{ count: 0, unmapped: 0 }]];
    return [[]];
  }
};
const dbPath = require.resolve('../config/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakePool };

// ---------------------------------------------------------------- mock systems
const newPair = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { publicKey, privateB64: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64') };
};
const POS_PAIR = newPair();
const RST_PAIR = newPair();
const OTHER_PAIR = newPair();
const POS_KEY = POS_PAIR.privateB64;
const RST_KEY = RST_PAIR.privateB64;
const json = (res, status, payload) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)); };
const shift = (id, branch) => ({
  shift_id: id, shift_no: String(id), branch, cashier: { id: 1, name: 'Cashier' },
  opened_at: '2026-10-01T03:00:00Z', closed_at: '2026-10-01T03:00:00Z', completed_at: '2026-10-01T03:00:00Z',
  cash: { declared: 100, actual: 100, counted: 100 }, card: { total: 0, count: 0, transactions: [] },
  online: { total: 0, count: 0, transactions: [] }, credit: { total: 0 },
  short_excess: { by_method: {}, total: 0, status: 'matched' }, collection: 100
});

// Same checks as VerifyBsmsSignature: signature over the path + query as sent,
// +-300 s, each nonce once.
const verifySignature = (sys, req, url) => {
  const ts = String(req.headers['x-bsms-timestamp'] || '');
  const nonce = String(req.headers['x-bsms-nonce'] || '');
  const sig = String(req.headers['x-bsms-signature'] || '');
  if (!/^\d+$/.test(ts) || !/^[A-Za-z0-9_-]{16,64}$/.test(nonce) || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?') + 1) : '';
  const payload = ['BSMS-SIG-1', req.method, url.pathname, query, ts, nonce].join('\n');
  if (!crypto.verify('sha256', Buffer.from(payload), sys.publicKey, Buffer.from(sig, 'base64'))) return false;
  if (sys.nonces.has(nonce)) return false;
  sys.nonces.add(nonce);
  return true;
};

const startSystem = ({ publicKey, branches }) => new Promise((resolve) => {
  const sys = { publicKey, nonces: new Set(), calls: [], logins: 0, bearer: 0, failNext: 0, noBranch: false, close: null, url: null };
  const branchOf = (i) => (sys.noBranch ? undefined : branches[i]);
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      sys.calls.push({ path: url.pathname, headers: { ...req.headers } });
      if (req.headers.authorization) sys.bearer += 1;
      if (url.pathname === '/api/login') { sys.logins += 1; return json(res, 401, { message: 'no logins expected' }); }
      if (!url.pathname.startsWith('/api/integration/') || !verifySignature(sys, req, url)) {
        return json(res, 401, { error: true, message: 'Unauthenticated.', status: 401 });
      }
      if (sys.failNext > 0) { sys.failNext -= 1; return json(res, 503, { message: 'Service Unavailable' }); }
      const path = url.pathname.slice('/api/integration'.length);
      if (path === '/items-list') return json(res, 200, { data: [{ id: 5, item_name: 'Fish Bun', price: '180.00', is_active: true }] });
      if (path === '/completed-shifts/collection') {
        const page = Number(url.searchParams.get('page') || 1);
        // Page 2 is reached through next_page_url, which already has /api/integration
        const next = page === 1 ? `${sys.url}/api/integration/completed-shifts/collection?page=2` : null;
        return json(res, 200, { data: [shift(300 + page, branchOf(page - 1))], next_page_url: next, meta: { current_page: page, last_page: 2 } });
      }
      if (path === '/credit-payments/collection') {
        return json(res, 200, { data: [{ id: 41, reference_no: 'CP-41', payment_date: '2026-10-03', payment_type: 'Cash', amount: '1500.00', branch: branchOf(0) }] });
      }
      if (path === '/employee-deductions') return json(res, 200, { data: [] });
      return json(res, 404, { message: 'Not found' });
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
const integrationAccess = require('../services/integrationAccess');
const controller = require('../controllers/collectionController');
const { fetchRavonPosItems } = require('../services/ravonPosService');

test.before(async () => {
  posSys = await startSystem({ publicKey: POS_PAIR.publicKey, branches: [{ id: 6, name: 'Cafe - M' }, { id: 2, name: 'MASKreeda' }] });
  rstSys = await startSystem({ publicKey: RST_PAIR.publicKey, branches: [{ id: null, name: 'Restaurant' }, { id: null, name: 'Restaurant' }] });
});
test.after(async () => { await posSys.close(); await rstSys.close(); });

const reset = ({ posKey = POS_KEY, rstKey = RST_KEY } = {}) => {
  db.rows.length = 0;
  db.nextId = 1;
  for (const sys of [posSys, rstSys]) { sys.calls.length = 0; sys.logins = 0; sys.bearer = 0; sys.failNext = 0; sys.noBranch = false; }
  auth.resetAuthState();
  process.env.RAVON_POS_API_URL = posSys.url;
  process.env.RAVON_RESTAURANT_API_URL = rstSys.url;
  if (posKey === null) delete process.env.RAVON_POS_INTEGRATION_PRIVATE_KEY; else process.env.RAVON_POS_INTEGRATION_PRIVATE_KEY = posKey;
  if (rstKey === null) delete process.env.RAVON_RESTAURANT_INTEGRATION_PRIVATE_KEY; else process.env.RAVON_RESTAURANT_INTEGRATION_PRIVATE_KEY = rstKey;
};
test.afterEach(() => {
  delete process.env.RAVON_POS_INTEGRATION_PRIVATE_KEY;
  delete process.env.RAVON_RESTAURANT_INTEGRATION_PRIVATE_KEY;
});

const fakeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};
// User 9 never logged in to POS / Restaurant (and has no session anywhere).
const fakeReq = (role, query = {}) => ({ user: { userId: 9, role, department_id: 7 }, query, body: {}, params: {} });
const pull = async (role = 'Accountant') => {
  const res = fakeRes();
  await controller.getPending(fakeReq(role, { refresh: '1', from_date: '2026-10-01', to_date: '2026-10-30' }), res);
  return res;
};
const bySystem = (body, system) => body.sync.systems.find((s) => s.system === system);

// ================================================================ tests
test('Collection imports both systems with the server key, without any user login', async () => {
  reset();
  const res = await pull();
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.sync.ok, true, JSON.stringify(res.body.sync));

  const pos = bySystem(res.body, 'POS');
  const rst = bySystem(res.body, 'RESTAURANT');
  assert.equal(pos.error, undefined);
  assert.equal(rst.error, undefined);
  assert.equal(pos.fetched, 2 + 1); // 2 shifts (2 pages) + 1 credit payment
  assert.equal(rst.fetched, 2 + 1);
  assert.equal(db.rows.filter((r) => r.source_system === 'POS').length, 3);
  assert.equal(db.rows.filter((r) => r.source_system === 'RESTAURANT').length, 3);

  for (const [sys, key] of [[posSys, POS_KEY], [rstSys, RST_KEY]]) {
    assert.equal(sys.logins, 0, 'no /api/login');
    assert.equal(sys.bearer, 0, 'no Authorization header');
    assert.ok(sys.calls.length > 0);
    for (const call of sys.calls) {
      assert.ok(call.path.startsWith('/api/integration/'), call.path);
      assert.ok(!JSON.stringify(call.headers).includes(key), 'the private key is never sent');
    }
    // A new nonce and signature for every request
    const nonces = sys.calls.map((c) => c.headers['x-bsms-nonce']);
    assert.equal(new Set(nonces).size, nonces.length);
    assert.equal(new Set(sys.calls.map((c) => c.headers['x-bsms-signature'])).size, nonces.length);
  }
  // Page 2 followed through next_page_url (no doubled /integration/)
  assert.ok(posSys.calls.some((c) => c.path === '/api/integration/completed-shifts/collection'));
  assert.ok(!posSys.calls.some((c) => c.path.includes('/integration/integration/')));

  assert.equal(res.body.integrations.pos.connected, true);
  assert.equal(res.body.integrations.pos.source, 'service_key');
  assert.equal(res.body.integrations.restaurant.connected, true);
  assert.equal(res.body.access.collection.allowed, true);
  assert.ok(!JSON.stringify(res.body).includes(POS_KEY) && !JSON.stringify(res.body).includes(RST_KEY), 'key never in a response');
});

test('status and access: connected, every collection source, all branches, no Connect needed', async () => {
  reset();
  const res = fakeRes();
  await controller.getIntegrationsStatus(fakeReq('Accountant'), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  for (const id of ['pos', 'restaurant']) {
    const st = res.body.integrations[id];
    assert.equal(st.connected, true, id);
    assert.equal(st.state, 'connected');
    assert.equal(st.source, 'service_key');
    assert.equal(st.scope.allBranches, true);
  }
  assert.deepEqual(res.body.access.collection.sources.POS.sort(), ['CREDIT_PAYMENT', 'EMPLOYEE_DEDUCTION', 'SHIFT']);
  assert.deepEqual(res.body.access.collection.sources.RESTAURANT.sort(), ['CREDIT_PAYMENT', 'EMPLOYEE_DEDUCTION', 'SHIFT']);
  assert.equal(res.body.access.fgItems.allowed, true);
  assert.match(res.body.message, /no POS \/ Restaurant login is needed/);

  const access = await integrationAccess.getAccess(9);
  assert.equal(integrationAccess.collectionWhere(access).sql.includes('pos_branch_id'), false, 'no branch filter');

  const connected = await auth.connect('restaurant', { userId: 9, username: 'x', password: 'never-sent' });
  assert.equal(connected.connected, true);
  assert.equal(rstSys.logins, 0);
});

test('a BSMS login sends no password to a system read with the key', async () => {
  reset();
  const result = await auth.loginAll({ userId: 9, role: 'Accountant', username: 'acc', password: 'secret-pass' });
  assert.equal(result.pos.skipped, true);
  assert.equal(result.restaurant.skipped, true);
  assert.equal(posSys.logins + rstSys.logins, 0);
});

test('FG item list reads the POS with the key', async () => {
  reset();
  const items = await fetchRavonPosItems({ userId: 9 });
  assert.ok(Array.isArray(items) && items.length === 1, JSON.stringify(items));
  assert.equal(posSys.calls[0].path, '/api/integration/items-list');
  assert.ok(posSys.calls[0].headers['x-bsms-signature']);
  assert.equal(posSys.calls[0].headers['x-integration-key'], undefined);
});

test('a retry after 503 is signed again (a one-time signature is never re-sent)', async () => {
  reset();
  posSys.failNext = 1;
  const items = await fetchRavonPosItems({ userId: 9 });
  assert.equal(items.length, 1);
  assert.equal(posSys.calls.length, 2);
  assert.notEqual(posSys.calls[0].headers['x-bsms-nonce'], posSys.calls[1].headers['x-bsms-nonce']);
});

test('a key that does not match: clear error, never the key itself, the other system still imports', async () => {
  reset({ rstKey: OTHER_PAIR.privateB64 });
  const res = await pull();
  assert.equal(res.statusCode, 200);
  const rst = bySystem(res.body, 'RESTAURANT');
  assert.equal(rst.code, 'RESTAURANT_CREDENTIALS_INVALID');
  assert.match(rst.error, /refused the Stock Management signature/);
  assert.ok(!JSON.stringify(res.body).includes(OTHER_PAIR.privateB64), 'key never in a response');
  assert.equal(bySystem(res.body, 'POS').error, undefined);
  assert.equal(db.rows.filter((r) => r.source_system === 'POS').length, 3);
});

test('an invalid private key is ignored; a system without a key keeps the per-user login', async () => {
  reset({ posKey: 'not-a-key', rstKey: null });
  assert.equal(auth.usesServiceKey('pos'), false);
  assert.equal(auth.usesServiceKey('restaurant'), false);
  const access = await auth.getUserAccess('pos', { userId: 9 });
  assert.equal(access.connected, false);
  assert.equal(access.state, 'not_connected');
  assert.deepEqual(access.abilities, []);
});

test('Restaurant records sent without a branch go to the Restaurant department (one location)', async () => {
  reset();
  rstSys.noBranch = true;
  const res = await pull();
  const rst = bySystem(res.body, 'RESTAURANT');
  assert.equal(rst.error, undefined);
  assert.equal(rst.unmapped, 0, JSON.stringify(rst.sources.map((s) => s.unmappedBranches)));
  const rows = db.rows.filter((r) => r.source_system === 'RESTAURANT');
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal(row.department_id, 4, row.source_type);
    assert.equal(row.pos_branch_name, 'Restaurant');
  }
  // The POS (several branches) is unaffected: its records keep their own branches
  assert.equal(bySystem(res.body, 'POS').unmapped, 0);
  assert.deepEqual([...new Set(db.rows.filter((r) => r.source_system === 'POS').map((r) => r.department_id))].sort((a, b) => a - b), [7, 12]);
});
