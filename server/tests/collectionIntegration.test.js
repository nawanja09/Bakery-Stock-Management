// Collection API end to end against TWO mock systems - RAVON POS and RAVON
// Restaurant - with a stateful fake `collections` table (no MySQL).
//   * no POS / Restaurant credential exists in process.env: sessions come only
//     from a typed login (the Finance user's BSMS login / Connect)
//   * both systems are imported into the same Pending list, each row tagged
//     with its source_system; the same POS / Restaurant id never collides
//   * a Restaurant failure (5xx, auth) never stops the POS import
//   * 401 -> the token is dropped and the call retried ONCE with the next session
//   * duplicate prevention per system; approval references per system, POS unchanged
//   * Connect endpoint: roles, validation, rate limit, never returns a secret
//   * no token / password in any response or log line
//   * POS-only regression: with the Restaurant not configured, POS rows are
//     exactly what the POS-only code produced
//   * every department is imported; no department / branch filter is sent
//   * a From..To search asks each system for the whole range (plus the
//     completion lag) and the list filters collection_date inclusively
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'collection-integration-secret';
process.env.POS_SESSION_PERSIST = '0';
for (const name of ['RAVON_POS_USERNAME', 'RAVON_POS_PASSWORD', 'RAVON_POS_API_KEY', 'POS_USERNAME', 'POS_PASSWORD']) delete process.env[name];

// ---------------------------------------------------------------- fake database
const DEPARTMENTS = [
  { id: 7, name: 'Cafe' }, { id: 14, name: 'MAS Intimo' }, { id: 12, name: 'MAS Kreeda' }, { id: 10, name: 'MAS Ayathi' }
];
const db = { rows: [], nextId: 1 };
const inserted = [];
const listQueries = [];
const sqlLog = [];
const dupError = () => { const e = new Error('Duplicate entry'); e.code = 'ER_DUP_ENTRY'; return e; };
const fakePool = {
  collectionsSchemaReady: Promise.resolve(),
  query: async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    sqlLog.push(s);
    if (s.startsWith('SELECT id, name FROM company')) return [[]];
    if (s.startsWith('SELECT id, name FROM departments')) return [DEPARTMENTS];
    if (s.startsWith('SELECT id, status, raw_payload')) {
      const [type, id, system] = params;
      return [db.rows.filter((r) => r.source_type === type && r.source_id === id && r.source_system === system)];
    }
    if (s.includes("reference_no = ? AND source_system = ? AND source_id <> ? AND status = 'completed'")) {
      const [type, ref, system, id] = params;
      return [db.rows.filter((r) => r.source_type === type && r.reference_no === ref && r.source_system === system
        && r.source_id !== id && r.status === 'completed')];
    }
    if (s.startsWith('INSERT INTO collections')) {
      const columns = s.slice(s.indexOf('(') + 1, s.indexOf(')')).split(',').map((c) => c.trim());
      const row = { id: db.nextId, status: 'pending' };
      columns.forEach((c, i) => { if (i < params.length) row[c] = params[i]; });
      if (db.rows.some((r) => r.source_system === row.source_system && r.source_type === row.source_type && r.source_id === row.source_id)) {
        throw dupError(); // UNIQUE (source_system, source_type, source_id)
      }
      db.nextId += 1;
      db.rows.push(row);
      inserted.push({ source_type: params[0], source_id: params[1], params, row });
      return [{ affectedRows: 1, insertId: row.id }];
    }
    if (s.startsWith('UPDATE collections d')) return [{ affectedRows: 0 }];
    if (s.startsWith('UPDATE collections SET')) return [{ affectedRows: 1 }];
    if (s.includes('COUNT(*) AS count')) { listQueries.push({ sql: s, params }); return [[{ count: 0, unmapped: 0 }]]; }
    return [[]];
  }
};
const dbPath = require.resolve('../config/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakePool };

// Column positions in the INSERT (source_type, source_id, ...COLUMNS, source_system).
const COLUMNS = ['reference_no', 'collection_date', 'shift_id', 'shift_no', 'shift_reference', 'cashier_name', 'employee_id',
  'employee_name', 'pos_company', 'company_id', 'pos_branch_id', 'pos_branch_name', 'department_id'];
const col = (row, name) => row.params[2 + COLUMNS.indexOf(name)];
const systemOf = (row) => row.row.source_system;

// ---------------------------------------------------------------- mock systems
const BRANCHES = [{ id: 6, name: 'Cafe - M' }, { id: 1, name: 'MASActive' }, { id: 2, name: 'MASKreeda' }, { id: 3, name: 'MASAyathi' }];
const shift = (i, branch, closedAt) => ({
  shift_id: 300 + i, shift_no: `00${i}`, branch, cashier: { id: 1, name: 'Cashier' },
  opened_at: closedAt, closed_at: closedAt, completed_at: closedAt,
  cash: { declared: 100, actual: 100, counted: 100 }, card: { total: 0, count: 0, transactions: [] },
  online: { total: 0, count: 0, transactions: [] }, credit: { total: 0 },
  short_excess: { by_method: {}, total: 0, status: 'balanced' }, collection: 100
});

const ALL_ABILITIES = ['items.view', 'collection.shifts', 'collection.credit_payments', 'collection.employee_deductions'];
const abilitiesOf = (sys, username) => (sys.abilities[username] || ALL_ABILITIES);

const json = (res, status, payload) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)); };

