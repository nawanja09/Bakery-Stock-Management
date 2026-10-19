// Period close (audit finding H7): only the last PERIOD_OPEN_MONTHS months are open;
// older months change only through a Super Admin-approved re-open, and only an Admin
// can post in a re-opened month. Also: balance_after of back-dated ledger rows.
//
// "Today" is pinned to 2026-10-16 by tests/db/useTestDatabase.js, so the open window is
// September + October 2026: 2026-09-01 is open, 2026-08-31 is closed.
//
// Drives the REAL routers, auth / RBAC / period guard, controllers and ledger helpers
// over HTTP on the MySQL TEST database (tests/db/useTestDatabase.js - never the real
// one). Every row the tests create is removed again in test.after().

require('./useTestDatabase');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const pool = require('../../config/db');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const authenticate = require('../../middleware/authenticate');
const authorizeApi = require('../../middleware/authorizeApi');
const periodGuard = require('../../middleware/periodGuard');
const periodLock = require('../../services/periodLock');
const { recordCashTransaction, recordBankTransaction, rebuildBalanceAfter, refreshBalancesOfReference } = require('../../utils/financeLedger');
const { getJwtSecret, JWT_SIGN_OPTIONS } = require('../../config/secrets');

const RUN = crypto.randomBytes(4).toString('hex');
const created = { users: [], companies: [], departments: [], items: [], hidden: [], issuances: [], adjustments: [], banks: [] };
const USERS = {};

let server;
let baseUrl;
let companyId;
let departmentId;
let itemId;

const one = async (sql, params = []) => (await pool.query(sql, params))[0][0];
const cents = (n) => Math.round(Number(n) * 100);

