// Collection module tests that need no MySQL:
//   * collectionMapper: POS record -> collections row, postings per payment method
//   * integrationAuthService: POS sessions from typed logins against a local mock
//                       POS - token reuse, single-flight login, expired / invalid
//                       token (401 -> one retry), refused credentials, no env credentials.
// The approve / reject / ledger flow is exercised against a real database by
// the end-to-end script described in the project notes.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { mapPosRecord, extractRecords, postingsOf, toPaymentMethod, SOURCES } = require('../services/collectionMapper');

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------
// Shape verified against the live POS /api/completed-shifts/collection (transactions trimmed).
const liveShift = (over = {}) => ({
  shift_id: 211,
  shift_no: '0104',
  branch: { id: 6, name: 'Cafe - M' },
  cashier: { id: 2, name: 'Imasha' },
  opened_at: '2026-10-06T00:36:51.000000Z',
  closed_at: '2026-10-06T08:36:35.000000Z',
  completed_at: '2026-10-06T10:19:28.000000Z',
  cash: { declared: 44560, actual: 44560, counted: 44560 },
  card: { total: 32929, count: 33, transactions: [{ type: 'sale', amount: 710, payment_method: 'card' }] },
  online: { total: 12380, count: 2, transactions: [] },
  credit: { total: 5440 },
  short_excess: { by_method: { cash: -120, card: 0, credit: 0, online: 0, pickme: 0 }, total: -120, status: 'short' },
  collection: 95309,
  ...over
});

test('live shift record: nested amounts, shift reference 211-0104, branch kept for department mapping', () => {
  const raw = liveShift();
  const result = mapPosRecord(SOURCES.SHIFT, raw);
  assert.equal(result.ok, true, result.reason);
  const r = result.record;
  assert.equal(r.source_id, '211');
  assert.equal(r.shift_id, '211');
  assert.equal(r.shift_no, '0104');
  assert.equal(r.shift_reference, '211-0104');
  assert.equal(r.reference_no, '211-0104');
  assert.equal(r.pos_branch_id, '6');
  assert.equal(r.pos_branch_name, 'Cafe - M');
  assert.equal(r.pos_company, null); // a branch is a department, not a company
  assert.equal(r.cashier_name, 'Imasha');
  assert.equal(r.collection_date, '2026-10-06'); // closed_at in Asia/Colombo
  assert.deepEqual(
    [r.cash_amount, r.card_amount, r.bank_amount, r.ar_amount, r.short_excess_amount, r.total_amount, r.pos_total_amount],
    [44560, 32929, 12380, 5440, 120, 95309, 95309] // short 120 stored +; total = POS collection
  );
  assert.deepEqual(JSON.parse(r.raw_payload), raw);
  assert.deepEqual(postingsOf(r).map((p) => [p.method, p.amount]),
    [['CASH', 44560], ['CARD', 32929], ['BANK', 12380], ['AR', 5440], ['SHORT_EXCESS', 120]]);
});

test('live shift: cash.actual null falls back to cash.counted; excess stored negative', () => {
  const r = mapPosRecord(SOURCES.SHIFT, liveShift({
    shift_id: 205, shift_no: '0101',
    cash: { declared: 24244, actual: null, counted: 24244 },
    card: { total: 28960 }, online: { total: 0 }, credit: { total: 66 },
    short_excess: { total: 332, status: 'excess' }, collection: 53270
  })).record;
  assert.equal(r.cash_amount, 24244);
  assert.equal(r.short_excess_amount, -332);
  assert.equal(r.total_amount, 53270);
  assert.equal(r.shift_reference, '205-0101');
});

test('short/excess without a status: POS sign (negative = short) is used', () => {
  const short = mapPosRecord(SOURCES.SHIFT, liveShift({ short_excess: { total: -750 } })).record;
  assert.equal(short.short_excess_amount, 750);
  const excess = mapPosRecord(SOURCES.SHIFT, liveShift({ short_excess: { total: 90 } })).record;
  assert.equal(excess.short_excess_amount, -90);
});

test('a shift without shift_no is refused (shift reference must combine both)', () => {
  const raw = liveShift();
  delete raw.shift_no;
  const result = mapPosRecord(SOURCES.SHIFT, raw);
  assert.equal(result.ok, false);
  assert.match(result.reason, /No shift number/);
});