// One RAVON system. Both use the same API; the Restaurant's records reuse the
// POS ids on purpose (shift 300.., credit payment 41/42, deduction 7).
const startSystem = ({ prefix, accounts, branches }) => new Promise((resolve) => {
  const sys = {
    prefix, accounts, logins: [], dataCalls: [], unauthorized: 0, valid: new Set(), seq: 0,
    tokenUser: new Map(), // token -> username
    abilities: {}, // username -> abilities (default: all)
    failData: null, // e.g. 500 -> every data call answers that status
    close: null, url: null
  };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      if (req.method === 'POST' && url.pathname === '/api/login') {
        const { username, password } = JSON.parse(body || '{}');
        sys.logins.push(username);
        if (sys.accounts[username] !== password) return json(res, 401, { message: 'These credentials do not match our records.' });
        sys.seq += 1;
        const token = `${prefix}-token-${sys.seq}`;
        sys.valid.add(token);
        sys.tokenUser.set(token, username);
        return json(res, 200, { token, user: { username, abilities: abilitiesOf(sys, username) } });
      }
      const auth = (req.headers.authorization || '').replace(/^Bearer /, '');
      if (!sys.valid.has(auth)) { sys.unauthorized += 1; return json(res, 401, { error: true, message: 'Unauthenticated.', status: 401 }); }
      const who = sys.tokenUser.get(auth);
      if (url.pathname === '/api/me') return json(res, 200, { user: { id: 3, name: who, branch_ids: [], abilities: abilitiesOf(sys, who) } });
      // Like the real APIs: each data route needs its ability.
      const needed = url.pathname.includes('completed-shifts') ? 'collection.shifts'
        : url.pathname.includes('credit-payments') ? 'collection.credit_payments'
          : url.pathname.includes('employee-deductions') ? 'collection.employee_deductions' : null;
      if (needed && !abilitiesOf(sys, who).includes(needed)) return json(res, 403, { error: true, message: 'You do not have permission to access this resource.', status: 403 });
      sys.dataCalls.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), token: auth });
      if (sys.failData) return json(res, sys.failData, { message: 'Server Error' });
      if (url.pathname.includes('completed-shifts')) {
        const page = Number(url.searchParams.get('page') || 1);
        const data = page === 1
          ? branches.map((b, i) => shift(i, b, '2026-10-01T03:00:00.000000Z'))
          : [shift(9, branches[1 % branches.length], '2026-10-30T18:00:00.000000Z')]; // 23:30 on 30 Oct in Colombo
        return json(res, 200, { data, meta: { current_page: page, last_page: 2 } });
      }
      if (url.pathname.includes('credit-payments')) {
        return json(res, 200, { data: [
          { id: 41, reference_no: 'CP-41', payment_date: '2026-10-03', payment_type: 'Cash', amount: '1500.00', branch: branches[1 % branches.length] },
          { id: 42, reference_no: 'CP-42', payment_date: '2026-10-04', payment_type: 'Card', amount: 2500, branch: branches[0] }
        ], meta: { current_page: 1, last_page: 1 } });
      }
      if (url.pathname.includes('employee-deductions')) {
        // Like the real POS: only "active" deductions unless status=all is asked for.
        const all = url.searchParams.get('status') === 'all';
        const data = [{ id: 7, date: '2026-10-05', employee_name: 'Kamal', employee_id: 'E1', shift_id: '300', amount: 500, status: 'deducted', branch: branches[0] },
          { id: 8, date: '2026-10-05', employee_name: 'Nimal', employee_id: 'E2', amount: 200, status: 'cancelled', branch: branches[0] }];
        return json(res, 200, { data: all ? data : [], meta: { current_page: 1, last_page: 1 } });
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

// The POS Finance account uses the same password as BSMS; the Restaurant Finance
// account has its OWN password (connected through the Connect action).
const POS_ACCOUNTS = { finance: 'fin-pass', accountant: 'acc-pass' };
const RESTAURANT_ACCOUNTS = { 'rst-finance': 'rst-pass', accountant: 'acc-pass' };
const SECRETS = ['fin-pass', 'rst-pass', 'acc-pass', 'pos-token', 'rst-token'];

let posSys;
let rstSys;
const auth = require('../services/integrationAuthService');
const controller = require('../controllers/collectionController');
const { dateWindow, stagePending, linkDeductionsToShifts } = require('../services/collectionSyncService');

test.before(async () => {
  posSys = await startSystem({ prefix: 'pos', accounts: POS_ACCOUNTS, branches: BRANCHES });
  rstSys = await startSystem({ prefix: 'rst', accounts: RESTAURANT_ACCOUNTS, branches: [{ id: 21, name: 'Cafe - R' }, { id: 22, name: 'MASKreeda' }] });
});
test.after(async () => { await posSys.close(); await rstSys.close(); });

// Fresh state for every test: empty table, configured systems, Finance logged in to the POS.
const reset = async ({ restaurant = true, financeLogin = true, connectRestaurant = true } = {}) => {
  db.rows.length = 0;
  db.nextId = 1;
  inserted.length = 0;
  listQueries.length = 0;
  sqlLog.length = 0;
  for (const sys of [posSys, rstSys]) {
    sys.logins.length = 0; sys.dataCalls.length = 0; sys.unauthorized = 0; sys.valid.clear(); sys.failData = null; sys.seq = 0;
    sys.tokenUser.clear(); sys.abilities = {};
  }
  auth.resetAuthState();
  process.env.RAVON_POS_API_URL = posSys.url;
  if (restaurant) process.env.RAVON_RESTAURANT_API_URL = rstSys.url;
  else delete process.env.RAVON_RESTAURANT_API_URL;
  // The requesting user's OWN BSMS login (user 1): the typed credentials go to
  // both systems; the Restaurant account has another password -> Connect.
  if (financeLogin) await auth.loginAll({ userId: 1, role: 'Accountant', username: 'finance', password: 'fin-pass' });
  if (restaurant && connectRestaurant) {
    await auth.connect('restaurant', { userId: 1, username: 'rst-finance', password: 'rst-pass' });
  }
};

const fakeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};
// The Stock Management user belongs to Cafe - that must not matter.
const fakeReq = (role, query = {}, extra = {}) => ({ user: { userId: 1, role, department_id: 7 }, query, body: {}, params: {}, ...extra });

