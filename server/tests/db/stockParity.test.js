// Audit M7 - one stock formula.
//
// Every screen that shows a current quantity must show the SAME number for the same item. The data
// below has one of everything that must not count - a deleted purchase, a deleted wastage note, a
// pending adjustment, a deleted adjustment - and one of every source that must, plus an item with
// only an opening balance. Each handler is then called and has to answer with the expected quantity.
//
// Runs on the MySQL TEST database (tests/db/useTestDatabase.js). Every row is removed in test.after().

require('./useTestDatabase');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const pool = require('../../config/db');
const rmStock = require('../../services/rmStockService');
const itemController = require('../../controllers/itemController');
const issuanceController = require('../../controllers/issuanceController');
const purchaseReturnController = require('../../controllers/purchaseReturnController');
const adjustmentController = require('../../controllers/adjustmentController');
const reportController = require('../../controllers/reportController');
const analystController = require('../../controllers/analystController');
const dashboardController = require('../../controllers/dashboardController');

const RUN = crypto.randomBytes(4).toString('hex');
const num = (value) => Math.round(Number(value) * 1000) / 1000;
const ids = { users: [], suppliers: [], departments: [], items: [], purchases: [], issuances: [], wastages: [], returns: [], purchaseReturns: [] };

// 100 + 50 - 30 - 5 + 4 - 6 + 3 = 116
const EXPECTED_A = 116;
// one opening row, nothing else
const EXPECTED_B = 50;
let itemA;
let itemB;

const run = async (handler, { params = {}, query = {} } = {}) => {
  let status = 200;
  let body;
  const res = { status(code) { status = code; return this; }, json(payload) { body = payload; return this; } };
  await handler({ params, query, body: {}, user: { userId: ids.users[0], role: 'Admin' } }, res);
  return { status, body };
};