test('UTC timestamps are dated in Sri Lanka time', () => {
  const late = mapPosRecord(SOURCES.SHIFT, liveShift({ closed_at: '2026-10-06T20:10:00.000000Z' })).record;
  assert.equal(late.collection_date, '2026-10-07');
});

test('separate short / excess fields become one signed amount (+ short, - excess)', () => {
  const excess = mapPosRecord(SOURCES.SHIFT, { id: 1, shift_no: '1', date: '2026-10-06', cash: 100, excess_amount: 40 });
  assert.equal(excess.record.short_excess_amount, -40);
  const short = mapPosRecord(SOURCES.SHIFT, { id: 2, shift_no: '2', date: '2026-10-06', cash: 100, short_amount: 25 });
  assert.equal(short.record.short_excess_amount, 25);
});

// ---------------------------------------------------------------------------
// POS branch -> existing department
// ---------------------------------------------------------------------------
const { createDepartmentMatcher, branchCandidates } = require('../services/departmentMapper');
const DEPARTMENTS = [
  { id: 1, name: 'Cake' }, { id: 2, name: 'Bakery' }, { id: 3, name: 'Pastry' }, { id: 4, name: 'Restaurant' },
  { id: 5, name: 'Savory' }, { id: 7, name: 'Cafe' }, { id: 8, name: 'Juice Bar' }, { id: 11, name: 'MAS Ayathi brew bar' }
];

test('branch "<Department> - <code>" maps to the existing department', () => {
  const match = createDepartmentMatcher(DEPARTMENTS, new Map());
  for (const [branch, id] of [['Cafe - M', 7], ['Bakery - M', 2], ['Cake - M', 1], ['Pastry - M', 3],
    ['Restaurant - M', 4], ['cafe-m', undefined], ['Juice Bar - KD', 8], ['CAFE – M', 7], ['Cafe (M)', 7], ['Cafe', 7]]) {
    const result = match(branch);
    if (id === undefined) assert.equal(result.ok, false, branch);
    else assert.equal(result.ok && result.department.id, id, branch);
  }
  assert.deepEqual(branchCandidates('Cafe - M'), ['Cafe - M', 'Cafe']);
});

test('no matching department -> clear error, never a guess', () => {
  const match = createDepartmentMatcher(DEPARTMENTS, new Map());
  const result = match('Savoury - M'); // DB spells it "Savory"
  assert.equal(result.ok, false);
  assert.match(result.reason, /No department matches branch "Savoury - M"/);
  assert.equal(match('').ok, false);
  assert.equal(match(null).ok, false);
});

test('configured alias handles spelling differences; alias to a missing department is an error', () => {
  const { parseAliases } = require('../services/departmentMapper');
  const match = createDepartmentMatcher(DEPARTMENTS, parseAliases('{"Savoury": "Savory", "Kitchen - M": "Nope"}'));
  assert.equal(match('Savoury - M').department.id, 5);
  assert.equal(match('Kitchen - M').ok, false);
});

test('ambiguous department names are refused', () => {
  const match = createDepartmentMatcher([{ id: 1, name: 'Cafe' }, { id: 2, name: 'CAFE' }], new Map());
  assert.match(match('Cafe - M').reason, /more than one department/);
});

test('credit payment: payment type decides the method; unknown types are refused', () => {
  const bank = mapPosRecord(SOURCES.CREDIT_PAYMENT, {
    id: 9, reference_no: 'CR-9', payment_date: '2026-10-05', payment_type: 'Bank Transfer', amount: '2500.00', account_no: '0000456783'
  });
  assert.equal(bank.ok, true);
  assert.equal(bank.record.bank_amount, 2500);
  assert.equal(bank.record.cash_amount, 0);
  assert.equal(bank.record.pos_bank_account, '0000456783');
  assert.deepEqual(postingsOf(bank.record), [{ method: 'BANK', amount: 2500 }]);

  const unknown = mapPosRecord(SOURCES.CREDIT_PAYMENT, { id: 10, date: '2026-10-05', payment_type: 'Gift voucher', amount: 5 });
  assert.equal(unknown.ok, false);
  assert.match(unknown.reason, /Unknown payment type/);

  assert.equal(toPaymentMethod('Cash'), 'CASH');
  assert.equal(toPaymentMethod('VISA'), 'CARD');
  assert.equal(toPaymentMethod('Credit Card'), 'CARD');
  assert.equal(toPaymentMethod('Online'), 'BANK');
  assert.equal(toPaymentMethod('AR'), 'AR');
  assert.equal(toPaymentMethod('credit'), 'AR');
});