const pull = async (role = 'Accountant', query = {}) => {
  const res = fakeRes();
  await controller.getPending(fakeReq(role, { refresh: '1', from_date: '2026-10-01', to_date: '2026-10-30', ...query }), res);
  return res;
};
const bySystem = (body, system) => body.sync.systems.find((s) => s.system === system);

// Captures every console line while fn runs.
const captureLogs = async (fn) => {
  const lines = [];
  const originals = {};
  for (const level of ['log', 'warn', 'error', 'info']) {
    originals[level] = console[level];
    console[level] = (...a) => { lines.push(a.map((x) => (x instanceof Error ? `${x.message} ${x.stack}` : (typeof x === 'object' ? JSON.stringify(x) : String(x)))).join(' ')); };
  }
  try { await fn(); } finally { Object.assign(console, originals); }
  return lines.join('\n');
};

// ================================================================ tests
test('no POS / Restaurant credential is read from the environment', () => {
  for (const name of ['RAVON_POS_USERNAME', 'RAVON_POS_PASSWORD', 'RAVON_POS_API_KEY', 'POS_USERNAME', 'POS_PASSWORD']) {
    assert.equal(process.env[name], undefined, name);
  }
});

test('date window: a From..To search covers the whole range, the To date and late completions', () => {
  const now = new Date('2026-11-20T06:00:00Z');
  assert.deepEqual(dateWindow(now, { fromDate: '2026-10-01', toDate: '2026-10-30' }),
    { start_date: '2026-09-30', end_date: '2026-11-13' });
  assert.deepEqual(dateWindow(new Date('2026-10-07T06:00:00Z'), { fromDate: '2026-10-01', toDate: '2026-10-30' }),
    { start_date: '2026-09-30', end_date: '2026-10-07' });
  assert.deepEqual(dateWindow(new Date('2026-10-07T06:00:00Z')), { start_date: '2026-09-30', end_date: '2026-10-07' });
});

test('both systems import into the same Pending list, each row tagged with its system', async () => {
  await reset();
  const res = await pull();
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.sync.ok, true);

  const pos = bySystem(res.body, 'POS');
  const rst = bySystem(res.body, 'RESTAURANT');
  // Per-system results: { system, fetched, created, updated, duplicates, unmapped, invalid }
  for (const s of [pos, rst]) {
    for (const key of ['fetched', 'created', 'updated', 'duplicates', 'unmapped', 'invalid']) assert.equal(typeof s[key], 'number', `${s.system}.${key}`);
    assert.equal(s.error, undefined);
  }
  assert.equal(pos.fetched, 5 + 2 + 2);
  assert.equal(pos.created, 5 + 2 + 1);
  assert.equal(rst.fetched, 3 + 2 + 2);
  assert.equal(rst.created, 3 + 2 + 1);

  const rows = (system, type) => inserted.filter((r) => systemOf(r) === system && r.source_type === type);
  assert.equal(rows('POS', 'SHIFT').length, 5);
  assert.equal(rows('RESTAURANT', 'SHIFT').length, 3);
  // Restaurant branches go through the same department mapping; an unknown branch
  // is imported unmapped (department NULL), exactly like POS.
  assert.deepEqual(rows('RESTAURANT', 'SHIFT').map((r) => col(r, 'department_id')), [7, 12, 12]);
  // Backward compatible sync.sources = the POS sources.
  assert.deepEqual(res.body.sync.sources.map((s) => s.source), ['SHIFT', 'CREDIT_PAYMENT', 'EMPLOYEE_DEDUCTION']);
  assert.ok(res.body.sync.sources.every((s) => s.system === 'POS'));
  // Status per system.
  assert.equal(res.body.integrations.pos.connected, true);
  assert.equal(res.body.integrations.restaurant.connected, true);
  assert.equal(res.body.integrations.restaurant.username, 'rst-finance');
  assert.equal(res.body.integrations.pos.scope.allBranches, true);
  assert.equal(res.body.backgroundSync, false);
  // Deductions are linked to shifts of the SAME system only.
  assert.ok(sqlLog.some((s) => s.startsWith('UPDATE collections d') && s.includes('s.source_system = d.source_system')));
});

test('the same source_id in POS and Restaurant never collides', async () => {
  await reset();
  await pull();
  for (const [type, id] of [['SHIFT', '300'], ['CREDIT_PAYMENT', '41'], ['EMPLOYEE_DEDUCTION', '7']]) {
    const both = db.rows.filter((r) => r.source_type === type && r.source_id === id);
    assert.deepEqual(both.map((r) => r.source_system).sort(), ['POS', 'RESTAURANT'], `${type} ${id}`);
  }
  // A second sync updates in place: nothing new, in either system.
  inserted.length = 0;
  const again = await pull();
  assert.equal(inserted.length, 0);
  assert.equal(bySystem(again.body, 'POS').created, 0);
  assert.equal(bySystem(again.body, 'RESTAURANT').created, 0);
});