const call = async (method, path, body, who) => {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${USERS[who].token}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

const hidden = (expense_date, who = 'accountant') =>
  call('POST', '/hidden-expenses', { expense_date, amount: 100, type: 'PickMe', company_id: companyId }, who);

// An issue note booked directly in the database (so it can sit in a closed month).
const oldIssuance = async (date) => {
  const [r] = await pool.query(
    `INSERT INTO issuances (issuance_date, issued_by, department_id, received_by, remarks, approved_by)
     VALUES (?, ?, ?, 'Chef', 'old', 'x')`, [`${date} 08:00:00`, USERS.stores.id, departmentId]);
  await pool.query('INSERT INTO issuance_items (issuance_id, item_id, quantity) VALUES (?, ?, 1)', [r.insertId, itemId]);
  created.issuances.push(r.insertId);
  return r.insertId;
};

const issuanceBody = (date) => ({
  issuance_date: date, issuance_time: '09:00', department_id: departmentId, received_by: 'Chef',
  remarks: 'Morning', items: [{ item_id: itemId, quantity: 1 }]
});

const requestReopen = (from = '2026-07', to = from, who = 'admin') =>
  call('POST', '/period-close/requests', { from_month: from, to_month: to, reason: 'Late supplier invoice found for July' }, who);

const reopen = async (from = '2026-07', to = from, hours = 2) => {
  const request = await requestReopen(from, to);
  assert.equal(request.status, 201, JSON.stringify(request.body));
  const approved = await call('POST', '/period-close/approve', { id: request.body.request.id, hours }, 'superAdmin');
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  return request.body.request.id;
};

test.before(async () => {
  await pool.financeSchemaReady;
  await pool.periodLockSchemaReady;
  await pool.stockAdjustmentSchemaReady;

  const hash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 4);
  for (const [key, role] of [['stores', 'Store Keeper'], ['accountant', 'Accountant'], ['admin', 'Admin'], ['superAdmin', 'Super Admin']]) {
    const [u] = await pool.query(
      'INSERT INTO users (name, username, password, role, status) VALUES (?, ?, ?, ?, 1)',
      [`${role} ${RUN}`, `${key}-pc-${RUN}`, hash, role]);
    created.users.push(u.insertId);
    USERS[key] = { id: u.insertId, token: jwt.sign({ userId: u.insertId, username: key, role, tv: 0 }, getJwtSecret(), JWT_SIGN_OPTIONS) };
  }
  const [c] = await pool.query('INSERT INTO company (name) VALUES (?)', [`PC ${RUN}`]);
  companyId = c.insertId;
  created.companies.push(companyId);
  await pool.query('INSERT IGNORE INTO cash_accounts (company_id, current_balance) VALUES (?, 0)', [companyId]);
  const [d] = await pool.query('INSERT INTO departments (name) VALUES (?)', [`Dept ${RUN}`]);
  departmentId = d.insertId;
  created.departments.push(departmentId);
  const [i] = await pool.query(`INSERT INTO items (item_code, name, unit, reorder_level) VALUES (?, ?, 'kg', 0)`, [`PC-${RUN}`, `Flour ${RUN}`]);
  itemId = i.insertId;
  created.items.push(itemId);
  // Enough opening stock for the issuance tests (audit H4 now checks real availability).
  await pool.query(`INSERT INTO opening_balances (date, item_id, quantity) VALUES ('2026-01-01', ?, 1000)`, [itemId]);

  const app = express();
  app.use(express.json());
  app.use('/api', authenticate, authorizeApi, periodGuard.periodErrorTranslator, periodGuard);
  // Stands in for a controller whose catch-all answers "Server error": its body names no date, so the
  // request guard lets it through and only the ledger helper can refuse the posting.
  app.post('/api/finance/__ledger-test', async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await recordCashTransaction(connection, {
        companyId, date: req.body.posting_day, remark: 'x', debit: 1, transactionType: 'Test', createdBy: req.user.userId
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    } finally {
      connection.release();
    }
  });
  app.use('/api/hidden-expenses', require('../../routes/hiddenExpenseRoutes'));
  app.use('/api/issuances', require('../../routes/issuanceRoutes'));
  app.use('/api/adjustments', require('../../routes/adjustmentRoutes'));
  app.use('/api/period-close', require('../../routes/periodCloseRoutes'));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  const del = async (sql, ids) => { if (ids.length) await pool.query(sql, [ids]); };
  await pool.query('DELETE FROM hidden_expenses WHERE company_id = ?', [companyId]);
  await del('DELETE FROM issuance_items WHERE issuance_id IN (?)', created.issuances);
  await del('DELETE FROM issuances WHERE department_id IN (?)', created.departments);
  await del("DELETE FROM stock_movements WHERE item_id IN (?) AND reference_type = 'stock_adjustments'", created.items);
  await del("DELETE FROM rm_adjustment_records WHERE category = 'Department' AND source_record_id IN (SELECT id FROM stock_adjustments WHERE item_id IN (?))", created.items);
  await del('DELETE FROM stock_adjustments WHERE item_id IN (?)', created.items);
  await del('DELETE FROM period_reopen_requests WHERE requested_by IN (?)', created.users);
  await del("DELETE FROM finance_transactions WHERE company_id IN (?)", created.companies);
  await del('DELETE FROM cash_accounts WHERE company_id IN (?)', created.companies);
  await del('DELETE FROM bank_details WHERE id IN (?)', created.banks);
  await del('DELETE FROM company WHERE id IN (?)', created.companies);
  await del('DELETE FROM departments WHERE id IN (?)', created.departments);
  await del('DELETE FROM opening_balances WHERE item_id IN (?)', created.items);
  await del('DELETE FROM items WHERE id IN (?)', created.items);
  await del('DELETE FROM users WHERE id IN (?)', created.users);
  await pool.end();
});

test.beforeEach(async () => {
  // Re-opens are shared state: every test starts with every month closed again.
  await pool.query("UPDATE period_reopen_requests SET status = 'Closed' WHERE status = 'Approved' AND requested_by IN (?)", [created.users]);
});

// ------------------------------------------------------------------ the open window

