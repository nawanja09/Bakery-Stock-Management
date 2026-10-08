// Collection API end to end against a mock POS (no MySQL; config/db is stubbed).
//   * the backend's POS finance integration account is used for every user;
//     nobody signs in to the POS, one shared login serves all requests
//   * every POS department is imported; no department / branch filter is sent
//   * POS "MASActive" is stored, shown and mapped as "MAS Intimo"
//   * a From..To search asks the POS for the whole range (plus the completion
//     lag) and the list filters collection_date inclusively on both ends
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// ---------------------------------------------------------------- fake database
const inserted = [];
const listQueries = [];
const DEPARTMENTS = [
  { id: 7, name: 'Cafe' }, { id: 14, name: 'MAS Intimo' }, { id: 12, name: 'MAS Kreeda' }, { id: 10, name: 'MAS Ayathi' }
];
const fakePool = {
  collectionsSchemaReady: Promise.resolve(),
  query: async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('SELECT id, name FROM company')) return [[]];
    if (s.startsWith('SELECT id, name FROM departments')) return [DEPARTMENTS];
    if (s.startsWith('SELECT id, status, raw_payload')) return [[]];
    if (s.startsWith('INSERT INTO collections')) {
      inserted.push({ source_type: params[0], source_id: params[1], params });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('UPDATE collections d')) return [{ affectedRows: 0 }];
    if (s.includes('COUNT(*) AS count')) { listQueries.push({ sql: s, params }); return [[{ count: 0, unmapped: 0 }]]; }
    return [[]];
  }
};
const dbPath = require.resolve('../config/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakePool };

// Column positions in the INSERT (source_type, source_id, ...COLUMNS).
const COLUMNS = ['reference_no', 'collection_date', 'shift_id', 'shift_no', 'shift_reference', 'cashier_name', 'employee_id',
  'employee_name', 'pos_company', 'company_id', 'pos_branch_id', 'pos_branch_name', 'department_id'];
const col = (row, name) => row.params[2 + COLUMNS.indexOf(name)];

// ---------------------------------------------------------------- mock POS
const BRANCHES = [{ id: 6, name: 'Cafe - M' }, { id: 1, name: 'MASActive' }, { id: 2, name: 'MASKreeda' }, { id: 3, name: 'MASAyathi' }];
const shift = (i, branch, closedAt) => ({
  shift_id: 300 + i, shift_no: `00${i}`, branch, cashier: { id: 1, name: 'Cashier' },
  opened_at: closedAt, closed_at: closedAt, completed_at: closedAt,
  cash: { declared: 100, actual: 100, counted: 100 }, card: { total: 0, count: 0, transactions: [] },
  online: { total: 0, count: 0, transactions: [] }, credit: { total: 0 },
  short_excess: { by_method: {}, total: 0, status: 'balanced' }, collection: 100
});

const stats = { logins: 0, dataCalls: [] };
let server;
const json = (res, status, payload) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)); };

