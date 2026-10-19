// Audit finding H4: issuing more of an item than is in stock, and a stock adjustment
// that trusts the client's "system quantity" and takes effect with no approval.
//
//   1. Issue to Department locks every item and checks its live stock before writing
//      anything; two issuances of the same item at the same moment cannot both exceed
//      what is really there (services/stockAvailability.js).
//   2. A stock adjustment's "system quantity" is always resolved by the SERVER from
//      live, approved stock - never the client's value - and the adjustment has no
//      stock effect until a user OTHER than whoever created it approves it
//      (maker-checker, controllers/adjustmentController.js).
//
// Drives the REAL routers, auth / RBAC / period guard and controllers over HTTP on the
// MySQL TEST database (tests/db/useTestDatabase.js - never the real one). "Today" is
// pinned to 2026-10-16. Every row the tests create is removed again in test.after().

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
const { getItemStock } = require('../../services/rmStockService');

const { getJwtSecret, JWT_SIGN_OPTIONS } = require('../../config/secrets');

const RUN = crypto.randomBytes(4).toString('hex');
const created = { users: [], departments: [], items: [], issuances: [], adjustments: [] };
const USERS = {};

let server;
let baseUrl;
let departmentId;

const one = async (sql, params = []) => (await pool.query(sql, params))[0][0];
const num = (value) => Math.round(Number(value) * 1000) / 1000;

const call = async (method, path, body, who = 'admin') => {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${USERS[who].token}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

// A fresh item, no stock unless `opening` is given.
const newItem = async (opening = 0) => {
  const [i] = await pool.query(`INSERT INTO items (item_code, name, unit, reorder_level) VALUES (?, ?, 'kg', 0)`,
    [`SA-${RUN}-${created.items.length}`, `Flour ${RUN} ${created.items.length}`]);
  created.items.push(i.insertId);
  if (opening) await pool.query(`INSERT INTO opening_balances (date, item_id, quantity) VALUES ('2026-01-01', ?, ?)`, [i.insertId, opening]);
  return i.insertId;
};

const issuanceBody = (itemId, quantity, date = '2026-10-12') => ({
  issuance_date: date, issuance_time: '09:00', department_id: departmentId, received_by: 'Chef',
  remarks: 'x', items: [{ item_id: itemId, quantity }]
});

const stockOf = async (itemId) => num((await getItemStock(pool, itemId)).current_stock);

// item_id, actual_qty, unit_price - never system_qty (the server ignores it).
const adjustmentBody = (itemId, actualQty, date = '2026-10-10 10:00:00') => ({
  date, approved_by: '', reference_note: `avail-${RUN}`, item_id: itemId, actual_qty: actualQty, unit_price: 100, reason: 'count'
});

test.before(async () => {
  await pool.financeSchemaReady;
  await pool.periodLockSchemaReady;
  await pool.stockAdjustmentSchemaReady;
  await pool.lineHistorySchemaReady;

  const hash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 4);
  for (const [key, role] of [['stores', 'Store Keeper'], ['stores2', 'Store Keeper'], ['admin', 'Admin'], ['admin2', 'Admin'], ['accountant', 'Accountant']]) {
    const [u] = await pool.query(
      'INSERT INTO users (name, username, password, role, status) VALUES (?, ?, ?, ?, 1)',
      [`${role} ${key} ${RUN}`, `${key}-sa-${RUN}`, hash, role]);
    created.users.push(u.insertId);
    USERS[key] = { id: u.insertId, name: `${role} ${key} ${RUN}`, token: jwt.sign({ userId: u.insertId, username: key, role, tv: 0 }, getJwtSecret(), JWT_SIGN_OPTIONS) };
  }
  const [d] = await pool.query('INSERT INTO departments (name) VALUES (?)', [`Dept ${RUN}`]);
  departmentId = d.insertId;
  created.departments.push(departmentId);

  const app = express();
  app.use(express.json());
  app.use('/api', authenticate, authorizeApi, periodGuard.periodErrorTranslator, periodGuard);
  app.use('/api/issuances', require('../../routes/issuanceRoutes'));
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
  await del("DELETE FROM stock_movements WHERE reference_type = 'stock_adjustments' AND reference_id IN (?)", created.adjustments);
  await del('DELETE FROM stock_adjustments WHERE id IN (?)', created.adjustments);
  await del('DELETE FROM record_line_history WHERE archived_by IN (?)', created.users);
  await del('DELETE FROM opening_balances WHERE item_id IN (?)', created.items);
  await del('DELETE FROM items WHERE id IN (?)', created.items);
  await del('DELETE FROM departments WHERE id IN (?)', created.departments);
  await del('DELETE FROM users WHERE id IN (?)', created.users);
  await pool.end();
});

