// Regression tests for the HIGH fixes of docs/security-financial-reaudit-2026-10-14.md:
//   N1 - POS / Restaurant requests only ever go to the configured origin
//        (a next_page_url on another host never receives a token / signature)
//   N2 - a concurrent duplicate approval (UNIQUE completed reference) is a 409
//        and nothing is kept
//   N3 - authenticate re-checks the user in the database: deactivated users,
//        revoked tokens and stale roles are refused
//   N4 - the actor of a request is always the signed-in user
// No MySQL is needed: config/db is replaced by a fake before anything loads it.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const dbPath = require.resolve('../config/db');
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { query: async () => [[]], getConnection: async () => { throw new Error('no db in this test'); } }
};

const SECRET = 'n'.repeat(48);
process.env.JWT_SECRET = SECRET;
const secrets = require('../config/secrets');

const listen = (handler) => new Promise((resolve) => {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1', () => resolve(server));
});
const close = (server) => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });

// ---------------------------------------------------------------- N1
test('N1: isSameOrigin refuses look-alike hosts and userinfo', () => {
  const auth = require('../services/integrationAuthService');
  process.env.RAVON_POS_API_URL = 'https://pos.ravonbakers.lk';
  try {
    assert.equal(auth.isSameOrigin('pos', 'https://pos.ravonbakers.lk/api/completed-shifts/collection?page=2'), true);
    assert.equal(auth.isSameOrigin('pos', 'https://pos.ravonbakers.lk.evil.tld/api/x'), false);
    assert.equal(auth.isSameOrigin('pos', 'https://pos.ravonbakers.lk@evil.tld/api/x'), false);
    assert.equal(auth.isSameOrigin('pos', 'http://pos.ravonbakers.lk/api/x'), false, 'scheme is part of the origin');
    assert.equal(auth.isSameOrigin('pos', 'https://pos.ravonbakers.lk:8443/api/x'), false, 'port is part of the origin');
    assert.equal(auth.isSameOrigin('pos', 'not a url'), false);
  } finally {
    delete process.env.RAVON_POS_API_URL;
  }
});

test('N1: posGet refuses an absolute URL on another host before sending anything', async () => {
  const auth = require('../services/integrationAuthService');
  process.env.RAVON_POS_API_URL = 'https://pos.ravonbakers.lk';
  try {
    await assert.rejects(auth.posGet('pos', 'https://pos.ravonbakers.lk.evil.tld/api/me', null, { userId: 1 }),
      (error) => error instanceof auth.PosConfigError && /another host|other than/i.test(error.message));
  } finally {
    delete process.env.RAVON_POS_API_URL;
  }
});

test('N1: a signed sync never follows next_page_url to another host', async () => {
  let attackerHits = 0;
  const attacker = await listen((req, res) => { attackerHits += 1; res.end('{}'); });
  let posHits = 0;
  let pos;
  pos = await listen((req, res) => {
    posHits += 1;
    const { port } = attacker.address();
    // startsWith("http://127.0.0.1:<pos port>") is true for this URL, but its host is the attacker.
    const next = `http://127.0.0.1:${pos.address().port}@127.0.0.1:${port}/api/integration/employee-deductions?status=all`;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ data: [{ id: 1 }], next_page_url: next }));
  });
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  process.env.RAVON_POS_API_URL = `http://127.0.0.1:${pos.address().port}`;
  process.env.RAVON_POS_INTEGRATION_PRIVATE_KEY = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  try {
    const { fetchAllRecords } = require('../services/collectionSyncService');
    const records = await fetchAllRecords(`${process.env.RAVON_POS_API_URL}/api/completed-shifts/collection`, { provider: 'pos' });
    assert.equal(records.length, 1);
    assert.equal(posHits, 1);
    assert.equal(attackerHits, 0, 'the attacker host must never receive a signed request');
  } finally {
    delete process.env.RAVON_POS_API_URL;
    delete process.env.RAVON_POS_INTEGRATION_PRIVATE_KEY;
    await close(pos);
    await close(attacker);
  }
});