test('duplicate prevention is per system: a completed POS reference blocks only POS', async () => {
  await reset();
  const record = (system, id, ref) => ({ source_system: system, source_type: 'SHIFT', source_id: id, reference_no: ref, raw_payload: `{"id":${id}}` });
  assert.equal(await stagePending(fakePool, record('POS', '1', 'R-1')), 'inserted');
  assert.equal(await stagePending(fakePool, record('RESTAURANT', '1', 'R-1')), 'inserted', 'same id + reference, other system');
  db.rows.find((r) => r.source_system === 'POS').status = 'completed';
  assert.equal(await stagePending(fakePool, record('POS', '2', 'R-1')), 'duplicate', 'same POS reference under another POS id');
  assert.equal(await stagePending(fakePool, record('RESTAURANT', '3', 'R-1')), 'inserted', 'a POS completion never blocks the Restaurant');
  assert.equal(await stagePending(fakePool, record('POS', '1', 'R-1')), 'unchanged', 'completed rows are never touched');
  // A record without source_system is a POS record (unchanged POS behaviour).
  const legacy = { source_type: 'SHIFT', source_id: '1', reference_no: 'R-1', raw_payload: '{"id":1}' };
  assert.equal(await stagePending(fakePool, legacy), 'unchanged');
  await linkDeductionsToShifts(fakePool);
});

test('Restaurant 5xx does not break the POS import', async () => {
  await reset();
  rstSys.failData = 500;
  const res = await pull();
  assert.equal(res.statusCode, 200);
  const pos = bySystem(res.body, 'POS');
  const rst = bySystem(res.body, 'RESTAURANT');
  assert.equal(pos.error, undefined);
  assert.equal(pos.created, 8);
  assert.match(rst.error, /RAVON Restaurant server had an error \(500\)/);
  assert.equal(res.body.sync.ok, false);
  assert.equal(inserted.filter((r) => systemOf(r) === 'RESTAURANT').length, 0);
  assert.equal(inserted.filter((r) => systemOf(r) === 'POS').length, 8);
});

test('Restaurant not connected -> clear "log in" message, no Restaurant data call, POS imports', async () => {
  await reset({ connectRestaurant: false }); // the Finance BSMS password is not the Restaurant password
  assert.deepEqual(rstSys.logins, ['finance'], 'the BSMS login tried the Restaurant once');
  const res = await pull();
  const rst = bySystem(res.body, 'RESTAURANT');
  assert.ok(['RESTAURANT_NOT_CONNECTED', 'RESTAURANT_CREDENTIALS_INVALID'].includes(rst.code), rst.code);
  assert.equal(rstSys.dataCalls.length, 0);
  assert.equal(bySystem(res.body, 'POS').created, 8);
  const status = res.body.integrations.restaurant;
  assert.equal(status.connected, false);
  assert.match(status.message, /RAVON Restaurant/);
});

test('POS failure (auth) does not break the Restaurant import', async () => {
  await reset({ financeLogin: false }); // nobody logged in to the POS
  const res = await pull();
  assert.equal(bySystem(res.body, 'POS').code, 'POS_NOT_CONNECTED');
  assert.match(bySystem(res.body, 'POS').error, /Log in to Stock Management with your own RAVON POS username and password/);
  assert.equal(bySystem(res.body, 'RESTAURANT').created, 6);
  assert.equal(res.body.pos.authError, true);
  assert.equal(posSys.dataCalls.length, 0);
  // sync.sources stays POS-shaped: each source carries the POS failure.
  assert.ok(res.body.sync.sources.every((s) => s.errorCode === 'POS_NOT_CONNECTED'));
});

test('token expiry: 401 -> the user\'s own token is dropped, a clear error, no re-login, the other system unaffected', async () => {
  await reset();
  const before = rstSys.logins.length;
  // The Restaurant revokes this user's own (connected) token.
  rstSys.valid.clear();
  const res = await pull();
  const rst = bySystem(res.body, 'RESTAURANT');
  assert.equal(rst.code, 'RESTAURANT_NOT_CONNECTED');
  assert.ok(rstSys.unauthorized <= 1, 'never more than one rejected call');
  assert.equal(rstSys.logins.length, before, 'no password is stored: no re-login');
  assert.equal(bySystem(res.body, 'POS').error, undefined);
  assert.equal(bySystem(res.body, 'POS').created, 8);
  assert.equal(res.body.integrations.restaurant.state, 'expired');
});

test('a user never reads with another user\'s session (no shared Finance session)', async () => {
  await reset(); // user 1 is connected to both
  posSys.dataCalls.length = 0;
  const res = fakeRes();
  await controller.getPending({ user: { userId: 99, role: 'Accountant' }, query: { refresh: '1' }, body: {}, params: {} }, res);
  assert.equal(res.statusCode, 403, JSON.stringify(res.body));
  assert.equal(res.body.code, 'INTEGRATION_ACCESS_DENIED');
  assert.equal(posSys.dataCalls.length, 0);
  assert.equal(rstSys.dataCalls.length, 0);
});

