// Audit Trail end to end: the app is assembled like server.js (audit middleware,
// sign-in routes, View Only gate, authenticate + central RBAC) on the MySQL TEST
// database (tests/db/useTestDatabase.js - never the real one).
//
// audit_log is append-only (triggers refuse UPDATE / DELETE), so the rows these
// tests create stay in the test database; they are told apart by RUN.

require('./useTestDatabase');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const pool = require('../../config/db');
const express = require('express');
const bcrypt = require('bcrypt');
const { auditTrail } = require('../../services/auditLog');
const authRoutes = require('../../routes/authRoutes');
const readOnly = require('../../middleware/readOnly');
const authenticate = require('../../middleware/authenticate');
const authorizeApi = require('../../middleware/authorizeApi');

const RUN = crypto.randomBytes(4).toString('hex');
const PASSWORD = `Pw-${RUN}-ok`;
const created = { users: [], companies: [] };
const USERS = {}; // key -> { id, username, name }

let server;
let baseUrl;

const call = async (method, path, { body, token } = {}) => {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': `audit-test/${RUN}`,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

const login = async (key) => {
  const result = await call('POST', '/login', { body: { username: USERS[key].username, password: PASSWORD } });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body.token;
};

// Rows are written just after the response is sent: wait for them.
const auditRows = async (where, params, expected = 1) => {
  for (let i = 0; i < 50; i += 1) {
    const [rows] = await pool.query(`SELECT * FROM audit_log WHERE ${where} ORDER BY occurred_at, id`, params);
    if (rows.length >= expected) return rows;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const [rows] = await pool.query(`SELECT * FROM audit_log WHERE ${where} ORDER BY occurred_at, id`, params);
  return rows;
};

test.before(async () => {
  await pool.auditLogSchemaReady;
  const hash = await bcrypt.hash(PASSWORD, 4);
  for (const [key, role] of [['admin', 'Admin'], ['superadmin', 'Super Admin'], ['accountant', 'Accountant'], ['stores', 'Store Keeper']]) {
    const username = `${key}-audit-${RUN}`;
    const name = `${role} ${RUN}`;
    const [u] = await pool.query(
      'INSERT INTO users (name, username, password, role, status) VALUES (?, ?, ?, ?, 1)', [name, username, hash, role]);
    created.users.push(u.insertId);
    USERS[key] = { id: u.insertId, username, name };
  }

  const app = express();
  app.use(express.json());
  app.use('/api', auditTrail);
  app.use('/api', authRoutes);
  app.use('/api', readOnly);
  app.use('/api', authenticate, authorizeApi);
  app.use('/api/companies', require('../../routes/companyRoutes'));
  app.use('/api/audit-logs', require('../../routes/auditLogRoutes'));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  if (created.companies.length) await pool.query('DELETE FROM company WHERE id IN (?)', [created.companies]);
  if (created.users.length) await pool.query('DELETE FROM users WHERE id IN (?)', [created.users]);
  await pool.end();
});

test('a failed sign-in is recorded with the typed username - and never the password', async () => {
  const typed = `${USERS.accountant.username}`;
  const result = await call('POST', '/login', { body: { username: typed, password: 'wrong-password' } });
  assert.equal(result.status, 401);
  const unknown = await call('POST', '/login', { body: { username: `nobody-${RUN}`, password: 'x' } });
  assert.equal(unknown.status, 401);

  const rows = await auditRows("action = 'LOGIN_FAILED' AND username IN (?, ?)", [typed, `nobody-${RUN}`], 2);
  assert.equal(rows.length, 2);
  const [known, nobody] = rows;
  assert.equal(known.user_id, USERS.accountant.id);
  assert.equal(known.event_type, 'AUTH');
  assert.equal(known.outcome, 'FAILED');
  assert.equal(known.message, 'Wrong password');
  assert.equal(known.user_agent, `audit-test/${RUN}`);
  assert.ok(known.ip_address);
  assert.equal(nobody.user_id, null);
  assert.equal(nobody.message, 'Unknown username');
  for (const row of rows) {
    assert.ok(!row.request_body.includes('wrong-password'), 'password must not be stored');
    assert.equal(JSON.parse(row.request_body).password, '[REDACTED]');
  }
});

test('one sign-in session: login, a change, a refused action and logout share a session id', async () => {
  const token = await login('stores');
  const [loginRow] = await auditRows("action = 'LOGIN' AND user_id = ?", [USERS.stores.id]);
  assert.ok(loginRow.session_id, 'login starts a session');
  assert.equal(loginRow.user_name, USERS.stores.name);
  assert.equal(loginRow.user_role, 'Store Keeper');
  assert.ok(!loginRow.response_body.includes(token), 'the sign-in token is never stored');

  const company = await call('POST', '/companies', { token, body: { name: `Audit Co ${RUN}` } });
  assert.equal(company.status, 201, JSON.stringify(company.body));
  created.companies.push(company.body.id || company.body.company?.id || company.body.insertId);

  const denied = await call('GET', '/audit-logs', { token });
  assert.equal(denied.status, 403);

  const logout = await call('POST', '/logout', { token });
  assert.equal(logout.status, 200);

  const rows = await auditRows('session_id = ?', [loginRow.session_id], 4);
  assert.deepEqual(rows.map((r) => [r.event_type, r.action, r.outcome]), [
    ['AUTH', 'LOGIN', 'SUCCESS'],
    ['CHANGE', 'CREATE', 'SUCCESS'],
    ['DENIED', 'ACCESS_DENIED', 'FAILED'],
    ['AUTH', 'LOGOUT', 'SUCCESS']
  ]);
  assert.equal(rows[1].module, 'Companies');
  assert.equal(JSON.parse(rows[1].request_body).name, `Audit Co ${RUN}`);
  assert.equal(rows[2].module, 'Audit Trail');
  assert.ok(rows.every((r) => r.user_id === USERS.stores.id));
});

test('a failed change is recorded with the error the user saw', async () => {
  const token = await login('accountant');
  const result = await call('POST', '/companies', { token, body: {} });
  assert.ok(result.status >= 400, JSON.stringify(result.body));
  const [row] = await auditRows("action = 'CREATE' AND user_id = ? AND outcome = 'FAILED'", [USERS.accountant.id]);
  assert.equal(row.module, 'Companies');
  assert.equal(row.status_code, result.status);
  assert.equal(row.message, result.body.error);
});

test('only Admin and Super Admin can read the Audit Trail', async () => {
  for (const key of ['accountant', 'stores']) {
    const token = await login(key);
    assert.equal((await call('GET', '/audit-logs', { token })).status, 403, key);
  }
  for (const key of ['admin', 'superadmin']) {
    const token = await login(key);
    assert.equal((await call('GET', '/audit-logs', { token })).status, 200, key);
  }
});

test('the Audit Trail API lists, filters, summarises and shows one event in full', async () => {
  const token = await login('admin');
  const today = new Date().toISOString().slice(0, 10);

  const list = await call('GET', `/audit-logs?userId=${USERS.stores.id}&from=2026-01-01&to=2099-12-31&limit=10`, { token });
  assert.equal(list.status, 200, JSON.stringify(list.body));
  assert.ok(list.body.total >= 4);
  assert.ok(list.body.rows.every((r) => r.user_id === USERS.stores.id));
  assert.equal(list.body.rows[0].request_body, undefined, 'the list stays light');

  const failedSignIns = await call('GET', `/audit-logs?search=${encodeURIComponent(`nobody-${RUN}`)}`, { token });
  assert.equal(failedSignIns.body.rows.length, 1);
  assert.equal(failedSignIns.body.rows[0].action, 'LOGIN_FAILED');

  const denied = await call('GET', `/audit-logs?eventType=DENIED&userId=${USERS.stores.id}`, { token });
  assert.ok(denied.body.rows.length >= 1);
  assert.ok(denied.body.rows.every((r) => r.event_type === 'DENIED'));

  const summary = await call('GET', `/audit-logs/summary?userId=${USERS.stores.id}&from=${today}&to=${today}`, { token });
  assert.equal(summary.status, 200);
  assert.ok(summary.body.logins >= 1 && summary.body.changes >= 1 && summary.body.denied >= 1);

  const filters = await call('GET', '/audit-logs/filters', { token });
  assert.ok(filters.body.users.some((u) => u.id === USERS.stores.id));
  assert.ok(filters.body.actions.includes('LOGIN'));
  assert.ok(filters.body.modules.includes('Companies'));

  const createRow = list.body.rows.find((r) => r.action === 'CREATE');
  const detail = await call('GET', `/audit-logs/${createRow.id}`, { token });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.request_body.name, `Audit Co ${RUN}`);
  assert.equal(detail.body.user_agent, `audit-test/${RUN}`);
  assert.equal((await call('GET', '/audit-logs/999999999', { token })).status, 404);
});

test('audit rows cannot be changed or deleted', async () => {
  const [[row]] = await pool.query('SELECT id FROM audit_log WHERE user_id = ? LIMIT 1', [USERS.stores.id]);
  await assert.rejects(pool.query("UPDATE audit_log SET action = 'X' WHERE id = ?", [row.id]), /append-only/);
  await assert.rejects(pool.query('DELETE FROM audit_log WHERE id = ?', [row.id]), /append-only/);
});

test('an edit records the old and new values; a delete records the last values', async () => {
  const token = await login('admin');
  const created1 = await call('POST', '/companies', { token, body: { name: `Before ${RUN}` } });
  assert.equal(created1.status, 201, JSON.stringify(created1.body));
  const id = created1.body.company.id;
  created.companies.push(id);

  const edit = await call('PUT', `/companies/${id}`, { token, body: { name: `After ${RUN}` } });
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  const [editRow] = await auditRows("action = 'UPDATE' AND module = 'Companies' AND entity_id = ?", [String(id)]);
  assert.equal(JSON.parse(editRow.old_values).row.name, `Before ${RUN}`);
  assert.equal(JSON.parse(editRow.new_values).row.name, `After ${RUN}`);

  const detail = await call('GET', `/audit-logs/${editRow.id}`, { token });
  assert.deepEqual(detail.body.changes.fields, [{ field: 'name', before: `Before ${RUN}`, after: `After ${RUN}` }]);

  // In plain words, with the record named the way people know it.
  assert.equal(editRow.record_type, 'Company');
  assert.equal(editRow.record_label, `Company After ${RUN}`);
  const [createRow] = await auditRows("action = 'CREATE' AND module = 'Companies' AND record_label = ?", [`Company Before ${RUN}`]);
  assert.ok(createRow, 'a create is named from the data entered');
  const plain = detail.body.plain;
  assert.equal(plain.headline, `${USERS.admin.name} edited Company After ${RUN}.`);
  assert.deepEqual(plain.who, { name: USERS.admin.name, role: 'Admin' });
  assert.deepEqual(plain.changes, [{ field: 'name', label: 'Name', before: `Before ${RUN}`, after: `After ${RUN}` }]);
  assert.equal(plain.result, 'Successful');

  const removed = await call('DELETE', `/companies/${id}`, { token });
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  const [deleteRow] = await auditRows("action = 'DELETE' AND module = 'Companies' AND entity_id = ?", [String(id)]);
  assert.equal(JSON.parse(deleteRow.old_values).row.name, `After ${RUN}`);
  assert.deepEqual(JSON.parse(deleteRow.new_values), { deleted: true });
  const deletedDetail = await call('GET', `/audit-logs/${deleteRow.id}`, { token });
  assert.equal(deletedDetail.body.changes.deleted, true);
});

test('a request without a valid sign-in never makes the server read the record', async () => {
  const result = await call('PUT', '/companies/1', { body: { name: `Anon ${RUN}` } });
  assert.equal(result.status, 401);
  const rows = await auditRows("method = 'PUT' AND path = '/api/companies/1' AND user_id IS NULL AND request_body LIKE ?", [`%Anon ${RUN}%`]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].old_values, null);
  assert.equal(rows[0].new_values, null);
});

