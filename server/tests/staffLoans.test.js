// Staff Loans API tests.
//
// These drive the REAL router, auth/role middleware, controller and the REAL
// Cash Book helper (utils/financeLedger.recordCashTransaction) over HTTP, on
// an in-memory SQLite database (see helpers/sqliteMysqlAdapter.js) so no MySQL
// server is needed. They are skipped automatically on Node versions without
// node:sqlite. Row locking (FOR UPDATE) is not exercised by this harness.

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = 'staff-loan-test-secret';

const { createSqliteMysqlPool, sqliteAvailable } = require('./helpers/sqliteMysqlAdapter');

if (!sqliteAvailable) {
  test('Staff Loans API tests', { skip: 'node:sqlite is not available on this Node version' }, () => {});
  return;
}

const pool = createSqliteMysqlPool();
const dbModulePath = require.resolve('../config/db');
require.cache[dbModulePath] = { id: dbModulePath, filename: dbModulePath, loaded: true, exports: pool };

const express = require('express');
const jwt = require('jsonwebtoken');
const readOnly = require('../middleware/readOnly');
const staffLoanRoutes = require('../routes/staffLoanRoutes');
const { recordCashTransaction, getCashBalance } = require('../utils/financeLedger');

const token = (role, userId = 7) =>
  jwt.sign({ userId, username: role.toLowerCase(), role }, process.env.JWT_SECRET);
const TOKENS = {
  accountant: token('Accountant', 7),
  admin: token('Admin', 1),
  viewOnly: token('View Only', 9),
  storeKeeper: token('Store Keeper', 5)
};

let server;
let baseUrl;
let employeeA;
let employeeB;
let inactiveEmployee;
let companyId;
let emptyCompanyId;

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

const countRows = (table, where = '1=1', params = []) =>
  Number(pool.raw.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get(...params).n);

test.before(async () => {
  pool.raw.exec(`
    INSERT INTO company (name) VALUES ('JH'), ('NoCashBook');
    INSERT INTO cash_accounts (company_id, current_balance) VALUES (1, 0);
    INSERT INTO employees (employee_code, employee_name, status) VALUES
      ('EMP-001', 'Employee A', 'Active'),
      ('EMP-002', 'Employee B', 'Active'),
      ('EMP-003', 'Former Employee', 'Inactive');
    INSERT INTO users (name, role) VALUES ('Admin', 'Admin');
  `);
  companyId = 1;
  emptyCompanyId = 2;
  employeeA = 1;
  employeeB = 2;
  inactiveEmployee = 3;

  // Opening cash balance of Rs. 100,000 through the real ledger helper.
  const connection = await pool.getConnection();
  await recordCashTransaction(connection, {
    companyId, date: '2026-01-01', remark: 'Opening Balance', debit: 100000,
    transactionType: 'Opening Balance', createdBy: 1
  });

  const app = express();
  app.use(express.json());
  app.use('/api', readOnly);
  app.use('/api/staff-loans', staffLoanRoutes);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => { server?.close(); });

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
  assert.deepEqual(body.companies.map((c) => c.name), ['JH']);
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

  const stored = pool.raw.prepare('SELECT * FROM staff_loans WHERE id = ?').get(loan.id);
  assert.equal(stored.employee_id, employeeA);
  assert.equal(stored.loan_amount, 50000);
  assert.equal(stored.issued_date, '2026-09-21');
  assert.equal(stored.status, 'Active');

  // Issuing the loan does not touch the Cash Book (only repayments do).
  assert.equal(await getCashBalance(companyId), before);
});

test('supports decimal loan amounts and an empty cheque detail', async () => {
  const loan = await createLoan({ loan_amount: '12345.67', cheque_details: '' });
  assert.equal(loan.loan_amount, 12345.67);
  assert.equal(loan.balance, 12345.67);
  assert.equal(loan.cheque_details, null);
});