test('Connect endpoint: roles, validation, success without secrets, rate limit', async () => {
  await reset({ connectRestaurant: false });
  const connect = async (role, body, provider = 'restaurant', userId = 1) => {
    const res = fakeRes();
    await controller.connectIntegration({ user: { userId, role }, params: { provider }, body: { ...body } }, res);
    return res;
  };
  const good = { username: 'rst-finance', password: 'rst-pass' };
  for (const role of ['QB', 'View Only', 'Staff', null]) {
    assert.equal((await connect(role, good)).statusCode, 403, String(role));
  }
  assert.equal((await connect('Accountant', good, 'erp')).statusCode, 404);
  assert.equal((await connect('Accountant', { username: 'rst-finance' })).statusCode, 400);
  assert.equal((await connect('Accountant', { ...good, token: 'x' })).statusCode, 400);
  assert.equal((await connect('Accountant', { username: 'a\u0000b', password: 'x' })).statusCode, 400);
  assert.equal(rstSys.logins.length, 1, 'invalid requests never reach the Restaurant (1 = the BSMS login)');

  const refused = await connect('Accountant', { username: 'rst-finance', password: 'wrong-pass' });
  assert.equal(refused.statusCode, 400, 'refused credentials are 400, never 401 (that would sign the user out)');
  assert.equal(refused.body.code, 'RESTAURANT_CREDENTIALS_INVALID');
  assert.doesNotMatch(JSON.stringify(refused.body), /wrong-pass/);

  const ok = await connect('Accountant', good, 'restaurant', 11);
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.connected, true);
  assert.equal(ok.body.username, 'rst-finance');
  assert.doesNotMatch(JSON.stringify(ok.body), /rst-pass|rst-token/);
  assert.equal(auth.getAuthStatus('restaurant', { userId: 11 }).connected, true);
  assert.equal(auth.getAuthStatus('restaurant', { userId: 12 }).connected, false, 'only for that user');
  assert.deepEqual(ok.body.abilities, ['items.view', 'collection.shifts', 'collection.credit_payments', 'collection.employee_deductions']);

  // POS reconnect works the same way.
  assert.equal((await connect('Admin', { username: 'finance', password: 'fin-pass' }, 'pos', 2)).body.connected, true);

  // At most 5 attempts per user per 10 minutes.
  const codes = [];
  for (let i = 0; i < 6; i += 1) codes.push((await connect('Accountant', { username: `nobody${i}`, password: 'x' }, 'pos', 55)).statusCode);
  assert.equal(codes[5], 429);
});

test('integration status endpoint: the user\'s own connection + privileges, no secrets', async () => {
  await reset();
  const res = fakeRes();
  await controller.getIntegrationsStatus(fakeReq('Accountant'), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(res.body.integrations).sort(), ['pos', 'restaurant']);
  assert.equal(res.body.integrations.pos.connected, true);
  assert.equal(res.body.backgroundSync, false);
  assert.match(res.body.message, /your own POS \/ Restaurant account/);
  assert.equal(res.body.access.collection.allowed, true);
  assert.equal(res.body.access.fgItems.allowed, true);
  assert.doesNotMatch(JSON.stringify(res.body), /fin-pass|rst-pass|pos-token|rst-token/);
  const stores = fakeRes();
  await controller.getIntegrationsStatus(fakeReq('Staff'), stores);
  assert.equal(stores.statusCode, 403);
});

test('no token or password ever appears in a response or a log line', async () => {
  const bodies = [];
  const logs = await captureLogs(async () => {
    await reset();
    bodies.push((await pull()).body);
    rstSys.failData = 503;
    bodies.push((await pull()).body);
    rstSys.failData = null;
    rstSys.valid.clear();
    posSys.valid.clear();
    bodies.push((await pull()).body);
    const res = fakeRes();
    await controller.connectIntegration({ user: { userId: 1, role: 'Admin' }, params: { provider: 'pos' }, body: { username: 'finance', password: 'bad-secret-pass' } }, res);
    bodies.push(res.body);
    const status = fakeRes();
    await controller.getIntegrationsStatus(fakeReq('Admin'), status);
    bodies.push(status.body);
  });
  const all = JSON.stringify(bodies);
  for (const secret of [...SECRETS, 'bad-secret-pass', 'Bearer ']) {
    assert.ok(!all.includes(secret), `response contains ${secret}`);
    assert.ok(!logs.includes(secret), `log contains ${secret}`);
  }
});

test('POS-only regression: Restaurant not configured -> skipped (not an error), POS rows identical to the POS-only code', async () => {
  await reset({ restaurant: false });
  const res = await pull();
  assert.equal(res.body.sync.ok, true);
  const rst = bySystem(res.body, 'RESTAURANT');
  assert.equal(rst.configured, false);
  assert.equal(rst.skipped, true);
  assert.equal(rst.error, undefined);
  assert.match(rst.message, /not configured/);
  assert.equal(res.body.integrations.restaurant.state, 'not_configured');
  assert.equal(rstSys.logins.length + rstSys.dataCalls.length, 0);

  // Every staged POS row = what the POS-only pipeline produced (mapPosRecord +
  // branch normalization + department mapping), plus source_system 'POS' at the end.
  const { mapPosRecord } = require('../services/collectionMapper');
  const { createDepartmentMatcher, normalizePosBranchName } = require('../services/departmentMapper');
  const match = createDepartmentMatcher(DEPARTMENTS);
  const ALL_COLUMNS = [
    'reference_no', 'collection_date', 'shift_id', 'shift_no', 'shift_reference', 'cashier_name', 'employee_id', 'employee_name',
    'pos_company', 'company_id', 'pos_branch_id', 'pos_branch_name', 'department_id', 'pos_payment_method', 'pos_bank_account',
    'cash_amount', 'card_amount', 'card_txn_count', 'card_txn_total', 'bank_amount', 'ar_amount', 'short_excess_amount', 'deduction_amount',
    'total_amount', 'pos_total_amount', 'raw_payload'
  ];
  const shifts = inserted.filter((r) => r.source_type === 'SHIFT');
  assert.equal(shifts.length, 5);
  for (const row of shifts) {
    const raw = JSON.parse(col(row, 'reference_no') && row.params[2 + ALL_COLUMNS.indexOf('raw_payload')]);
    const expected = mapPosRecord('SHIFT', raw).record;
    expected.company_id = null;
    expected.pos_branch_name = normalizePosBranchName(expected.pos_branch_name);
    const m = match(expected.pos_branch_name);
    expected.department_id = m.ok ? m.department.id : null;
    const old = [expected.source_type, expected.source_id, ...ALL_COLUMNS.map((c) => expected[c] ?? null)];
    assert.deepEqual(row.params.slice(0, -1), old, `shift ${row.source_id}`);
    assert.equal(row.params[row.params.length - 1], 'POS');
  }
});