// ------------------------------------------------------------------ issuance: availability

test('issuing within stock succeeds, down to exactly zero', async () => {
  const item = await newItem(10);
  const first = await call('POST', '/issuances', issuanceBody(item, 6), undefined, 'stores');
  assert.equal(first.status, 201);
  created.issuances.push(first.body.issuance_id);
  assert.equal(await stockOf(item), 4);
  const last = await call('POST', '/issuances', issuanceBody(item, 4), undefined, 'stores');
  assert.equal(last.status, 201, JSON.stringify(last.body));
  created.issuances.push(last.body.issuance_id);
  assert.equal(await stockOf(item), 0);
});

test('issuing more than is in stock is refused, names the item and the shortfall, and writes nothing', async () => {
  const item = await newItem(10);
  const rowsBefore = Number((await one('SELECT COUNT(*) AS n FROM issuance_items WHERE item_id = ?', [item])).n);

  const refused = await call('POST', '/issuances', issuanceBody(item, 15), undefined, 'stores');
  assert.equal(refused.status, 400, JSON.stringify(refused.body));
  assert.match(refused.body.error, /Not enough stock/);
  assert.match(refused.body.error, /Flour/);
  assert.match(refused.body.error, /requested 15/);
  assert.match(refused.body.error, /10(\.000)? kg available/);
  assert.equal(await stockOf(item), 10, 'nothing changed');
  assert.equal(Number((await one('SELECT COUNT(*) AS n FROM issuance_items WHERE item_id = ?', [item])).n), rowsBefore);

  assert.equal((await call('POST', '/issuances', issuanceBody(item, 10.01), undefined, 'stores')).status, 400, 'one gram too many');
  const last = await call('POST', '/issuances', issuanceBody(item, 10), undefined, 'stores');
  assert.equal(last.status, 201);
  created.issuances.push(last.body.issuance_id);
});

test('an item with no stock at all cannot be issued', async () => {
  const item = await newItem(0);
  const refused = await call('POST', '/issuances', issuanceBody(item, 1), undefined, 'stores');
  assert.equal(refused.status, 400, JSON.stringify(refused.body));
  assert.match(refused.body.error, /0(\.000)? kg available/);
});

test('one line in a multi-item issuance short is enough to refuse the whole note', async () => {
  const plenty = await newItem(100);
  const short = await newItem(2);
  const body = {
    issuance_date: '2026-10-12', issuance_time: '09:00', department_id: departmentId, received_by: 'Chef', remarks: 'x',
    items: [{ item_id: plenty, quantity: 50 }, { item_id: short, quantity: 5 }]
  };
  const refused = await call('POST', '/issuances', body, undefined, 'stores');
  assert.equal(refused.status, 400, JSON.stringify(refused.body));
  assert.equal(await stockOf(plenty), 100, 'the line that was fine is not issued either');
  assert.equal(await stockOf(short), 2);
});

test('a negative or zero quantity is refused, not accepted as a stock increase', async () => {
  const item = await newItem(10);
  for (const quantity of [-5, 0, 'abc', null]) {
    const refused = await call('POST', '/issuances', issuanceBody(item, quantity), undefined, 'stores');
    assert.equal(refused.status, 400, `quantity ${quantity}: ${JSON.stringify(refused.body)}`);
  }
  assert.equal(await stockOf(item), 10, 'stock is unaffected either way');
});

