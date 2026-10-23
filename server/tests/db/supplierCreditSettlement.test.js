// Invoice settlements that move no money - an advance payment / overpayment or a
// purchase return applied to an invoice:
//   POST /api/suppliers/settle-credit          (Settle Now)
//   POST /api/purchase-returns                 (return with invoice settlements)
//   POST /api/purchase-returns/:id/settle      (settle a return against invoices)
// and their place in Payment History and Purchasing Payment adjustments.
//
// Drives the REAL routers, auth/role middleware and controllers over HTTP on the
// MySQL TEST database (tests/db/useTestDatabase.js - never the real one). Every
// row the tests create is removed again in test.after().

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
const supplierCreditRoutes = require('../../routes/supplierCreditRoutes');
const purchaseReturnRoutes = require('../../routes/purchaseReturnRoutes');
const { ensureSettlementPaymentMethods } = require('../../services/settlementPaymentMethods');
const { recordCashTransaction, getCashBalance } = require('../../utils/financeLedger');
const { getJwtSecret, JWT_SIGN_OPTIONS } = require('../../config/secrets');

const RUN = crypto.randomBytes(4).toString('hex');
const created = { users: [], companies: [], suppliers: [], purchases: [], items: [] };

let server;
let baseUrl;
let companyId;
let supplierId;
let itemId;
let actorUserId;
const TOKENS = {};
let seq = 0;

const one = async (sql, params = []) => (await pool.query(sql, params))[0][0];
const cents = (n) => Math.round(Number(n) * 100);

const call = async (method, path, body, who = 'accountant') => {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKENS[who]}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

const createInvoice = async (total) => {
  seq += 1;
  const [r] = await pool.query(
    `INSERT INTO purchases
       (invoice_no, purchase_date, supplier_id, bill_amount, subtotal, vat_amount, total_with_vat, vat_rate,
        paid_amount, balance_amount, balance_status, payment_method, prepared_by, company_id, payment_status)
     VALUES (?, '2026-10-08', ?, ?, ?, 0, ?, 0, 0, ?, 1, 'CASH', ?, ?, 'Non-Paid')`,
    [`SC-${RUN}-${seq}`, supplierId, total, total, total, total, actorUserId, companyId]
  );
  created.purchases.push(r.insertId);
  return r.insertId;
};

