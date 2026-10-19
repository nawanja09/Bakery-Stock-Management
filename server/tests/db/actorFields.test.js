// "Who did this" is the signed-in user (audit R4): Issued By, Entered By,
// Settled By, Returned By and the stock adjustment's saved-by are taken from the
// login, never from the request body. "Approved By" is the approver typed on the
// form when there is one, otherwise the signed-in user's name.
//
// Every request below sends ANOTHER user's id / name in those fields, the way a
// tampered request would, and checks what was saved.
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
const { getJwtSecret, JWT_SIGN_OPTIONS } = require('../../config/secrets');

const RUN = crypto.randomBytes(4).toString('hex');
const created = {
  users: [], companies: [], suppliers: [], items: [], departments: [],
  purchases: [], issuances: [], wastages: [], adjustments: []
};
const USERS = {}; // key -> { id, name, token }

let server;
let baseUrl;
let companyId;
let supplierId;
let itemId;
let departmentId;
let seq = 0;

const one = async (sql, params = []) => (await pool.query(sql, params))[0][0];

const call = async (method, path, body, who) => {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${USERS[who].token}` },
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
    [`AF-${RUN}-${seq}`, supplierId, total, total, total, total, USERS.accountant.id, companyId]
  );
  created.purchases.push(r.insertId);
  return r.insertId;
};

test.before(async () => {
  await pool.financeSchemaReady;
  await pool.paymentHistorySchemaReady;
  await pool.stockAdjustmentSchemaReady;

  const hash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 4);
  for (const [key, role] of [['stores', 'Store Keeper'], ['accountant', 'Accountant'], ['admin', 'Admin']]) {
    const name = `${role} ${RUN}`;
    const [u] = await pool.query(
      'INSERT INTO users (name, username, password, role, status) VALUES (?, ?, ?, ?, 1)',
      [name, `${key}-af-${RUN}`, hash, role]
    );
    created.users.push(u.insertId);
    USERS[key] = { id: u.insertId, name, token: jwt.sign({ userId: u.insertId, username: key, role, tv: 0 }, getJwtSecret(), JWT_SIGN_OPTIONS) };
  }

  const [c] = await pool.query('INSERT INTO company (name) VALUES (?)', [`AF ${RUN}`]);
  companyId = c.insertId;
  created.companies.push(companyId);
  await pool.query('INSERT IGNORE INTO cash_accounts (company_id, current_balance) VALUES (?, 0)', [companyId]);
  const [s] = await pool.query(
    `INSERT INTO supplier (name, address, city, contact_name, contact_phone) VALUES (?, 'x', 'x', 'x', '0000000000')`,
    [`Supplier ${RUN}`]);
  supplierId = s.insertId;
  created.suppliers.push(supplierId);
  const [i] = await pool.query(`INSERT INTO items (item_code, name, unit, reorder_level) VALUES (?, ?, 'kg', 0)`,
    [`AF-${RUN}`, `Flour ${RUN}`]);
  itemId = i.insertId;
  created.items.push(itemId);
  // Enough opening stock for the issue-note test (audit H4 now checks real availability).
  await pool.query(`INSERT INTO opening_balances (date, item_id, quantity) VALUES ('2026-01-01', ?, 1000)`, [itemId]);
  const [d] = await pool.query('INSERT INTO departments (name) VALUES (?)', [`Bakery ${RUN}`]);
  departmentId = d.insertId;
  created.departments.push(departmentId);

  const app = express();
  app.use(express.json());
  app.use('/api/purchases', require('../../routes/paymentRoutes'));
  app.use('/api/purchases', require('../../routes/purchaseRoutes'));
  app.use('/api/suppliers', require('../../routes/supplierCreditRoutes'));
  app.use('/api/purchase-returns', require('../../routes/purchaseReturnRoutes'));
  app.use('/api/issuances', require('../../routes/issuanceRoutes'));
  app.use('/api/wastages', require('../../routes/wastageRoutes'));
  app.use('/api/adjustments', require('../../routes/adjustmentRoutes'));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  const del = async (sql, ids) => { if (ids.length) await pool.query(sql, [ids]); };
  await del('DELETE FROM issuance_items WHERE issuance_id IN (?)', created.issuances);
  await del('DELETE FROM issuances WHERE id IN (?)', created.issuances);
  await del('DELETE FROM wastage_items WHERE wastage_id IN (?)', created.wastages);
  await del('DELETE FROM wastages WHERE id IN (?)', created.wastages);
  await del("DELETE FROM stock_movements WHERE reference_type = 'stock_adjustments' AND reference_id IN (?)", created.adjustments);
  await del("DELETE FROM rm_adjustment_records WHERE category = 'Department' AND source_record_id IN (?)", created.adjustments);
  await del('DELETE FROM stock_adjustments WHERE id IN (?)', created.adjustments);
  await del('DELETE FROM credit_allocations WHERE purchase_id IN (?)', created.purchases);
  await del('DELETE FROM payment_history WHERE purchase_id IN (?)', created.purchases);
  await del('DELETE FROM purchase_return_credits WHERE supplier_id IN (?)', created.suppliers);
  await del('DELETE pri FROM purchase_return_items pri JOIN purchase_returns pr ON pr.id = pri.return_id WHERE pr.supplier_id IN (?)', created.suppliers);
  await del('DELETE FROM purchase_returns WHERE supplier_id IN (?)', created.suppliers);
  await del('DELETE FROM supplier_overpayments WHERE supplier_id IN (?)', created.suppliers);
  await del('DELETE FROM purchases WHERE id IN (?)', created.purchases);
  await del("DELETE FROM finance_transactions WHERE account_type = 'CASH' AND company_id IN (?)", created.companies);
  await del('DELETE FROM cash_accounts WHERE company_id IN (?)', created.companies);
  await del('DELETE FROM company WHERE id IN (?)', created.companies);
  await del('DELETE FROM supplier WHERE id IN (?)', created.suppliers);
  await del('DELETE FROM departments WHERE id IN (?)', created.departments);
  await del('DELETE FROM opening_balances WHERE item_id IN (?)', created.items);
  await del('DELETE FROM items WHERE id IN (?)', created.items);
  await del('DELETE FROM users WHERE id IN (?)', created.users);
  await pool.end();
});

// ------------------------------------------------------------------ Issue to Department

test('issue note: Issued By is the signed-in user; Approved By is the typed approver, else that user', async () => {
  const body = (approvedBy) => ({
    issuance_date: '2026-10-10', issuance_time: '09:00', department_id: departmentId, received_by: 'Chef',
    remarks: 'Morning', approved_by: approvedBy, items: [{ item_id: itemId, quantity: 1 }],
    issued_by: USERS.admin.id // tampered: someone else
  });

  const plain = await call('POST', '/issuances', body(''), 'stores');
  assert.equal(plain.status, 201, JSON.stringify(plain.body));
  created.issuances.push(plain.body.issuance_id);
  let row = await one('SELECT issued_by, approved_by FROM issuances WHERE id = ?', [plain.body.issuance_id]);
  assert.deepEqual(row, { issued_by: USERS.stores.id, approved_by: USERS.stores.name });

  const approved = await call('POST', '/issuances', body('Sampath'), 'stores');
  created.issuances.push(approved.body.issuance_id);
  row = await one('SELECT issued_by, approved_by FROM issuances WHERE id = ?', [approved.body.issuance_id]);
  assert.deepEqual(row, { issued_by: USERS.stores.id, approved_by: 'Sampath' });

  // Edited by another user: Issued By stays the maker, and the page shows the name.
  const edit = await call('PUT', `/issuances/${approved.body.issuance_id}`, body('Sampath'), 'accountant');
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  row = await one('SELECT issued_by FROM issuances WHERE id = ?', [approved.body.issuance_id]);
  assert.equal(row.issued_by, USERS.stores.id);
  const view = await call('GET', `/issuances/${approved.body.issuance_id}`, undefined, 'stores');
  assert.equal(view.body.issued_by_name, USERS.stores.name);
});

// ------------------------------------------------------------------ Wastage

test('wastage note: Entered By is the signed-in user; Approved By is the typed approver, else that user', async () => {
  const body = (approvedBy) => ({
    date: '2026-10-10', reason: 'Expired', remarks: 'x', approved_by: approvedBy,
    items: [{ item_id: itemId, quantity: 1, estimated_loss: 10 }],
    entered_by: USERS.admin.id // tampered
  });

  await call('POST', '/wastages', body(''), 'stores');
  await call('POST', '/wastages', body('Mr.Hashan'), 'stores');
  const rows = (await pool.query(
    `SELECT w.id, w.approved_by, w.entered_by FROM wastages w JOIN wastage_items wi ON wi.wastage_id = w.id
      WHERE wi.item_id = ? ORDER BY w.id`, [itemId]))[0];
  created.wastages.push(...rows.map((r) => r.id));
  assert.deepEqual(rows.map((r) => [r.approved_by, r.entered_by]), [
    [USERS.stores.name, USERS.stores.id],
    ['Mr.Hashan', USERS.stores.id]
  ]);

  // Edit clearing the approver: the editor's name is saved; Entered By is unchanged.
  const edit = await call('PUT', `/wastages/${rows[1].id}`, body(''), 'accountant');
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  const after = await one('SELECT approved_by, entered_by FROM wastages WHERE id = ?', [rows[1].id]);
  assert.deepEqual(after, { approved_by: USERS.accountant.name, entered_by: USERS.stores.id });

  const list = await call('GET', '/wastages', undefined, 'stores');
  assert.equal(list.body.find((w) => w.id === rows[0].id).entered_by, USERS.stores.name);
});

// ------------------------------------------------------------------ Stock adjustment

test('stock adjustment: saved by the signed-in user; Approved By is the typed approver, else that user', async () => {
  const body = (approvedBy) => ({
    date: '2026-10-10 10:00:00', approved_by: approvedBy, reference_note: 'count', item_id: itemId,
    system_qty: 5, actual_qty: 4, unit_price: 100, reason: 'count',
    user_name: 'Someone Else', created_by: USERS.stores.id // tampered
  });

  const plain = await call('POST', '/adjustments', body(''), 'admin');
  assert.equal(plain.status, 201, JSON.stringify(plain.body));
  created.adjustments.push(plain.body.adjustment_id);
  const approved = await call('POST', '/adjustments', body('Dinidu Jayawickrama'), 'admin');
  created.adjustments.push(approved.body.adjustment_id);

  const rows = (await pool.query('SELECT user_name, created_by FROM stock_adjustments WHERE id IN (?) ORDER BY id',
    [created.adjustments]))[0];
  assert.deepEqual(rows.map((r) => [r.user_name, r.created_by]), [
    [USERS.admin.name, USERS.admin.id],
    ['Dinidu Jayawickrama', USERS.admin.id]
  ]);

  const view = await call('GET', `/adjustments/${approved.body.adjustment_id}`, undefined, 'admin');
  assert.equal(view.body.created_by_name, USERS.admin.name);
  assert.equal(view.body.user_name, 'Dinidu Jayawickrama');
});

// ------------------------------------------------------------------ Settlements and returns

test('Settle Now: Settled By and the payment row are the signed-in user', async () => {
  const adv = await call('POST', '/suppliers/pay-now', {
    supplier_id: supplierId, company_id: companyId, payment_date: '2026-10-05', payment_method: 'CHEQUE', amount: 500
  }, 'accountant');
  assert.equal(adv.status, 201, JSON.stringify(adv.body));
  const id = await createInvoice(500);

  const result = await call('POST', '/suppliers/settle-credit', {
    purchase_id: id, settlement_date: '2026-10-12', settled_by: USERS.admin.id, // tampered
    credits: [{ credit_type: 'overpayment', credit_id: adv.body.overpayment.id, amount: 500 }]
  }, 'accountant');
  assert.equal(result.status, 200, JSON.stringify(result.body));

  assert.equal((await one('SELECT settled_by FROM credit_allocations WHERE purchase_id = ?', [id])).settled_by, USERS.accountant.id);
  assert.equal((await one('SELECT created_by FROM payment_history WHERE purchase_id = ?', [id])).created_by, USERS.accountant.id);
});

test('purchase return: Returned By and Settled By are the signed-in user', async () => {
  const id = await createInvoice(2000);
  seq += 1;
  const created1 = await call('POST', '/purchase-returns', {
    return_number: `PR-${RUN}-${seq}`, supplier_id: supplierId, return_date: '2026-10-09',
    returned_by: USERS.admin.id, // tampered
    items: [{ item_id: itemId, item_name: 'Flour', return_quantity: 1, unit_price: 800, vat_applicable: 0 }]
  }, 'stores');
  assert.equal(created1.status, 201, JSON.stringify(created1.body));
  assert.equal((await one('SELECT returned_by FROM purchase_returns WHERE id = ?', [created1.body.return_id])).returned_by, USERS.stores.id);

  const settled = await call('POST', `/purchase-returns/${created1.body.return_id}/settle`, {
    settlements: [{ purchase_id: id, amount: 300 }], settlement_date: '2026-10-10',
    settled_by: USERS.admin.id // tampered
  }, 'accountant');
  assert.equal(settled.status, 200, JSON.stringify(settled.body));

  const settledViaInvoice = await call('POST', `/purchases/${created1.body.return_id}/settle`, {
    settlements: [{ purchase_id: id, amount: 200 }], settlement_date: '2026-10-11',
    settled_by: USERS.admin.id // tampered
  }, 'accountant');
  assert.equal(settledViaInvoice.status, 200, JSON.stringify(settledViaInvoice.body));

  const rows = (await pool.query('SELECT created_by FROM payment_history WHERE purchase_id = ? ORDER BY id', [id]))[0];
  assert.deepEqual(rows.map((r) => r.created_by), [USERS.accountant.id, USERS.accountant.id]);
});