test('backend rejects invalid loan amounts', async () => {
  for (const bad of ['0', 0, '-100', -1, '', null, 'abc', '10.999', '1e5']) {
    const before = countRows('staff_loans');
    const result = await call('POST', '', {
      body: { employee_id: employeeA, company_id: companyId, loan_amount: bad, issued_date: '2026-09-01' }
    });
    assert.equal(result.status, 400, `amount ${JSON.stringify(bad)} should be rejected`);
    assert.ok(result.body.error);
    assert.equal(countRows('staff_loans'), before);
  }
});

test('backend rejects missing/invalid employee, company, date and over-long cheque details', async () => {
  const valid = { employee_id: employeeA, company_id: companyId, loan_amount: '100', issued_date: '2026-09-01' };
  const cases = [
    { ...valid, employee_id: undefined },
    { ...valid, employee_id: 'abc' },
    { ...valid, employee_id: 9999 },
    { ...valid, employee_id: inactiveEmployee },
    { ...valid, company_id: undefined },
    { ...valid, company_id: 9999 },
    { ...valid, company_id: emptyCompanyId },
    { ...valid, issued_date: undefined },
    { ...valid, issued_date: '2026-02-30' },
    { ...valid, issued_date: '21/09/2026' },
    { ...valid, cheque_details: 'x'.repeat(501) },
    { ...valid, cheque_details: 12345 }
  ];
  for (const body of cases) {
    const before = countRows('staff_loans');
    const result = await call('POST', '', { body });
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.equal(countRows('staff_loans'), before);
  }
});

// ------------------------------------------------------ full repayment flow

test('partial, second and final repayments keep loan balance and Cash Book in sync', async () => {
  const cashStart = await getCashBalance(companyId);
  const loan = await createLoan({ loan_amount: '50000', issued_date: '2026-09-01' });

  // First repayment: 10,000
  let result = await repay(loan.id, '10000', '2026-09-10');
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.loan.loan_amount, 50000, 'original loan amount is never overwritten');
  assert.equal(result.body.loan.balance, 40000);
  assert.equal(result.body.loan.status, 'Active');
  assert.equal(result.body.cash_balance, cashStart + 10000);
  assert.equal(await getCashBalance(companyId), cashStart + 10000);

  // The Cash Book row: DEBIT / IN, with the required remark and the entered date.
  const ledger = pool.raw.prepare(
    "SELECT * FROM finance_transactions WHERE reference_type = 'STAFF_LOAN_REPAYMENT' AND reference_id = ?"
  ).get(result.body.repayment.id);
  assert.equal(ledger.account_type, 'CASH');
  assert.equal(ledger.company_id, companyId);
  assert.equal(ledger.debit, 10000);
  assert.equal(ledger.credit, 0);
  assert.equal(ledger.transaction_direction, 'IN');
  assert.equal(ledger.remark, 'Staff Loan Repayment - Employee A');
  assert.equal(ledger.transaction_date, '2026-09-10');
  assert.equal(ledger.transaction_type, 'Staff Loan Repayment');
  assert.equal(ledger.status, 1);
  const repaymentRow = pool.raw.prepare('SELECT * FROM staff_loan_repayments WHERE id = ?').get(result.body.repayment.id);
  assert.equal(repaymentRow.finance_transaction_id, ledger.id);

  // Second repayment: 15,000
  result = await repay(loan.id, '15000', '2026-09-15');
  assert.equal(result.status, 201);
  assert.equal(result.body.loan.balance, 25000);
  assert.equal(await getCashBalance(companyId), cashStart + 25000);

  // Over-payment is rejected and changes nothing.
  const repaymentsBefore = countRows('staff_loan_repayments', 'staff_loan_id = ?', [loan.id]);
  const ledgerBefore = countRows('finance_transactions');
  result = await repay(loan.id, '25000.01');
  assert.equal(result.status, 400);
  assert.match(result.body.error, /outstanding balance of Rs\. 25,000\.00/);
  assert.equal(countRows('staff_loan_repayments', 'staff_loan_id = ?', [loan.id]), repaymentsBefore);
  assert.equal(countRows('finance_transactions'), ledgerBefore);
  assert.equal(await getCashBalance(companyId), cashStart + 25000);

  // Final repayment settles the loan.
  result = await repay(loan.id, '25000', '2026-09-21');
  assert.equal(result.status, 201);
  assert.equal(result.body.loan.balance, 0);
  assert.equal(result.body.loan.status, 'Settled');
  assert.equal(await getCashBalance(companyId), cashStart + 50000);
  assert.equal(pool.raw.prepare('SELECT status FROM staff_loans WHERE id = ?').get(loan.id).status, 'Settled');

  // A settled loan cannot receive more cash and the Cash Book is untouched.
  const settledLedgerCount = countRows('finance_transactions');
  result = await repay(loan.id, '1');
  assert.equal(result.status, 400);
  assert.match(result.body.error, /fully settled/);
  assert.equal(countRows('finance_transactions'), settledLedgerCount);
  assert.equal(await getCashBalance(companyId), cashStart + 50000);

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
  pool.raw.prepare("UPDATE staff_loans SET status = 'Settled' WHERE id = ?").run(loan.id);
  const fetched = await call('GET', `/${loan.id}`);
  assert.equal(fetched.body.balance, 1500);
  assert.equal(fetched.body.status, 'Active');
});

