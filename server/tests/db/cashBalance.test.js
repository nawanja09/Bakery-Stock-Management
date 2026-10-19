// Cash in hand cannot go negative (audit finding R5): a posting that needs more cash than the
// company's cash book holds is refused with InsufficientBalanceError (HTTP 400 for the user).
// Only the cash book's TOTAL counts - not its balance at the posting's date - and money coming in
// is never refused. Bank accounts are not checked.
//
// Drives the REAL ledger helpers, routers, auth / RBAC / period guard and the automatic cheque
// release over the MySQL TEST database (tests/db/useTestDatabase.js - never the real one).
// "Today" is pinned to 2026-10-16. Every row the tests create is removed again in test.after().

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
const cheques = require('../../services/chequeReleaseService');
const { recordCashTransaction, recordBankTransaction, getCashBalance, InsufficientBalanceError } = require('../../utils/financeLedger');
const { getJwtSecret, JWT_SIGN_OPTIONS } = require('../../config/secrets');

const RUN = crypto.randomBytes(4).toString('hex');
const created = { users: [], companies: [], banks: [], suppliers: [], purchases: [] };
const USERS = {};

let server;
let baseUrl;
let userId;

const one = async (sql, params = []) => (await pool.query(sql, params))[0][0];
const cents = (n) => Math.round(Number(n) * 100);

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

// A company with a cash book that holds `opening`.
const newCompany = async (opening = 0, label = 'C') => {
  const [c] = await pool.query('INSERT INTO company (name) VALUES (?)', [`${label} ${RUN} ${created.companies.length}`]);
  created.companies.push(c.insertId);
  await pool.query('INSERT IGNORE INTO cash_accounts (company_id, current_balance) VALUES (?, 0)', [c.insertId]);
  if (opening) await receive(c.insertId, opening);
  return c.insertId;
};

const post = (companyId, { debit = 0, credit = 0, date = '2026-10-10', createdBy = userId } = {}) =>
  withConnection((connection) => recordCashTransaction(connection, {
    companyId, date, remark: 'x', debit, credit, transactionType: 'Test', createdBy
  }));
const receive = (companyId, amount, date) => post(companyId, { debit: amount, date });
const pay = (companyId, amount, date) => post(companyId, { credit: amount, date });
const rowCount = async (companyId) => Number((await one(
  "SELECT COUNT(*) AS n FROM finance_transactions WHERE account_type = 'CASH' AND company_id = ?", [companyId])).n);