test('the open window is this month and last month: 2026-09-01 is open, 2026-08-31 is closed', async () => {
  assert.equal(periodLock.firstOpenDate(), '2026-09-01');

  for (const date of ['2026-10-16', '2026-10-01', '2026-09-30', '2026-09-01', '2026-12-31']) {
    const r = await hidden(date);
    assert.equal(r.status, 201, `${date}: ${JSON.stringify(r.body)}`);
  }
  for (const date of ['2026-08-31', '2026-07-10', '2025-01-01']) {
    const r = await hidden(date);
    assert.equal(r.status, 409, `${date}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.code, 'PERIOD_CLOSED');
    assert.equal(r.body.closed_before, '2026-09-01');
    assert.match(r.body.error, /closed/i);
  }
  assert.match((await hidden('2026-08-31')).body.error, /August 2026/);
});

test('no record is created by a refused request', async () => {
  const before = Number((await one('SELECT COUNT(*) AS n FROM hidden_expenses WHERE company_id = ?', [companyId])).n);
  assert.equal((await hidden('2026-06-15')).status, 409);
  assert.equal(Number((await one('SELECT COUNT(*) AS n FROM hidden_expenses WHERE company_id = ?', [companyId])).n), before);
});

test('reading closed months is never blocked', async () => {
  const list = await call('GET', '/hidden-expenses', undefined, 'accountant');
  assert.equal(list.status, 200);
});

// ------------------------------------------------------------------ editing and voiding

test('a record dated in a closed month cannot be edited, moved or voided - not even by an Admin', async () => {
  const id = await oldIssuance('2026-07-10');
  const edit = await call('PUT', `/issuances/${id}`, issuanceBody('2026-10-10'), 'admin');
  assert.equal(edit.status, 409, JSON.stringify(edit.body));
  assert.equal(edit.body.code, 'PERIOD_CLOSED');
  assert.equal(String((await one('SELECT issuance_date FROM issuances WHERE id = ?', [id])).issuance_date).slice(0, 10) !== '', true);

  const open = await hidden('2026-10-10');
  const moveIntoClosed = await call('PUT', `/hidden-expenses/${open.body.id}`,
    { expense_date: '2026-07-10', amount: 100, type: 'PickMe', company_id: companyId }, 'accountant');
  assert.equal(moveIntoClosed.status, 409, JSON.stringify(moveIntoClosed.body));

  const oldHidden = await pool.query(
    "INSERT INTO hidden_expenses (expense_date, amount, type, company_id) VALUES ('2026-06-05', 50, 'PickMe', ?)", [companyId]);
  const voidOld = await call('DELETE', `/hidden-expenses/${oldHidden[0].insertId}`, undefined, 'admin');
  assert.equal(voidOld.status, 409, JSON.stringify(voidOld.body));
  assert.equal((await one('SELECT is_deleted FROM hidden_expenses WHERE id = ?', [oldHidden[0].insertId])).is_deleted, 0);
});

test('an open record can still be edited and voided', async () => {
  const open = await hidden('2026-10-10');
  const edit = await call('PUT', `/hidden-expenses/${open.body.id}`,
    { expense_date: '2026-09-20', amount: 150, type: 'PickMe', company_id: companyId }, 'accountant');
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  assert.equal((await call('DELETE', `/hidden-expenses/${open.body.id}`, undefined, 'accountant')).status, 200);
});

test('stock notes follow the same rule: issue note and stock adjustment', async () => {
  assert.equal((await call('POST', '/issuances', issuanceBody('2026-10-15'), 'stores')).status, 201);
  const closedIssue = await call('POST', '/issuances', issuanceBody('2026-07-15'), 'stores');
  assert.equal(closedIssue.status, 409, JSON.stringify(closedIssue.body));

  const adjustment = (date) => ({
    date, approved_by: '', reference_note: 'count', item_id: itemId, system_qty: 5, actual_qty: 4, unit_price: 100, reason: 'count'
  });
  const closedAdjustment = await call('POST', '/adjustments', adjustment('2026-07-05 10:00:00'), 'admin');
  assert.equal(closedAdjustment.status, 409, JSON.stringify(closedAdjustment.body));
  const openAdjustment = await call('POST', '/adjustments', adjustment('2026-10-05 10:00:00'), 'admin');
  assert.equal(openAdjustment.status, 201, JSON.stringify(openAdjustment.body));
  created.adjustments.push(openAdjustment.body.adjustment_id);
});

// ------------------------------------------------------------------ re-open workflow

test('an Admin requests, only the Super Admin approves, and then only an Admin can post in that month', async () => {
  const request = await requestReopen('2026-07');
  assert.equal(request.status, 201, JSON.stringify(request.body));
  assert.equal(request.body.request.status, 'Pending');
  assert.equal(request.body.request.from_month, '2026-07');
  const id = request.body.request.id;

  // still closed while Pending
  assert.equal((await hidden('2026-07-10', 'admin')).status, 409);

  // an Admin cannot approve; neither can anyone else
  for (const who of ['admin', 'accountant', 'stores']) {
    const r = await call('POST', '/period-close/approve', { id, hours: 2 }, who);
    assert.equal(r.status, 403, `${who}: ${JSON.stringify(r.body)}`);
  }
  assert.equal((await one('SELECT status FROM period_reopen_requests WHERE id = ?', [id])).status, 'Pending');

  const approved = await call('POST', '/period-close/approve', { id, hours: 2, note: 'ok' }, 'superAdmin');
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.request.status, 'Approved');
  assert.equal(approved.body.request.is_active, true);

  // the Admin can now post and edit in July ...
  const posted = await hidden('2026-07-10', 'admin');
  assert.equal(posted.status, 201, JSON.stringify(posted.body));
  const oldId = await oldIssuance('2026-07-12');
  assert.equal((await call('PUT', `/issuances/${oldId}`, issuanceBody('2026-07-12'), 'admin')).status, 200);
  assert.equal((await call('PUT', `/hidden-expenses/${posted.body.id}`,
    { expense_date: '2026-07-11', amount: 120, type: 'PickMe', company_id: companyId }, 'admin')).status, 200);

  // ... the Super Admin too ...
  assert.equal((await hidden('2026-07-20', 'superAdmin')).status, 201);

  // ... but nobody else, even though the month is open
  for (const who of ['accountant']) {
    const r = await hidden('2026-07-10', who);
    assert.equal(r.status, 409, `${who}: ${JSON.stringify(r.body)}`);
    assert.match(r.body.error, /only an Admin/i);
  }
  const storesIssue = await call('POST', '/issuances', issuanceBody('2026-07-10'), 'stores');
  assert.equal(storesIssue.status, 409);
  assert.match(storesIssue.body.error, /only an Admin/i);
});

test('a re-open covers only the months that were approved', async () => {
  await reopen('2026-07');
  assert.equal((await hidden('2026-07-31', 'admin')).status, 201);
  assert.equal((await hidden('2026-06-30', 'admin')).status, 409);
  assert.equal((await hidden('2026-08-01', 'admin')).status, 409);

  await reopen('2026-05', '2026-06');
  assert.equal((await hidden('2026-06-30', 'admin')).status, 201);
  assert.equal((await hidden('2026-05-01', 'admin')).status, 201);
  assert.equal((await hidden('2026-04-30', 'admin')).status, 409);
  // 2026-08 is still closed: the gap between the two grants stays shut
  assert.equal((await hidden('2026-08-15', 'admin')).status, 409);
});

test('the status page shows the window and the months open right now', async () => {
  const before = await call('GET', '/period-close/status', undefined, 'admin');
  assert.equal(before.status, 200, JSON.stringify(before.body));
  assert.equal(before.body.closed_before, '2026-09-01');
  assert.equal(before.body.open_months, 2);
  assert.deepEqual(before.body.reopened, []);

  const id = await reopen('2026-07', '2026-07', 3);
  const after = await call('GET', '/period-close/status', undefined, 'admin');
  assert.deepEqual(after.body.reopened.map((g) => [g.id, g.from_month, g.to_month]), [[id, '2026-07', '2026-07']]);
});

test('an approved re-open stops when it expires, and the list shows it as Expired', async () => {
  const id = await reopen('2026-07');
  assert.equal((await hidden('2026-07-10', 'admin')).status, 201);

  await pool.query('UPDATE period_reopen_requests SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = ?', [id]);
  const refused = await hidden('2026-07-10', 'admin');
  assert.equal(refused.status, 409, JSON.stringify(refused.body));
  assert.match(refused.body.error, /closed/i);

  const list = await call('GET', '/period-close/requests', undefined, 'admin');
  assert.equal(list.body.find((r) => r.id === id).status, 'Expired');
  // an expired approval cannot be closed or approved again
  assert.equal((await call('POST', '/period-close/close', { id }, 'admin')).status, 409);
  assert.equal((await call('POST', '/period-close/approve', { id, hours: 1 }, 'superAdmin')).status, 409);
});

test('an Admin can close a re-opened month again early', async () => {
  const id = await reopen('2026-07');
  assert.equal((await hidden('2026-07-10', 'admin')).status, 201);
  const closed = await call('POST', '/period-close/close', { id }, 'admin');
  assert.equal(closed.status, 200, JSON.stringify(closed.body));
  assert.equal(closed.body.request.status, 'Closed');
  assert.equal((await hidden('2026-07-10', 'admin')).status, 409);
  // a second close is refused
  assert.equal((await call('POST', '/period-close/close', { id }, 'admin')).status, 409);
});

test('the Super Admin can reject a request, with a reason', async () => {
  const request = await requestReopen('2026-07');
  const id = request.body.request.id;
  assert.equal((await call('POST', '/period-close/reject', { id }, 'superAdmin')).status, 400);
  assert.equal((await call('POST', '/period-close/reject', { id, note: 'not needed' }, 'admin')).status, 403);
  const rejected = await call('POST', '/period-close/reject', { id, note: 'Use next month instead' }, 'superAdmin');
  assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
  assert.equal(rejected.body.request.status, 'Rejected');
  assert.equal((await hidden('2026-07-10', 'admin')).status, 409);
  // a decided request cannot be decided again
  assert.equal((await call('POST', '/period-close/approve', { id, hours: 1 }, 'superAdmin')).status, 409);
});

test('requests are validated', async () => {
  const send = (body) => call('POST', '/period-close/requests', body, 'admin');
  const reason = 'Late supplier invoice found for July';
  assert.equal((await send({ from_month: '2026-10', reason })).status, 400, 'an open month cannot be re-opened');
  assert.equal((await send({ from_month: '2026-09', reason })).status, 400, 'September is open');
  assert.equal((await send({ from_month: '2026-07', to_month: '2026-09', reason })).status, 400, 'range reaches an open month');
  assert.equal((await send({ from_month: '2026-07', to_month: '2026-05', reason })).status, 400, 'from after to');
  assert.equal((await send({ from_month: '2025-01', to_month: '2026-07', reason })).status, 400, 'more than 12 months');
  assert.equal((await send({ from_month: '2026-13', reason })).status, 400);
  assert.equal((await send({ from_month: 'July', reason })).status, 400);
  assert.equal((await send({ from_month: '2026-07', reason: 'short' })).status, 400);
  assert.equal((await send({ from_month: '2026-07', reason: 'x'.repeat(501) })).status, 400);
  assert.equal((await send({ from_month: '2026-07', reason })).status, 201);

  const id = (await call('GET', '/period-close/requests', undefined, 'admin')).body[0].id;
  for (const hours of [0, 169, 1.5, 'abc']) {
    assert.equal((await call('POST', '/period-close/approve', { id, hours }, 'superAdmin')).status, 400, `hours ${hours}`);
  }
  assert.equal((await call('POST', '/period-close/approve', { id: 999999, hours: 1 }, 'superAdmin')).status, 404);
  assert.equal((await call('POST', '/period-close/approve', { hours: 1 }, 'superAdmin')).status, 400);
});

test('only Admin and Super Admin can use the Period Close endpoints', async () => {
  for (const who of ['stores', 'accountant']) {
    assert.equal((await call('GET', '/period-close/status', undefined, who)).status, 403, who);
    assert.equal((await call('GET', '/period-close/requests', undefined, who)).status, 403, who);
    assert.equal((await call('POST', '/period-close/requests', { from_month: '2026-07', reason: 'Late supplier invoice found' }, who)).status, 403, who);
  }
  assert.equal((await call('GET', '/period-close/status', undefined, 'admin')).status, 200);
  assert.equal((await call('GET', '/period-close/status', undefined, 'superAdmin')).status, 200);
});

// ------------------------------------------------------------------ the ledger refuses too

test('Cash / Bank ledger postings are refused in a closed month, whatever route makes them', async () => {
  const post = (userId, date, extra = {}) => {
    const run = async () => {
      const connection = await pool.getConnection();
      try {
        return await recordCashTransaction(connection, {
          companyId, date, remark: 'x', debit: 10, transactionType: 'Test', createdBy: userId, ...extra
        });
      } finally {
        connection.release();
      }
    };
    return run();
  };

  await assert.rejects(post(USERS.accountant.id, '2026-07-10'), (e) => e.name === 'PeriodClosedError' && e.status === 409);
  await assert.rejects(post(USERS.admin.id, '2026-07-10'), (e) => e.name === 'PeriodClosedError', 'an Admin needs a re-open too');
  await post(USERS.accountant.id, '2026-09-01'); // open: fine

  await reopen('2026-07');
  await post(USERS.admin.id, '2026-07-10'); // Admin in a re-opened month: fine
  await assert.rejects(post(USERS.accountant.id, '2026-07-10'), (e) => e.name === 'PeriodClosedError' && /only an Admin/i.test(e.message));
  // attributed to the original user, but an Admin is the one acting
  await post(USERS.accountant.id, '2026-07-11', { periodActor: USERS.admin.id });
  await post(null, '2026-07-12', { system: true });
  await assert.rejects(post(USERS.admin.id, '2026-06-10'), (e) => e.name === 'PeriodClosedError');
});

test('a ledger refusal that a controller reports as "Server error" still reaches the user as a 409', async () => {
  const open = await call('POST', '/finance/__ledger-test', { posting_day: '2026-10-10' }, 'accountant');
  assert.equal(open.status, 200, JSON.stringify(open.body));
  const closed = await call('POST', '/finance/__ledger-test', { posting_day: '2026-06-10' }, 'accountant');
  assert.equal(closed.status, 409, JSON.stringify(closed.body));
  assert.equal(closed.body.code, 'PERIOD_CLOSED');
  assert.match(closed.body.error, /June 2026 is closed/);
  assert.equal(closed.body.closed_before, '2026-09-01');
});

test('a refused ledger posting writes nothing', async () => {
  const connection = await pool.getConnection();
  const rowsBefore = Number((await one("SELECT COUNT(*) AS n FROM finance_transactions WHERE company_id = ?", [companyId])).n);
  try {
    await assert.rejects(recordCashTransaction(connection, {
      companyId, date: '2026-05-01', remark: 'x', debit: 10, transactionType: 'Test', createdBy: USERS.accountant.id
    }), (e) => e.name === 'PeriodClosedError');
  } finally {
    connection.release();
  }
  assert.equal(Number((await one("SELECT COUNT(*) AS n FROM finance_transactions WHERE company_id = ?", [companyId])).n), rowsBefore);
});

// ------------------------------------------------------------------ balance_after

const ledgerRows = async (type, id) => (await pool.query(
  `SELECT id, DATE_FORMAT(transaction_date, '%Y-%m-%d') AS d, debit, credit, balance_after, status
     FROM finance_transactions WHERE account_type = ? AND ${type === 'BANK' ? 'bank_id' : 'company_id'} = ?
    ORDER BY transaction_date, created_at, id`, [type, id]))[0];

const runningBalances = (rows) => {
  let balance = 0;
  return rows.filter((r) => r.status === 1).map((r) => {
    balance = Math.round((balance + Number(r.debit) - Number(r.credit)) * 100) / 100;
    return balance;
  });
};

const withConnection = async (work) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

test('a back-dated cash posting gets the balance at its own date, and the rows after it are corrected', async () => {
  const [c] = await pool.query('INSERT INTO company (name) VALUES (?)', [`BAL ${RUN}`]);
  created.companies.push(c.insertId);
  await pool.query('INSERT IGNORE INTO cash_accounts (company_id, current_balance) VALUES (?, 0)', [c.insertId]);
  const post = (date, debit, credit) => withConnection((connection) => recordCashTransaction(connection, {
    companyId: c.insertId, date, remark: 'x', debit, credit, transactionType: 'Test', createdBy: USERS.admin.id
  }));

  await post('2026-10-01', 1000, 0);
  await post('2026-10-10', 0, 200);
  await post('2026-10-15', 0, 100);
  const total = await post('2026-10-05', 0, 50); // back-dated, between the first two

  const rows = await ledgerRows('CASH', c.insertId);
  assert.deepEqual(rows.map((r) => r.d), ['2026-10-01', '2026-10-05', '2026-10-10', '2026-10-15']);
  assert.deepEqual(rows.map((r) => cents(r.balance_after)), [100000, 95000, 75000, 65000]);
  assert.deepEqual(rows.map((r) => cents(r.balance_after)), runningBalances(rows).map(cents));
  assert.equal(cents(total), 65000, 'the account total is unchanged by the order');
  assert.equal(cents((await one('SELECT current_balance FROM cash_accounts WHERE company_id = ?', [c.insertId])).current_balance), 65000);

  // same date as an existing row: it goes after it
  await post('2026-10-10', 25, 0);
  const again = await ledgerRows('CASH', c.insertId);
  assert.deepEqual(again.map((r) => cents(r.balance_after)), runningBalances(again).map(cents));
});

test('a back-dated bank posting gets the balance at its own date too', async () => {
  const [b] = await pool.query(
    "INSERT INTO bank_details (bank_name, account_number, company, status) VALUES (?, '1', 'JH', 'Active')", [`BAL Bank ${RUN}`]);
  created.banks.push(b.insertId);
  const post = (date, debit, credit) => withConnection((connection) => recordBankTransaction(connection, {
    bankId: b.insertId, date, remark: 'x', debit, credit, transactionType: 'Test', createdBy: USERS.admin.id
  }));
  await post('2026-10-02', 500, 0);
  await post('2026-10-12', 0, 100);
  await post('2026-10-07', 40, 0);

  const rows = await ledgerRows('BANK', b.insertId);
  assert.deepEqual(rows.map((r) => cents(r.balance_after)), [50000, 54000, 44000]);
  assert.equal(cents((await one('SELECT current_balance FROM bank_details WHERE id = ?', [b.insertId])).current_balance), 44000);
});

test('rebuildBalanceAfter repairs wrong stored balances, ignores voided rows, and is repeatable', async () => {
  const [c] = await pool.query('INSERT INTO company (name) VALUES (?)', [`REB ${RUN}`]);
  created.companies.push(c.insertId);
  await pool.query('INSERT IGNORE INTO cash_accounts (company_id, current_balance) VALUES (?, 0)', [c.insertId]);
  const insert = async (date, debit, credit, balance, status = 1) => (await pool.query(
    `INSERT INTO finance_transactions (account_type, company_id, transaction_date, transaction_type, transaction_direction, remark, debit, credit, balance_after, status, created_by)
     VALUES ('CASH', ?, ?, 'Test', 'IN', 'x', ?, ?, ?, ?, ?)`, [c.insertId, date, debit, credit, balance, status, USERS.admin.id]))[0].insertId;
  await insert('2026-10-01', 1000, 0, 999);
  const voided = await insert('2026-10-03', 0, 300, 12345, 0);
  await insert('2026-10-05', 0, 100, 777);

  const balance = await withConnection((connection) => rebuildBalanceAfter(connection, 'CASH', c.insertId));
  assert.equal(cents(balance), 90000);
  const rows = await ledgerRows('CASH', c.insertId);
  assert.deepEqual(rows.filter((r) => r.status === 1).map((r) => cents(r.balance_after)), [100000, 90000]);
  assert.equal(cents(rows.find((r) => r.id === voided).balance_after), 1234500, 'a voided row keeps whatever it had');
  assert.equal(cents((await one('SELECT current_balance FROM cash_accounts WHERE company_id = ?', [c.insertId])).current_balance), 90000);

  await withConnection((connection) => rebuildBalanceAfter(connection, 'CASH', c.insertId));
  assert.deepEqual((await ledgerRows('CASH', c.insertId)).filter((r) => r.status === 1).map((r) => cents(r.balance_after)), [100000, 90000]);
});

test('refreshBalancesOfReference fixes the running balances after a row was edited or voided in place', async () => {
  const [c] = await pool.query('INSERT INTO company (name) VALUES (?)', [`REF ${RUN}`]);
  created.companies.push(c.insertId);
  await pool.query('INSERT IGNORE INTO cash_accounts (company_id, current_balance) VALUES (?, 0)', [c.insertId]);
  const post = (date, debit, credit, referenceId = null) => withConnection((connection) => recordCashTransaction(connection, {
    companyId: c.insertId, date, remark: 'x', debit, credit, transactionType: 'Test', referenceType: 'PC_TEST', referenceId, createdBy: USERS.admin.id
  }));
  await post('2026-10-01', 1000, 0);
  await post('2026-10-05', 0, 100, 777);
  await post('2026-10-09', 0, 50);

  // edit the middle row in place: amount 100 -> 300 and the date moves after the last row
  await pool.query("UPDATE finance_transactions SET credit = 300, transaction_date = '2026-10-12' WHERE reference_type = 'PC_TEST' AND reference_id = 777");
  await withConnection((connection) => refreshBalancesOfReference(connection, 'PC_TEST', 777));
  let rows = await ledgerRows('CASH', c.insertId);
  assert.deepEqual(rows.map((r) => r.d), ['2026-10-01', '2026-10-09', '2026-10-12']);
  assert.deepEqual(rows.map((r) => cents(r.balance_after)), [100000, 95000, 65000]);

  // void it
  await pool.query("UPDATE finance_transactions SET status = 0 WHERE reference_type = 'PC_TEST' AND reference_id = 777");
  await withConnection((connection) => refreshBalancesOfReference(connection, 'PC_TEST', 777));
  rows = await ledgerRows('CASH', c.insertId);
  assert.deepEqual(rows.filter((r) => r.status === 1).map((r) => cents(r.balance_after)), [100000, 95000]);
  assert.equal(cents((await one('SELECT current_balance FROM cash_accounts WHERE company_id = ?', [c.insertId])).current_balance), 95000);
});

// ------------------------------------------------------------------ automatic cheque release

test('the automatic cheque release skips a cheque dated in a closed month and still releases the others', async () => {
  const cheques = require('../../services/chequeReleaseService');
  const [c] = await pool.query('INSERT INTO company (name) VALUES (?)', [`CHQ ${RUN}`]);
  const chequeCompany = c.insertId;
  created.companies.push(chequeCompany);
  await pool.query('INSERT IGNORE INTO cash_accounts (company_id, current_balance) VALUES (?, 0)', [chequeCompany]);
  const [b] = await pool.query("INSERT INTO bank_details (bank_name, account_number, company, status) VALUES (?, '9', 'JH', 'Active')", [`CHQ Bank ${RUN}`]);
  created.banks.push(b.insertId);

  // Bank -> Cash cheque transfers: the Bank leg is already posted, Release posts the Cash leg.
  const makeCheque = async (suffix, releaseDate) => {
    const [t] = await pool.query(
      `INSERT INTO finance_cheque_transfers (company_id, bank_id, amount, transfer_date, cheque_number, created_by)
       VALUES (?, ?, 500, '2026-06-01', ?, ?)`, [chequeCompany, b.insertId, `CQ-${RUN}-${suffix}`, USERS.accountant.id]);
    await pool.query(
      `INSERT INTO finance_transactions (account_type, company_id, bank_id, transaction_date, transaction_type, transaction_direction, remark, debit, credit, balance_after, reference_type, reference_id, created_by)
       VALUES ('BANK', ?, ?, '2026-06-01', 'Bank Withdrawal', 'OUT', 'x', 0, 500, 0, 'CASH_BANK_TRANSFER', ?, ?)`,
      [chequeCompany, b.insertId, t.insertId, USERS.accountant.id]);
    const [r] = await pool.query(
      `INSERT INTO expenses_cheque_registry (source_type, source_id, type, date, name, cheque_number, amount, bank_id, company_id, release_date, status)
       VALUES ('BANK_TO_CASH', ?, 'Transfer', '2026-06-01', 'x', ?, 500, ?, ?, ?, 'Pending')`,
      [t.insertId, `CQ-${RUN}-${suffix}`, b.insertId, chequeCompany, releaseDate]);
    return r.insertId;
  };
  const closedCheque = await makeCheque('closed', '2026-06-10');
  const openCheque = await makeCheque('open', '2026-10-10');

  await cheques.processDueCheques();

  const statusOf = async (id) => (await one('SELECT status FROM expenses_cheque_registry WHERE id = ?', [id])).status;
  assert.equal(await statusOf(openCheque), 'Released', 'the open one is still released');
  assert.equal(await statusOf(closedCheque), 'Pending', 'the one dated in June stays Pending');
  const cashRows = (await pool.query(
    "SELECT DATE_FORMAT(transaction_date, '%Y-%m-%d') AS d, debit FROM finance_transactions WHERE account_type = 'CASH' AND company_id = ?", [chequeCompany]))[0];
  assert.deepEqual(cashRows.map((r) => [r.d, cents(r.debit)]), [['2026-10-10', 50000]], 'nothing was posted into June');

  // Once June is re-opened, an Accountant still cannot release it - an Admin can.
  const [grant] = await pool.query(
    `INSERT INTO period_reopen_requests (period_from, period_to, reason, status, requested_by, decided_by, decided_at, expires_at)
     VALUES ('2026-06-01', '2026-06-30', 'release the June cheque', 'Approved', ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 2 HOUR))`,
    [USERS.admin.id, USERS.superAdmin.id]);
  assert.ok(grant.insertId);
  const release = (actorUserId) => withConnection(async (connection) => {
    const [rows] = await connection.query('SELECT * FROM expenses_cheque_registry WHERE id = ?', [closedCheque]);
    return cheques.postChequeRelease(connection, rows[0], '2026-06-10', { actorUserId });
  });
  await assert.rejects(release(USERS.accountant.id), (e) => e.name === 'PeriodClosedError' && /only an Admin/i.test(e.message));
  assert.equal(await statusOf(closedCheque), 'Pending');
  assert.equal(await release(USERS.admin.id), true);
  assert.equal(await statusOf(closedCheque), 'Released');
});
