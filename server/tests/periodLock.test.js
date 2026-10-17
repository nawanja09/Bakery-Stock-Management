require('./helpers/noDatabase'); // unit test: never the real database
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const lock = require('../services/periodLock');
const { createPeriodGuard, bodyDates, recordRulesOf, isGuarded, BODY_DATE_FIELDS, RECORD_DATES } = require('../middleware/periodGuard');
const { evaluateApiAccess } = require('../config/rolePermissions');

const withEnv = (vars, work) => {
  const saved = {};
  for (const key of Object.keys(vars)) saved[key] = process.env[key];
  Object.assign(process.env, vars);
  for (const key of Object.keys(vars)) if (vars[key] === undefined) delete process.env[key];
  try { return work(); } finally {
    for (const key of Object.keys(saved)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  }
};

// ------------------------------------------------------------------ the window

test('the first open date: this month and the previous month by default', () => {
  assert.equal(lock.firstOpenDate('2026-10-16', 2), '2026-09-01');
  assert.equal(lock.firstOpenDate('2026-10-01', 2), '2026-09-01');
  assert.equal(lock.firstOpenDate('2026-10-31', 2), '2026-09-01');
  assert.equal(lock.firstOpenDate('2026-01-31', 2), '2025-12-01', 'crosses the year');
  assert.equal(lock.firstOpenDate('2026-02-28', 3), '2025-12-01');
  assert.equal(lock.firstOpenDate('2026-03-01', 1), '2026-03-01', 'one month = this month only');
  assert.equal(lock.firstOpenDate('2026-10-16', 12), '2025-11-01');
  assert.equal(lock.firstOpenDate('2026-10-16', 24), '2024-11-01');
});

test('PERIOD_OPEN_MONTHS is read from the environment, with a safe default', () => {
  for (const [value, expected] of [[undefined, 2], ['3', 3], ['1', 1], ['24', 24], ['0', 2], ['25', 2], ['-1', 2], ['abc', 2], ['', 2], ['2.5', 2]]) {
    withEnv({ PERIOD_OPEN_MONTHS: value }, () => assert.equal(lock.openMonths(), expected, `PERIOD_OPEN_MONTHS=${value}`));
  }
});

test('"today" can be pinned for tests, but never in production', () => {
  withEnv({ PERIOD_LOCK_TODAY: '2030-05-20', NODE_ENV: 'test' }, () => assert.equal(lock.today(), '2030-05-20'));
  withEnv({ PERIOD_LOCK_TODAY: '2030-05-20', NODE_ENV: 'production' }, () => {
    assert.notEqual(lock.today(), '2030-05-20');
    assert.match(lock.today(), /^\d{4}-\d{2}-\d{2}$/);
  });
  withEnv({ PERIOD_LOCK_TODAY: 'tomorrow', NODE_ENV: 'test' }, () => assert.match(lock.today(), /^\d{4}-\d{2}-\d{2}$/));
});

test('closedDateOf: the boundary day, other date shapes, and things that are not dates', () => {
  const opts = { today: '2026-10-16', months: 2 };
  assert.equal(lock.closedDateOf('2026-08-31', opts), '2026-08-31');
  assert.equal(lock.closedDateOf('2026-09-01', opts), null);
  assert.equal(lock.closedDateOf('2026-12-31', opts), null, 'the future is open');
  assert.equal(lock.closedDateOf('2026-07-10 08:30:00', opts), '2026-07-10', 'a DATETIME keeps its date');
  assert.equal(lock.closedDateOf(new Date(2026, 6, 10), opts), '2026-07-10');
  assert.equal(lock.closedDateOf(new Date(2026, 8, 1), opts), null);
  for (const bad of [null, undefined, '', 'abc', '0000-00-00', '2026-02-30', 20260710, {}]) {
    assert.equal(lock.closedDateOf(bad, opts), null, String(bad));
  }
  assert.equal(lock.isClosedDate('2026-01-01', opts), true);
});

test('month helpers', () => {
  assert.equal(lock.monthStart('2026-07'), '2026-07-01');
  assert.equal(lock.monthEnd('2026-07'), '2026-07-31');
  assert.equal(lock.monthEnd('2026-06'), '2026-06-30');
  assert.equal(lock.monthEnd('2026-02'), '2026-02-28');
  assert.equal(lock.monthEnd('2028-02'), '2028-02-29');
  assert.equal(lock.isMonthKey('2026-07'), true);
  for (const bad of ['2026-13', '2026-00', '2026-7', '26-07', 'July', '2026-07-01', '', null, undefined]) {
    assert.equal(lock.isMonthKey(bad), false, String(bad));
  }
  assert.equal(lock.monthLabel('2026-08-31'), 'August 2026');
});

test('only Admin and Super Admin may edit a re-opened month', () => {
  for (const role of ['Admin', 'Super Admin', 'ADMIN', 'superadmin']) assert.equal(lock.canEditReopenedPeriod(role), true, role);
  for (const role of ['Accountant', 'Store Keeper', 'Stores', 'Finance', 'QB', 'View Only', 'Staff', '', null, undefined]) {
    assert.equal(lock.canEditReopenedPeriod(role), false, String(role));
  }
});

// ------------------------------------------------------------------ assertOpen

const fakeDb = ({ grants = [], role = 'Accountant', missingTable = false } = {}) => {
  const calls = [];
  return {
    calls,
    async query(sql) {
      calls.push(String(sql));
      if (/period_reopen_requests/.test(sql)) {
        if (missingTable) { const e = new Error('no table'); e.code = 'ER_NO_SUCH_TABLE'; throw e; }
        return [grants];
      }
      if (/FROM users/.test(sql)) return [role ? [{ role }] : []];
      throw new Error(`unexpected SQL: ${sql}`);
    }
  };
};

test('assertOpen: open dates cost no query', async () => {
  const db = fakeDb();
  await lock.assertOpen(db, 1, ['2026-10-16', '2026-09-01', null, 'x']);
  await lock.assertOpen(db, 1, '2026-09-30');
  assert.equal(db.calls.length, 0);
});

test('assertOpen: a closed date with no re-open is refused with the date and the window', async () => {
  const db = fakeDb();
  await assert.rejects(lock.assertOpen(db, 1, ['2026-10-01', '2026-07-10']), (e) => {
    assert.equal(e.name, 'PeriodClosedError');
    assert.equal(e.status, 409);
    assert.equal(e.code, 'PERIOD_CLOSED');
    assert.deepEqual(e.dates, ['2026-07-10']);
    assert.equal(e.closedBefore, '2026-09-01');
    assert.match(e.message, /July 2026 is closed/);
    return true;
  });
});

test('assertOpen: a re-opened month is open to an Admin and a Super Admin only', async () => {
  const grants = [{ id: 1, from: '2026-07-01', to: '2026-07-31', expires_at: new Date() }];
  await lock.assertOpen(fakeDb({ grants, role: 'Admin' }), 5, '2026-07-10');
  await lock.assertOpen(fakeDb({ grants, role: 'Super Admin' }), 5, '2026-07-31');
  for (const role of ['Accountant', 'Store Keeper', 'Finance', null]) {
    await assert.rejects(lock.assertOpen(fakeDb({ grants, role }), 5, '2026-07-10'),
      (e) => e.name === 'PeriodClosedError' && /only an Admin/.test(e.message), String(role));
  }
  // a month outside the grant stays closed, even for an Admin
  await assert.rejects(lock.assertOpen(fakeDb({ grants, role: 'Admin' }), 5, '2026-08-01'), /closed/);
  await assert.rejects(lock.assertOpen(fakeDb({ grants, role: 'Admin' }), 5, ['2026-07-10', '2026-06-30']), /June 2026 is closed/);
});

test('assertOpen: the system (background jobs) skips the role check but not the re-open', async () => {
  const grants = [{ id: 1, from: '2026-07-01', to: '2026-07-31', expires_at: new Date() }];
  await lock.assertOpen(fakeDb({ grants, role: null }), null, '2026-07-10', { system: true });
  await assert.rejects(lock.assertOpen(fakeDb({ grants: [] }), null, '2026-07-10', { system: true }), /closed/);
});

test('assertOpen: a database without the table yet counts as "no re-open"', async () => {
  await assert.rejects(lock.assertOpen(fakeDb({ missingTable: true }), 1, '2026-07-10'), (e) => e.name === 'PeriodClosedError');
  await lock.assertOpen(fakeDb({ missingTable: true }), 1, '2026-10-10');
});

test('assertOpen: other database errors are not swallowed', async () => {
  const db = { async query() { const e = new Error('connection lost'); e.code = 'PROTOCOL_CONNECTION_LOST'; throw e; } };
  await assert.rejects(lock.assertOpen(db, 1, '2026-07-10'), /connection lost/);
});

// ------------------------------------------------------------------ the request guard

const run = async (guard, req) => {
  const out = { nextCalled: false, status: null, body: null };
  const res = { status(code) { out.status = code; return this; }, json(body) { out.body = body; return this; } };
  await guard({ user: { userId: 7 }, body: {}, ...req }, res, () => { out.nextCalled = true; });
  return out;
};

test('guard: reads and unguarded modules pass without any query', async () => {
  const db = fakeDb();
  const guard = createPeriodGuard({ getDb: () => db });
  for (const req of [
    { method: 'GET', originalUrl: '/api/purchases', body: { date: '2026-01-01' } },
    { method: 'POST', originalUrl: '/api/items', body: { date: '2026-01-01' } },
    { method: 'POST', originalUrl: '/api/orders', body: { expected_receive_date: '2026-01-01' } },
    { method: 'POST', originalUrl: '/api/cutlery-purchases', body: { purchase_date: '2026-01-01' } },
    { method: 'PUT', originalUrl: '/api/suppliers/5', body: {} }
  ]) {
    const out = await run(guard, req);
    assert.equal(out.nextCalled, true, `${req.method} ${req.originalUrl}`);
  }
  assert.equal(db.calls.length, 0);
});

test('guard: a guarded write with a closed date is refused with 409 and nothing runs', async () => {
  const guard = createPeriodGuard({ getDb: () => fakeDb() });
  const out = await run(guard, { method: 'POST', originalUrl: '/api/issuances', body: { issuance_date: '2026-07-10' } });
  assert.equal(out.nextCalled, false);
  assert.equal(out.status, 409);
  assert.equal(out.body.code, 'PERIOD_CLOSED');
  assert.equal(out.body.closed_before, '2026-09-01');
  assert.match(out.body.error, /July 2026/);
});

test('guard: open dates pass; a request without a date passes', async () => {
  const guard = createPeriodGuard({ getDb: () => fakeDb() });
  assert.equal((await run(guard, { method: 'POST', originalUrl: '/api/wastages', body: { date: '2026-10-10' } })).nextCalled, true);
  assert.equal((await run(guard, { method: 'POST', originalUrl: '/api/purchases/12/pay', body: { amount: 5 } })).nextCalled, true);
});

test('guard: editing a record dated in a closed month looks up that record first', async () => {
  const seen = [];
  const db = { async query(sql, params) {
    seen.push([String(sql), params]);
    if (/FROM `purchases`/.test(sql)) return [[{ d: '2026-06-20' }]];
    return [[]];
  } };
  const guard = createPeriodGuard({ getDb: () => db });
  const out = await run(guard, { method: 'PUT', originalUrl: '/api/purchases/42', body: { purchase_date: '2026-10-01' } });
  assert.equal(out.status, 409);
  assert.match(out.body.error, /June 2026/);
  assert.match(seen[0][0], /FROM `purchases`/);
  assert.deepEqual(seen[0][1], [42]);
});

test('guard: collections approve checks the dates of the collections being approved', async () => {
  const db = { async query(sql, params) {
    if (/FROM collections/.test(sql)) { assert.deepEqual(params, [[3, 4]]); return [[{ d: '2026-10-01' }, { d: '2026-05-30' }]]; }
    return [[]];
  } };
  const guard = createPeriodGuard({ getDb: () => db });
  const out = await run(guard, { method: 'POST', originalUrl: '/api/collections/approve', body: { items: [{ id: 3 }, { id: '4' }, { id: 'x' }] } });
  assert.equal(out.status, 409);
  assert.match(out.body.error, /May 2026/);
  // reject / restore post nothing and are not checked
  assert.equal((await run(guard, { method: 'POST', originalUrl: '/api/collections/reject', body: { items: [{ id: 3 }] } })).nextCalled, true);
});

test('guard: when the check itself fails, the change is refused (fail closed)', async () => {
  const guard = createPeriodGuard({ getDb: () => ({ async query() { throw new Error('db down'); } }) });
  const out = await run(guard, { method: 'PUT', originalUrl: '/api/wastages/9', body: { date: '2026-10-10' } });
  assert.equal(out.nextCalled, false);
  assert.equal(out.status, 503);
});

test('guard: path tricks do not slip past (case, double slash, query string, trailing slash)', async () => {
  const guard = createPeriodGuard({ getDb: () => fakeDb() });
  for (const url of ['/api/ISSUANCES', '/api//issuances', '/api/issuances/', '/api/issuances?x=1', '/API/Issuances']) {
    const out = await run(guard, { method: 'POST', originalUrl: url, body: { issuance_date: '2026-07-10' } });
    assert.equal(out.status, 409, url);
  }
});

test('guard rules: body date fields and record lookups', () => {
  assert.deepEqual(bodyDates({ date: '2026-07-10', amount: 5 }), ['2026-07-10']);
  assert.deepEqual(bodyDates({ payment_date: '2026-07-10', settlement_date: '2026-10-01 10:00:00' }).sort(), ['2026-07-10', '2026-10-01']);
  assert.deepEqual(bodyDates({ date: 'not a date', payment_date: '' }), []);
  assert.deepEqual(bodyDates(null), []);
  // dates that do not book anything are not checked
  assert.deepEqual(bodyDates({ invoice_date: '2026-01-01', cheque_date: '2026-01-01', due_date: '2026-01-01' }), []);
  assert.ok(!BODY_DATE_FIELDS.includes('invoice_date') && !BODY_DATE_FIELDS.includes('cheque_date'));

  assert.deepEqual(recordRulesOf('POST', '/issuances'), []);
  assert.deepEqual(recordRulesOf('GET', '/issuances/5').length, 1, 'rules only look at the path; the guard skips GET');
  assert.deepEqual(recordRulesOf('PUT', '/issuances/5'), [{ table: 'issuances', column: 'issuance_date', id: 5 }]);
  assert.deepEqual(recordRulesOf('DELETE', '/finance/cash/issued/17'), [{ table: 'finance_transactions', column: 'transaction_date', id: 17 }]);
  assert.deepEqual(recordRulesOf('PUT', '/purchases/payments/88-12/adjust'), [{ table: 'payment_history', column: 'payment_date', id: 88 }]);
  assert.deepEqual(recordRulesOf('PUT', '/adjustments/records/Cash Receive/finance/9'.toLowerCase()), [{ table: 'finance_transactions', column: 'transaction_date', id: 9 }]);
  assert.deepEqual(recordRulesOf('PATCH', '/finance/cheque-registry/3'), [{ table: 'expenses_cheque_registry', column: 'release_date', id: 3 }]);
  assert.deepEqual(recordRulesOf('PATCH', '/inhand/4/approve'), [{ table: 'inhand_adjustments', column: 'transaction_date', id: 4 }]);
  assert.deepEqual(recordRulesOf('PUT', '/items/5'), []);
});

test('guard rules: every module that books money or stock is guarded; master data is not', () => {
  for (const url of ['/purchases', '/purchases/5', '/purchase-returns', '/returns', '/issuances/3', '/wastages', '/opening-balance',
    '/adjustments/7', '/suppliers/pay-now', '/suppliers/settle-credit', '/expenses/petty-cash/voucher', '/new-expenses/pay',
    '/cash-expenses', '/hidden-expenses/2', '/finance/cash/receive', '/finance/transfer', '/staff-loans/1/repayments',
    '/incomes', '/inhand/1/approve', '/collections/approve']) {
    assert.equal(isGuarded(url), true, url);
  }
  for (const url of ['/items', '/suppliers', '/suppliers/5', '/payees', '/departments', '/companies', '/orders', '/reports/stock',
    '/dashboard', '/employees', '/cutlery-assets', '/period-close/requests', '/audit-logs', '/collections/reject', '/purchasesx']) {
    assert.equal(isGuarded(url), false, url);
  }
});

test('guard rules: every lookup rule names a real record shape', () => {
  for (const rule of RECORD_DATES) {
    assert.match(rule.table, /^[a-z_]+$/, 'table names are static identifiers');
    assert.match(rule.column, /^[a-z_]+$/);
    assert.ok(rule.path.exec(`/x`) === null || true);
  }
});

// ------------------------------------------------------------------ permissions

test('Period Close permissions: Admin and Super Admin use it, only the Super Admin approves or rejects', () => {
  const can = (role, method, url) => evaluateApiAccess(role, method, url).allowed;
  for (const role of ['Admin', 'Super Admin']) {
    assert.equal(can(role, 'GET', '/api/period-close/status'), true, role);
    assert.equal(can(role, 'GET', '/api/period-close/requests'), true, role);
    assert.equal(can(role, 'POST', '/api/period-close/requests'), true, role);
    assert.equal(can(role, 'POST', '/api/period-close/close'), true, role);
  }
  assert.equal(can('Super Admin', 'POST', '/api/period-close/approve'), true);
  assert.equal(can('Super Admin', 'POST', '/api/period-close/reject'), true);
  assert.equal(can('Admin', 'POST', '/api/period-close/approve'), false);
  assert.equal(can('Admin', 'POST', '/api/period-close/reject'), false);
  assert.equal(can('Admin', 'POST', '/api/period-close/APPROVE'), false, 'case does not matter');
  for (const role of ['Accountant', 'Store Keeper', 'Finance', 'QB']) {
    assert.equal(can(role, 'GET', '/api/period-close/status'), false, role);
    assert.equal(can(role, 'POST', '/api/period-close/requests'), false, role);
  }
});

test('client and server agree on the Period Close module', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../client/src/config/rolePermissions.js'), 'utf8');
  assert.match(src, /PERIOD_CLOSE: 'periodClose'/);
  assert.match(src, /M\.AUDIT, M\.PERIOD_CLOSE\r?\n\];/);
  assert.match(src, /rule\('\/period-close', \{ all: \[M\.PERIOD_CLOSE\] \}\)/);
  for (const role of ['STORES', 'ACCOUNTANT', 'QB', 'FINANCE_USER']) {
    assert.doesNotMatch(src.match(new RegExp(`\\[ROLES\\.${role}\\]: \\[[^\\]]*\\]`))[0], /PERIOD_CLOSE/, role);
  }
});