test('employee deduction posts one Short/Excess CREDIT (negative signed amount)', () => {
  const ded = mapPosRecord(SOURCES.EMPLOYEE_DEDUCTION, {
    id: 5, date: '2026-10-07', employee_name: 'Kamal', employee_id: 'E12', shift_id: '77', amount: '500'
  });
  assert.equal(ded.ok, true);
  assert.equal(ded.record.deduction_amount, 500);
  assert.equal(ded.record.shift_id, '77');
  assert.deepEqual(postingsOf({ ...ded.record }), [{ method: 'SHORT_EXCESS', amount: -500 }]);
});

test('live credit payment: date_time (UTC) is the date; method columns, not the label, split the amount', () => {
  // Field names exactly as /api/credit-payments/collection returns them (values made up).
  const live = (over) => ({
    id: 501, reference_no: 'CP-501', date_time: '2026-10-07T20:15:10.000000Z',
    customer: { id: 3, name: 'Test Customer', bucket: null }, branch: { id: null, name: null },
    received_by: 'cashier1', payment_method: 'Cash', cash: 1000, card: 0, bank_transfer: 0, setoff: 0,
    amount: 1000, collection: 1000, allocations: [{ type: 'sale', sale_id: 9, opening_balance_id: null, bill: 'B-9', amount: 1000 }],
    allocated: 1000, unallocated: 0, notes: null, ...over
  });

  const cash = mapPosRecord(SOURCES.CREDIT_PAYMENT, live());
  assert.equal(cash.ok, true, cash.reason);
  assert.equal(cash.record.collection_date, '2026-10-08', '20:15 UTC is the next day in Sri Lanka');
  assert.equal(cash.record.reference_no, 'CP-501');
  assert.equal(cash.record.cashier_name, 'Test Customer');
  assert.equal(cash.record.pos_branch_name, null);
  assert.deepEqual(postingsOf(cash.record), [{ method: 'CASH', amount: 1000 }]);
  assert.equal(cash.record.total_amount, cash.record.pos_total_amount);

  // Labelled "Bank Transfer" but part paid in cash.
  const split = mapPosRecord(SOURCES.CREDIT_PAYMENT, live({ payment_method: 'Bank Transfer', cash: 200, bank_transfer: 800 }));
  assert.deepEqual(postingsOf(split.record), [{ method: 'CASH', amount: 200 }, { method: 'BANK', amount: 800 }]);
  assert.equal(split.record.total_amount, 1000);

  // Set-off part is not money received: only the cash is booked (= POS collection).
  const mixed = mapPosRecord(SOURCES.CREDIT_PAYMENT, live({ payment_method: 'Cash + Overpayment Setoff', cash: 600, setoff: 400, amount: 1000, collection: 600 }));
  assert.deepEqual(postingsOf(mixed.record), [{ method: 'CASH', amount: 600 }]);
  assert.equal(mixed.record.total_amount, mixed.record.pos_total_amount);

  const setoff = mapPosRecord(SOURCES.CREDIT_PAYMENT, live({ payment_method: 'Overpayment Setoff', cash: 0, setoff: 1000, collection: 0 }));
  assert.equal(setoff.ok, false);
  assert.equal(setoff.excluded, true, 'a set-off is excluded, not an unreadable record');
  assert.match(setoff.reason, /Overpayment set-off - no new money received/);
});

test('live employee deduction: nested employee + source.shift_id (links the deduction to its shift)', () => {
  // Field names exactly as /api/employee-deductions returns them (values made up).
  const ded = mapPosRecord(SOURCES.EMPLOYEE_DEDUCTION, {
    id: 31, deduction_date: '2026-09-25', employee: { id: 14, name: 'Test Employee' },
    source_type: 'shift', source_label: 'Shift 0042', source: { shift_id: 211, shift_no: '0042', branch: 'Cafe - M' },
    reason: 'Cash shortage', shortage: 750, offset: 0, amount: 750, offsets: [], status: 'active',
    created_by: 'finance', created_at: '2026-09-25T10:05:05.000000Z', voided_by: null, voided_at: null
  });
  assert.equal(ded.ok, true, ded.reason);
  assert.equal(ded.record.collection_date, '2026-09-25');
  assert.equal(ded.record.employee_id, '14');
  assert.equal(ded.record.employee_name, 'Test Employee');
  assert.equal(ded.record.shift_id, '211');
  assert.equal(ded.record.deduction_amount, 750);
  // The branch is not used for deductions (department matching unchanged).
  assert.equal(ded.record.pos_branch_name, null);

  const voided = mapPosRecord(SOURCES.EMPLOYEE_DEDUCTION, {
    id: 32, deduction_date: '2026-09-25', employee: { id: 14, name: 'Test Employee' }, amount: 100, status: 'voided'
  });
  assert.equal(voided.ok, false);
  assert.equal(voided.excluded, true);
});

