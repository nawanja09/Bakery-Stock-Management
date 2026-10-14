// Staff Loans API tests.
//
// These drive the REAL router, auth/role middleware, controller and the REAL
// Cash Book helper (utils/financeLedger.recordCashTransaction) over HTTP, on
// the MySQL TEST database (tests/db/useTestDatabase.js - never the real one),
// so row locking and MySQL types are exercised as in production. Every row the
// tests create is removed again in test.after().

require('./useTestDatabase');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const pool = require('../../config/db');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const readOnly = require('../../middleware/readOnly');
const staffLoanRoutes = require('../../routes/staffLoanRoutes');
const { recordCashTransaction, getCashBalance } = require('../../utils/financeLedger');
const { getJwtSecret, JWT_SIGN_OPTIONS } = require('../../config/secrets');

// Unique names, so the run never collides with other data in the test database.
const RUN = crypto.randomBytes(4).toString('hex');
const created = { users: [], employees: [], companies: [] };

let server;
let baseUrl;
let employeeA;
let employeeB;
let inactiveEmployee;
let companyId;
let emptyCompanyId;
let companyName;
let emptyCompanyName;
const TOKENS = {};

const one = async (sql, params = []) => (await pool.query(sql, params))[0][0];
// Money compared in whole cents (the API reports exact 2-decimal amounts; JS
// float sums such as -23345.67 + 10000 are not).
const money = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- failure injection
// failNext(pattern): the next statement matching `pattern` on a pooled
// connection throws, so the controller's transaction handling can be tested.
let failPattern = null;
const realGetConnection = pool.getConnection.bind(pool);
pool.getConnection = async () => {
  const conn = await realGetConnection();
  if (!failPattern) return conn;
  const originalQuery = conn.query.bind(conn);
  const originalRelease = conn.release.bind(conn);
  conn.query = (sql, ...rest) => {
    if (failPattern && failPattern.test(String(sql))) {
      failPattern = null;
      return Promise.reject(new Error('injected test failure'));
    }
    return originalQuery(sql, ...rest);
  };
  conn.release = () => { conn.query = originalQuery; conn.release = originalRelease; return originalRelease(); };
  return conn;
};
const failNext = (pattern) => { failPattern = pattern; };