test('the same item listed twice in one issuance is summed before the check', async () => {
  const item = await newItem(10);
  const body = {
    issuance_date: '2026-10-12', issuance_time: '09:00', department_id: departmentId, received_by: 'Chef', remarks: 'x',
    items: [{ item_id: item, quantity: 6 }, { item_id: item, quantity: 6 }]
  };
  assert.equal((await call('POST', '/issuances', body, undefined, 'stores')).status, 400, 'summed: 12 > 10');
  const ok = { ...body, items: [{ item_id: item, quantity: 4 }, { item_id: item, quantity: 4 }] };
  const created1 = await call('POST', '/issuances', ok, undefined, 'stores');
  assert.equal(created1.status, 201, JSON.stringify(created1.body));
  created.issuances.push(created1.body.issuance_id);
  assert.equal(await stockOf(item), 2);
  assert.equal(Number((await one('SELECT quantity FROM issuance_items WHERE issuance_id = ?', [created1.body.issuance_id])).quantity), 8, 'one summed line');
});

// ------------------------------------------------------------------ issuance: the real race

test('two issuances of the same item at the same moment: only what is really there goes out', async () => {
  const item = await newItem(10);
  const results = await Promise.allSettled([
    call('POST', '/issuances', issuanceBody(item, 6), undefined, 'stores'),
    call('POST', '/issuances', issuanceBody(item, 6), undefined, 'stores2')
  ]);
  const bodies = results.map((r) => r.value ?? r.reason);
  bodies.filter((r) => r.status === 201).forEach((r) => created.issuances.push(r.body.issuance_id));
  const okCount = bodies.filter((r) => r.status === 201).length;
  const refusedCount = bodies.filter((r) => r.status === 400).length;
  assert.equal(okCount, 1, `exactly one must succeed: ${JSON.stringify(bodies)}`);
  assert.equal(refusedCount, 1);
  assert.equal(await stockOf(item), 4, 'stock never went negative');
});

test('three concurrent issuances that together exceed stock: as many as fit go through, no more', async () => {
  const item = await newItem(10);
  const results = await Promise.allSettled([
    call('POST', '/issuances', issuanceBody(item, 4), undefined, 'stores'),
    call('POST', '/issuances', issuanceBody(item, 4), undefined, 'stores2'),
    call('POST', '/issuances', issuanceBody(item, 4), undefined, 'admin')
  ]);
  const bodies = results.map((r) => r.value ?? r.reason);
  bodies.filter((r) => r.status === 201).forEach((r) => created.issuances.push(r.body.issuance_id));
  const okCount = bodies.filter((r) => r.status === 201).length;
  assert.equal(okCount, 2, `exactly two of three (4+4=8 <= 10, +4 more would not fit): ${JSON.stringify(bodies)}`);
  assert.equal(await stockOf(item), 2);
});

// ------------------------------------------------------------------ editing an issuance

test('editing an issuance excludes its own old lines from the check', async () => {
  const item = await newItem(10);
  const made = await call('POST', '/issuances', issuanceBody(item, 6), undefined, 'stores');
  assert.equal(made.status, 201);
  created.issuances.push(made.body.issuance_id);
  assert.equal(await stockOf(item), 4);

  // raising 6 -> 10 only needs 4 more, which is exactly what remains
  const raised = await call('PUT', `/issuances/${made.body.issuance_id}`, issuanceBody(item, 10), undefined, 'stores');
  assert.equal(raised.status, 200, JSON.stringify(raised.body));
  assert.equal(await stockOf(item), 0);

  // raising to 11 needs 1 more than is there
  const refused = await call('PUT', `/issuances/${made.body.issuance_id}`, issuanceBody(item, 11), undefined, 'admin');
  assert.equal(refused.status, 400, JSON.stringify(refused.body));
  assert.equal(await stockOf(item), 0, 'the refused edit changed nothing');
  assert.equal(Number((await one('SELECT quantity FROM issuance_items WHERE issuance_id = ?', [made.body.issuance_id])).quantity), 10);

  // lowering gives stock back
  assert.equal((await call('PUT', `/issuances/${made.body.issuance_id}`, issuanceBody(item, 2), undefined, 'stores')).status, 200);
  assert.equal(await stockOf(item), 8);
});