test('approval: one POS and one Restaurant shift with the same id get separate references; POS unchanged', async () => {
  const { approveCollections, ledgerReference, posCardKey, cardPaymentReference } = require('../services/collectionService');
  const payload = {
    shift_id: 211, shift_no: '0104', branch: { id: 6, name: 'Cafe - M' }, closed_at: '2026-10-06T08:36:35.000000Z',
    cash: { actual: 1000 }, card: { total: 810, count: 1, transactions: [{ type: 'sale', sale_id: 21127, receipt_no: 'R1', amount: 810, date_time: '2026-10-06T08:37:39.000000Z' }] },
    online: { total: 0 }, credit: { total: 0 }, short_excess: { total: 0 }, collection: 1810
  };
  const rowFor = (id, system) => ({
    id, source_system: system, source_type: 'SHIFT', source_id: '211', reference_no: '211-0104', collection_date: '2026-10-06',
    shift_id: '211', shift_no: '0104', cashier_name: 'Imasha', employee_name: null, company_id: 1, pos_bank_account: null,
    pos_branch_name: 'Cafe - M', department_id: 7, cash_amount: 1000, card_amount: 810, bank_amount: 0, ar_amount: 0,
    short_excess_amount: 0, deduction_amount: 0, total_amount: 1810, pos_total_amount: 1810, linked_collection_id: null,
    status: 'pending', version: 'v1', raw_payload: JSON.stringify(payload)
  });
  const rows = { 1: rowFor(1, 'POS'), 2: rowFor(2, 'RESTAURANT') };
  const writes = { lines: [], card: [], ccp: [], cash: [], dupChecks: [] };
  const connection = {
    async query(sql, params = []) {
      const s = String(sql).replace(/\s+/g, ' ').trim();
      if (/FROM collections WHERE id = \? FOR UPDATE/.test(s)) return [[{ ...rows[params[0]] }]];
      if (/SELECT id FROM collection_transactions WHERE collection_id/.test(s)) return [[]];
      if (/SELECT id FROM collections WHERE source_type = \? AND reference_no/.test(s)) { writes.dupChecks.push(params); return [[]]; }
      if (/FROM bank_details bd INNER JOIN company/.test(s)) return [[{ id: params[0] }]];
      if (/SELECT pos_card_key FROM collection_card_payments/.test(s)) return [[]];
      if (/FROM card_transactions WHERE LOWER\(TRIM\(reference_number\)\)/.test(s)) return [[]];
      if (/^INSERT INTO collection_transactions/.test(s)) { writes.lines.push(params); return [{ insertId: 50 + writes.lines.length }]; }
      if (/^INSERT INTO card_transactions/.test(s)) { writes.card.push(params); return [{ insertId: 500 + writes.card.length }]; }
      if (/^INSERT INTO collection_card_payments/.test(s)) { writes.ccp.push(params); return [{ insertId: 1 }]; }
      if (/^INSERT INTO finance_transactions/.test(s)) { writes.cash.push(params); return [{ insertId: 900 }]; }
      if (/LAST_INSERT_ID/.test(s)) return [[{ id: 900 }]];
      if (/^UPDATE collections SET status = 'completed'/.test(s)) return [{ affectedRows: 1 }];
      return [[]];
    }
  };
  const result = await approveCollections(connection, { items: [{ id: 1, version: 'v1', card_bank_account_id: 3 }, { id: 2, version: 'v1', card_bank_account_id: 3 }], userId: 9 });
  assert.deepEqual(result.approved.map((a) => a.reference), ['SHIFT-211-0104', 'RST-SHIFT-211-0104']);
  // Duplicate check per system.
  assert.deepEqual(writes.dupChecks.map((p) => p[2]), ['POS', 'RESTAURANT']);
  // Card Ledger references and card keys never collide; POS ones are the old format.
  assert.deepEqual(writes.card.map((p) => p[4]), ['SHIFT-211-0104/SALE-21127', 'RST-SHIFT-211-0104/SALE-21127']);
  assert.deepEqual(writes.ccp.map((p) => p[2]), ['SHIFT:211:sale-21127', 'RESTAURANT:SHIFT:211:sale-21127']);
  // Lines carry the per-system reference.
  assert.deepEqual([...new Set(writes.lines.map((p) => p[2]))], ['SHIFT-211-0104', 'RST-SHIFT-211-0104']);

  // POS references are byte-for-byte the pre-Restaurant ones (no source_system = POS).
  const legacyRow = { source_type: 'CREDIT_PAYMENT', source_id: '41', reference_no: 'CP-41' };
  assert.equal(ledgerReference(legacyRow), 'CP-CP-41');
  assert.equal(ledgerReference({ ...legacyRow, source_system: 'POS' }), 'CP-CP-41');
  assert.equal(ledgerReference({ ...legacyRow, source_system: 'RESTAURANT' }), 'RST-CP-CP-41');
  assert.equal(posCardKey({ source_type: 'SHIFT', source_id: '211' }, { key: 'sale-1' }), 'SHIFT:211:sale-1');
  assert.equal(cardPaymentReference('SHIFT-211-0104', { sale_id: '5', key: 'sale-5', occurrence: 1 }), 'SHIFT-211-0104/SALE-5');
});