// ---------------------------------------------------------------- N2
// Pending shifts with Rs 100 cash each. `concurrentDup` = ids whose status flip
// hits the UNIQUE completed-reference key (another user approved the other copy
// of the same POS reference at the same moment); `alreadyApproved` = ids whose
// other copy was approved BEFORE (seen by the plain early check).
const fakeApprovalConnection = ({ concurrentDup = [], alreadyApproved = [] } = {}) => {
  const log = [];
  let current = null;
  const rowOf = (id) => ({
    id, source_system: 'POS', source_type: 'SHIFT', source_id: String(900 + id), reference_no: `SH-${900 + id}`,
    collection_date: '2026-10-13', shift_id: String(900 + id), shift_no: '7', cashier_name: 'C', employee_name: null,
    company_id: 1, pos_bank_account: null, pos_branch_name: 'Cafe', department_id: 3,
    cash_amount: '100.00', card_amount: '0.00', bank_amount: '0.00', ar_amount: '0.00',
    short_excess_amount: '0.00', deduction_amount: '0.00', total_amount: '100.00', pos_total_amount: null,
    linked_collection_id: null, status: 'pending', raw_payload: '{}', version: 'v1'
  });
  const query = async (sql, params = []) => {
    const s = String(sql).replace(/\s+/g, ' ').trim();
    if (/FROM collections WHERE id = \? FOR UPDATE/.test(s)) { current = params[0]; return [[rowOf(current)]]; }
    if (/SELECT id FROM collection_transactions/.test(s)) return [[]];
    if (/^SELECT id FROM collections WHERE source_type = \? AND reference_no/.test(s)) {
      const locking = /LOCK IN SHARE MODE/.test(s);
      if (alreadyApproved.includes(current) && !locking) return [[{ id: 40 + current }]];
      if (concurrentDup.includes(current) && locking) return [[{ id: 60 + current }]]; // committed by the other user
      return [[]];
    }
    if (/SELECT u\.name FROM collections c LEFT JOIN users u/.test(s)) return [[{ name: 'accountant1' }]];
    if (/COALESCE\(SUM/.test(s)) return [[{ current_balance: '0.00' }]];
    if (/LAST_INSERT_ID/.test(s)) return [[{ id: 77 }]];
    if (/^UPDATE collections SET status = 'completed'/.test(s) && concurrentDup.includes(current)) {
      const error = new Error(`Duplicate entry 'POS:SHIFT:SH-${900 + current}' for key 'uq_collections_completed_ref'`);
      error.code = 'ER_DUP_ENTRY';
      throw error;
    }
    log.push({ id: current, sql: s.split(' ').slice(0, 4).join(' ') });
    return [{ insertId: 10, affectedRows: 1 }];
  };
  return { connection: { query }, log };
};

test('N2: a concurrent duplicate is skipped with the reason; only that record is rolled back, the batch is approved', async () => {
  const { approveCollections } = require('../services/collectionService');
  const { connection, log } = fakeApprovalConnection({ concurrentDup: [6] });
  const result = await approveCollections(connection, { items: [5, 6, 7].map((id) => ({ id, version: 'v1' })), userId: 4 });

  assert.deepEqual(result.approved.map((a) => a.id), [5, 7]);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].id, 6);
  assert.equal(result.skipped[0].duplicate_of, 66);
  assert.match(result.skipped[0].reason, /approved at the same moment as collection #66 by accountant1/);

  // Record 6 posted, hit the key, and was rolled back to ITS savepoint only.
  const six = log.filter((l) => l.id === 6).map((l) => l.sql);
  assert.ok(six.some((q) => /^SAVEPOINT/.test(q)));
  assert.ok(six.some((q) => /^INSERT INTO collection_transactions/.test(q)));
  assert.ok(six.some((q) => /^ROLLBACK TO SAVEPOINT/.test(q)));
  for (const id of [5, 7]) {
    assert.ok(!log.some((l) => l.id === id && /^ROLLBACK/.test(l.sql)), `record ${id} is kept`);
    assert.ok(log.some((l) => l.id === id && /^UPDATE collections SET status/.test(l.sql)), `record ${id} completed`);
  }
});