test.before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      if (req.method === 'POST' && url.pathname === '/api/login') {
        stats.logins += 1;
        const { username, password } = JSON.parse(body || '{}');
        if (username !== 'finance' || password !== 'fin-pass') return json(res, 401, { message: 'Invalid credentials' });
        return json(res, 200, { token: 'finance-token' });
      }
      if (req.headers.authorization !== 'Bearer finance-token') return json(res, 401, { message: 'Unauthenticated.' });
      stats.dataCalls.push({ path: url.pathname, query: Object.fromEntries(url.searchParams) });
      if (url.pathname === '/api/me') return json(res, 200, { user: { id: 3, name: 'finance', branch_ids: [] } });
      // Two pages of shifts from every branch; the last one closed late on the To date (Sri Lanka time).
      if (url.pathname.includes('completed-shifts')) {
        const page = Number(url.searchParams.get('page') || 1);
        const data = page === 1
          ? BRANCHES.map((b, i) => shift(i, b, '2026-10-01T03:00:00.000000Z'))
          : [shift(9, BRANCHES[1], '2026-10-30T18:00:00.000000Z')]; // 23:30 on 30 Oct in Colombo
        return json(res, 200, { data, meta: { current_page: page, last_page: 2 } });
      }
      if (url.pathname.includes('credit-payments')) {
        return json(res, 200, { data: [
          { id: 41, reference_no: 'CP-41', payment_date: '2026-10-03', payment_type: 'Cash', amount: '1500.00', branch: BRANCHES[1] },
          { id: 42, reference_no: 'CP-42', payment_date: '2026-10-04', payment_type: 'Card', amount: 2500, branch: BRANCHES[0] }
        ], meta: { current_page: 1, last_page: 1 } });
      }
      if (url.pathname.includes('employee-deductions')) {
        // Like the real POS: only "active" deductions unless status=all is asked for.
        const all = url.searchParams.get('status') === 'all';
        const data = [{ id: 7, date: '2026-10-05', employee_name: 'Kamal', employee_id: 'E1', shift_id: '300', amount: 500, status: 'deducted', branch: BRANCHES[0] },
          { id: 8, date: '2026-10-05', employee_name: 'Nimal', employee_id: 'E2', amount: 200, status: 'cancelled', branch: BRANCHES[0] }];
        return json(res, 200, { data: all ? data : [], meta: { current_page: 1, last_page: 1 } });
      }
      return json(res, 200, { data: [], meta: { current_page: 1, last_page: 1 } });
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  process.env.RAVON_POS_API_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.RAVON_POS_USERNAME = 'finance';
  process.env.RAVON_POS_PASSWORD = 'fin-pass';
  delete process.env.RAVON_POS_API_KEY;
});

test.after(() => new Promise((r) => server.close(r)));

test.beforeEach(() => {
  inserted.length = 0;
  listQueries.length = 0;
  stats.dataCalls.length = 0;
});

const controller = require('../controllers/collectionController');
const { dateWindow } = require('../services/collectionSyncService');

const fakeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};
// The Stock Management user belongs to Cafe - that must not matter.
const fakeReq = (role, query) => ({ user: { userId: 1, role, department_id: 7 }, query, body: {} });

test('date window: a From..To search covers the whole range, the To date and late completions', () => {
  const now = new Date('2026-11-20T06:00:00Z');
  assert.deepEqual(dateWindow(now, { fromDate: '2026-10-01', toDate: '2026-10-30' }),
    { start_date: '2026-09-30', end_date: '2026-11-13' });
  // never past today
  assert.deepEqual(dateWindow(new Date('2026-10-07T06:00:00Z'), { fromDate: '2026-10-01', toDate: '2026-10-30' }),
    { start_date: '2026-09-30', end_date: '2026-10-07' });
  // no range: recent default window
  assert.deepEqual(dateWindow(new Date('2026-10-07T06:00:00Z')), { start_date: '2026-09-30', end_date: '2026-10-07' });
});