test.before(async () => {
  await pool.financeSchemaReady;
  await pool.stockAdjustmentSchemaReady;

  const insert = async (sql, params, bucket) => {
    const [result] = await pool.query(sql, params);
    ids[bucket].push(result.insertId);
    return result.insertId;
  };

  const user = await insert(
    'INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, ?)',
    [`Parity ${RUN}`, `parity_${RUN}`, 'x', 'Admin'], 'users');
  const supplier = await insert(
    "INSERT INTO supplier (name, address, city, contact_name, contact_phone) VALUES (?, 'a', 'c', 'n', '0710000000')",
    [`Parity Supplier ${RUN}`], 'suppliers');
  const department = await insert('INSERT INTO departments (name) VALUES (?)', [`Parity Dept ${RUN}`], 'departments');

  const newItem = (n, reorder) => insert(
    "INSERT INTO items (item_code, name, unit, reorder_level, auto_add_to_stock) VALUES (?, ?, 'kg', ?, 1)",
    [`PR${n}${RUN}`.slice(0, 20), `Parity ${n} ${RUN}`, reorder], 'items');
  itemA = await newItem('A', 9000000000); // reorder level far above its stock: tops the low-stock list
  itemB = await newItem('B', 0);

  // ---- item A ----
  await pool.query("INSERT INTO opening_balances (date, item_id, quantity) VALUES ('2026-01-01', ?, 100)", [itemA]);

  const purchase = async (invoice, quantity, deleted) => {
    const id = await insert(
      "INSERT INTO purchases (invoice_no, purchase_date, supplier_id, bill_amount, prepared_by, deleted) VALUES (?, '2026-10-05', ?, 0, ?, ?)",
      [`PAR-${RUN}-${invoice}`, supplier, user, deleted], 'purchases');
    await pool.query("INSERT INTO purchase_items (purchase_id, item_id, item_name, quantity, unit_price) VALUES (?, ?, 'x', ?, 10)", [id, itemA, quantity]);
  };
  await purchase('1', 50, 0);
  await purchase('2', 20, 1);                       // deleted invoice: not counted

  const issuance = await insert(
    "INSERT INTO issuances (issuance_date, issued_by, department_id, received_by) VALUES ('2026-10-06 09:00:00', ?, ?, 'x')",
    [user, department], 'issuances');
  await pool.query('INSERT INTO issuance_items (issuance_id, item_id, quantity) VALUES (?, ?, 30)', [issuance, itemA]);

  const wastage = async (note, quantity, status) => {
    const id = await insert(
      "INSERT INTO wastages (wastage_note_number, date, approved_by, reason, entered_by, status) VALUES (?, '2026-10-07', 'x', 'Damaged', ?, ?)",
      [`W${RUN}${note}`.slice(0, 20), user, status], 'wastages');
    await pool.query('INSERT INTO wastage_items (wastage_id, item_id, quantity) VALUES (?, ?, ?)', [id, itemA, quantity]);
  };
  await wastage('1', 5, 1);
  await wastage('2', 7, 0);                         // deleted note: not counted

  const ret = await insert(
    "INSERT INTO returns (return_number, return_date, department_id, received_by, entered_by) VALUES (?, '2026-10-08', ?, 'x', ?)",
    [`RET-${RUN}`, department, user], 'returns');
  await pool.query('INSERT INTO return_items (return_id, item_id, quantity) VALUES (?, ?, 4)', [ret, itemA]);

  const purchaseReturn = await insert(
    "INSERT INTO purchase_returns (return_number, return_date, supplier_id, returned_by) VALUES (?, '2026-10-09 10:00:00', ?, ?)",
    [`PRT-${RUN}`, supplier, user], 'purchaseReturns');
  await pool.query("INSERT INTO purchase_return_items (return_id, item_id, item_name, quantity, unit_price) VALUES (?, ?, 'x', 6, 10)", [purchaseReturn, itemA]);

  const adjustment = (variance, status, deleted) => pool.query(
    `INSERT INTO stock_adjustments (date, user_name, item_id, system_qty, actual_qty, variance, unit_price, amount, status, is_deleted)
     VALUES ('2026-10-10 10:00:00', ?, ?, 0, ?, ?, 1, ?, ?, ?)`,
    [`parity-${RUN}`, itemA, variance, variance, variance, status, deleted]);
  await adjustment(3, 'Approved', 0);
  await adjustment(100, 'Pending', 0);              // waiting for a second user: not counted
  await adjustment(50, 'Approved', 1);              // deleted: not counted

  // ---- item B: an opening balance and nothing else ----
  await pool.query("INSERT INTO opening_balances (date, item_id, quantity) VALUES ('2026-01-01', ?, 50)", [itemB]);
});

test.after(async () => {
  const del = (sql, list) => (list.length ? pool.query(sql, [list]) : null);
  await del('DELETE FROM stock_adjustments WHERE item_id IN (?)', ids.items);
  await del('DELETE FROM purchase_return_items WHERE return_id IN (?)', ids.purchaseReturns);
  await del('DELETE FROM purchase_returns WHERE id IN (?)', ids.purchaseReturns);
  await del('DELETE FROM return_items WHERE return_id IN (?)', ids.returns);
  await del('DELETE FROM returns WHERE id IN (?)', ids.returns);
  await del('DELETE FROM wastage_items WHERE wastage_id IN (?)', ids.wastages);
  await del('DELETE FROM wastages WHERE id IN (?)', ids.wastages);
  await del('DELETE FROM issuance_items WHERE issuance_id IN (?)', ids.issuances);
  await del('DELETE FROM issuances WHERE id IN (?)', ids.issuances);
  await del('DELETE FROM purchase_items WHERE purchase_id IN (?)', ids.purchases);
  await del('DELETE FROM purchases WHERE id IN (?)', ids.purchases);
  await del('DELETE FROM opening_balances WHERE item_id IN (?)', ids.items);
  await del('DELETE FROM items WHERE id IN (?)', ids.items);
  await del('DELETE FROM departments WHERE id IN (?)', ids.departments);
  await del('DELETE FROM supplier WHERE id IN (?)', ids.suppliers);
  await del('DELETE FROM users WHERE id IN (?)', ids.users);
  await pool.end();
});

