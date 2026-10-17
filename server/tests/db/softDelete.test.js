// Nothing is hard deleted (audit finding H5): a deleted stock adjustment stays in the
// database, flagged with who / when / why, and stock, lists and reports stop counting
// it; item lines replaced by an edit are copied to record_line_history first.
//
// Drives the REAL routers, auth / RBAC / period guard and controllers over HTTP on the
// MySQL TEST database (tests/db/useTestDatabase.js - never the real one). "Today" is
// pinned to 2026-10-16 (open window: September + October 2026). Every row the tests
// create is removed again in test.after().

require('./useTestDatabase');

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('crypto');

const pool = require('../../config/db');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const authenticate = require('../../middleware/authenticate');
const authorizeApi = require('../../middleware/authorizeApi');
const periodGuard = require('../../middleware/periodGuard');
const { getItemStock } = require('../../services/rmStockService');
const { archiveLines, SOURCES } = require('../../services/lineHistory');
const { getJwtSecret, JWT_SIGN_OPTIONS } = require('../../config/secrets');

const RUN = crypto.randomBytes(4).toString('hex');
const created = { users: [], departments: [], items: [], issuances: [], wastages: [] };
const USERS = {};

let server;
let baseUrl;
let departmentId;
let itemId;

const one = async (sql, params = []) => (await pool.query(sql, params))[0][0];
const num = (value) => Math.round(Number(value) * 1000) / 1000;