test('records that cannot be understood are reported with their real field names, never guessed', () => {
  const noId = mapPosRecord(SOURCES.SHIFT, { foo: 1, date: '2026-10-06', cash: 5 });
  assert.equal(noId.ok, false);
  assert.match(noId.reason, /No unique id/);
  assert.deepEqual(noId.fields, ['foo', 'date', 'cash']);

  const noDate = mapPosRecord(SOURCES.SHIFT, { id: 1, cash: 5 });
  assert.match(noDate.reason, /date/);

  const noAmounts = mapPosRecord(SOURCES.SHIFT, { id: 1, date: '2026-10-06' });
  assert.match(noAmounts.reason, /No cash/);

  const badNumber = mapPosRecord(SOURCES.SHIFT, { id: 1, date: '2026-10-06', cash: 'abc' });
  assert.match(badNumber.reason, /not a valid number/);
});

test('record lists are found in the usual envelopes', () => {
  assert.equal(extractRecords([{ id: 1 }]).length, 1);
  assert.equal(extractRecords({ data: [{ id: 1 }, { id: 2 }] }).length, 2);
  assert.equal(extractRecords({ success: true, data: { current_page: 1, data: [{ id: 1 }] } }).length, 1);
  assert.equal(extractRecords({ message: 'nothing' }), null);
});

// ---------------------------------------------------------------------------
// POS authentication against a local mock POS
// ---------------------------------------------------------------------------
const startMockPos = (handler) => new Promise((resolve) => {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => handler(req, res, body));
  });
  server.listen(0, '127.0.0.1', () => resolve(server));
});

const json = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

const UNAUTH = { error: true, message: 'Unauthenticated.', status: 401 };

// No credentials in the environment, ever. A token only comes from a typed login
// (loginAll at the BSMS login, or connect()); nothing is persisted in these tests.
process.env.POS_SESSION_PERSIST = '0';
for (const name of ['RAVON_POS_USERNAME', 'RAVON_POS_PASSWORD', 'RAVON_POS_API_KEY', 'POS_USERNAME', 'POS_PASSWORD']) delete process.env[name];
delete process.env.RAVON_RESTAURANT_API_URL; // POS-only here

const auth = require('../services/integrationAuthService');
const pos = require('../services/posAuthService');

const setupPos = async (options = {}) => {
  const stats = { logins: 0, dataCalls: 0, tokensSeen: [] };
  const valid = new Set();
  const server = await startMockPos((req, res, body) => {
    if (req.method === 'POST' && req.url === '/api/login') {
      stats.logins += 1;
      const { username, password } = JSON.parse(body || '{}');
      if (username !== 'finance' || password !== 'fin-pass') return json(res, 401, { message: 'Invalid credentials' });
      const token = `tok-${stats.logins}`;
      valid.add(token);
      return json(res, 200, { status: true, data: { token, expires_in: options.expiresIn } });
    }
    if (req.url === '/api/me') return json(res, 200, { user: { id: 1, name: 'finance', branch_ids: [] } });
    stats.dataCalls += 1;
    const header = req.headers.authorization || '';
    stats.tokensSeen.push(header);
    if (!valid.has(header.replace(/^Bearer /, ''))) return json(res, 401, UNAUTH);
    return json(res, 200, { data: [{ id: 1 }] });
  });
  process.env.RAVON_POS_API_URL = `http://127.0.0.1:${server.address().port}`;
  auth.resetAuthState();
  return {
    stats, server,
    // User 11's OWN login (an Accountant whose POS account is 'finance').
    financeLogin: () => auth.loginAll({ userId: 11, role: 'Accountant', username: 'finance', password: 'fin-pass' }),
    expireServerTokens: () => valid.clear(),
    close: () => new Promise((r) => server.close(r))
  };
};