const advance = async (amount) => {
  const r = await call('POST', '/suppliers/pay-now', {
    supplier_id: supplierId, company_id: companyId, payment_date: '2026-10-05', payment_method: 'CASH', amount
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.overpayment;
};

// A purchase return worth `amount` (1 unit, VAT 0). Without settlements its
// whole value becomes a return credit (CRD-…).
const purchaseReturn = async (amount, settlements) => {
  seq += 1;
  const returnNumber = `PR-${RUN}-${seq}`;
  const r = await call('POST', '/purchase-returns', {
    return_number: returnNumber, supplier_id: supplierId, return_date: '2026-10-09', returned_by: actorUserId,
    items: [{ item_id: itemId, item_name: 'Flour', return_quantity: 1, unit_price: amount, vat_applicable: 0 }],
    payment_method: 'CASH', settlements
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { id: r.body.return_id, returnNumber };
};

const settle = (purchaseId, credits) => call('POST', '/suppliers/settle-credit', {
  purchase_id: purchaseId, settlement_date: '2026-10-12', settled_by: actorUserId, notes: 'from credits', credits
});

const pay = (purchaseId, amount) => call('POST', '/purchases/pay-multiple', {
  payment_date: '2026-10-13', payment_method: 'CASH', amount,
  invoice_allocations: [{ purchase_id: purchaseId, amount }]
});

const historyOf = async (purchaseId) => {
  const details = await call('GET', `/purchases/${purchaseId}`);
  assert.equal(details.status, 200, JSON.stringify(details.body));
  return {
    invoice: details.body,
    rows: details.body.payments
      .map((p) => [p.payment_method, cents(p.paid_amount), p.check_number || null])
      .sort((a, b) => a[0].localeCompare(b[0]))
  };
};

test.before(async () => {
  await pool.financeSchemaReady;
  await pool.paymentHistorySchemaReady;

  const hash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 4);
  for (const [key, role] of [['accountant', 'Accountant'], ['admin', 'Admin']]) {
    const [u] = await pool.query(
      'INSERT INTO users (name, username, password, role, status) VALUES (?, ?, ?, ?, 1)',
      [`${role} ${RUN}`, `${key}-sc-${RUN}`, hash, role]
    );
    created.users.push(u.insertId);
    TOKENS[key] = jwt.sign({ userId: u.insertId, username: role, role, tv: 0 }, getJwtSecret(), JWT_SIGN_OPTIONS);
  }
  actorUserId = created.users[0];

  const [c] = await pool.query('INSERT INTO company (name) VALUES (?)', [`SC ${RUN}`]);
  companyId = c.insertId;
  created.companies.push(companyId);
  await pool.query('INSERT IGNORE INTO cash_accounts (company_id, current_balance) VALUES (?, 0)', [companyId]);

  const [s] = await pool.query(
    `INSERT INTO supplier (name, address, city, contact_name, contact_phone) VALUES (?, 'x', 'x', 'x', '0000000000')`,
    [`Supplier ${RUN}`]
  );
  supplierId = s.insertId;
  created.suppliers.push(supplierId);

  const [i] = await pool.query(`INSERT INTO items (item_code, name, unit, reorder_level) VALUES (?, ?, 'kg', 0)`,
    [`SC-${RUN}`, `Flour ${RUN}`]);
  itemId = i.insertId;
  created.items.push(itemId);
  // Purchase returns now check the live stock (audit H4): give the test item some.
  await pool.query(`INSERT INTO opening_balances (date, item_id, quantity) VALUES ('2026-01-01', ?, 1000)`, [itemId]);

  const connection = await pool.getConnection();
  try {
    await recordCashTransaction(connection, {
      companyId, date: '2026-10-01', remark: 'Opening Balance', debit: 1000000,
      transactionType: 'Opening Balance', createdBy: actorUserId
    });
  } finally {
    connection.release();
  }

  const app = express();
  app.use(express.json());
  app.use('/api/purchases', paymentRoutes);
  app.use('/api/purchases', purchaseRoutes);
  app.use('/api/suppliers', supplierCreditRoutes);
  app.use('/api/purchase-returns', purchaseReturnRoutes);
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  if (created.purchases.length) {
    await pool.query('DELETE FROM credit_allocations WHERE purchase_id IN (?)', [created.purchases]);
    await pool.query(
      `DELETE ppa FROM purchase_payment_allocations ppa
         JOIN payment_history ph ON ph.id = ppa.payment_history_id
        WHERE ph.purchase_id IN (?) OR ppa.purchase_id IN (?)`, [created.purchases, created.purchases]);
    await pool.query(
      "DELETE FROM finance_transactions WHERE reference_type = 'PURCHASE_PAYMENT' AND reference_id IN (SELECT id FROM payment_history WHERE purchase_id IN (?))",
      [created.purchases]);
    await pool.query('DELETE FROM payment_history WHERE purchase_id IN (?)', [created.purchases]);
  }
  if (created.suppliers.length) {
    await pool.query('DELETE FROM purchase_return_credits WHERE supplier_id IN (?)', [created.suppliers]);
    await pool.query(
      'DELETE pri FROM purchase_return_items pri JOIN purchase_returns pr ON pr.id = pri.return_id WHERE pr.supplier_id IN (?)',
      [created.suppliers]);
    await pool.query('DELETE FROM purchase_returns WHERE supplier_id IN (?)', [created.suppliers]);
    await pool.query('DELETE FROM supplier_overpayments WHERE supplier_id IN (?)', [created.suppliers]);
  }
  if (created.purchases.length) await pool.query('DELETE FROM purchases WHERE id IN (?)', [created.purchases]);
  if (created.companies.length) {
    await pool.query("DELETE FROM finance_transactions WHERE account_type = 'CASH' AND company_id IN (?)", [created.companies]);
    await pool.query('DELETE FROM cash_accounts WHERE company_id IN (?)', [created.companies]);
    await pool.query('DELETE FROM company WHERE id IN (?)', [created.companies]);
  }
  if (created.suppliers.length) await pool.query('DELETE FROM supplier WHERE id IN (?)', [created.suppliers]);
  if (created.items.length) await pool.query('DELETE FROM opening_balances WHERE item_id IN (?)', [created.items]);
  if (created.items.length) await pool.query('DELETE FROM items WHERE id IN (?)', [created.items]);
  if (created.users.length) await pool.query('DELETE FROM users WHERE id IN (?)', [created.users]);
  await pool.end();
});

// ------------------------------------------------------------------ schema

test('payment_history keeps every earlier method and accepts the settlement methods', async () => {
  const column = await one("SHOW COLUMNS FROM payment_history LIKE 'payment_method'");
  for (const value of ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT_CARD', 'ADVANCE_PAYMENT', 'PURCHASE_RETURN', 'SUPPLIER_CREDIT']) {
    assert.ok(column.Type.includes(`'${value}'`), `${value} missing from ${column.Type}`);
  }
});

// ------------------------------------------------------------------ Payment History rows

test('advance, cash part-payment, then settle the rest: an Advance Payment row and a Cash row', async () => {
  const adv = await advance(5000);
  const id = await createInvoice(12000);
  assert.equal((await pay(id, 7000)).status, 200);
  const cashAfterPayment = await getCashBalance(companyId);

  const result = await settle(id, [{ credit_type: 'overpayment', credit_id: adv.id, amount: 5000 }]);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(cents(await getCashBalance(companyId)), cents(cashAfterPayment), 'settling moves no cash');

  const { invoice, rows } = await historyOf(id);
  assert.equal(invoice.payment_status, 'Paid');
  assert.equal(cents(invoice.balance_amount), 0);
  assert.deepEqual(rows, [
    ['ADVANCE_PAYMENT', 500000, adv.overpayment_number],
    ['CASH', 700000, null]
  ]);
});

test('Settle Now with an advance AND a return credit: one row for each source', async () => {
  const adv = await advance(3000);
  const ret = await purchaseReturn(2000);
  const credits = (await call('GET', `/suppliers/${supplierId}/credits`)).body;
  const returnCredit = credits.return_credits.find((c) => c.purchase_return_id === ret.id) || credits.return_credits[0];
  assert.ok(returnCredit, 'the return created a return credit');

  const id = await createInvoice(5000);
  const result = await settle(id, [
    { credit_type: 'overpayment', credit_id: adv.id, amount: 3000 },
    { credit_type: 'return_credit', credit_id: returnCredit.id, amount: 2000 }
  ]);
  assert.equal(result.status, 200, JSON.stringify(result.body));

  const { invoice, rows } = await historyOf(id);
  assert.equal(invoice.payment_status, 'Paid');
  assert.deepEqual(rows, [
    ['ADVANCE_PAYMENT', 300000, adv.overpayment_number],
    ['PURCHASE_RETURN', 200000, returnCredit.credit_number]
  ]);
});

test('settling a purchase return against an invoice records Purchase Return, not Cash', async () => {
  const id = await createInvoice(4000);
  const cashBefore = await getCashBalance(companyId);
  const ret = await purchaseReturn(1500);

  // The return page still sends payment_method 'CASH'.
  const result = await call('POST', `/purchase-returns/${ret.id}/settle`, {
    settlements: [{ purchase_id: id, amount: 1500 }], payment_method: 'CASH',
    settlement_date: '2026-10-10', settled_by: actorUserId
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));

  const { rows } = await historyOf(id);
  assert.deepEqual(rows, [['PURCHASE_RETURN', 150000, ret.returnNumber]]);
  assert.equal(cents(await getCashBalance(companyId)), cents(cashBefore), 'a return moves no cash');
});

test('a return created with invoice settlements records Purchase Return, not Cash', async () => {
  const id = await createInvoice(4000);
  const ret = await purchaseReturn(1000, [{ purchase_id: id, amount: 1000 }]);
  const { rows } = await historyOf(id);
  assert.deepEqual(rows, [['PURCHASE_RETURN', 100000, ret.returnNumber]]);
});

// ------------------------------------------------------------------ payment adjustments

test('Purchasing Payment adjustments list cash payments but not settlements, and refuse to change one', async () => {
  const adv = await advance(1000);
  const id = await createInvoice(3000);
  const cashPayment = await pay(id, 2000);
  assert.equal(cashPayment.status, 200);
  assert.equal((await settle(id, [{ credit_type: 'overpayment', credit_id: adv.id, amount: 1000 }])).status, 200);
  const settlementRow = await one("SELECT id FROM payment_history WHERE purchase_id = ? AND payment_method = 'ADVANCE_PAYMENT'", [id]);

  const list = await call('GET', '/purchases/payments/adjustable', undefined, 'admin');
  assert.equal(list.status, 200, JSON.stringify(list.body));
  const mine = list.body.filter((r) => Number(r.purchase_id) === id);
  assert.deepEqual(mine.map((r) => r.payment_method), ['CASH']);

  const cashBefore = await getCashBalance(companyId);
  const detail = await call('GET', `/purchases/payments/${settlementRow.id}-${id}/adjust-detail`, undefined, 'admin');
  assert.equal(detail.status, 409, JSON.stringify(detail.body));
  const adjust = await call('PUT', `/purchases/payments/${settlementRow.id}-${id}/adjust`, {
    payment_date: '2026-10-14', amount: 1000, payment_method: 'CASH'
  }, 'admin');
  assert.equal(adjust.status, 409, JSON.stringify(adjust.body));
  assert.equal(cents(await getCashBalance(companyId)), cents(cashBefore), 'nothing posted to the cash book');
  assert.equal((await one('SELECT payment_method FROM payment_history WHERE id = ?', [settlementRow.id])).payment_method, 'ADVANCE_PAYMENT');

  // A real cash payment can still be opened for adjustment.
  const cashDetail = await call('GET', `/purchases/payments/${cashPayment.body.payment_id}-${id}/adjust-detail`, undefined, 'admin');
  assert.equal(cashDetail.status, 200, JSON.stringify(cashDetail.body));
});

// D1 (2026-10-23): a payment's allocated_amount/payment_history.amount hold
// cash + discount COMBINED; adjustPurchasePayment must move the Cash/Bank
// ledger by the CASH delta only, never by the combined delta.
test('adjusting a discounted payment moves the cash book by the cash delta, not the combined delta', async () => {
  const id = await createInvoice(10000);

  const paid = await call('POST', '/purchases/pay-multiple', {
    payment_date: '2026-10-13', payment_method: 'CASH', amount: 5000, notes: 'Early payment discount agreed with supplier',
    invoice_allocations: [{ purchase_id: id, amount: 5000, discount: 2000 }]
  });
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  assert.equal(cents(paid.body.applied_amount), 500000, 'applied_amount is the cash portion only');
  assert.equal(cents(paid.body.discount_amount), 200000);
  assert.equal(cents(paid.body.total_credited), 700000, 'total_credited is cash + discount combined');

  const cashAfterFirstPayment = await getCashBalance(companyId);
  const invoiceAfterFirstPayment = await one('SELECT balance_amount FROM purchases WHERE id = ?', [id]);
  assert.equal(cents(invoiceAfterFirstPayment.balance_amount), 300000, '10000 - 5000 cash - 2000 discount = 3000');

  // Correct the cash figure from 5000 to 6000; the discount (2000) is left alone.
  const adjust = await call('PUT', `/purchases/payments/${paid.body.payment_id}-${id}/adjust`, {
    payment_date: '2026-10-13', amount: 6000, payment_method: 'CASH', notes: 'Corrected the cash figure entered earlier'
  }, 'admin');
  assert.equal(adjust.status, 200, JSON.stringify(adjust.body));

  const cashAfterAdjust = await getCashBalance(companyId);
  // The cash book must move by exactly -1000 (one more 1000 paid out), never
  // by +1000 (the bug: it used to read the combined 7000->6000 "delta" as a
  // CASH movement and credited the book backwards by the discount amount).
  assert.equal(cents(cashAfterAdjust), cents(cashAfterFirstPayment) - 100000,
    'cash book should drop by exactly the extra 1000 cash, not move by the discount');

  const allocation = await one(
    'SELECT allocated_amount, discount_amount FROM purchase_payment_allocations WHERE payment_history_id = ? AND purchase_id = ?',
    [paid.body.payment_id, id]
  );
  assert.equal(cents(allocation.discount_amount), 200000, 'discount is preserved, not discarded');
  assert.equal(cents(allocation.allocated_amount), 800000, '6000 cash + 2000 discount');

  const invoiceAfterAdjust = await one('SELECT balance_amount, paid_amount FROM purchases WHERE id = ?', [id]);
  assert.equal(cents(invoiceAfterAdjust.balance_amount), 200000, '10000 - 6000 cash - 2000 discount = 2000');
});

// D2 (2026-10-23): a payment discount must post its own balanced journal
// entry (Dr Accounts-Payable-RM / Cr Purchase-Discount-Received) - the GL
// must not move by the cash portion alone, or Accounts-Payable there would
// no longer reconcile with the real invoice balance reduction.
test('a payment discount posts a balanced Dr AP / Cr Purchase-Discount-Received journal entry', async () => {
  const id = await createInvoice(10000);

  const paid = await call('POST', '/purchases/pay-multiple', {
    payment_date: '2026-10-13', payment_method: 'CASH', amount: 5000, notes: 'Early payment discount agreed with supplier',
    invoice_allocations: [{ purchase_id: id, amount: 5000, discount: 2000 }]
  });
  assert.equal(paid.status, 200, JSON.stringify(paid.body));

  const lines = (await pool.query(
    `SELECT je.reference_type, jl.account_code, jl.debit, jl.credit
       FROM journal_entries je JOIN journal_lines jl ON jl.entry_id = je.id
      WHERE je.reference_id = ? AND je.reference_type IN ('PURCHASE_PAYMENT', 'PURCHASE_PAYMENT_DISCOUNT')
      ORDER BY je.id, jl.id`,
    [paid.body.payment_id]
  ))[0];

  // Every entry balances on its own (the chokepoint's own invariant)...
  const byEntry = new Map();
  for (const l of lines) {
    const key = l.reference_type;
    const prev = byEntry.get(key) || { debit: 0, credit: 0 };
    byEntry.set(key, { debit: prev.debit + cents(l.debit), credit: prev.credit + cents(l.credit) });
  }
  assert.equal(byEntry.get('PURCHASE_PAYMENT').debit, byEntry.get('PURCHASE_PAYMENT').credit);
  assert.equal(byEntry.get('PURCHASE_PAYMENT_DISCOUNT').debit, byEntry.get('PURCHASE_PAYMENT_DISCOUNT').credit);

  // ...and the discount entry is specifically Dr AP 2000 / Cr Discount-Received 2000.
  const discountLines = lines.filter((l) => l.reference_type === 'PURCHASE_PAYMENT_DISCOUNT');
  assert.deepEqual(
    discountLines.map((l) => [l.account_code, cents(l.debit), cents(l.credit)]).sort(),
    [['ACCOUNTS-PAYABLE-RM', 200000, 0], ['PURCHASE-DISCOUNT-RECEIVED', 0, 200000]].sort()
  );

  // Combined across both entries, Accounts-Payable-RM is debited 7000 total
  // (5000 cash + 2000 discount) - matching the invoice's real balance drop,
  // not just the 5000 cash that reached the Cash book.
  const apDebit = lines.filter((l) => l.account_code === 'ACCOUNTS-PAYABLE-RM').reduce((s, l) => s + cents(l.debit), 0);
  assert.equal(apDebit, 700000);
});

// D3 (2026-10-23, owner decision: require a reason, no RBAC change): a
// Discount Amount writes off part of an invoice with no cash movement, so
// whoever applies one must say why.
test('a payment discount is refused without a reason in Notes, on both create and edit', async () => {
  const id = await createInvoice(10000);
  const cashBefore = await getCashBalance(companyId);

  const noReason = await call('POST', '/purchases/pay-multiple', {
    payment_date: '2026-10-13', payment_method: 'CASH', amount: 5000,
    invoice_allocations: [{ purchase_id: id, amount: 5000, discount: 2000 }]
  });
  assert.equal(noReason.status, 400, JSON.stringify(noReason.body));
  assert.match(noReason.body.error, /reason is required/i);
  assert.equal(cents(await getCashBalance(companyId)), cents(cashBefore), 'nothing posted - the cash book is untouched');
  const untouched = await one('SELECT paid_amount, balance_amount FROM purchases WHERE id = ?', [id]);
  assert.equal(cents(untouched.balance_amount), 1000000, 'the invoice is untouched');

  const blankReason = await call('POST', '/purchases/pay-multiple', {
    payment_date: '2026-10-13', payment_method: 'CASH', amount: 5000, notes: '   ',
    invoice_allocations: [{ purchase_id: id, amount: 5000, discount: 2000 }]
  });
  assert.equal(blankReason.status, 400, JSON.stringify(blankReason.body), 'whitespace-only notes do not count as a reason');

  // A cash-only payment (no discount) still needs no reason at all.
  const cashOnly = await call('POST', '/purchases/pay-multiple', {
    payment_date: '2026-10-13', payment_method: 'CASH', amount: 1000,
    invoice_allocations: [{ purchase_id: id, amount: 1000 }]
  });
  assert.equal(cashOnly.status, 200, JSON.stringify(cashOnly.body));

  // With a reason, the discounted payment goes through...
  const withReason = await call('POST', '/purchases/pay-multiple', {
    payment_date: '2026-10-13', payment_method: 'CASH', amount: 4000, notes: 'Supplier agreed a discount for early settlement',
    invoice_allocations: [{ purchase_id: id, amount: 4000, discount: 2000 }]
  });
  assert.equal(withReason.status, 200, JSON.stringify(withReason.body));

  // ...and editing it away from its reason (blank notes) is refused too,
  // even though the discount itself isn't changing on this edit.
  const editNoReason = await call('PUT', `/purchases/payments/${withReason.body.payment_id}-${id}/adjust`, {
    payment_date: '2026-10-13', amount: 4100, payment_method: 'CASH'
  }, 'admin');
  assert.equal(editNoReason.status, 400, JSON.stringify(editNoReason.body));
  assert.match(editNoReason.body.error, /reason is required/i);

  const editWithReason = await call('PUT', `/purchases/payments/${withReason.body.payment_id}-${id}/adjust`, {
    payment_date: '2026-10-13', amount: 4100, payment_method: 'CASH', notes: 'Corrected the cash figure, discount unchanged'
  }, 'admin');
  assert.equal(editWithReason.status, 200, JSON.stringify(editWithReason.body));
});

// ------------------------------------------------------------------ order of events

test('settle from the advance first, then pay the rest: the balance is right and an overpayment is refused', async () => {
  const adv = await advance(5000);
  const id = await createInvoice(12000);
  assert.equal((await settle(id, [{ credit_type: 'overpayment', credit_id: adv.id, amount: 5000 }])).status, 200);

  const tooMuch = await pay(id, 7000.01);
  assert.equal(tooMuch.status, 409, JSON.stringify(tooMuch.body));

  const rest = await pay(id, 7000);
  assert.equal(rest.status, 200, JSON.stringify(rest.body));
  const invoice = await one('SELECT paid_amount, balance_amount, payment_status FROM purchases WHERE id = ?', [id]);
  assert.equal(invoice.payment_status, 'Paid');
  assert.equal(cents(invoice.paid_amount), 1200000);
  assert.equal(cents(invoice.balance_amount), 0);
});

// ------------------------------------------------------------------ repair of earlier rows

test('start-up names the source of earlier settlement rows, and leaves everything else alone', async () => {
  const id = await createInvoice(9000);
  const otherId = await createInvoice(9000);
  const adv = await advance(800);
  // An earlier Settle Now: credit allocation + a row saved with '' (the refused 'CREDIT').
  await pool.query(
    `INSERT INTO credit_allocations (credit_type, overpayment_id, purchase_id, allocated_amount, settlement_date, settled_by)
     VALUES ('overpayment', ?, ?, 800, '2026-10-02', ?)`, [adv.id, id, actorUserId]);
  const insert = async (purchaseId, method, amount, notes) => {
    const [r] = await pool.query(
      `INSERT INTO payment_history (purchase_id, payment_date, amount, payment_method, notes, created_by)
       VALUES (?, '2026-10-02', ?, 'CASH', ?, ?)`, [purchaseId, amount, notes, actorUserId]);
    await pool.query('UPDATE payment_history SET payment_method = ? WHERE id = ?', [method, r.insertId]);
    return r.insertId;
  };
  const oldAdvance = await insert(id, '', 800, 'Credit settlement: Settled from available supplier credits');
  const noAllocation = await insert(otherId, '', 300, 'Credit settlement: unknown source');
  const oldReturn = await insert(id, 'CASH', 600, 'Settlement added to return #RT-1');
  const otherBlank = await insert(id, '', 50, 'something else');
  const realCash = await insert(id, 'CASH', 400, 'Supplier paid');
  // A return-note row that DID post to the cash book stays Cash.
  const returnWithLedger = await insert(otherId, 'CASH', 200, 'Return settlement from return #RT-2');
  const connection = await pool.getConnection();
  try {
    await recordCashTransaction(connection, {
      companyId, date: '2026-10-02', remark: 'test', credit: 200, transactionType: 'RM Purchase Payment',
      referenceType: 'PURCHASE_PAYMENT', referenceId: returnWithLedger, createdBy: actorUserId
    });
  } finally {
    connection.release();
  }

  await ensureSettlementPaymentMethods(pool);

  const methodOf = async (rowId) => one('SELECT payment_method, check_number FROM payment_history WHERE id = ?', [rowId]);
  assert.deepEqual(await methodOf(oldAdvance), { payment_method: 'ADVANCE_PAYMENT', check_number: adv.overpayment_number });
  assert.deepEqual(await methodOf(noAllocation), { payment_method: 'SUPPLIER_CREDIT', check_number: null });
  assert.equal((await methodOf(oldReturn)).payment_method, 'PURCHASE_RETURN');
  assert.equal((await methodOf(otherBlank)).payment_method, '');
  assert.equal((await methodOf(realCash)).payment_method, 'CASH');
  assert.equal((await methodOf(returnWithLedger)).payment_method, 'CASH');

  // Running it again changes nothing.
  await ensureSettlementPaymentMethods(pool);
  assert.equal((await methodOf(oldAdvance)).payment_method, 'ADVANCE_PAYMENT');
});