const call = async (method, urlPath, body, who = 'admin') => {
  const response = await fetch(`${baseUrl}/api${urlPath}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${USERS[who].token}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

// An adjustment that takes `variance` kg off the item's stock (system 10, actual 10 + variance).
const adjust = async (variance, date = '2026-10-10 10:00:00') => {
  const response = await call('POST', '/adjustments', {
    date, approved_by: '', reference_note: `soft-${RUN}`, item_id: itemId,
    system_qty: 10, actual_qty: 10 + variance, unit_price: 100, reason: 'count'
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.adjustment_id;
};

const systemQty = async () => num((await call('GET', `/adjustments/system-stock/${itemId}`)).body.system_qty);

test.before(async () => {
  await pool.financeSchemaReady;
  await pool.periodLockSchemaReady;
  await pool.stockAdjustmentSchemaReady;
  await pool.lineHistorySchemaReady;

  const hash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 4);
  for (const [key, role] of [['admin', 'Admin'], ['stores', 'Store Keeper']]) {
    const [u] = await pool.query(
      'INSERT INTO users (name, username, password, role, status) VALUES (?, ?, ?, ?, 1)',
      [`${role} ${RUN}`, `${key}-sd-${RUN}`, hash, role]);
    created.users.push(u.insertId);
    USERS[key] = { id: u.insertId, token: jwt.sign({ userId: u.insertId, username: key, role, tv: 0 }, getJwtSecret(), JWT_SIGN_OPTIONS) };
  }
  const [d] = await pool.query('INSERT INTO departments (name) VALUES (?)', [`Dept ${RUN}`]);
  departmentId = d.insertId;
  created.departments.push(departmentId);
  const [i] = await pool.query(`INSERT INTO items (item_code, name, unit, reorder_level) VALUES (?, ?, 'kg', 0)`, [`SD-${RUN}`, `Flour ${RUN}`]);
  itemId = i.insertId;
  created.items.push(itemId);

  const app = express();
  app.use(express.json());
  app.use('/api', authenticate, authorizeApi, periodGuard.periodErrorTranslator, periodGuard);
  app.use('/api/adjustments', require('../../routes/adjustmentRoutes'));
  app.use('/api/issuances', require('../../routes/issuanceRoutes'));
  app.use('/api/wastages', require('../../routes/wastageRoutes'));
  app.use('/api/reports', require('../../routes/reportRoutes'));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  const del = async (sql, ids) => { if (ids.length) await pool.query(sql, [ids]); };
  await del("DELETE FROM stock_movements WHERE item_id IN (?) AND reference_type = 'stock_adjustments'", created.items);
  await del("DELETE FROM rm_adjustment_records WHERE category = 'Department' AND source_record_id IN (SELECT id FROM stock_adjustments WHERE item_id IN (?))", created.items);
  await del('DELETE FROM stock_adjustments WHERE item_id IN (?)', created.items);
  await del('DELETE FROM issuance_items WHERE item_id IN (?)', created.items);
  await del('DELETE FROM issuances WHERE department_id IN (?)', created.departments);
  await del('DELETE FROM wastage_items WHERE item_id IN (?)', created.items);
  await del('DELETE FROM wastages WHERE id IN (?)', created.wastages);
  await del("DELETE FROM record_line_history WHERE archived_by IN (?)", created.users);
  await del('DELETE FROM departments WHERE id IN (?)', created.departments);
  await del('DELETE FROM items WHERE id IN (?)', created.items);
  await del('DELETE FROM users WHERE id IN (?)', created.users);
  await pool.end();
});

// ------------------------------------------------------------------ stock adjustments

test('deleting a stock adjustment keeps the row, flagged with who / when / why', async () => {
  const before = await systemQty();
  const id = await adjust(-3);
  assert.equal(await systemQty(), before - 3);

  const removed = await call('DELETE', `/adjustments/${id}`, { reason: 'entered twice by mistake' });
  assert.equal(removed.status, 200, JSON.stringify(removed.body));

  const row = await one('SELECT * FROM stock_adjustments WHERE id = ?', [id]);
  assert.ok(row, 'the row is still in the database');
  assert.equal(row.is_deleted, 1);
  assert.equal(row.deleted_by, USERS.admin.id);
  assert.ok(row.deleted_at, 'when');
  assert.equal(row.delete_reason, 'entered twice by mistake');
  assert.equal(num(row.variance), -3, 'the figures are untouched');

  const movement = await one("SELECT is_deleted, deleted_by FROM stock_movements WHERE reference_type = 'stock_adjustments' AND reference_id = ?", [id]);
  assert.deepEqual({ ...movement }, { is_deleted: 1, deleted_by: USERS.admin.id }, 'its stock movement is kept too, flagged');
});

test('a deleted adjustment no longer counts in stock, lists, details or reports', async () => {
  const before = await systemQty();
  const id = await adjust(-4);
  assert.equal(await systemQty(), before - 4);
  const stockBefore = num((await getItemStock(pool, itemId)).current_stock);

  assert.equal((await call('DELETE', `/adjustments/${id}`)).status, 200);

  assert.equal(await systemQty(), before, 'system quantity for the next adjustment');
  assert.equal(num((await getItemStock(pool, itemId)).current_stock), stockBefore + 4, 'stock service');

  const list = await call('GET', `/adjustments?startDate=2026-10-01&endDate=2026-10-31&item_id=${itemId}`);
  assert.equal(list.status, 200);
  assert.ok(!list.body.some((row) => row.id === id), 'not in the list');
  assert.equal((await call('GET', `/adjustments/${id}`)).status, 404, 'not found by id');
  assert.equal((await call('PUT', `/adjustments/${id}`, {
    date: '2026-10-10 10:00:00', reference_note: 'x', item_id: itemId, system_qty: 10, actual_qty: 5, unit_price: 100, reason: 'x'
  })).status, 404, 'cannot be edited');

  const summary = await call('GET', '/adjustments/summary/Department?startDate=2026-10-01&endDate=2026-10-31');
  assert.equal(summary.status, 200, JSON.stringify(summary.body));
  assert.ok(!summary.body.some((row) => row.id === id), 'not in the adjustment summary');

  const report = await call('GET', '/reports/stock?date=2026-10-16');
  assert.equal(report.status, 200, JSON.stringify(report.body).slice(0, 200));
  const rows = Array.isArray(report.body) ? report.body : (report.body.items || report.body.rows || []);
  const mine = rows.find((r) => Number(r.id ?? r.item_id) === itemId);
  assert.ok(mine, `the item is missing from the stock report: ${JSON.stringify(report.body).slice(0, 300)}`);
  const closing = num(mine.closing_balance ?? mine.closing ?? mine.current_stock);
  assert.equal(closing, num((await getItemStock(pool, itemId)).current_stock), `stock report agrees with the stock service: ${JSON.stringify(mine)}`);
});

test('deleting twice, or an unknown adjustment, is a 404 and changes nothing', async () => {
  const id = await adjust(-1);
  assert.equal((await call('DELETE', `/adjustments/${id}`, { reason: 'first' })).status, 200);
  const again = await call('DELETE', `/adjustments/${id}`, { reason: 'second' });
  assert.equal(again.status, 404, JSON.stringify(again.body));
  assert.equal((await one('SELECT delete_reason FROM stock_adjustments WHERE id = ?', [id])).delete_reason, 'first');
  assert.equal((await call('DELETE', '/adjustments/99999999')).status, 404);
});

test('the reason is optional and never longer than the column', async () => {
  const none = await adjust(-1);
  assert.equal((await call('DELETE', `/adjustments/${none}`)).status, 200);
  assert.equal((await one('SELECT delete_reason FROM stock_adjustments WHERE id = ?', [none])).delete_reason, null);

  const long = await adjust(-1);
  assert.equal((await call('DELETE', `/adjustments/${long}`, { reason: 'x'.repeat(900) })).status, 200);
  assert.equal((await one('SELECT delete_reason FROM stock_adjustments WHERE id = ?', [long])).delete_reason.length, 500);
});

test('a Store Keeper cannot delete an adjustment, and the period lock still applies', async () => {
  const id = await adjust(-1);
  assert.equal((await call('DELETE', `/adjustments/${id}`, undefined, 'stores')).status, 403);
  assert.equal((await one('SELECT is_deleted FROM stock_adjustments WHERE id = ?', [id])).is_deleted, 0);

  // dated in a closed month: refused by the period lock, row untouched
  const [old] = await pool.query(
    `INSERT INTO stock_adjustments (date, user_name, reference_note, item_id, system_qty, actual_qty, variance, unit_price, amount, reason)
     VALUES ('2026-06-10 10:00:00', 'x', ?, ?, 10, 9, -1, 100, -100, 'old')`, [`soft-${RUN}`, itemId]);
  const refused = await call('DELETE', `/adjustments/${old.insertId}`);
  assert.equal(refused.status, 409, JSON.stringify(refused.body));
  assert.equal(refused.body.code, 'PERIOD_CLOSED');
  assert.equal((await one('SELECT is_deleted FROM stock_adjustments WHERE id = ?', [old.insertId])).is_deleted, 0);
});

// ------------------------------------------------------------------ replaced item lines

test('editing an issue note keeps the old lines in record_line_history', async () => {
  const body = (quantity) => ({
    issuance_date: '2026-10-12', issuance_time: '09:00', department_id: departmentId, received_by: 'Chef',
    remarks: 'Morning', items: [{ item_id: itemId, quantity }]
  });
  const made = await call('POST', '/issuances', body(2), 'stores');
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const id = made.body.issuance_id;
  created.issuances.push(id);

  assert.equal((await call('PUT', `/issuances/${id}`, body(5), 'stores')).status, 200);
  assert.equal((await call('PUT', `/issuances/${id}`, body(7), 'admin')).status, 200);

  const history = (await pool.query(
    "SELECT line_count, lines_json, archived_by FROM record_line_history WHERE source_table = 'issuance_items' AND record_id = ? ORDER BY id", [id]))[0];
  assert.equal(history.length, 2, 'one copy per edit');
  assert.deepEqual(history.map((h) => h.archived_by), [USERS.stores.id, USERS.admin.id], 'who replaced them');
  const [first, second] = history.map((h) => JSON.parse(h.lines_json));
  assert.deepEqual([first.length, num(first[0].quantity), first[0].item_id], [1, 2, itemId], 'the lines as first entered');
  assert.deepEqual([second.length, num(second[0].quantity)], [1, 5], 'the lines after the first edit');
  assert.equal(num((await one('SELECT quantity FROM issuance_items WHERE issuance_id = ?', [id])).quantity), 7, 'the live line is the new one');
});

test('editing a wastage note keeps the old lines too', async () => {
  const body = (quantity) => ({
    date: '2026-10-12', reason: 'Expired', remarks: 'x', approved_by: '',
    items: [{ item_id: itemId, quantity, estimated_loss: 10 }]
  });
  await call('POST', '/wastages', body(1), 'stores');
  const note = await one(
    'SELECT w.id FROM wastages w JOIN wastage_items wi ON wi.wastage_id = w.id WHERE wi.item_id = ? ORDER BY w.id DESC LIMIT 1', [itemId]);
  created.wastages.push(note.id);

  assert.equal((await call('PUT', `/wastages/${note.id}`, body(4), 'admin')).status, 200);
  const history = await one("SELECT line_count, lines_json FROM record_line_history WHERE source_table = 'wastage_items' AND record_id = ?", [note.id]);
  assert.equal(history.line_count, 1);
  assert.equal(num(JSON.parse(history.lines_json)[0].quantity), 1);
});

test('archiveLines: only listed tables, and nothing is archived when there are no lines', async () => {
  await assert.rejects(archiveLines(pool, 'users', 1), /not an archived table/);
  await assert.rejects(archiveLines(pool, 'issuance_items; DROP TABLE users', 1), /not an archived table/);
  assert.equal(await archiveLines(pool, 'issuance_items', 987654321, { userId: USERS.admin.id }), 0);
  assert.equal(Number((await one("SELECT COUNT(*) AS n FROM record_line_history WHERE record_id = 987654321")).n), 0);
  assert.deepEqual(Object.keys(SOURCES).sort(), [
    'cutlery_damage_items', 'cutlery_purchase_items', 'issuance_items', 'other_ledger_company_map', 'purchase_items', 'wastage_items']);
});

// ------------------------------------------------------------------ the rule itself

test('the application code has no hard delete except replacing item lines, and each of those is archived first', () => {
  const root = path.join(__dirname, '..', '..');
  const ALLOWED = new Set(Object.keys(SOURCES));
  const files = [];
  for (const dir of ['controllers', 'routes', 'services', 'utils']) {
    for (const name of fs.readdirSync(path.join(root, dir))) if (name.endsWith('.js')) files.push(path.join(dir, name));
  }
  const offenders = [];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(/DELETE\s+(?:\w+\s+)?FROM\s+`?(\w+)`?/gi)) {
      const table = match[1];
      if (!ALLOWED.has(table)) { offenders.push(`${file}: DELETE FROM ${table}`); continue; }
      const before = source.slice(0, match.index);
      if (!new RegExp(`archiveLines\\(\\s*connection,\\s*'${table}'`).test(before)) offenders.push(`${file}: DELETE FROM ${table} without archiveLines`);
    }
  }
  assert.deepEqual(offenders, []);
});
