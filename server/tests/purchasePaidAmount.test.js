require('./helpers/noDatabase');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Audit H3: createPurchase / updatePurchase used the client's paid_amount, so an invoice could be
// marked paid with no payment behind it. A new invoice is now always unpaid, and an edit keeps
// whatever the real payment allocations add up to.

const dbPath = path.join(__dirname, '..', 'config', 'db.js');

const makeConnection = ({ allocatedPaid = 0, log }) => ({
  async beginTransaction() {},
  async commit() {},
  async rollback() { log.push({ rollback: true }); },
  release() {},
  async query(sql, params) {
    log.push({ sql: String(sql), params });
    const text = String(sql);
    if (/FROM items WHERE id IN/i.test(text)) {
      return [[{ id: 1, name: 'Flour', vat_applicable: 0 }]];
    }
    if (/FROM supplier WHERE id/i.test(text)) return [[{ vat_registered: 0 }]];
    if (/FROM purchases WHERE id = \? FOR UPDATE/i.test(text)) return [[{ id: 5, invoice_no: 'INV-1', paid_amount: 0 }]];
    if (/actual_paid_amount/i.test(text)) return [[{ actual_paid_amount: allocatedPaid }]];
    if (/^INSERT INTO purchases/i.test(text.trim())) return [{ insertId: 77 }];
    return [[]];
  }
});

const load = (connection) => {
  require.cache[dbPath].exports.getConnection = async () => connection;
  require.cache[dbPath].exports.query = async () => [[]]; // reference-number committed-read helper
  const controllerPath = require.resolve('../controllers/purchaseController');
  delete require.cache[controllerPath];
  return require('../controllers/purchaseController');
};

const call = async (handler, req) => {
  let status = 200;
  let body;
  const res = { status(c) { status = c; return this; }, json(b) { body = b; return this; } };
  await handler(req, res);
  return { status, body };
};

const baseBody = (extra = {}) => ({
  invoice_no: `INV-${Math.random().toString(36).slice(2, 8)}`,
  purchase_date: '2026-10-10',
  supplier_id: 3,
  company_id: 1,
  payment_method: 'CASH',
  vat_rate: 18,
  items: [{ item_id: 1, quantity: 2, unit_price: 100 }],
  ...extra
});

test('create: a client paid_amount is ignored - the invoice is unpaid and no payment row is written', async () => {
  const log = [];
  const controller = load(makeConnection({ log }));
  const { status, body } = await call(controller.createPurchase, {
    user: { userId: 9 },
    body: baseBody({ paid_amount: 200, total_with_vat: 200 })
  });
  assert.equal(status, 201);
  assert.equal(body.paid_amount, 0);
  assert.equal(body.payment_status, 'Non-Paid');
  assert.equal(body.balance_amount, 200);
  assert.equal(log.some((entry) => /INSERT INTO payment_history/i.test(entry.sql || '')), false);
  assert.equal(log.some((entry) => /INSERT INTO purchase_payment_allocations/i.test(entry.sql || '')), false);
});

test('update: paid_amount comes from the real allocations, not the request', async () => {
  const log = [];
  const controller = load(makeConnection({ allocatedPaid: 50, log }));
  const { status, body } = await call(controller.updatePurchase, {
    user: { userId: 9 },
    params: { id: '5' },
    get: () => undefined,
    body: baseBody({ paid_amount: 200 })
  });
  assert.equal(status, 200);
  assert.equal(body.payment_status, 'Partially Paid');
  const update = log.find((entry) => /^UPDATE purchases/i.test((entry.sql || '').trim()));
  assert.ok(update, 'the invoice was updated');
  // params: ..., paid_amount, balance_amount, ...
  assert.ok(update.params.includes(50), 'paid_amount = 50 allocated');
  assert.ok(update.params.includes(150), 'balance = 200 - 50');
  assert.equal(update.params.includes(200) && update.params.indexOf(200) > 8, false);
});

test('update: the total cannot be lowered below what has already been paid', async () => {
  const log = [];
  const controller = load(makeConnection({ allocatedPaid: 500, log }));
  const { status, body } = await call(controller.updatePurchase, {
    user: { userId: 9 },
    params: { id: '5' },
    get: () => undefined,
    body: baseBody()
  });
  assert.equal(status, 409);
  assert.match(body.error, /already has 500\.00 paid/);
  assert.equal(log.some((entry) => /^UPDATE purchases/i.test((entry.sql || '').trim())), false);
  assert.equal(log.some((entry) => entry.rollback), true);
});