test('a user\'s own login gives the token; their later calls reuse it (no background login)', async () => {
  const mock = await setupPos();
  try {
    await assert.rejects(pos.posGet('/api/employee-deductions', null, { userId: 11 }), { code: 'POS_NOT_CONNECTED' });
    assert.equal(mock.stats.logins, 0, 'nothing logs in by itself');
    const result = await mock.financeLogin();
    assert.equal(result.pos.ok, true);
    await pos.posGet('/api/completed-shifts/collection', null, { userId: 11 });
    await pos.posGet('/api/credit-payments/collection', null, { userId: 11 });
    await pos.posGet('/api/employee-deductions', null, { userId: 11 });
    assert.equal(mock.stats.logins, 1);
    assert.deepEqual(mock.stats.tokensSeen, ['Bearer tok-1', 'Bearer tok-1', 'Bearer tok-1']);
  } finally { await mock.close(); }
});

test('concurrent logins with the same typed credentials share ONE request (5 logins/minute limit)', async () => {
  const mock = await setupPos();
  try {
    await Promise.all(Array.from({ length: 6 }, () => mock.financeLogin()));
    assert.equal(mock.stats.logins, 1);
    await Promise.all(Array.from({ length: 8 }, () => pos.posGet('/api/employee-deductions', null, { userId: 11 })));
    assert.equal(mock.stats.logins, 1);
  } finally { await mock.close(); }
});

test('401 Unauthenticated -> the user\'s token is invalidated, a clear "log in" error, no other session used', async () => {
  const mock = await setupPos();
  try {
    await mock.financeLogin();
    await auth.loginAll({ userId: 8, role: 'Accountant', username: 'finance', password: 'fin-pass' });
    assert.equal(mock.stats.logins, 2);
    mock.expireServerTokens();
    await assert.rejects(pos.posGet('/api/employee-deductions', null, { userId: 8 }),
      (e) => e.code === 'POS_NOT_CONNECTED' && /Log in again with your own RAVON POS account/.test(e.message));
    assert.equal(mock.stats.dataCalls, 1, 'only the user\'s own token is tried');
    assert.deepEqual(mock.stats.tokensSeen, ['Bearer tok-2']);
    assert.equal(mock.stats.logins, 2, 'no password is stored, so there is no automatic re-login');
    assert.equal(auth.getAuthStatus('pos', { userId: 8 }).state, 'expired');
  } finally { await mock.close(); }
});

test('another user\'s session is never used (no shared Finance session)', async () => {
  const mock = await setupPos();
  try {
    await auth.loginAll({ userId: 8, role: 'Accountant', username: 'finance', password: 'fin-pass' });
    assert.equal(auth.getAuthStatus('pos', { userId: 8 }).source, 'own');
    await assert.rejects(pos.posGet('/api/employee-deductions', null, { userId: 11 }), { code: 'POS_NOT_CONNECTED' });
    await assert.rejects(pos.posGet('/api/employee-deductions'), { code: 'POS_NOT_CONNECTED' });
    assert.deepEqual(mock.stats.tokensSeen, []);
  } finally { await mock.close(); }
});

test('a token the login says expires (inside the safety margin) is not used', async () => {
  const mock = await setupPos({ expiresIn: 30 });
  try {
    await mock.financeLogin();
    await assert.rejects(pos.posGet('/api/employee-deductions', null, { userId: 11 }), { code: 'POS_NOT_CONNECTED' });
    assert.equal(mock.stats.dataCalls, 0);
  } finally { await mock.close(); }
});

test('refused credentials -> clear error, cool-down, no login storm', async () => {
  const mock = await setupPos();
  try {
    const first = await auth.loginAll({ userId: 11, role: 'Finance', username: 'finance', password: 'wrong' });
    assert.equal(first.pos.ok, false);
    assert.equal(first.pos.code, 'POS_CREDENTIALS_INVALID');
    assert.doesNotMatch(JSON.stringify(first), /wrong/);
    await auth.loginAll({ userId: 11, role: 'Finance', username: 'finance', password: 'wrong' });
    assert.equal(mock.stats.logins, 1, 'second attempt answered from the cool-down');
  } finally { await mock.close(); }
});

