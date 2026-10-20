require('./helpers/noDatabase');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Audit H4 (second half): wastage and purchase returns take stock OUT, so - like Issue to
// Department - they lock the items first and refuse more than the live stock.

const dbPath = path.join(__dirname, '..', 'config', 'db.js');

const makeConnection = ({ stock, ownLines = [], log }) => ({
  async beginTransaction() {},
  async commit() { log.push('COMMIT'); },
  async rollback() { log.push('ROLLBACK'); },
  release() {},
  async query(sql, params) {
    const s = String(sql).replace(/\s+/g, ' ').trim();
    log.push(s);
    if (/^SELECT id FROM items WHERE id = \? FOR UPDATE/.test(s)) return [[{ id: params[0] }]];
    if (/FROM wastage_items WHERE wastage_id = \? FOR UPDATE/.test(s)) return [ownLines];
    if (/AS current_stock/.test(s)) return [[{ id: params[params.length - 1], name: 'Flour', unit: 'kg', current_stock: String(stock) }]];
    if (/FROM items WHERE id IN/.test(s)) return [[{ id: 1, name: 'Flour', vat_applicable: 0 }]];
    if (/FROM wastages\s*WHERE id = \? AND/.test(s) || /FROM wastages WHERE id/.test(s)) return [[{ id: 5, wastage_note_number: 'WN-1' }]];
    if (/^INSERT INTO wastages/.test(s)) return [{ insertId: 31 }];
    if (/^INSERT INTO purchase_returns/.test(s)) return [{ insertId: 41 }];
    if (/FROM supplier WHERE id/.test(s)) return [[{ vat_registered: 0 }]];
    return [[]];
  }
});

const load = (connection, file) => {
  const exp = require.cache[dbPath].exports;
  exp.getConnection = async () => connection;
  exp.query = async () => [[]];
  const p = require.resolve(file);
  delete require.cache[p];
  return require(file);
};

const call = async (handler, req) => {
  let status = 200; let body;
  const res = { status(c) { status = c; return this; }, json(b) { body = b; return this; } };
  await handler(req, res);
  return { status, body };
};

const wastageBody = (qty) => ({ date: '2026-10-10', reason: 'Expired', items: [{ item_id: 1, quantity: qty, estimated_loss: 10 }] });
const writes = (log) => log.filter((s) => /^(INSERT|UPDATE|DELETE)/.test(s));

test('wastage create: more than the stock in hand is refused, nothing is written', async () => {
  const log = [];
  const controller = load(makeConnection({ stock: 5, log }), '../controllers/wastageController');
  const { status, body } = await call(controller.createWastage, { user: { userId: 9 }, body: wastageBody(8) });
  assert.equal(status, 400);
  assert.match(body.error, /Not enough stock - Flour: requested 8 kg, only 5\.000 kg available/);
  assert.deepEqual(writes(log), []);
  assert.ok(log.includes('ROLLBACK'));
});

test('wastage create: the item lock is the FIRST query of the transaction', async () => {
  const log = [];
  const controller = load(makeConnection({ stock: 5, log }), '../controllers/wastageController');
  await call(controller.createWastage, { user: { userId: 9 }, body: wastageBody(2) });
  assert.match(log[0], /^SELECT id FROM items WHERE id = \? FOR UPDATE/);
});

test('wastage create: within the stock in hand is saved', async () => {
  const log = [];
  const controller = load(makeConnection({ stock: 5, log }), '../controllers/wastageController');
  const { status } = await call(controller.createWastage, { user: { userId: 9 }, body: wastageBody(5) });
  assert.equal(status, 201);
  assert.ok(log.some((s) => /^INSERT INTO wastage_items/.test(s)));
});

test('wastage edit: the note\'s own old quantity is credited back before checking', async () => {
  // stock 2 left, the note already holds 4 -> editing it to 6 needs 6 <= 2 + 4: allowed
  const log = [];
  const controller = load(makeConnection({ stock: 2, ownLines: [{ item_id: 1, quantity: '4' }], log }), '../controllers/wastageController');
  const ok = await call(controller.updateWastage, { user: { userId: 9 }, params: { id: '5' }, get: () => undefined, body: wastageBody(6) });
  assert.equal(ok.status, 200);
  // ...but 7 is more than 2 + 4
  const log2 = [];
  const controller2 = load(makeConnection({ stock: 2, ownLines: [{ item_id: 1, quantity: '4' }], log: log2 }), '../controllers/wastageController');
  const refused = await call(controller2.updateWastage, { user: { userId: 9 }, params: { id: '5' }, get: () => undefined, body: wastageBody(7) });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /Not enough stock/);
  assert.deepEqual(writes(log2), []);
});

const returnBody = (qty) => ({
  return_number: 'PR-1', supplier_id: 3, return_date: '2026-10-10', purchase_id: 12,
  items: [{ item_id: 1, item_name: 'Flour', return_quantity: qty, unit_price: 100 }]
});

test('purchase return: more than the stock in hand is refused before anything is written', async () => {
  const log = [];
  const controller = load(makeConnection({ stock: 3, log }), '../controllers/purchaseReturnController');
  const { status, body } = await call(controller.createPurchaseReturn, { user: { userId: 9 }, body: returnBody(10) });
  assert.equal(status, 400);
  assert.match(body.error, /Not enough stock/);
  assert.deepEqual(writes(log), []);
  assert.match(log[0], /^SELECT id FROM items WHERE id = \? FOR UPDATE/);
});

test('purchase return: within the stock in hand passes the stock check', async () => {
  const log = [];
  const controller = load(makeConnection({ stock: 30, log }), '../controllers/purchaseReturnController');
  await call(controller.createPurchaseReturn, { user: { userId: 9 }, body: returnBody(10) });
  assert.ok(log.some((s) => /^INSERT INTO purchase_returns/.test(s)), 'the return was inserted');
});

// ---- M5: purchase-return totals are exact decimals, not float sums
test('purchase return totals: 3 x 0.1 is exactly 0.30 and VAT is rounded once at the end', async () => {
  const log = [];
  const conn = makeConnection({ stock: 1000, log });
  const original = conn.query.bind(conn);
  const inserts = [];
  conn.query = async (sql, params) => {
    const s = String(sql).replace(/\s+/g, ' ').trim();
    if (/FROM supplier WHERE id/.test(s)) return [[{ vat_registered: 1 }]];
    if (/^INSERT INTO purchase_returns/.test(s)) inserts.push(params);
    return original(sql, params);
  };
  const controller = load(conn, '../controllers/purchaseReturnController');
  const body = {
    return_number: 'PR-M5', supplier_id: 3, return_date: '2026-10-10',
    items: [
      { item_id: 1, return_quantity: 3, unit_price: 0.1, vat_applicable: 0 },
      { item_id: 1, return_quantity: 3, unit_price: 33.33, vat_applicable: 1 }
    ]
  };
  await call(controller.createPurchaseReturn, { user: { userId: 9 }, body });
  assert.equal(inserts.length >= 1, true, 'the return was inserted');
  // params: return_number, return_date, purchase_id, supplier_id, subtotal, vat_amount, vat_rate, total_amount, ...
  const [, , , , subtotal, vat, , total] = inserts[0];
  assert.equal(subtotal, 100.29);   // 0.30 + 99.99
  assert.equal(vat, 18);            // 99.99 x 18% = 17.9982 -> 18.00
  assert.equal(total, 118.29);
});
