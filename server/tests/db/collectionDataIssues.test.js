// Audit M4: the quarantine table and its SQL, against the MySQL TEST database
// (tests/db/useTestDatabase.js - never the real one).
require('./useTestDatabase');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const pool = require('../../config/db');
const quarantine = require('../../services/collectionQuarantine');

const RUN = crypto.randomBytes(4).toString('hex');
const keys = [];

test.before(async () => { await pool.collectionsSchemaReady; });

test.after(async () => {
  await pool.query('DELETE FROM collection_data_issues WHERE reason LIKE ?', [`%${RUN}%`]);
  await pool.end();
});

test('the same rejected record is one issue whose seen_count rises; a new payload is a new issue', async () => {
  const base = { system: 'POS', source: 'SHIFT', kind: quarantine.KINDS.REJECTED, reason: `online is missing ${RUN}`, fields: ['shift_id'], sourceId: '900' };
  assert.equal(await quarantine.recordIssue(pool, { ...base, payload: { shift_id: 900, run: RUN } }), true);
  assert.equal(await quarantine.recordIssue(pool, { ...base, payload: { shift_id: 900, run: RUN } }), true);
  assert.equal(await quarantine.recordIssue(pool, { ...base, payload: { shift_id: 900, run: RUN, other: 1 } }), true);

  const [rows] = await pool.query('SELECT id, seen_count, status, kind, source_system, raw_payload FROM collection_data_issues WHERE reason = ? ORDER BY id', [base.reason]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].seen_count, 2);
  assert.equal(rows[1].seen_count, 1);
  assert.equal(rows[0].status, 'OPEN');
  assert.equal(JSON.parse(rows[0].raw_payload).run, RUN);
  keys.push(rows[0].id, rows[1].id);
});

test('list, resolve (needs OPEN), and a resolved issue stays resolved when seen again', async () => {
  const reason = `drift ${RUN}`;
  const issue = { system: 'RESTAURANT', source: 'CREDIT_PAYMENT', kind: quarantine.KINDS.CHANGED_AFTER_APPROVAL, reason, payload: `{"run":"${RUN}"}`, collectionId: null };
  await quarantine.recordIssue(pool, issue);
  const open = (await quarantine.listIssues(pool, { status: 'OPEN', limit: 500 })).filter((r) => r.reason === reason);
  assert.equal(open.length, 1);
  assert.equal(open[0].kind, 'CHANGED_AFTER_APPROVAL');

  assert.equal(await quarantine.resolveIssue(pool, open[0].id, { userId: null, note: 'checked with the POS' }), true);
  assert.equal(await quarantine.resolveIssue(pool, open[0].id, { userId: null, note: 'again' }), false, 'already resolved');

  await quarantine.recordIssue(pool, issue); // the POS sends the same thing again
  const after = await quarantine.getIssue(pool, open[0].id);
  assert.equal(after.status, 'RESOLVED');
  assert.equal(after.seen_count, 2);
  assert.equal(after.resolution_note, 'checked with the POS');
  assert.equal((await quarantine.listIssues(pool, { status: 'OPEN', limit: 500 })).some((r) => r.reason === reason), false);
  assert.equal((await quarantine.listIssues(pool, { status: 'ALL', limit: 500 })).some((r) => r.reason === reason), true);
});