const call = async (method, path, body) => {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${USERS.accountant.token}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

test.before(async () => {
  await pool.financeSchemaReady;
  await pool.periodLockSchemaReady;

  const hash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 4);
  const [u] = await pool.query(
    'INSERT INTO users (name, username, password, role, status) VALUES (?, ?, ?, ?, 1)',
    [`Accountant ${RUN}`, `accountant-cb-${RUN}`, hash, 'Accountant']);
  userId = u.insertId;
  created.users.push(userId);
  USERS.accountant = { id: userId, token: jwt.sign({ userId, username: 'accountant', role: 'Accountant', tv: 0 }, getJwtSecret(), JWT_SIGN_OPTIONS) };

  const app = express();
  app.use(express.json());
  app.use('/api', authenticate, authorizeApi, periodGuard.periodErrorTranslator, periodGuard);
  // Stands in for a controller whose catch-all answers "Server error".
  app.post('/api/finance/__cash-test', async (req, res) => {
    try {
      await post(req.body.company_id, { credit: req.body.amount, createdBy: req.user.userId });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  });
  app.use('/api/finance', require('../../routes/financeRoutes'));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  delete process.env.CASH_ALLOW_NEGATIVE;
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  const del = async (sql, ids) => { if (ids.length) await pool.query(sql, [ids]); };
  await del('DELETE FROM expenses_cheque_registry WHERE company_id IN (?)', created.companies);
  await del('DELETE FROM payment_history WHERE purchase_id IN (?)', created.purchases);
  await del('DELETE FROM purchases WHERE id IN (?)', created.purchases);
  await del('DELETE FROM supplier WHERE id IN (?)', created.suppliers);
  await del('DELETE FROM finance_transactions WHERE company_id IN (?)', created.companies);
  await del('DELETE FROM finance_transactions WHERE bank_id IN (?)', created.banks);
  await del('DELETE FROM cash_accounts WHERE company_id IN (?)', created.companies);
  await del('DELETE FROM bank_details WHERE id IN (?)', created.banks);
  await del('DELETE FROM company WHERE id IN (?)', created.companies);
  await del('DELETE FROM users WHERE id IN (?)', created.users);
  await pool.end();
});

// ------------------------------------------------------------------ the helper

test('a payment within the cash in hand is posted, down to exactly zero', async () => {
  const company = await newCompany(1000);
  assert.equal(cents(await pay(company, 400)), 60000);
  assert.equal(cents(await pay(company, 600)), 0, 'the last rupee can be spent');
  assert.equal(cents(await getCashBalance(company)), 0);
});

test('a payment above the cash in hand is refused, says how much there is, and writes nothing', async () => {
  const company = await newCompany(1000);
  const rowsBefore = await rowCount(company);

  await assert.rejects(pay(company, 1500), (error) => {
    assert.ok(error instanceof InsufficientBalanceError);
    assert.equal(error.name, 'InsufficientBalanceError');
    assert.equal(error.status, 400);
    assert.equal(error.code, 'INSUFFICIENT_CASH');
    assert.match(error.message, /Not enough cash in hand/);
    assert.match(error.message, /Rs\. 1,500\.00/);
    assert.match(error.message, /Rs\. 1,000\.00 available/);
    assert.match(error.message, /Record the cash received first/);
    return true;
  });
  assert.equal(await rowCount(company), rowsBefore);
  assert.equal(cents(await getCashBalance(company)), 100000);
  assert.equal(cents((await one('SELECT current_balance FROM cash_accounts WHERE company_id = ?', [company])).current_balance), 100000);

  await assert.rejects(pay(company, 1000.01), InsufficientBalanceError, 'one cent too many');
  assert.equal(cents(await pay(company, 1000)), 0);
});

test('an empty cash book cannot pay anything; money coming in is never refused', async () => {
  const company = await newCompany(0);
  await assert.rejects(pay(company, 1), InsufficientBalanceError);
  assert.equal(cents(await receive(company, 250)), 25000);
  assert.equal(cents(await pay(company, 250)), 0);
});

test('a cash book that is already negative can receive money but not pay any', async () => {
  const company = await newCompany(0);
  // history that went negative before the rule existed
  await pool.query(
    `INSERT INTO finance_transactions (account_type, company_id, transaction_date, transaction_type, transaction_direction, remark, debit, credit, balance_after, created_by)
     VALUES ('CASH', ?, '2026-10-01', 'Test', 'OUT', 'old', 0, 300, -300, ?)`, [company, userId]);
  assert.equal(cents(await getCashBalance(company)), -30000);

  await assert.rejects(pay(company, 10), InsufficientBalanceError);
  assert.equal(cents(await receive(company, 100)), -20000, 'receipts still help');
  await assert.rejects(pay(company, 10), InsufficientBalanceError, 'still below zero');
  assert.equal(cents(await receive(company, 500)), 30000);
  assert.equal(cents(await pay(company, 300)), 0);
});

test('only the total counts: a back-dated payment is fine when today\'s cash covers it', async () => {
  const company = await newCompany(0);
  await receive(company, 1000, '2026-10-15');
  // on 2026-10-01 the book held nothing, but today it holds 1,000
  assert.equal(cents(await pay(company, 400, '2026-10-01')), 60000);
  await assert.rejects(pay(company, 700, '2026-10-02'), InsufficientBalanceError, 'more than is there today');
  assert.equal(cents(await getCashBalance(company)), 60000);
});

test('each company has its own cash book', async () => {
  const rich = await newCompany(5000);
  const poor = await newCompany(100);
  await assert.rejects(pay(poor, 200), InsufficientBalanceError);
  assert.equal(cents(await pay(rich, 200)), 480000);
});

test('bank accounts are not checked: they may be overdrawn', async () => {
  const company = await newCompany(0);
  const [b] = await pool.query("INSERT INTO bank_details (bank_name, account_number, company, status) VALUES (?, '5', 'JH', 'Active')", [`CB Bank ${RUN}`]);
  created.banks.push(b.insertId);
  const balance = await withConnection((connection) => recordBankTransaction(connection, {
    bankId: b.insertId, date: '2026-10-10', remark: 'x', credit: 750, transactionType: 'Test', createdBy: userId
  }));
  assert.equal(cents(balance), -75000);
  assert.ok(company);
});

test('CASH_ALLOW_NEGATIVE=on switches the check off', async () => {
  const company = await newCompany(100);
  process.env.CASH_ALLOW_NEGATIVE = 'on';
  try {
    assert.equal(cents(await pay(company, 250)), -15000);
  } finally {
    delete process.env.CASH_ALLOW_NEGATIVE;
  }
  await assert.rejects(pay(company, 1), InsufficientBalanceError, 'back on');
});

test('two payments at the same moment cannot both spend the same cash', async () => {
  const company = await newCompany(1000);
  const results = await Promise.allSettled([pay(company, 800), pay(company, 800)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const refused = results.find((r) => r.status === 'rejected');
  assert.ok(refused.reason instanceof InsufficientBalanceError);
  assert.equal(cents(await getCashBalance(company)), 20000);
});

// ------------------------------------------------------------------ what the user sees

test('a controller that answers "Server error" still shows the user the real reason (400)', async () => {
  const company = await newCompany(500);
  const refused = await call('POST', '/finance/__cash-test', { company_id: company, amount: 900 });
  assert.equal(refused.status, 400, JSON.stringify(refused.body));
  assert.equal(refused.body.code, 'INSUFFICIENT_CASH');
  assert.match(refused.body.error, /Rs\. 500\.00 available/);
  assert.equal((await call('POST', '/finance/__cash-test', { company_id: company, amount: 100 })).status, 200);
});

test('the real Cash to Bank transfer: refused when cash is short, nothing posted to either account', async () => {
  const company = await newCompany(1000);
  const [b] = await pool.query("INSERT INTO bank_details (bank_name, account_number, company, status) VALUES (?, '6', 'JH', 'Active')", [`CB Bank2 ${RUN}`]);
  created.banks.push(b.insertId);
  const transfer = (amount) => call('POST', '/finance/transfer', {
    company_id: company, from_account: 'CASH', to_account: 'BANK', bank_id: b.insertId, amount, date: '2026-10-12', remark: 'deposit'
  });

  const cashRows = await rowCount(company);
  const refused = await transfer(1500);
  assert.equal(refused.status, 400, JSON.stringify(refused.body));
  assert.match(refused.body.error, /Not enough cash in hand/);
  assert.equal(await rowCount(company), cashRows);
  assert.equal(Number((await one("SELECT COUNT(*) AS n FROM finance_transactions WHERE account_type = 'BANK' AND bank_id = ?", [b.insertId])).n), 0);

  const ok = await transfer(600);
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(cents(await getCashBalance(company)), 40000);
});

// ------------------------------------------------------------------ automatic cheque release

test('the automatic cheque release leaves a cash cheque the cash book cannot cover Pending, and releases the others', async () => {
  const company = await newCompany(10000);
  const [s] = await pool.query(`INSERT INTO supplier (name, address, city, contact_name, contact_phone) VALUES (?, 'x', 'x', 'x', '0000000000')`, [`CB Supplier ${RUN}`]);
  created.suppliers.push(s.insertId);

  // A supplier payment by cheque, paid from the cash book (no bank): registry row + payment row.
  let seq = 0;
  const makeCheque = async (amount) => {
    seq += 1;
    const [p] = await pool.query(
      `INSERT INTO purchases (invoice_no, purchase_date, supplier_id, bill_amount, subtotal, vat_amount, total_with_vat, vat_rate,
                              paid_amount, balance_amount, balance_status, payment_method, prepared_by, company_id, payment_status)
       VALUES (?, '2026-10-08', ?, ?, ?, 0, ?, 0, 0, ?, 1, 'CHEQUE', ?, ?, 'Non-Paid')`,
      [`CB-${RUN}-${seq}`, s.insertId, amount, amount, amount, amount, userId, company]);
    created.purchases.push(p.insertId);
    const [ph] = await pool.query(
      `INSERT INTO payment_history (purchase_id, payment_date, amount, payment_method, check_number, created_by)
       VALUES (?, '2026-10-08', ?, 'CHEQUE', ?, ?)`, [p.insertId, amount, `CHQ-${RUN}-${seq}`, userId]);
    const [r] = await pool.query(
      `INSERT INTO expenses_cheque_registry (source_type, source_id, type, date, name, cheque_number, amount, company_id, release_date, status)
       VALUES ('PURCHASING_PAYMENT', ?, 'Expense', '2026-10-08', 'x', ?, ?, ?, '2026-10-10', 'Pending')`,
      [ph.insertId, `CHQ-${RUN}-${seq}`, amount, company]);
    return r.insertId;
  };
  const big = await makeCheque(50000);
  const small = await makeCheque(4000);

  await cheques.processDueCheques();

  const statusOf = async (id) => (await one('SELECT status FROM expenses_cheque_registry WHERE id = ?', [id])).status;
  assert.equal(await statusOf(small), 'Released', 'the one the cash book can pay goes out');
  assert.equal(await statusOf(big), 'Pending', 'the other waits instead of overdrawing the cash book');
  assert.equal(cents(await getCashBalance(company)), 600000);

  // Once the cash is there, the next run releases it.
  await receive(company, 60000, '2026-10-11');
  await cheques.processDueCheques();
  assert.equal(await statusOf(big), 'Released');
  assert.equal(cents(await getCashBalance(company)), 1600000, '10,000 - 4,000 + 60,000 - 50,000');
});