test('login rate limit: at most RAVON_LOGIN_MAX_PER_MINUTE login requests per minute per system (default 30)', async () => {
  let mock = await setupPos();
  try {
    // Every BSMS user logs in from this server: 7 different users all go through.
    for (let i = 0; i < 7; i += 1) {
      await auth.loginAll({ userId: 100 + i, role: 'Admin', username: `user${i}`, password: 'x' });
    }
    assert.equal(mock.stats.logins, 7);
  } finally { await mock.close(); }
  process.env.RAVON_LOGIN_MAX_PER_MINUTE = '4';
  mock = await setupPos();
  try {
    for (let i = 0; i < 7; i += 1) {
      await auth.loginAll({ userId: 200 + i, role: 'Admin', username: `other${i}`, password: 'x' });
    }
    assert.equal(mock.stats.logins, 4);
  } finally {
    delete process.env.RAVON_LOGIN_MAX_PER_MINUTE;
    await mock.close();
  }
});

test('not configured is reported without any network call; status never exposes the token', async () => {
  const mock = await setupPos();
  await mock.financeLogin();
  const status = auth.getAuthStatus('pos', { userId: 11 });
  assert.equal(status.connected, true);
  assert.equal(status.username, 'finance');
  assert.doesNotMatch(JSON.stringify(status), /tok-1|fin-pass/);
  await mock.close();
  delete process.env.RAVON_POS_API_URL;
  await assert.rejects(pos.posGet('/api/employee-deductions', null, { userId: 11 }), { name: 'PosConfigError', code: 'POS_NOT_CONFIGURED' });
  assert.equal(auth.getAuthStatus('pos').configured, false);
});

test('login token is found in the common response shapes', () => {
  const { extractToken } = require('../services/posAuthService');
  assert.equal(extractToken({ token: 'a' }), 'a');
  assert.equal(extractToken({ access_token: 'b', token_type: 'Bearer' }), 'b');
  assert.equal(extractToken({ data: { token: 'c' } }), 'c');
  assert.equal(extractToken({ authorisation: { token: 'd' } }), 'd');
  assert.equal(extractToken({ token: { plainTextToken: 'e' } }), 'e');
  assert.equal(extractToken({ data: { access_token: 'f', expires_in: 3600 } }), 'f');
  assert.equal(extractToken({ message: 'ok' }), null);
  const { extractExpiry } = require('../services/posAuthService');
  assert.equal(extractExpiry({ expires_in: 60 }, 1000), 61000);
  assert.equal(extractExpiry({ data: { expires_at: '2026-10-10T00:00:00Z' } }), Date.parse('2026-10-10T00:00:00Z'));
  assert.equal(extractExpiry({ token: 'x' }), null);
});

test('scrub() removes Bearer values, live tokens and given secrets', async () => {
  const mock = await setupPos();
  try {
    await mock.financeLogin();
    const text = auth.scrub('failed with Authorization: Bearer abc.def and tok-1 and pw fin-pass', ['fin-pass']);
    assert.doesNotMatch(text, /abc\.def|tok-1|fin-pass/);
  } finally { await mock.close(); }
});

test('credential variables in the environment are ignored (no service login, no static key)', async () => {
  const mock = await setupPos();
  Object.assign(process.env, { RAVON_POS_USERNAME: 'finance', RAVON_POS_PASSWORD: 'fin-pass', RAVON_POS_API_KEY: 'tok-1', POS_USERNAME: 'finance', POS_PASSWORD: 'fin-pass' });
  try {
    await assert.rejects(pos.posGet('/api/employee-deductions'), { code: 'POS_NOT_CONNECTED' });
    assert.equal(mock.stats.logins, 0);
    assert.equal(mock.stats.dataCalls, 0);
  } finally {
    for (const name of ['RAVON_POS_USERNAME', 'RAVON_POS_PASSWORD', 'RAVON_POS_API_KEY', 'POS_USERNAME', 'POS_PASSWORD']) delete process.env[name];
    await mock.close();
  }
});