// ------------------------------------------------------------------ adjustment: server-resolved system quantity

test('the client\'s system_qty is ignored - the server resolves it from live stock', async () => {
  const item = await newItem(20);
  const created1 = await call('POST', '/adjustments', {
    date: '2026-10-10 10:00:00', approved_by: '', reference_note: 'x', item_id: item,
    system_qty: 0, actual_qty: 100, unit_price: 100, reason: 'tampered system_qty' // ignored
  }, 'admin');
  assert.equal(created1.status, 201, JSON.stringify(created1.body));
  created.adjustments.push(created1.body.adjustment_id);

  const row = await one('SELECT system_qty, actual_qty, variance, amount, status FROM stock_adjustments WHERE id = ?', [created1.body.adjustment_id]);
  assert.equal(num(row.system_qty), 20, 'resolved from live stock, not the tampered 0');
  assert.equal(num(row.actual_qty), 100);
  assert.equal(num(row.variance), 80);
  assert.equal(num(row.amount), 8000);
  assert.equal(row.status, 'Pending');

  // Pending: no stock effect yet.
  assert.equal(await stockOf(item), 20);
});

test('creating an adjustment for an unknown item is a 404', async () => {
  const refused = await call('POST', '/adjustments', adjustmentBody(999999999, 5), 'admin');
  assert.equal(refused.status, 404, JSON.stringify(refused.body));
});

// ------------------------------------------------------------------ adjustment: maker-checker

test('a new adjustment is Pending and has no stock effect until approved', async () => {
  const item = await newItem(20);
  const created1 = await call('POST', '/adjustments', adjustmentBody(item, 15), 'admin');
  assert.equal(created1.status, 201, JSON.stringify(created1.body));
  const id = created1.body.adjustment_id;
  created.adjustments.push(id);

  assert.equal((await one('SELECT status FROM stock_adjustments WHERE id = ?', [id])).status, 'Pending');
  assert.equal(await stockOf(item), 20, 'unchanged while Pending');
  const list = await call('GET', '/adjustments', undefined, 'admin');
  assert.equal(list.body.find((row) => row.id === id)?.status, 'Pending');

  const approved = await call('PATCH', `/adjustments/${id}/approve`, undefined, 'admin2');
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(await stockOf(item), 15, 'now it counts');
  const detail = await call('GET', `/adjustments/${id}`, undefined, 'admin');
  assert.equal(detail.body.status, 'Approved');
  assert.equal(detail.body.approved_by, USERS.admin2.id);
  assert.equal(detail.body.approved_by_name, USERS.admin2.name);
  assert.ok(detail.body.approved_at);
});

test('the person who created an adjustment cannot approve it themselves', async () => {
  const item = await newItem(20);
  const created1 = await call('POST', '/adjustments', adjustmentBody(item, 10), 'admin');
  const id = created1.body.adjustment_id;
  created.adjustments.push(id);

  const selfApprove = await call('PATCH', `/adjustments/${id}/approve`, undefined, 'admin');
  assert.equal(selfApprove.status, 403, JSON.stringify(selfApprove.body));
  assert.match(selfApprove.body.error, /different user must approve/i);
  assert.equal(await stockOf(item), 20, 'still Pending, no effect');
  assert.equal((await one('SELECT status FROM stock_adjustments WHERE id = ?', [id])).status, 'Pending');

  assert.equal((await call('PATCH', `/adjustments/${id}/approve`, undefined, 'admin2')).status, 200);
  assert.equal(await stockOf(item), 10);
});