for (const role of ['Accountant', 'Admin', 'Super Admin', 'QB']) {
  test(`${role}: Search pulls ALL departments of both systems for the range with the Finance sessions`, async () => {
    await reset();
    const posLogins = posSys.logins.length;
    const res = await pull(role);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.sync.ok, true);
    assert.equal(res.body.viewOnly, role === 'QB');
    assert.equal(posSys.logins.length, posLogins, 'no login during a sync');

    for (const sys of [posSys, rstSys]) {
      for (const call of sys.dataCalls) {
        assert.equal(call.query.start_date, '2026-09-30');
        assert.ok(call.query.end_date >= '2026-10-07');
        for (const key of Object.keys(call.query)) assert.doesNotMatch(key, /branch|department/i);
      }
      assert.ok(sys.dataCalls.some((c) => c.path.includes('completed-shifts') && c.query.page === '2'));
    }

    // All four POS departments staged; MASActive is stored and mapped as MAS Intimo.
    const shifts = inserted.filter((r) => r.source_type === 'SHIFT' && systemOf(r) === 'POS');
    assert.equal(shifts.length, 5);
    assert.deepEqual([...new Set(shifts.map((r) => col(r, 'department_id')))].sort((a, b) => a - b), [7, 10, 12, 14]);
    assert.equal(shifts.some((r) => /MASActive/.test(col(r, 'pos_branch_name'))), false);
    assert.equal(shifts.filter((r) => col(r, 'pos_branch_name') === 'MAS Intimo').length, 2);
    assert.ok(shifts.some((r) => col(r, 'collection_date') === '2026-10-30'));

    const list = listQueries[0];
    assert.match(list.sql, /c\.collection_date >= \?/);
    assert.match(list.sql, /c\.collection_date <= \?/);
    assert.ok(list.params.includes('2026-10-01') && list.params.includes('2026-10-30'));
  });
}

test('paging and the Completed / Rejected tabs never call POS or Restaurant', async () => {
  await reset();
  await controller.getPending(fakeReq('Accountant', { page: '2', from_date: '2026-10-01', to_date: '2026-10-30' }), fakeRes());
  await controller.getCompleted(fakeReq('Accountant', { from_date: '2026-10-01', to_date: '2026-10-30' }), fakeRes());
  assert.equal(posSys.dataCalls.length + rstSys.dataCalls.length, 0);
});

test('GET /api/collections?status=pending&refresh=1 pulls like /pending', async () => {
  await reset();
  const res = fakeRes();
  await controller.listCollections(fakeReq('Admin', { status: 'pending', refresh: '1', from_date: '2026-10-01', to_date: '2026-10-30' }), res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.sync);
  assert.ok(posSys.dataCalls.length > 0 && rstSys.dataCalls.length > 0);
});

test('invalid ranges are refused before calling either system', async () => {
  await reset();
  const reversed = fakeRes();
  await controller.getPending(fakeReq('Admin', { refresh: '1', from_date: '2026-10-30', to_date: '2026-10-01' }), reversed);
  assert.equal(reversed.statusCode, 400);
  const tooLong = fakeRes();
  await controller.getPending(fakeReq('Admin', { refresh: '1', from_date: '2024-01-01', to_date: '2026-10-01' }), tooLong);
  assert.equal(tooLong.statusCode, 400);
  assert.equal(posSys.dataCalls.length + rstSys.dataCalls.length, 0);
});

test('MASActive is normalized to MAS Intimo (display + mapping), other names untouched', () => {
  const { normalizePosBranchName, createDepartmentMatcher } = require('../services/departmentMapper');
  assert.equal(normalizePosBranchName('MASActive'), 'MAS Intimo');
  assert.equal(normalizePosBranchName('MASActive - M'), 'MAS Intimo - M');
  assert.equal(normalizePosBranchName('MAS Active'), 'MAS Intimo');
  assert.equal(normalizePosBranchName('MASAyathi'), 'MASAyathi');
  assert.equal(normalizePosBranchName('Cafe - M'), 'Cafe - M');
  assert.equal(normalizePosBranchName('MASBrew'), 'MAS Ayathi Brew Bar');
  assert.equal(normalizePosBranchName('MASBrew - M'), 'MAS Ayathi Brew Bar - M');
  assert.equal(normalizePosBranchName('MAS Brew'), 'MAS Ayathi Brew Bar');
  assert.equal(normalizePosBranchName('MAS Ayathi Brew Bar'), 'MAS Ayathi Brew Bar', 'the Stock Management name is left as is');
  assert.equal(normalizePosBranchName('MASKreeda'), 'MASKreeda');
  const match = createDepartmentMatcher(DEPARTMENTS, new Map());
  assert.equal(match('MASActive').department.id, 14);
  const brew = createDepartmentMatcher([...DEPARTMENTS, { id: 21, name: 'MAS Ayathi Brew Bar' }], new Map());
  assert.equal(brew('MASBrew').department.id, 21, 'MASBrew -> MAS Ayathi Brew Bar');
  assert.equal(brew('MASBrew - M').department.id, 21);
  assert.equal(brew('MASActive').department.id, 14, 'MASActive still -> MAS Intimo');
  assert.equal(brew('MASKreeda').department.id, 12, 'MASKreeda unchanged');
  assert.equal(brew('Cafe - M').department.id, 7, 'Cafe unchanged');
  assert.equal(match('MASBrew').ok, false);
  assert.equal(brew('MASAyathi').department.id, 10, 'MASAyathi keeps its own department');
  assert.equal(match('MASKreeda').department.id, 12);
});

