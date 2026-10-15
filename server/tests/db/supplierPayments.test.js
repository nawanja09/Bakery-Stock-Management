// Supplier invoice payment (audit R1) - POST /api/purchases/pay-multiple and
// POST /api/purchases/:id/pay.
//
// Drives the REAL routers, auth/role middleware, controller and Cash Book helper
// over HTTP on the MySQL TEST database (tests/db/useTestDatabase.js - never the
// real one), so row locking and REPEATABLE READ snapshots behave as in
// production. Every row the tests create is removed again in test.after().

require('./useTestDatabase');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const pool = require('../../config/db');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const paymentRoutes = require('../../routes/paymentRoutes');
const purchaseRoutes = require('../../routes/purchaseRoutes');
const { recordCashTransaction, getCashBalance } = require('../../utils/financeLedger');
const { getJwtSecret, JWT_SIGN_OPTIONS } = require('../../config/secrets');

const RUN = crypto.randomBytes(4).toString('hex');
const created = { users: [], companies: [], suppliers: [], purchases: [] };

let server;
let baseUrl;
let companyId;
let supplierId;
let actorUserId;
let token;
let invoiceSeq = 0;

const one = async (sql, params = []) => (await pool.query(sql, params))[0][0];
const cents = (n) => Math.round(Number(n) * 100);

// ---------------------------------------------------------------- race injection
// slowLocks(ms): every `SELECT … FROM purchases … FOR UPDATE` waits `ms` first,
// so two concurrent requests both finish their earlier statements before either
// takes the invoice lock - the worst case for a check-then-act race.
let lockDelayMs = 0;
const realGetConnection = pool.getConnection.bind(pool);
pool.getConnection = async () => {
  const conn = await realGetConnection();
  if (!lockDelayMs) return conn;
  const originalQuery = conn.query.bind(conn);
  const originalRelease = conn.release.bind(conn);
  conn.query = async (sql, ...rest) => {
    if (lockDelayMs && /FROM purchases[\s\S]*FOR UPDATE/i.test(String(sql))) {
      await new Promise((resolve) => setTimeout(resolve, lockDelayMs));
    }
    return originalQuery(sql, ...rest);
  };
  conn.release = () => { conn.query = originalQuery; conn.release = originalRelease; return originalRelease(); };
  return conn;
};