test('POS / Restaurant sync runs are recorded with counts, rejected records and errors', async () => {
  const { recordSyncRun } = require('../../services/collectionSyncService');
  recordSyncRun([
    {
      system: 'POS', label: 'RAVON POS', fetched: 12, created: 8, updated: 2, duplicates: 0, unmapped: 1, invalid: 1, excluded: 0,
      sources: [{ source: 'SHIFT', fetched: 12, inserted: 8, updated: 2, invalid: 1,
        invalidSamples: [{ index: 3, reason: `Missing amount ${RUN}`, fields: ['total'] }] }]
    },
    { system: 'RESTAURANT', label: 'RAVON Restaurant', fetched: 0, created: 0, updated: 0, duplicates: 0, unmapped: 0,
      invalid: 0, excluded: 0, sources: [], error: `Restaurant unreachable ${RUN}`, code: 'RESTAURANT_AUTH_UNAVAILABLE' },
    { system: 'X', label: 'Not configured', skipped: true, fetched: 0, created: 0, updated: 0, invalid: 0, unmapped: 0, sources: [] }
  ], { window: { start_date: '2026-10-10', end_date: '2026-10-16' }, userId: USERS.accountant.id, request: { ip: '10.1.2.3' } });

  const rows = await auditRows("event_type = 'SYNC' AND user_id = ?", [USERS.accountant.id], 2);
  assert.deepEqual(rows.map((r) => [r.module, r.outcome]), [
    ['Collection - RAVON POS', 'FAILED'],
    ['Collection - RAVON Restaurant', 'FAILED']
  ]);
  assert.match(rows[0].message, /12 fetched, 8 new, 2 updated, 1 rejected/);
  assert.ok(rows[0].response_body.includes(`Missing amount ${RUN}`), 'the rejected record and its reason are kept');
  assert.match(rows[1].message, new RegExp(`Restaurant unreachable ${RUN}`));
  assert.equal(rows[0].user_role, 'Accountant');
  assert.equal(rows[0].ip_address, '10.1.2.3');

  const token = await login('admin');
  const summary = await call('GET', `/audit-logs/summary?userId=${USERS.accountant.id}`, { token });
  assert.ok(summary.body.failedSyncs >= 2);
  const list = await call('GET', `/audit-logs?eventType=SYNC&userId=${USERS.accountant.id}`, { token });
  assert.equal(list.body.rows.length, 2);
});
