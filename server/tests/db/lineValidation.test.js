// Audit finding R7: GRN and stock-movement payloads were not validated - a client
// could send a negative/zero/garbage quantity or unit price, and a purchase's
// subtotal/vat_amount/total_with_vat were stored exactly as the client sent them
// (an inflated total raised the amount payable).
//
//   - Purchase (createPurchase/updatePurchase): every line's item_id, quantity and
//     unit_price is validated server-side, and subtotal/vat_amount/total_with_vat
//     are always RECOMPUTED from the validated lines - the client's totals are
//     only ever a display hint, never trusted (services/.../utils/documentLines.js).
//   - Wastage and Purchase Return get the same quantity/price validation.
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
const created = { users: [], companies: [], suppliers: [], items: [], purchases: [], wastages: [], purchaseReturns: [] };
const USERS = {};

let server;
let baseUrl;
let companyId;
let vatSupplierId;      // vat_registered = 1
let plainSupplierId;    // vat_registered = 0
let vatItemId;          // vat_applicable = 1
let plainItemId;        // vat_applicable = 0
let seq = 0;

const one = async (sql, params = []) => (await pool.query(sql, params))[0][0];
const num = (value) => Math.round(Number(value) * 100) / 100;

const call = async (method, path, body, who = 'accountant') => {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${USERS[who].token}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

const purchaseBody = (overrides = {}) => {
  seq += 1;
  return {
    invoice_no: `LV-${RUN}-${seq}`,
    purchase_date: '2026-10-10',
    supplier_id: vatSupplierId,
    items: [{ item_id: vatItemId, item_name: 'VAT Item', quantity: 10, unit_price: 100 }],
    // Tampered totals: the server must ignore all of these and recompute from
    // the lines - this is the exact shape of the original bug. vat_rate itself
    // is a legitimate, trusted input (the system supports more than one rate);
    // only the computed totals are never trusted.
    subtotal: 1, vat_amount: 1, total_with_vat: 999999, vat_rate: 18,
    paid_amount: 0, payment_method: 'CASH',
    company_id: companyId,
    ...overrides
  };
};

test.before(async () => {
  await pool.financeSchemaReady;
  await pool.paymentHistorySchemaReady;

  const hash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 4);
  for (const [key, role] of [['accountant', 'Accountant'], ['admin', 'Admin'], ['stores', 'Store Keeper']]) {
    const name = `${role} ${key} ${RUN}`;
    const [u] = await pool.query(
      'INSERT INTO users (name, username, password, role, status) VALUES (?, ?, ?, ?, 1)',
      [name, `${key}-lv-${RUN}`, hash, role]
    );
    created.users.push(u.insertId);
    USERS[key] = { id: u.insertId, name, token: jwt.sign({ userId: u.insertId, username: key, role, tv: 0 }, getJwtSecret(), JWT_SIGN_OPTIONS) };
  }

  const [c] = await pool.query('INSERT INTO company (name) VALUES (?)', [`LV ${RUN}`]);
  companyId = c.insertId;
  created.companies.push(companyId);
  await pool.query('INSERT IGNORE INTO cash_accounts (company_id, current_balance) VALUES (?, 0)', [companyId]);

  const [sv] = await pool.query(
    `INSERT INTO supplier (name, address, city, contact_name, contact_phone, vat_registered) VALUES (?, 'x', 'x', 'x', '0000000000', 1)`,
    [`VAT Supplier ${RUN}`]);
  vatSupplierId = sv.insertId;
  created.suppliers.push(vatSupplierId);

  const [sp] = await pool.query(
    `INSERT INTO supplier (name, address, city, contact_name, contact_phone, vat_registered) VALUES (?, 'x', 'x', 'x', '0000000000', 0)`,
    [`Plain Supplier ${RUN}`]);
  plainSupplierId = sp.insertId;
  created.suppliers.push(plainSupplierId);

  const [vi] = await pool.query(
    `INSERT INTO items (item_code, name, unit, reorder_level, vat_applicable) VALUES (?, ?, 'kg', 0, 1)`,
    [`LV-V-${RUN}`, `VAT Flour ${RUN}`]);
  vatItemId = vi.insertId;
  created.items.push(vatItemId);

  const [pi] = await pool.query(
    `INSERT INTO items (item_code, name, unit, reorder_level, vat_applicable) VALUES (?, ?, 'kg', 0, 0)`,
    [`LV-P-${RUN}`, `Plain Flour ${RUN}`]);
  plainItemId = pi.insertId;
  created.items.push(plainItemId);

  const app = express();
  app.use(express.json());
  app.use('/api/purchases', require('../../routes/purchaseRoutes'));
  app.use('/api/purchase-returns', require('../../routes/purchaseReturnRoutes'));
  app.use('/api/wastages', require('../../routes/wastageRoutes'));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  const del = async (sql, ids) => { if (ids.length) await pool.query(sql, [ids]); };
  await del('DELETE FROM wastage_items WHERE wastage_id IN (?)', created.wastages);
  await del('DELETE FROM wastages WHERE id IN (?)', created.wastages);
  await del('DELETE pri FROM purchase_return_items pri JOIN purchase_returns pr ON pr.id = pri.return_id WHERE pr.id IN (?)', created.purchaseReturns);
  await del('DELETE FROM purchase_returns WHERE id IN (?)', created.purchaseReturns);
  await del('DELETE FROM payment_history WHERE purchase_id IN (?)', created.purchases);
  await del('DELETE FROM purchase_items WHERE purchase_id IN (?)', created.purchases);
  await del('DELETE FROM record_line_history WHERE archived_by IN (?)', created.users);
  await del('DELETE FROM purchases WHERE id IN (?)', created.purchases);
  await del("DELETE FROM finance_transactions WHERE account_type = 'CASH' AND company_id IN (?)", created.companies);
  await del('DELETE FROM cash_accounts WHERE company_id IN (?)', created.companies);
  await del('DELETE FROM company WHERE id IN (?)', created.companies);
  await del('DELETE FROM supplier WHERE id IN (?)', created.suppliers);
  await del('DELETE FROM items WHERE id IN (?)', created.items);
  await del('DELETE FROM users WHERE id IN (?)', created.users);
  await pool.end();
});