const call = async (method, path, { body, headers = {} } = {}) => {
  const response = await fetch(`${baseUrl}/api/purchases${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, body: json };
};

// An unpaid invoice of `total` (VAT 0) for the test supplier and company.
const createInvoice = async (total) => {
  invoiceSeq += 1;
  const [r] = await pool.query(
    `INSERT INTO purchases
       (invoice_no, purchase_date, supplier_id, bill_amount, subtotal, vat_amount, total_with_vat, vat_rate,
        paid_amount, balance_amount, balance_status, payment_method, prepared_by, company_id, payment_status)
     VALUES (?, '2026-10-01', ?, ?, ?, 0, ?, 0, 0, ?, 1, 'CASH', ?, ?, 'Non-Paid')`,
    [`R1-${RUN}-${invoiceSeq}`, supplierId, total, total, total, total, actorUserId, companyId]
  );
  created.purchases.push(r.insertId);
  return r.insertId;
};

const invoice = (id) => one('SELECT paid_amount, balance_amount, payment_status FROM purchases WHERE id = ?', [id]);
const paymentsFor = async (id) => Number((await one(
  'SELECT COUNT(*) AS n FROM purchase_payment_allocations WHERE purchase_id = ?', [id])).n);
const creditsOfSupplier = async () => (await pool.query(
  'SELECT original_amount, remaining_credit, status FROM supplier_overpayments WHERE supplier_id = ? ORDER BY id', [supplierId]))[0];

const pay = (body, headers) => call('POST', '/pay-multiple', {
  body: { payment_date: '2026-10-10', payment_method: 'CASH', ...body },
  headers
});

test.before(async () => {
  await pool.financeSchemaReady;
  await pool.paymentHistorySchemaReady;

  const hash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 4);
  const [u] = await pool.query(
    'INSERT INTO users (name, username, password, role, status) VALUES (?, ?, ?, ?, 1)',
    [`Accountant ${RUN}`, `accountant-r1-${RUN}`, hash, 'Accountant']
  );
  actorUserId = u.insertId;
  created.users.push(actorUserId);
  token = jwt.sign({ userId: actorUserId, username: 'Accountant', role: 'Accountant', tv: 0 }, getJwtSecret(), JWT_SIGN_OPTIONS);

  const [c] = await pool.query('INSERT INTO company (name) VALUES (?)', [`R1 ${RUN}`]);
  companyId = c.insertId;
  created.companies.push(companyId);
  await pool.query('INSERT IGNORE INTO cash_accounts (company_id, current_balance) VALUES (?, 0)', [companyId]);

  const [s] = await pool.query(
    `INSERT INTO supplier (name, address, city, contact_name, contact_phone) VALUES (?, 'x', 'x', 'x', '0000000000')`,
    [`Supplier ${RUN}`]
  );
  supplierId = s.insertId;
  created.suppliers.push(supplierId);

  // Opening cash of Rs. 1,000,000 through the real ledger helper.
  const connection = await pool.getConnection();
  try {
    await recordCashTransaction(connection, {
      companyId, date: '2026-01-01', remark: 'Opening Balance', debit: 1000000,
      transactionType: 'Opening Balance', createdBy: actorUserId
    });
  } finally {
    connection.release();
  }

  const app = express();
  app.use(express.json());
  app.use('/api/purchases', paymentRoutes);
  app.use('/api/purchases', purchaseRoutes);
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  lockDelayMs = 0;
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  if (created.purchases.length) {
    await pool.query(
      `DELETE ppa FROM purchase_payment_allocations ppa
         JOIN payment_history ph ON ph.id = ppa.payment_history_id
        WHERE ph.purchase_id IN (?) OR ppa.purchase_id IN (?)`, [created.purchases, created.purchases]);
    await pool.query('DELETE FROM payment_history WHERE purchase_id IN (?)', [created.purchases]);
    await pool.query('DELETE FROM purchases WHERE id IN (?)', [created.purchases]);
  }
  if (created.suppliers.length) await pool.query('DELETE FROM supplier_overpayments WHERE supplier_id IN (?)', [created.suppliers]);
  if (created.companies.length) {
    await pool.query("DELETE FROM finance_transactions WHERE account_type = 'CASH' AND company_id IN (?)", [created.companies]);
    await pool.query('DELETE FROM cash_accounts WHERE company_id IN (?)', [created.companies]);
    await pool.query('DELETE FROM company WHERE id IN (?)', [created.companies]);
  }
  if (created.suppliers.length) await pool.query('DELETE FROM supplier WHERE id IN (?)', [created.suppliers]);
  if (created.users.length) await pool.query('DELETE FROM users WHERE id IN (?)', [created.users]);
  await pool.end();
});

// ------------------------------------------------------------------ R1.1 race

test('two people paying the same invoice at the same moment: only one payment goes through', async () => {
  const id = await createInvoice(10000);
  const cashBefore = await getCashBalance(companyId);

  lockDelayMs = 300;
  let results;
  try {
    results = await Promise.all([1, 2].map(() =>
      pay({ amount: 10000, invoice_allocations: [{ purchase_id: id, amount: 10000 }] })));
  } finally {
    lockDelayMs = 0;
  }

  const ok = results.filter((r) => r.status === 200);
  const refused = results.filter((r) => r.status === 409);
  assert.equal(ok.length, 1, `exactly one payment must succeed: ${JSON.stringify(results.map((r) => [r.status, r.body]))}`);
  assert.equal(refused.length, 1, 'the other must be refused with 409');
  assert.match(refused[0].body.error, /refresh/i);

  assert.equal(cents(await getCashBalance(companyId)), cents(cashBefore) - 1000000, 'cash leaves once');
  const row = await invoice(id);
  assert.equal(cents(row.paid_amount), 1000000);
  assert.equal(cents(row.balance_amount), 0);
  assert.equal(row.payment_status, 'Paid');
  assert.equal(await paymentsFor(id), 1);
});

test('two concurrent part-payments that fit the balance both go through, and add up', async () => {
  const id = await createInvoice(10000);
  const cashBefore = await getCashBalance(companyId);

  lockDelayMs = 300;
  let results;
  try {
    results = await Promise.all([1, 2].map(() =>
      pay({ amount: 4000, invoice_allocations: [{ purchase_id: id, amount: 4000 }] })));
  } finally {
    lockDelayMs = 0;
  }

  assert.deepEqual(results.map((r) => r.status), [200, 200], JSON.stringify(results.map((r) => r.body)));
  assert.equal(cents(await getCashBalance(companyId)), cents(cashBefore) - 800000);
  const row = await invoice(id);
  assert.equal(cents(row.paid_amount), 800000, 'the second payment must not overwrite the first');
  assert.equal(cents(row.balance_amount), 200000);
  assert.equal(row.payment_status, 'Partially Paid');
});

// ------------------------------------------------------------------ R1.2 cap

test('an allocation above what the invoice still owes is refused and posts nothing', async () => {
  const id = await createInvoice(1000);
  const cashBefore = await getCashBalance(companyId);

  const result = await pay({ amount: 50000, invoice_allocations: [{ purchase_id: id, amount: 50000 }] });

  assert.equal(result.status, 409, JSON.stringify(result.body));
  assert.equal(cents(await getCashBalance(companyId)), cents(cashBefore));
  const row = await invoice(id);
  assert.equal(cents(row.paid_amount), 0);
  assert.equal(cents(row.balance_amount), 100000);
  assert.equal(await paymentsFor(id), 0);
});

test('single-invoice Pay above the balance is refused', async () => {
  const id = await createInvoice(1000);
  const result = await call('POST', `/${id}/pay`, {
    body: { payment_date: '2026-10-10', payment_method: 'CASH', amount: 1500 }
  });
  assert.equal(result.status, 409, JSON.stringify(result.body));
  assert.equal(cents((await invoice(id)).balance_amount), 100000);
});

// ------------------------------------------------------------------ R1.3 excess

test('paying more than the selected invoices owe stores the excess as supplier credit', async () => {
  const a = await createInvoice(60000);
  const b = await createInvoice(40000);
  const cashBefore = await getCashBalance(companyId);
  const creditsBefore = (await creditsOfSupplier()).length;

  // What InvoicePaymentModal sends when Rs. 150,000 is typed for Rs. 100,000 due.
  const result = await pay({
    amount: 150000,
    invoice_allocations: [{ purchase_id: a, amount: 60000 }, { purchase_id: b, amount: 40000 }]
  });

  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(cents(result.body.applied_amount), 10000000);
  assert.equal(cents(result.body.supplier_credit_amount), 5000000);
  assert.equal(cents(await getCashBalance(companyId)), cents(cashBefore) - 15000000, 'the full amount leaves cash');
  assert.equal((await invoice(a)).payment_status, 'Paid');
  assert.equal((await invoice(b)).payment_status, 'Paid');

  const credits = await creditsOfSupplier();
  assert.equal(credits.length, creditsBefore + 1, 'one supplier credit row for the excess');
  const credit = credits[credits.length - 1];
  assert.equal(cents(credit.original_amount), 5000000);
  assert.equal(cents(credit.remaining_credit), 5000000);
  assert.equal(credit.status, 'Active');

  // The payment record holds what reached the invoices; the excess is its own
  // Advance Payment line in the cash book, so nothing is counted twice.
  const payment = await one('SELECT amount FROM payment_history WHERE id = ?', [result.body.payment_id]);
  assert.equal(cents(payment.amount), 10000000);
  const ledger = (await pool.query(
    `SELECT reference_type, credit FROM finance_transactions
      WHERE account_type = 'CASH' AND company_id = ? AND status = 1
        AND ((reference_type = 'PURCHASE_PAYMENT' AND reference_id = ?) OR (reference_type = 'SUPPLIER_ADVANCE' AND reference_id = ?))
      ORDER BY id`,
    [companyId, result.body.payment_id, result.body.supplier_credit.id]))[0];
  assert.deepEqual(ledger.map((row) => [row.reference_type, cents(row.credit)]),
    [['PURCHASE_PAYMENT', 10000000], ['SUPPLIER_ADVANCE', 5000000]]);
});

test('paying more than owed by cheque is refused (the excess must be an Advance Payment)', async () => {
  const id = await createInvoice(1000);
  const result = await pay({
    payment_method: 'CHEQUE', check_number: `CHQ-${RUN}`, amount: 1500,
    invoice_allocations: [{ purchase_id: id, amount: 1000 }]
  });
  assert.equal(result.status, 400, JSON.stringify(result.body));
  assert.match(result.body.error, /Advance Payment/);
  assert.equal(await paymentsFor(id), 0);
});

test('a payment amount below the allocations is refused', async () => {
  const id = await createInvoice(10000);
  const result = await pay({ amount: 3000, invoice_allocations: [{ purchase_id: id, amount: 5000 }] });
  assert.equal(result.status, 400, JSON.stringify(result.body));
  assert.equal(await paymentsFor(id), 0);
});

test('the same invoice twice in one payment is refused', async () => {
  const id = await createInvoice(10000);
  const result = await pay({
    amount: 2000,
    invoice_allocations: [{ purchase_id: id, amount: 1000 }, { purchase_id: id, amount: 1000 }]
  });
  assert.equal(result.status, 400, JSON.stringify(result.body));
  assert.equal(await paymentsFor(id), 0);
});

// ------------------------------------------------------------------ double submit

test('the same request_id sent twice (what the payment screens send) records the payment once', async () => {
  const id = await createInvoice(10000);
  const cashBefore = await getCashBalance(companyId);
  const key = `pay-${RUN}-${crypto.randomUUID()}`;
  const body = { amount: 3000, invoice_allocations: [{ purchase_id: id, amount: 3000 }], request_id: key };

  const first = await pay(body);
  const second = await pay(body);

  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(second.body.duplicate, true);
  assert.equal(second.body.payment_id, first.body.payment_id);
  assert.equal(cents(await getCashBalance(companyId)), cents(cashBefore) - 300000, 'cash leaves once');
  assert.equal(cents((await invoice(id)).paid_amount), 300000);
});

test('the same Idempotency-Key sent twice at the same moment records the payment once', async () => {
  const id = await createInvoice(10000);
  const cashBefore = await getCashBalance(companyId);
  const key = `pay-${RUN}-${crypto.randomUUID()}`;
  const body = { amount: 3000, invoice_allocations: [{ purchase_id: id, amount: 3000 }] };

  lockDelayMs = 300;
  let results;
  try {
    results = await Promise.all([1, 2].map(() => pay(body, { 'Idempotency-Key': key })));
  } finally {
    lockDelayMs = 0;
  }

  assert.deepEqual(results.map((r) => r.status), [200, 200], JSON.stringify(results.map((r) => r.body)));
  assert.equal(results.filter((r) => r.body.duplicate === true).length, 1);
  assert.equal(results[0].body.payment_id, results[1].body.payment_id);
  assert.equal(cents(await getCashBalance(companyId)), cents(cashBefore) - 300000, 'cash leaves once');
  assert.equal(await paymentsFor(id), 1);
});

// ------------------------------------------------------------------ unchanged behaviour

test('a normal part-payment and then the rest still settle the invoice', async () => {
  const id = await createInvoice(10000);
  const cashBefore = await getCashBalance(companyId);

  assert.equal((await pay({ amount: 2500.5, invoice_allocations: [{ purchase_id: id, amount: 2500.5 }] })).status, 200);
  let row = await invoice(id);
  assert.equal(row.payment_status, 'Partially Paid');
  assert.equal(cents(row.balance_amount), 749950);

  assert.equal((await call('POST', `/${id}/pay`, {
    body: { payment_date: '2026-10-11', payment_method: 'CASH', amount: 7499.5 }
  })).status, 200);
  row = await invoice(id);
  assert.equal(row.payment_status, 'Paid');
  assert.equal(cents(row.balance_amount), 0);
  assert.equal(cents(await getCashBalance(companyId)), cents(cashBefore) - 1000000);
});

test('an already fully paid invoice cannot be paid again', async () => {
  const id = await createInvoice(500);
  assert.equal((await pay({ amount: 500, invoice_allocations: [{ purchase_id: id, amount: 500 }] })).status, 200);
  const again = await pay({ amount: 500, invoice_allocations: [{ purchase_id: id, amount: 500 }] });
  assert.ok([400, 409].includes(again.status), JSON.stringify(again.body));
  assert.equal(await paymentsFor(id), 1);
});