test('rmStockService (the reference): deleted, pending and deleted-adjustment records do not count', async () => {
  assert.equal(num((await rmStock.getItemStock(pool, itemA)).current_stock), EXPECTED_A);
  assert.equal(num((await rmStock.getItemStock(pool, itemB)).current_stock), EXPECTED_B);
  const all = await rmStock.getAllItemsWithStock(pool);
  assert.equal(num(all.find((row) => row.id === itemA).current_stock), EXPECTED_A);
  assert.equal(num(all.find((row) => row.id === itemB).current_stock), EXPECTED_B);
});

test('Items: one item and the list', async () => {
  const one = await run(itemController.getItemById, { params: { id: itemA } });
  assert.equal(num(one.body.current_stock), EXPECTED_A);
  const list = await run(itemController.getAllItems, { query: {} });
  assert.equal(num(list.body.find((row) => row.id === itemA).current_stock), EXPECTED_A);
  assert.equal(num(list.body.find((row) => row.id === itemB).current_stock), EXPECTED_B);
});

test('Issue to Department: the stock it offers is the stock the save would enforce', async () => {
  const { body } = await run(issuanceController.getItemsWithStock);
  assert.equal(num(body.find((row) => row.id === itemA).current_stock), EXPECTED_A);
  assert.equal(num(body.find((row) => row.id === itemB).current_stock), EXPECTED_B);
});

test('Purchase return: one item and the list (this page used to leave out returns and adjustments)', async () => {
  const one = await run(purchaseReturnController.getItemStock, { params: { itemId: String(itemA) } });
  assert.equal(num(one.body.quantity), EXPECTED_A);
  const b = await run(purchaseReturnController.getItemStock, { params: { itemId: String(itemB) } });
  assert.equal(num(b.body.quantity), EXPECTED_B);
  const list = await run(purchaseReturnController.getCurrentStock);
  assert.equal(num(list.body.find((row) => row.item_id === itemA).quantity), EXPECTED_A);
  assert.equal(num(list.body.find((row) => row.item_id === itemB).quantity), EXPECTED_B);
});

test('Stock adjustment: the system quantity the server resolves', async () => {
  const { body } = await run(adjustmentController.getSystemQuantity, { params: { itemId: String(itemA) } });
  assert.equal(num(body.system_qty), EXPECTED_A);
});

test('Dashboard low-stock list', async () => {
  const { body } = await run(dashboardController.getDashboardOverview);
  const row = body.lowStock.items.find((r) => r.id === itemA);
  assert.ok(row, 'item A (reorder level far above its stock) must be on the low-stock list');
  assert.equal(num(row.current_stock), EXPECTED_A);
});

test('Stock report: the closing balance for a day after every record', async () => {
  const { status, body } = await run(reportController.getStockReport, { query: { date: '2026-10-19' } });
  assert.equal(status, 200);
  assert.equal(num(body.find((row) => row.id === itemA).closing_balance), EXPECTED_A);
  assert.equal(num(body.find((row) => row.id === itemB).closing_balance), EXPECTED_B);
});

test('Stock report: before the records exist, they are not counted yet', async () => {
  // 2026-10-05 = the purchase day: opening 100 + purchase 50 only (issue 06, wastage 07, return 08, purchase return 09, adjustment 10 come later)
  const { body } = await run(reportController.getStockReport, { query: { date: '2026-10-05' } });
  assert.equal(num(body.find((row) => row.id === itemA).closing_balance), 150);
});

test('Balance sheet (stores value) runs on the shared rules', async () => {
  const { status, body } = await run(analystController.getBalanceSheet, { query: { date: '2026-10-19' } });
  assert.equal(status, 200, JSON.stringify(body));
});