// ------------------------------------------------------------------ Purchase: line validation

test('createPurchase rejects a non-positive, non-numeric or over-precise quantity', async () => {
  for (const quantity of [0, -5, 'abc', null, 1.0001, 1e6 + 1]) {
    const res = await call('POST', '/purchases', purchaseBody({ items: [{ item_id: vatItemId, quantity, unit_price: 10 }] }));
    assert.equal(res.status, 400, `quantity ${quantity}: ${JSON.stringify(res.body)}`);
  }
});

test('createPurchase rejects a negative or non-numeric unit price', async () => {
  for (const unit_price of [-1, 'abc', undefined]) {
    const res = await call('POST', '/purchases', purchaseBody({ items: [{ item_id: vatItemId, quantity: 1, unit_price }] }));
    assert.equal(res.status, 400, `unit_price ${unit_price}: ${JSON.stringify(res.body)}`);
  }
});

test('createPurchase rejects an unknown item and an unknown supplier', async () => {
  const badItem = await call('POST', '/purchases', purchaseBody({ items: [{ item_id: 999999999, quantity: 1, unit_price: 10 }] }));
  assert.equal(badItem.status, 404, JSON.stringify(badItem.body));

  const badSupplier = await call('POST', '/purchases', purchaseBody({ supplier_id: 999999999 }));
  assert.equal(badSupplier.status, 404, JSON.stringify(badSupplier.body));
});

test('createPurchase ignores the client\'s subtotal/vat_amount/total_with_vat and recomputes them from the lines', async () => {
  // VAT-registered supplier + vat_applicable item: 10 x 100 = 1000 subtotal, 18% VAT -> 1180 total.
  const res = await call('POST', '/purchases', purchaseBody());
  assert.equal(res.status, 201, JSON.stringify(res.body));
  created.purchases.push(res.body.purchase_id);

  const row = await one('SELECT subtotal, vat_amount, total_with_vat, vat_rate FROM purchases WHERE id = ?', [res.body.purchase_id]);
  assert.equal(num(row.subtotal), 1000, 'recomputed from quantity x unit_price, not the tampered 1');
  assert.equal(num(row.vat_amount), 180, 'recomputed at 18%');
  assert.equal(num(row.total_with_vat), 1180, 'recomputed, not the tampered 999999');
  assert.equal(Number(row.vat_rate), 18);

  const items = (await pool.query('SELECT quantity, unit_price FROM purchase_items WHERE purchase_id = ?', [res.body.purchase_id]))[0];
  assert.equal(items.length, 1);
  assert.equal(num(items[0].quantity), 10);
  assert.equal(num(items[0].unit_price), 100);
});