for (const role of ['Accountant', 'Admin', 'Super Admin', 'QB']) {
  test(`${role}: Search pulls ALL departments for the range through the shared POS finance login`, async () => {
    const res = fakeRes();
    await controller.getPending(fakeReq(role, { refresh: '1', from_date: '2026-10-01', to_date: '2026-10-30' }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.sync.ok, true);
    assert.equal(res.body.viewOnly, role === 'QB');

    // One shared login for every user / request (it is cached).
    assert.equal(stats.logins, 1);

    // The range was sent to every POS endpoint; no branch / department filter; every page followed.
    const dataCalls = stats.dataCalls.filter((c) => c.path !== '/api/me');
    for (const call of dataCalls) {
      assert.equal(call.query.start_date, '2026-09-30');
      assert.ok(call.query.end_date >= '2026-10-07');
      for (const key of Object.keys(call.query)) assert.doesNotMatch(key, /branch|department/i);
    }
    assert.ok(dataCalls.some((c) => c.path.includes('completed-shifts') && c.query.page === '2'));

    // All four departments staged; MASActive is stored and mapped as MAS Intimo.
    const shifts = inserted.filter((r) => r.source_type === 'SHIFT');
    assert.equal(shifts.length, 5);
    assert.deepEqual([...new Set(shifts.map((r) => col(r, 'department_id')))].sort((a, b) => a - b), [7, 10, 12, 14]);
    assert.equal(shifts.some((r) => /MASActive/.test(col(r, 'pos_branch_name'))), false);
    assert.equal(shifts.filter((r) => col(r, 'pos_branch_name') === 'MAS Intimo').length, 2);
    // The late shift on the To date is dated 30 Oct (business time zone), i.e. inside the range.
    assert.ok(shifts.some((r) => col(r, 'collection_date') === '2026-10-30'));

    // The list is filtered inclusively on both dates in SQL.
    const list = listQueries[0];
    assert.match(list.sql, /c\.collection_date >= \?/);
    assert.match(list.sql, /c\.collection_date <= \?/);
    assert.ok(list.params.includes('2026-10-01') && list.params.includes('2026-10-30'));
  });
}

test('paging and the Completed / Rejected tabs never call the POS', async () => {
  await controller.getPending(fakeReq('Accountant', { page: '2', from_date: '2026-10-01', to_date: '2026-10-30' }), fakeRes());
  await controller.getCompleted(fakeReq('Accountant', { from_date: '2026-10-01', to_date: '2026-10-30' }), fakeRes());
  assert.equal(stats.dataCalls.length, 0);
});

test('GET /api/collections?status=pending&refresh=1 pulls like /pending', async () => {
  const res = fakeRes();
  await controller.listCollections(fakeReq('Admin', { status: 'pending', refresh: '1', from_date: '2026-10-01', to_date: '2026-10-30' }), res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.sync);
  assert.ok(stats.dataCalls.length > 0);
});

test('invalid ranges are refused before calling the POS', async () => {
  const reversed = fakeRes();
  await controller.getPending(fakeReq('Admin', { refresh: '1', from_date: '2026-10-30', to_date: '2026-10-01' }), reversed);
  assert.equal(reversed.statusCode, 400);
  const tooLong = fakeRes();
  await controller.getPending(fakeReq('Admin', { refresh: '1', from_date: '2024-01-01', to_date: '2026-10-01' }), tooLong);
  assert.equal(tooLong.statusCode, 400);
  assert.equal(stats.dataCalls.length, 0);
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
  // No "MAS Ayathi Brew Bar" department: reported, never guessed / created.
  assert.equal(match('MASBrew').ok, false);
  assert.equal(brew('MASAyathi').department.id, 10, 'MASAyathi keeps its own department');
  assert.equal(match('MASKreeda').department.id, 12);
});

test('Credit Payment and Employee Deduction records are retrieved (deductions of every status, cancelled ones skipped)', async () => {
  const res = fakeRes();
  await controller.getPending(fakeReq('Accountant', { refresh: '1', from_date: '2026-10-01', to_date: '2026-10-30' }), res);
  const bySource = (t) => inserted.filter((r) => r.source_type === t);
  assert.deepEqual(bySource('CREDIT_PAYMENT').map((r) => r.source_id), ['41', '42']);
  assert.deepEqual(bySource('EMPLOYEE_DEDUCTION').map((r) => r.source_id), ['7']);
  const deductionCall = stats.dataCalls.find((c) => c.path.includes('employee-deductions'));
  assert.equal(deductionCall.query.status, 'all');
  const sources = Object.fromEntries(res.body.sync.sources.map((s) => [s.source, s]));
  assert.equal(sources.CREDIT_PAYMENT.fetched, 2);
  assert.equal(sources.EMPLOYEE_DEDUCTION.fetched, 2);
  // The cancelled one is excluded (not a collection), not reported as unreadable.
  assert.equal(sources.EMPLOYEE_DEDUCTION.invalid, 0);
  assert.equal(sources.EMPLOYEE_DEDUCTION.excluded, 1);
  assert.match(sources.EMPLOYEE_DEDUCTION.excludedReasons[0].reason, /Deduction is cancel/i);
  // MASActive credit payment -> MAS Intimo department
  assert.equal(col(bySource('CREDIT_PAYMENT')[0], 'department_id'), 14);
});

test('Source filter: every spelling resolves to the stored source value and combines with the other filters', async () => {
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
    assert.equal(params[1], stored, input);
    assert.ok(params.includes(14) && params.includes('2026-10-01') && params.includes('2026-10-30') && params.includes('%CP-41%'));
  }
  const bad = fakeRes();
  await controller.listCollections(fakeReq('Accountant', { status: 'pending', source: 'gift voucher' }), bad);
  assert.equal(bad.statusCode, 400);
});