test('only Admin / Super Admin can approve; a Store Keeper or Accountant cannot', async () => {
  const item = await newItem(20);
  const created1 = await call('POST', '/adjustments', adjustmentBody(item, 10), 'admin');
  const id = created1.body.adjustment_id;
  created.adjustments.push(id);

  for (const who of ['stores', 'accountant']) {
    const r = await call('PATCH', `/adjustments/${id}/approve`, undefined, who);
    assert.equal(r.status, 403, `${who}: ${JSON.stringify(r.body)}`);
  }
  assert.equal((await one('SELECT status FROM stock_adjustments WHERE id = ?', [id])).status, 'Pending');
});

test('approving twice, or an unknown adjustment, fails and changes nothing', async () => {
  const item = await newItem(20);
  const created1 = await call('POST', '/adjustments', adjustmentBody(item, 10), 'admin');
  const id = created1.body.adjustment_id;
  created.adjustments.push(id);

  assert.equal((await call('PATCH', `/adjustments/${id}/approve`, undefined, 'admin2')).status, 200);
  const again = await call('PATCH', `/adjustments/${id}/approve`, undefined, 'admin');
  assert.equal(again.status, 409, JSON.stringify(again.body));
  assert.match(again.body.error, /already approved/i);
  assert.equal(await stockOf(item), 10, 'approving twice does not double the effect');

  assert.equal((await call('PATCH', '/adjustments/99999999/approve', undefined, 'admin2')).status, 404);
});

test('an approved adjustment cannot be edited; a Pending one can, and is still unapplied', async () => {
  const item = await newItem(20);
  const pending = await call('POST', '/adjustments', adjustmentBody(item, 10), 'admin');
  const pendingId = pending.body.adjustment_id;
  created.adjustments.push(pendingId);

  const edited = await call('PUT', `/adjustments/${pendingId}`,
    { date: '2026-10-10 10:00:00', reference_note: 'x', item_id: item, actual_qty: 12, unit_price: 100, reason: 'recount' }, 'admin');
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  const afterEdit = await one('SELECT system_qty, variance, status FROM stock_adjustments WHERE id = ?', [pendingId]);
  assert.equal(num(afterEdit.system_qty), 20, 'resolved fresh, still from live stock');
  assert.equal(num(afterEdit.variance), -8);
  assert.equal(afterEdit.status, 'Pending');
  assert.equal(await stockOf(item), 20, 'still no effect');

  assert.equal((await call('PATCH', `/adjustments/${pendingId}/approve`, undefined, 'admin2')).status, 200);
  const locked = await call('PUT', `/adjustments/${pendingId}`,
    { date: '2026-10-10 10:00:00', reference_note: 'x', item_id: item, actual_qty: 5, unit_price: 100, reason: 'recount again' }, 'admin');
  assert.equal(locked.status, 409, JSON.stringify(locked.body));
  assert.match(locked.body.error, /already approved/i);
  assert.equal(num((await one('SELECT variance FROM stock_adjustments WHERE id = ?', [pendingId])).variance), -8, 'unchanged by the refused edit');
});

// ------------------------------------------------------------------ period lock on approve

test('approving an adjustment dated in a closed month is refused', async () => {
  const item = await newItem(20);
  const [row] = await pool.query(
    `INSERT INTO stock_adjustments (date, user_name, reference_note, item_id, system_qty, actual_qty, variance, unit_price, amount, reason, created_by, status)
     VALUES ('2026-06-10 10:00:00', 'x', ?, ?, 20, 10, -10, 100, -1000, 'old', ?, 'Pending')`,
    [`avail-${RUN}`, item, USERS.admin.id]);
  created.adjustments.push(row.insertId);

  const refused = await call('PATCH', `/adjustments/${row.insertId}/approve`, undefined, 'admin2');
  assert.equal(refused.status, 409, JSON.stringify(refused.body));
  assert.equal(refused.body.code, 'PERIOD_CLOSED');
  assert.equal((await one('SELECT status FROM stock_adjustments WHERE id = ?', [row.insertId])).status, 'Pending');
});