test('Credit Payment and Employee Deduction records are retrieved (deductions of every status, cancelled ones skipped)', async () => {
  await reset();
  const res = await pull();
  const of = (system, t) => inserted.filter((r) => r.source_type === t && systemOf(r) === system);
  for (const system of ['POS', 'RESTAURANT']) {
    assert.deepEqual(of(system, 'CREDIT_PAYMENT').map((r) => r.source_id), ['41', '42'], system);
    assert.deepEqual(of(system, 'EMPLOYEE_DEDUCTION').map((r) => r.source_id), ['7'], system);
  }
  for (const sys of [posSys, rstSys]) {
    assert.equal(sys.dataCalls.find((c) => c.path.includes('employee-deductions')).query.status, 'all');
  }
  const sources = Object.fromEntries(res.body.sync.sources.map((s) => [s.source, s]));
  assert.equal(sources.CREDIT_PAYMENT.fetched, 2);
  assert.equal(sources.EMPLOYEE_DEDUCTION.fetched, 2);
  assert.equal(sources.EMPLOYEE_DEDUCTION.invalid, 0);
  assert.equal(sources.EMPLOYEE_DEDUCTION.excluded, 1);
  assert.match(sources.EMPLOYEE_DEDUCTION.excludedReasons[0].reason, /Deduction is cancel/i);
  assert.equal(col(of('POS', 'CREDIT_PAYMENT')[0], 'department_id'), 14);
});

test('Restaurant record adapter: same shape as POS maps identically; an unknown shape is reported, never guessed', () => {
  const { mapSystemRecord, mapPosRecord } = require('../services/collectionMapper');
  // Fixture in the shape the Restaurant API is expected to share with the POS (same Laravel app).
  const restaurantShift = shift(1, { id: 21, name: 'Cafe - R' }, '2026-10-01T03:00:00.000000Z');
  const viaRestaurant = mapSystemRecord('RESTAURANT', 'SHIFT', restaurantShift);
  const viaPos = mapPosRecord('SHIFT', restaurantShift);
  assert.equal(viaRestaurant.ok, true);
  assert.equal(viaRestaurant.record.source_system, 'RESTAURANT');
  const { source_system: _s, ...rest } = viaRestaurant.record;
  assert.deepEqual(rest, viaPos.record);
  const unknown = mapSystemRecord('RESTAURANT', 'SHIFT', { order_no: 'X', table: 4, grand: 'abc' });
  assert.equal(unknown.ok, false);
  assert.deepEqual(unknown.fields, ['order_no', 'table', 'grand']);
  assert.equal(mapSystemRecord('ERP', 'SHIFT', restaurantShift).ok, false);
});

test('Filters: source and source_system resolve to the stored values and combine with the others', async () => {
  await reset();
  const cases = [
    ['SHIFT', 'SHIFT'], ['Shift Collection', 'SHIFT'], ['shift_collection', 'SHIFT'],
    ['CREDIT_PAYMENT', 'CREDIT_PAYMENT'], ['Credit Payment', 'CREDIT_PAYMENT'], ['credit-payment', 'CREDIT_PAYMENT'],
    ['credit_payment_collection', 'CREDIT_PAYMENT'],
    ['EMPLOYEE_DEDUCTION', 'EMPLOYEE_DEDUCTION'], ['Employee Deduction', 'EMPLOYEE_DEDUCTION'], ['employee-deductions', 'EMPLOYEE_DEDUCTION']
  ];
  for (const [input, stored] of cases) {
    listQueries.length = 0;
    const res = fakeRes();
    await controller.listCollections(fakeReq('Accountant', {
      status: 'completed', source: input, department_id: '14', from_date: '2026-10-01', to_date: '2026-10-30', search: 'CP-41'
    }), res);
    assert.equal(res.statusCode, 200, `${input}: ${JSON.stringify(res.body)}`);
    const { sql, params } = listQueries[0];
    assert.match(sql, /c.source_type = ?/);
    assert.ok(params.includes(stored), input);
    assert.match(sql, /c\.source_type IN \(\?\)/, 'the user\'s access is always applied');
    assert.ok(params.includes(14) && params.includes('2026-10-01') && params.includes('2026-10-30') && params.includes('%CP-41%'));
    assert.doesNotMatch(sql, /AND c\.source_system = \?/, 'no system filter unless asked for');
  }
  for (const [input, stored] of [['POS', 'POS'], ['pos', 'POS'], ['Restaurant', 'RESTAURANT'], ['RESTAURANT', 'RESTAURANT']]) {
    listQueries.length = 0;
    const res = fakeRes();
    await controller.listCollections(fakeReq('Accountant', { status: 'rejected', source_system: input, source: 'SHIFT' }), res);
    assert.equal(res.statusCode, 200);
    assert.match(listQueries[0].sql, /AND c\.source_system = \?/);
    assert.ok(listQueries[0].params.includes(stored), input);
  }
  for (const all of ['', 'all']) {
    listQueries.length = 0;
    await controller.listCollections(fakeReq('Accountant', { status: 'completed', source_system: all }), fakeRes());
    assert.doesNotMatch(listQueries[0].sql, /AND c\.source_system = \?/);
  }
  const bad = fakeRes();
  await controller.listCollections(fakeReq('Accountant', { status: 'pending', source: 'gift voucher' }), bad);
  assert.equal(bad.statusCode, 400);
  const badSystem = fakeRes();
  await controller.listCollections(fakeReq('Accountant', { status: 'completed', source_system: 'erp' }), badSystem);
  assert.equal(badSystem.statusCode, 400);
});