test('createPurchase charges no VAT when the supplier is not VAT-registered, even for a vat_applicable item', async () => {
  const res = await call('POST', '/purchases', purchaseBody({ supplier_id: plainSupplierId }));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  created.purchases.push(res.body.purchase_id);
  const row = await one('SELECT subtotal, vat_amount, total_with_vat FROM purchases WHERE id = ?', [res.body.purchase_id]);
  assert.equal(num(row.vat_amount), 0);
  assert.equal(num(row.total_with_vat), num(row.subtotal));
});

test('createPurchase charges no VAT on a non-vat_applicable item, even for a VAT-registered supplier', async () => {
  const res = await call('POST', '/purchases', purchaseBody({ items: [{ item_id: plainItemId, quantity: 10, unit_price: 100 }] }));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  created.purchases.push(res.body.purchase_id);
  const row = await one('SELECT vat_amount FROM purchases WHERE id = ?', [res.body.purchase_id]);
  assert.equal(num(row.vat_amount), 0);
});

test('updatePurchase rejects bad lines the same way, and recomputes totals on a real edit', async () => {
  const created1 = await call('POST', '/purchases', purchaseBody());
  assert.equal(created1.status, 201, JSON.stringify(created1.body));
  const id = created1.body.purchase_id;
  created.purchases.push(id);

  const badQty = await call('PUT', `/purchases/${id}`, purchaseBody({ items: [{ item_id: vatItemId, quantity: -1, unit_price: 100 }] }));
  assert.equal(badQty.status, 400, JSON.stringify(badQty.body));

  // Raise the quantity 10 -> 20: subtotal/VAT/total must reflect the NEW lines, not the tampered body.
  const edited = await call('PUT', `/purchases/${id}`, purchaseBody({ items: [{ item_id: vatItemId, quantity: 20, unit_price: 100 }] }));
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  const row = await one('SELECT subtotal, vat_amount, total_with_vat FROM purchases WHERE id = ?', [id]);
  assert.equal(num(row.subtotal), 2000);
  assert.equal(num(row.vat_amount), 360);
  assert.equal(num(row.total_with_vat), 2360);
});

// ------------------------------------------------------------------ Wastage: line validation

test('wastage rejects a non-positive quantity and a negative or non-numeric estimated loss', async () => {
  const badQty = await call('POST', '/wastages', {
    date: '2026-10-10', reason: 'Expired', remarks: 'x',
    items: [{ item_id: vatItemId, quantity: -1, estimated_loss: 10 }]
  }, 'stores');
  assert.equal(badQty.status, 400, JSON.stringify(badQty.body));

  const badLoss = await call('POST', '/wastages', {
    date: '2026-10-10', reason: 'Expired', remarks: 'x',
    items: [{ item_id: vatItemId, quantity: 1, estimated_loss: -5 }]
  }, 'stores');
  assert.equal(badLoss.status, 400, JSON.stringify(badLoss.body));

  const ok = await call('POST', '/wastages', {
    date: '2026-10-10', reason: 'Expired', remarks: 'x',
    items: [{ item_id: vatItemId, quantity: 1, estimated_loss: 50 }]
  }, 'stores');
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const row = (await pool.query('SELECT id FROM wastages WHERE wastage_note_number = ?', [ok.body.wastage_note_number]))[0][0];
  created.wastages.push(row.id);
});

// ------------------------------------------------------------------ Purchase Return: line validation

test('purchase return rejects a non-positive return_quantity and a negative unit price', async () => {
  seq += 1;
  const badQty = await call('POST', '/purchase-returns', {
    return_number: `LVPR-${RUN}-${seq}`, supplier_id: vatSupplierId, return_date: '2026-10-10',
    items: [{ item_id: vatItemId, item_name: 'VAT Item', return_quantity: -1, unit_price: 100, vat_applicable: 1 }]
  }, 'stores');
  assert.equal(badQty.status, 400, JSON.stringify(badQty.body));

  seq += 1;
  const badPrice = await call('POST', '/purchase-returns', {
    return_number: `LVPR-${RUN}-${seq}`, supplier_id: vatSupplierId, return_date: '2026-10-10',
    items: [{ item_id: vatItemId, item_name: 'VAT Item', return_quantity: 1, unit_price: -100, vat_applicable: 1 }]
  }, 'stores');
  assert.equal(badPrice.status, 400, JSON.stringify(badPrice.body));

  seq += 1;
  const ok = await call('POST', '/purchase-returns', {
    return_number: `LVPR-${RUN}-${seq}`, supplier_id: vatSupplierId, return_date: '2026-10-10',
    items: [{ item_id: vatItemId, item_name: 'VAT Item', return_quantity: 1, unit_price: 100, vat_applicable: 1 }]
  }, 'stores');
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  created.purchaseReturns.push(ok.body.return_id);
});