test('no source code file contains a POS / Restaurant credential variable or fallback', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const files = ['services', 'controllers', 'routes', 'config', 'scripts', 'middleware']
    .flatMap((dir) => fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.js')).map((f) => path.join(root, dir, f)));
  for (const file of [...files, path.join(root, 'server.js'), path.join(root, '.env.example'), path.join(root, '.env')]) {
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    const assigned = src.match(/^\s*(RAVON_POS_USERNAME|RAVON_POS_PASSWORD|RAVON_POS_API_KEY|POS_USERNAME|POS_PASSWORD)\s*=/m);
    assert.equal(assigned, null, `${path.basename(file)} sets ${assigned && assigned[1]}`);
    assert.doesNotMatch(src, /process\.env\.(RAVON_POS_USERNAME|RAVON_POS_PASSWORD|RAVON_POS_API_KEY|POS_USERNAME|POS_PASSWORD)\b/, path.basename(file));
  }
});

// ---------------------------------------------------------------------------
// Collection role access (backend rule, independent of the UI)
// ---------------------------------------------------------------------------
test('Collection API: Accountant full; Admin / Super Admin all but approve; QB view only; Finance and everyone else 403', () => {
  const { evaluateApiAccess, canApproveCollections } = require('../config/rolePermissions');
  const reads = ['/api/collections/pending', '/api/collections/completed', '/api/collections/rejected', '/api/collections/12'];
  const writes = ['/api/collections/approve', '/api/collections/reject', '/api/collections/restore'];
  const can = (role, method, url) => evaluateApiAccess(role, method, url).allowed;

  for (const url of reads) assert.equal(can('Accountant', 'GET', url), true, `Accountant GET ${url}`);
  for (const url of writes) assert.equal(can('Accountant', 'POST', url), true, `Accountant POST ${url}`);
  // Approving posts to the ledgers: Accountant only, whatever the URL case.
  for (const role of ['Admin', 'Super Admin', 'SuperAdmin']) {
    for (const url of reads) assert.equal(can(role, 'GET', url), true, `${role} GET ${url}`);
    assert.equal(can(role, 'POST', '/api/collections/reject'), true, `${role} reject`);
    assert.equal(can(role, 'POST', '/api/collections/restore'), true, `${role} restore`);
    for (const url of ['/api/collections/approve', '/api/Collections/APPROVE', '/api/collections/approve/']) {
      assert.equal(can(role, 'POST', url), false, `${role} POST ${url}`);
    }
  }
  assert.equal(canApproveCollections('Accountant'), true);
  for (const role of ['Admin', 'Super Admin', 'Finance', 'QB', 'Store Keeper', null]) {
    assert.equal(canApproveCollections(role), false, String(role));
  }
  for (const role of ['View Only', 'QB']) {
    for (const url of reads) assert.equal(can(role, 'GET', url), true, `${role} GET ${url}`);
    for (const url of writes) {
      const result = evaluateApiAccess(role, 'POST', url);
      assert.equal(result.allowed, false, `${role} POST ${url}`);
      assert.equal(result.reason, 'view-only');
    }
  }
  for (const role of ['Finance', 'Store Keeper', 'Staff', 'Manager', 'User', null]) {
    for (const url of reads) assert.equal(can(role, 'GET', url), false, `${role} GET ${url}`);
    for (const url of writes) assert.equal(can(role, 'POST', url), false, `${role} POST ${url}`);
  }
});

test('client and server role tables agree on Collection', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '../../client/src/config/rolePermissions.js'), 'utf8');
  assert.match(src, /COLLECTION: 'collection'/);
  assert.match(src, /\[ROLES\.ACCOUNTANT\]: \[[^\]]*M\.COLLECTION\]/);
  assert.match(src, /\[ROLES\.QB\]: \[[^\]]*M\.COLLECTION\]/);
  assert.doesNotMatch(src.match(/\[ROLES\.FINANCE_USER\]: \[[^\]]*\]/)[0], /COLLECTION/);
  assert.match(src, /COLLECTION_APPROVER_ROLES = Object\.freeze\(\[ROLES\.ACCOUNTANT\]\)/);
  assert.doesNotMatch(src.match(/\[ROLES\.STORES\]: \[[^\]]*\]/)[0], /COLLECTION/);
  assert.match(src, /rule\('\/collection', \{ all: \[M\.COLLECTION\] \}\)/);
});