const call = async (method, path, { auth = TOKENS.accountant, body } = {}) => {
  const response = await fetch(`${baseUrl}/api/staff-loans${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${auth}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, body: json };
};

const createLoan = async (overrides = {}) => {
  const result = await call('POST', '', {
    body: {
      employee_id: employeeA,
      company_id: companyId,
      loan_amount: '50000',
      issued_date: '2026-09-01',
      cheque_details: 'CHQ 000123 - Commercial Bank',
      ...overrides
    }
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body.loan;
};

const repay = (loanId, amount, date = '2026-09-21', auth) =>
  call('POST', `/${loanId}/repayments`, { auth, body: { amount, received_date: date } });

const countRows = async (table, where = '1=1', params = []) =>
  Number((await one(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, params)).n);

// A real, active user per role: authenticate re-checks every token against `users`.
const addUser = async (role) => {
  const hash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 4);
  const [r] = await pool.query(
    'INSERT INTO users (name, username, password, role, status) VALUES (?, ?, ?, ?, 1)',
    [`${role} ${RUN}`, `${role.toLowerCase().replace(/\s+/g, '-')}-${RUN}`, hash, role]
  );
  created.users.push(r.insertId);
  return jwt.sign({ userId: r.insertId, username: role, role, tv: 0 }, getJwtSecret(), JWT_SIGN_OPTIONS);
};

test.before(async () => {
  // config/db gives every existing company a cash account when it starts;
  // wait for that, or it would also give one to the "no Cash Book" company below.
  await pool.financeSchemaReady;
  companyName = `JH ${RUN}`;
  emptyCompanyName = `NoCashBook ${RUN}`;
  const [c1] = await pool.query('INSERT INTO company (name) VALUES (?)', [companyName]);
  const [c2] = await pool.query('INSERT INTO company (name) VALUES (?)', [emptyCompanyName]);
  companyId = c1.insertId;
  emptyCompanyId = c2.insertId;
  created.companies.push(companyId, emptyCompanyId);
  await pool.query('INSERT INTO cash_accounts (company_id, current_balance) VALUES (?, 0)', [companyId]);

  const addEmployee = async (code, name, status) => {
    const [r] = await pool.query(
      'INSERT INTO employees (employee_code, employee_name, status) VALUES (?, ?, ?)', [`${code}-${RUN}`, name, status]);
    created.employees.push(r.insertId);
    return r.insertId;
  };
  employeeA = await addEmployee('EMP-001', 'Employee A', 'Active');
  employeeB = await addEmployee('EMP-002', 'Employee B', 'Active');
  inactiveEmployee = await addEmployee('EMP-003', 'Former Employee', 'Inactive');

  TOKENS.accountant = await addUser('Accountant');
  TOKENS.admin = await addUser('Admin');
  TOKENS.viewOnly = await addUser('View Only');
  TOKENS.storeKeeper = await addUser('Store Keeper');

  // Opening cash balance of Rs. 100,000 through the real ledger helper.
  const connection = await pool.getConnection();
  try {
    await recordCashTransaction(connection, {
      companyId, date: '2026-01-01', remark: 'Opening Balance', debit: 100000,
      transactionType: 'Opening Balance', createdBy: created.users[1]
    });
  } finally {
    connection.release();
  }

  const app = express();
  app.use(express.json());
  app.use('/api', readOnly);
  app.use('/api/staff-loans', staffLoanRoutes);
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  // Remove everything this run created (children first).
  if (created.companies.length) {
    await pool.query(
      `DELETE r FROM staff_loan_repayments r JOIN staff_loans l ON l.id = r.staff_loan_id WHERE l.company_id IN (?)`,
      [created.companies]);
    await pool.query('DELETE FROM staff_loans WHERE company_id IN (?)', [created.companies]);
    await pool.query("DELETE FROM finance_transactions WHERE account_type = 'CASH' AND company_id IN (?)", [created.companies]);
    await pool.query('DELETE FROM cash_accounts WHERE company_id IN (?)', [created.companies]);
    await pool.query('DELETE FROM company WHERE id IN (?)', [created.companies]);
  }
  if (created.employees.length) await pool.query('DELETE FROM employees WHERE id IN (?)', [created.employees]);
  if (created.users.length) await pool.query('DELETE FROM users WHERE id IN (?)', [created.users]);
  await pool.end();
});

// ------------------------------------------------------------------ access

test('rejects requests without a token and roles outside the Finance module', async () => {
  assert.equal((await call('GET', '', { auth: null })).status, 401);
  assert.equal((await call('GET', '', { auth: TOKENS.storeKeeper })).status, 403);
  assert.equal((await call('POST', '', { auth: TOKENS.storeKeeper, body: {} })).status, 403);
});

test('View Only users can read but cannot create loans or receive cash', async () => {
  const loan = await createLoan();
  assert.equal((await call('GET', '', { auth: TOKENS.viewOnly })).status, 200);
  assert.equal((await call('GET', `/${loan.id}`, { auth: TOKENS.viewOnly })).status, 200);

  const create = await call('POST', '', {
    auth: TOKENS.viewOnly,
    body: { employee_id: employeeA, company_id: companyId, loan_amount: '100', issued_date: '2026-09-01' }
  });
  assert.equal(create.status, 403);

  const before = await getCashBalance(companyId);
  const receive = await repay(loan.id, '100', '2026-09-21', TOKENS.viewOnly);
  assert.equal(receive.status, 403);
  assert.equal(await getCashBalance(companyId), before);
});

test('Admin and Accountant can both use the module', async () => {
  const adminLoan = await call('POST', '', {
    auth: TOKENS.admin,
    body: { employee_id: employeeB, company_id: companyId, loan_amount: '1000', issued_date: '2026-09-02' }
  });
  assert.equal(adminLoan.status, 201);
});

// ---------------------------------------------------------------- form data

test('form options list only active employees (from Employee Management) and companies with a Cash Book', async () => {
  const { status, body } = await call('GET', '/form-options');
  assert.equal(status, 200);
  const names = body.employees.map((e) => e.employee_name);
  assert.ok(names.includes('Employee A'));
  assert.ok(names.includes('Employee B'));
  assert.ok(!names.includes('Former Employee'));
  // The shared test database may hold other companies; this run's two decide the rule.
  const companies = body.companies.map((c) => c.name);
  assert.ok(companies.includes(companyName), 'company with a Cash Book is offered');
  assert.ok(!companies.includes(emptyCompanyName), 'company without a Cash Book is not offered');
});

// -------------------------------------------------------------- create loan

test('creating a loan stores every field and sets the balance equal to the loan amount', async () => {
  const before = await getCashBalance(companyId);
  const loan = await createLoan({ loan_amount: '50000', issued_date: '2026-09-21', cheque_details: '  CHQ 778899 - BOC  ' });

  assert.equal(loan.employee_id, employeeA);
  assert.equal(loan.employee_name, 'Employee A');
  assert.equal(loan.loan_amount, 50000);
  assert.equal(loan.balance, 50000);
  assert.equal(loan.total_received, 0);
  assert.equal(loan.status, 'Active');
  assert.equal(loan.issued_date, '2026-09-21');
  assert.equal(loan.cheque_details, 'CHQ 778899 - BOC');

  const stored = await one(
    "SELECT employee_id, loan_amount, DATE_FORMAT(issued_date, '%Y-%m-%d') AS issued_date, status FROM staff_loans WHERE id = ?",
    [loan.id]);
  assert.equal(stored.employee_id, employeeA);
  assert.equal(Number(stored.loan_amount), 50000);
  assert.equal(stored.issued_date, '2026-09-21');
  assert.equal(stored.status, 'Active');

  // Issuing the loan pays the employee from the Cash Book: one CREDIT (money
  // out) of the loan amount, dated the issued date (staffLoanController).
  assert.equal(await getCashBalance(companyId), before - 50000);
  const payout = await one(
    `SELECT credit, debit, transaction_type, DATE_FORMAT(transaction_date, '%Y-%m-%d') AS transaction_date
       FROM finance_transactions WHERE reference_type = 'STAFF_LOAN_ISSUE' AND reference_id = ?`, [loan.id]);
  assert.equal(Number(payout.credit), 50000);
  assert.equal(Number(payout.debit), 0);
  assert.equal(payout.transaction_type, 'Staff Loan Issued');
  assert.equal(payout.transaction_date, '2026-09-21');
});

test('supports decimal loan amounts and an empty cheque detail', async () => {
  const loan = await createLoan({ loan_amount: '12345.67', cheque_details: '' });
  assert.equal(loan.loan_amount, 12345.67);
  assert.equal(loan.balance, 12345.67);
  assert.equal(loan.cheque_details, null);
});

test('backend rejects invalid loan amounts', async () => {
  for (const bad of ['0', 0, '-100', -1, '', null, 'abc', '10.999', '1e5']) {
    const before = await countRows('staff_loans');
    const result = await call('POST', '', {
      body: { employee_id: employeeA, company_id: companyId, loan_amount: bad, issued_date: '2026-09-01' }
    });
    assert.equal(result.status, 400, `amount ${JSON.stringify(bad)} should be rejected`);
    assert.ok(result.body.error);
    assert.equal(await countRows('staff_loans'), before);
  }
});

test('backend rejects missing/invalid employee, company, date and over-long cheque details', async () => {
  const valid = { employee_id: employeeA, company_id: companyId, loan_amount: '100', issued_date: '2026-09-01' };
  const cases = [
    { ...valid, employee_id: undefined },
    { ...valid, employee_id: 'abc' },
    { ...valid, employee_id: 99999999 },
    { ...valid, employee_id: inactiveEmployee },
    { ...valid, company_id: undefined },
    { ...valid, company_id: 99999999 },
    { ...valid, company_id: emptyCompanyId },
    { ...valid, issued_date: undefined },
    { ...valid, issued_date: '2026-02-30' },
    { ...valid, issued_date: '21/09/2026' },
    { ...valid, cheque_details: 'x'.repeat(501) },
    { ...valid, cheque_details: 12345 }
  ];
  for (const body of cases) {
    const before = await countRows('staff_loans');
    const result = await call('POST', '', { body });
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.equal(await countRows('staff_loans'), before);
  }
});

// ------------------------------------------------------ full repayment flow

test('partial, second and final repayments keep loan balance and Cash Book in sync', async () => {
  const beforeIssue = await getCashBalance(companyId);
  const loan = await createLoan({ loan_amount: '50000', issued_date: '2026-09-01' });
  // The payout already left the Cash Book; repayments bring it back.
  const cashStart = await getCashBalance(companyId);
  assert.equal(cashStart, beforeIssue - 50000);

  // First repayment: 10,000
  let result = await repay(loan.id, '10000', '2026-09-10');
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.loan.loan_amount, 50000, 'original loan amount is never overwritten');
  assert.equal(result.body.loan.balance, 40000);
  assert.equal(result.body.loan.status, 'Active');
  assert.equal(result.body.cash_balance, money(cashStart + 10000));
  assert.equal(await getCashBalance(companyId), money(cashStart + 10000));

  // The Cash Book row: DEBIT / IN, with the required remark and the entered date.
  const ledger = await one(
    `SELECT id, account_type, company_id, debit, credit, transaction_direction, remark, transaction_type, status,
            DATE_FORMAT(transaction_date, '%Y-%m-%d') AS transaction_date
       FROM finance_transactions WHERE reference_type = 'STAFF_LOAN_REPAYMENT' AND reference_id = ?`,
    [result.body.repayment.id]);
  assert.equal(ledger.account_type, 'CASH');
  assert.equal(ledger.company_id, companyId);
  assert.equal(Number(ledger.debit), 10000);
  assert.equal(Number(ledger.credit), 0);
  assert.equal(ledger.transaction_direction, 'IN');
  assert.equal(ledger.remark, 'Staff Loan Repayment - Employee A');
  assert.equal(ledger.transaction_date, '2026-09-10');
  assert.equal(ledger.transaction_type, 'Staff Loan Repayment');
  assert.equal(Number(ledger.status), 1);
  const repaymentRow = await one('SELECT finance_transaction_id FROM staff_loan_repayments WHERE id = ?', [result.body.repayment.id]);
  assert.equal(repaymentRow.finance_transaction_id, ledger.id);

  // Second repayment: 15,000
  result = await repay(loan.id, '15000', '2026-09-15');
  assert.equal(result.status, 201);
  assert.equal(result.body.loan.balance, 25000);
  assert.equal(await getCashBalance(companyId), money(cashStart + 25000));

  // Over-payment is rejected and changes nothing.
  const repaymentsBefore = await countRows('staff_loan_repayments', 'staff_loan_id = ?', [loan.id]);
  const ledgerBefore = await countRows('finance_transactions');
  result = await repay(loan.id, '25000.01');
  assert.equal(result.status, 400);
  assert.match(result.body.error, /outstanding balance of Rs\. 25,000\.00/);
  assert.equal(await countRows('staff_loan_repayments', 'staff_loan_id = ?', [loan.id]), repaymentsBefore);
  assert.equal(await countRows('finance_transactions'), ledgerBefore);
  assert.equal(await getCashBalance(companyId), money(cashStart + 25000));

  // Final repayment settles the loan.
  result = await repay(loan.id, '25000', '2026-09-21');
  assert.equal(result.status, 201);
  assert.equal(result.body.loan.balance, 0);
  assert.equal(result.body.loan.status, 'Settled');
  assert.equal(await getCashBalance(companyId), money(cashStart + 50000));
  assert.equal((await one('SELECT status FROM staff_loans WHERE id = ?', [loan.id])).status, 'Settled');

  // A settled loan cannot receive more cash and the Cash Book is untouched.
  const settledLedgerCount = await countRows('finance_transactions');
  result = await repay(loan.id, '1');
  assert.equal(result.status, 400);
  assert.match(result.body.error, /fully settled/);
  assert.equal(await countRows('finance_transactions'), settledLedgerCount);
  assert.equal(await getCashBalance(companyId), money(cashStart + 50000));

  // The loan is not deleted and its history is complete.
  const history = await call('GET', `/${loan.id}/repayments`);
  assert.equal(history.status, 200);
  assert.deepEqual(history.body.repayments.map((r) => r.amount), [10000, 15000, 25000]);
  assert.deepEqual(history.body.repayments.map((r) => r.balance_after), [40000, 25000, 0]);
  assert.deepEqual(history.body.repayments.map((r) => r.received_date), ['2026-09-10', '2026-09-15', '2026-09-21']);
  assert.equal(history.body.loan.status, 'Settled');
  assert.equal(history.body.loan.loan_amount, 50000);

  // "Refresh": everything is re-read from the database and still correct.
  const list = await call('GET', '');
  const listed = list.body.find((l) => l.id === loan.id);
  assert.equal(listed.balance, 0);
  assert.equal(listed.status, 'Settled');
  assert.equal(listed.loan_amount, 50000);
  assert.equal(listed.total_received, 50000);
  const fetched = await call('GET', `/${loan.id}`);
  assert.equal(fetched.body.balance, 0);
});

test('a repayment of the full amount in one go settles the loan; decimals are exact', async () => {
  const loan = await createLoan({ loan_amount: '100.10', issued_date: '2026-09-01' });
  let result = await repay(loan.id, '0.10');
  assert.equal(result.body.loan.balance, 100);
  result = await repay(loan.id, '100');
  assert.equal(result.body.loan.balance, 0);
  assert.equal(result.body.loan.status, 'Settled');
});

test('the balance is derived from repayment rows, not from any stored field', async () => {
  const loan = await createLoan({ loan_amount: '2000' });
  await repay(loan.id, '500');
  // Tamper with the stored status: the API still reports what the repayments say.
  await pool.query("UPDATE staff_loans SET status = 'Settled' WHERE id = ?", [loan.id]);
  const fetched = await call('GET', `/${loan.id}`);
  assert.equal(fetched.body.balance, 1500);
  assert.equal(fetched.body.status, 'Active');
});

// ------------------------------------------------------ repayment validation

test('backend rejects invalid repayments and leaves everything unchanged', async () => {
  const loan = await createLoan({ loan_amount: '10000', issued_date: '2026-09-05' });
  const cash = await getCashBalance(companyId);
  const ledgerRows = await countRows('finance_transactions');
  const repaymentRows = await countRows('staff_loan_repayments');

  const bad = [
    { amount: '0', received_date: '2026-09-21' },
    { amount: '-500', received_date: '2026-09-21' },
    { amount: '', received_date: '2026-09-21' },
    { amount: undefined, received_date: '2026-09-21' },
    { amount: 'abc', received_date: '2026-09-21' },
    { amount: '10.001', received_date: '2026-09-21' },
    { amount: '10000.01', received_date: '2026-09-21' },
    { amount: '100', received_date: '' },
    { amount: '100', received_date: undefined },
    { amount: '100', received_date: '2026-02-31' },
    { amount: '100', received_date: 'yesterday' },
    { amount: '100', received_date: '2026-09-04' } // before the loan was issued
  ];
  for (const body of bad) {
    const result = await call('POST', `/${loan.id}/repayments`, { body });
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.ok(result.body.error);
  }

  assert.equal(await countRows('finance_transactions'), ledgerRows);
  assert.equal(await countRows('staff_loan_repayments'), repaymentRows);
  assert.equal(await getCashBalance(companyId), cash);
});

test('invalid or unknown loan ids are rejected on every endpoint', async () => {
  for (const id of ['abc', '0', '-1', '1.5']) {
    assert.equal((await call('GET', `/${id}`)).status, 400, `GET ${id}`);
    assert.equal((await call('GET', `/${id}/repayments`)).status, 400, `history ${id}`);
    assert.equal((await repay(id, '10')).status, 400, `repay ${id}`);
  }
  assert.equal((await call('GET', '/99999999')).status, 404);
  assert.equal((await call('GET', '/99999999/repayments')).status, 404);
  const missing = await repay(99999999, '10');
  assert.equal(missing.status, 404);
});

test('a deactivated employee can still repay an existing loan', async () => {
  const loan = await createLoan({ employee_id: employeeB, loan_amount: '3000' });
  await pool.query("UPDATE employees SET status = 'Inactive' WHERE id = ?", [employeeB]);
  try {
    const result = await repay(loan.id, '1000');
    assert.equal(result.status, 201);
    assert.equal(result.body.loan.balance, 2000);
  } finally {
    await pool.query("UPDATE employees SET status = 'Active' WHERE id = ?", [employeeB]);
  }
});

// ---------------------------------------------------- transaction consistency

test('if the Cash Book posting fails, the repayment is rolled back too', async () => {
  const loan = await createLoan({ loan_amount: '8000' });
  const cash = await getCashBalance(companyId);
  const repaymentRows = await countRows('staff_loan_repayments');
  const ledgerRows = await countRows('finance_transactions');

  failNext(/INSERT INTO finance_transactions/i);
  const result = await repay(loan.id, '3000');

  assert.equal(result.status, 500);
  assert.equal(await countRows('staff_loan_repayments'), repaymentRows, 'repayment must not be saved without a Cash Book entry');
  assert.equal(await countRows('finance_transactions'), ledgerRows);
  assert.equal(await getCashBalance(companyId), cash);
  const after = await call('GET', `/${loan.id}`);
  assert.equal(after.body.balance, 8000);
  assert.equal(after.body.status, 'Active');

  // ...and the same request succeeds normally afterwards.
  const retry = await repay(loan.id, '3000');
  assert.equal(retry.status, 201);
  assert.equal(retry.body.loan.balance, 5000);
});

test('if saving the repayment fails, nothing reaches the Cash Book', async () => {
  const loan = await createLoan({ loan_amount: '8000' });
  const cash = await getCashBalance(companyId);
  const ledgerRows = await countRows('finance_transactions');

  failNext(/INSERT INTO staff_loan_repayments/i);
  const result = await repay(loan.id, '3000');

  assert.equal(result.status, 500);
  assert.equal(await countRows('finance_transactions'), ledgerRows, 'Cash Book must not be updated without a repayment');
  assert.equal(await getCashBalance(companyId), cash);
});

test('if the final settle step fails, the whole repayment including the Cash Book entry is rolled back', async () => {
  const loan = await createLoan({ loan_amount: '600' });
  const cash = await getCashBalance(companyId);

  failNext(/UPDATE staff_loans SET status/i);
  const result = await repay(loan.id, '600');

  assert.equal(result.status, 500);
  assert.equal(await getCashBalance(companyId), cash);
  const after = await call('GET', `/${loan.id}`);
  assert.equal(after.body.balance, 600);
  assert.equal(after.body.status, 'Active');
});

// ------------------------------------------------------------------- listing

test('the list shows every loan (including settled ones) newest first, and can be filtered', async () => {
  const all = await call('GET', '');
  assert.equal(all.status, 200);
  const dates = all.body.map((l) => l.issued_date);
  assert.deepEqual(dates, [...dates].sort().reverse());
  assert.ok(all.body.some((l) => l.status === 'Settled'));
  assert.ok(all.body.some((l) => l.status === 'Active'));

  const settled = await call('GET', '?status=Settled');
  assert.ok(settled.body.length > 0 && settled.body.every((l) => l.status === 'Settled'));
  const active = await call('GET', '?status=Active');
  assert.ok(active.body.length > 0 && active.body.every((l) => l.status === 'Active'));
});