// ------------------------------------------------------ repayment validation

test('backend rejects invalid repayments and leaves everything unchanged', async () => {
  const loan = await createLoan({ loan_amount: '10000', issued_date: '2026-09-05' });
  const cash = await getCashBalance(companyId);
  const ledgerRows = countRows('finance_transactions');
  const repaymentRows = countRows('staff_loan_repayments');

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

  assert.equal(countRows('finance_transactions'), ledgerRows);
  assert.equal(countRows('staff_loan_repayments'), repaymentRows);
  assert.equal(await getCashBalance(companyId), cash);
});

test('invalid or unknown loan ids are rejected on every endpoint', async () => {
  for (const id of ['abc', '0', '-1', '1.5']) {
    assert.equal((await call('GET', `/${id}`)).status, 400, `GET ${id}`);
    assert.equal((await call('GET', `/${id}/repayments`)).status, 400, `history ${id}`);
    assert.equal((await repay(id, '10')).status, 400, `repay ${id}`);
  }
  assert.equal((await call('GET', '/999999')).status, 404);
  assert.equal((await call('GET', '/999999/repayments')).status, 404);
  const missing = await repay(999999, '10');
  assert.equal(missing.status, 404);
});

test('a deactivated employee can still repay an existing loan', async () => {
  const loan = await createLoan({ employee_id: employeeB, loan_amount: '3000' });
  pool.raw.prepare("UPDATE employees SET status = 'Inactive' WHERE id = ?").run(employeeB);
  try {
    const result = await repay(loan.id, '1000');
    assert.equal(result.status, 201);
    assert.equal(result.body.loan.balance, 2000);
  } finally {
    pool.raw.prepare("UPDATE employees SET status = 'Active' WHERE id = ?").run(employeeB);
  }
});

// ---------------------------------------------------- transaction consistency

test('if the Cash Book posting fails, the repayment is rolled back too', async () => {
  const loan = await createLoan({ loan_amount: '8000' });
  const cash = await getCashBalance(companyId);
  const repaymentRows = countRows('staff_loan_repayments');
  const ledgerRows = countRows('finance_transactions');

  pool.failNext(/INSERT INTO finance_transactions/i);
  const result = await repay(loan.id, '3000');

  assert.equal(result.status, 500);
  assert.equal(countRows('staff_loan_repayments'), repaymentRows, 'repayment must not be saved without a Cash Book entry');
  assert.equal(countRows('finance_transactions'), ledgerRows);
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
  const ledgerRows = countRows('finance_transactions');

  pool.failNext(/INSERT INTO staff_loan_repayments/i);
  const result = await repay(loan.id, '3000');

  assert.equal(result.status, 500);
  assert.equal(countRows('finance_transactions'), ledgerRows, 'Cash Book must not be updated without a repayment');
  assert.equal(await getCashBalance(companyId), cash);
});

test('if the final settle step fails, the whole repayment including the Cash Book entry is rolled back', async () => {
  const loan = await createLoan({ loan_amount: '600' });
  const cash = await getCashBalance(companyId);

  pool.failNext(/UPDATE staff_loans SET status/i);
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