test('POS / Restaurant integration endpoints: status + connect for Accountant / Admin, never Stores or Finance; QB cannot POST', () => {
  const { evaluateApiAccess } = require('../config/rolePermissions');
  const can = (role, method, url) => evaluateApiAccess(role, method, url).allowed;
  for (const role of ['Accountant', 'Admin', 'Super Admin']) {
    assert.equal(can(role, 'GET', '/api/collections/integrations/status'), true, role);
    assert.equal(can(role, 'POST', '/api/collections/integrations/restaurant/connect'), true, role);
  }
  assert.equal(can('QB', 'GET', '/api/collections/integrations/status'), true);
  assert.equal(evaluateApiAccess('QB', 'POST', '/api/collections/integrations/pos/connect').reason, 'view-only');
  assert.equal(can('Store Keeper', 'GET', '/api/collections/integrations/status'), false);
  assert.equal(can('Store Keeper', 'POST', '/api/collections/integrations/pos/connect'), false);
  // Finance has no Collection access at all.
  assert.equal(can('Finance', 'GET', '/api/collections/integrations/status'), false);
  assert.equal(can('Finance', 'POST', '/api/collections/integrations/pos/connect'), false);
  assert.equal(can('Finance', 'GET', '/api/collections/pending'), false);
});

// ---------------------------------------------------------------------------
// Data call error handling: meaningful messages, bounded retries
// ---------------------------------------------------------------------------
const posWithStatus = async (sequence) => {
  const stats = { logins: 0, dataCalls: 0 };
  const server = await startMockPos((req, res) => {
    if (req.url === '/api/login') { stats.logins += 1; return json(res, 200, { token: 'tok' }); }
    if (req.url === '/api/me') return json(res, 200, { user: { branch_ids: [] } });
    const step = sequence[Math.min(stats.dataCalls, sequence.length - 1)];
    stats.dataCalls += 1;
    if (step.headers) Object.entries(step.headers).forEach(([k, v]) => res.setHeader(k, v));
    return json(res, step.status, step.body ?? {});
  });
  process.env.RAVON_POS_API_URL = `http://127.0.0.1:${server.address().port}`;
  auth.resetAuthState();
  await auth.loginAll({ userId: 11, role: 'Accountant', username: 'finance', password: 'fin-pass' });
  return { auth: { posGet: (path, params = null) => pos.posGet(path, params, { userId: 11 }) }, stats, close: () => new Promise((r) => server.close(r)) };
};

test('POS 403 / 422 / 429 / 500 -> meaningful errors, no endless retries', async () => {
  const cases = [
    [{ status: 403, body: { message: 'Forbidden' } }, /Your RAVON POS account is not allowed to read/, 1],
    [{ status: 422, body: { message: 'The start date is invalid.' } }, /request parameters \(422: The start date is invalid\.\)/, 1],
    [{ status: 429, headers: { 'Retry-After': '30' } }, /rate limit .* in 30 seconds/, 1],
    [{ status: 500, body: { message: 'Server Error' } }, /RAVON POS server had an error \(500\)/, 1]
  ];
  for (const [step, pattern, calls] of cases) {
    const mock = await posWithStatus([step]);
    try {
      await assert.rejects(mock.auth.posGet('/api/completed-shifts/collection'), (e) => e.name === 'PosResponseError' && pattern.test(e.message));
      assert.equal(mock.stats.dataCalls, calls, `status ${step.status}`);
    } finally { await mock.close(); }
  }
});

test('POS 503 is retried once, then succeeds; a second 503 is reported', async () => {
  const ok = await posWithStatus([{ status: 503 }, { status: 200, body: { data: [] } }]);
  try {
    assert.deepEqual(await ok.auth.posGet('/api/employee-deductions'), { data: [] });
    assert.equal(ok.stats.dataCalls, 2);
  } finally { await ok.close(); }
  const bad = await posWithStatus([{ status: 503 }]);
  try {
    await assert.rejects(bad.auth.posGet('/api/employee-deductions'), /server had an error \(503\)/);
    assert.equal(bad.stats.dataCalls, 2);
  } finally { await bad.close(); }
});

test('POS network failure -> PosUnavailableError after one retry; login unreachable -> POS_AUTH_UNAVAILABLE', async () => {
  const mock = await posWithStatus([{ status: 200, body: { data: [] } }]);
  await mock.close();
  await assert.rejects(mock.auth.posGet('/api/employee-deductions'), { name: 'PosUnavailableError' });
  auth.resetAuthState();
  const result = await auth.loginAll({ userId: 11, role: 'Finance', username: 'finance', password: 'fin-pass' });
  assert.equal(result.pos.code, 'POS_AUTH_UNAVAILABLE');
});