test('N2: a copy of an already-approved reference is skipped before anything is posted (no batch failure)', async () => {
  const { approveCollections } = require('../services/collectionService');
  const { connection, log } = fakeApprovalConnection({ alreadyApproved: [8] });
  const result = await approveCollections(connection, { items: [8, 9].map((id) => ({ id, version: 'v1' })), userId: 4 });

  assert.deepEqual(result.approved.map((a) => a.id), [9]);
  assert.equal(result.skipped[0].id, 8);
  assert.equal(result.skipped[0].duplicate_of, 48);
  assert.match(result.skipped[0].reason, /already approved as collection #48 by accountant1.*reject it/);
  assert.deepEqual(log.filter((l) => l.id === 8), [], 'nothing written for the duplicate');
});

// ---------------------------------------------------------------- N3
const { createAuthenticate } = require('../middleware/authenticate');

const runAuth = async (authenticate, token) => {
  let status = null; let body = null; let user = null;
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = { status(code) { status = code; return { json(b) { body = b; } }; } };
  await authenticate(req, res, () => { user = req.user; });
  return { status, body, user };
};

const users = new Map([
  [1, { id: 1, username: 'admin', role: 'Admin', token_version: 0 }],
  [2, { id: 2, username: 'keeper', role: 'Store Keeper', token_version: 3 }]
]);
const authWithUsers = createAuthenticate({ loadUser: async (id) => users.get(Number(id)) || null });
const sign = (claims) => jwt.sign(claims, SECRET, secrets.JWT_SIGN_OPTIONS);

test('N3: an active user with the current token_version is accepted', async () => {
  const r = await runAuth(authWithUsers, sign({ userId: 1, role: 'Admin', tv: 0 }));
  assert.equal(r.status, null);
  assert.equal(r.user.userId, 1);
});

test('N3: the role always comes from the database, never from the token', async () => {
  const r = await runAuth(authWithUsers, sign({ userId: 2, role: 'Super Admin', tv: 3 }));
  assert.equal(r.user.role, 'Store Keeper');
});

test('N3: deactivated / deleted users are refused even with a valid token', async () => {
  const r = await runAuth(authWithUsers, sign({ userId: 99, role: 'Admin', tv: 0 }));
  assert.equal(r.status, 401);
  assert.equal(r.body.expired, true);
});

test('N3: a revoked token (token_version bumped) and a pre-fix token without tv are refused', async () => {
  assert.equal((await runAuth(authWithUsers, sign({ userId: 2, role: 'Store Keeper', tv: 2 }))).status, 401);
  assert.equal((await runAuth(authWithUsers, sign({ userId: 1, role: 'Admin' }))).status, 401);
});

test('N3: a database failure fails closed (503), never trusting the token', async () => {
  const broken = createAuthenticate({ loadUser: async () => { throw new Error('db down'); } });
  const r = await runAuth(broken, sign({ userId: 1, role: 'Admin', tv: 0 }));
  assert.equal(r.status, 503);
  assert.equal(r.user, null);
});

test('N3: /refresh-token requires a valid session and issues the CURRENT role', async () => {
  const sessionUserPath = require.resolve('../services/sessionUser');
  const sessionUser = require(sessionUserPath);
  const original = sessionUser.loadActiveUser;
  sessionUser.loadActiveUser = async (id) => users.get(Number(id)) || null;
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api', require('../routes/authRoutes'));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const url = `http://127.0.0.1:${server.address().port}/api/refresh-token`;
  try {
    const stale = sign({ userId: 2, role: 'Super Admin', tv: 3 });
    const ok = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${stale}` } });
    assert.equal(ok.status, 200);
    const { token } = await ok.json();
    assert.equal(jwt.verify(token, SECRET, secrets.JWT_VERIFY_OPTIONS).role, 'Store Keeper');

    const bodyOnly = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: stale })
    });
    assert.equal(bodyOnly.status, 401, 'a token in the body is no longer accepted');

    const deactivated = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${sign({ userId: 99, role: 'Admin', tv: 0 })}` } });
    assert.equal(deactivated.status, 401);
  } finally {
    sessionUser.loadActiveUser = original;
    await close(server);
  }
});

// ---------------------------------------------------------------- N5
test('N5: the approve handler itself refuses every role but Accountant, before any DB work', async () => {
  const controller = require('../controllers/collectionController');
  for (const role of ['Admin', 'Super Admin', 'Finance', 'View Only', 'Store Keeper']) {
    let status = null; let body = null;
    const res = { status(code) { status = code; return { json(b) { body = b; } }; }, json(b) { body = b; } };
    await controller.approve({ user: { userId: 3, role }, body: { items: [{ id: 1 }] } }, res);
    assert.equal(status, 403, role);
    assert.match(body.error, /Only an Accountant/);
  }
});

// ---------------------------------------------------------------- N4
test('N4: actorId is the signed-in user only', () => {
  const { actorId } = require('../utils/actor');
  assert.equal(actorId({ user: { userId: 7 }, body: { created_by: 1 } }), 7);
  assert.equal(actorId({ body: { created_by: 1 } }), null);
  assert.equal(actorId({ user: { userId: '0' } }), null);
  assert.equal(actorId({ user: { userId: 'abc' } }), null);
});

test('N4: no controller reads created_by / prepared_by from the request body', () => {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', 'controllers');
  const offenders = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    if (/req\.body\??\.(created_by|prepared_by)\b/.test(src)) offenders.push(`${file}: req.body.created_by / prepared_by`);
    for (const m of src.matchAll(/(?:const|let)\s*\{([^}]*)\}\s*=\s*req\.body/g)) {
      if (/\b(created_by|prepared_by)\b/.test(m[1])) offenders.push(`${file}: destructures created_by / prepared_by from req.body`);
    }
  }
  assert.deepEqual(offenders, [], 'use utils/actor.js actorId(req)');
});
