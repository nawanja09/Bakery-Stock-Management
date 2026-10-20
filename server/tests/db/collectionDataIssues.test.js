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

// Domain 6 M9 fix: collection_data_issues is now append-only (a DB trigger
// refuses DELETE), so this run's rows are left in the test DB rather than
// cleaned up - each run tags its rows with a unique RUN marker instead.
test.after(async () => {
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

// Domain 1 M3 fix: a flood of distinct malformed payloads from one (system,
// source) collapses into one shared BURST row once the per-hour budget for
// NEW distinct issues is used up, instead of one row per variant.
test('a burst of distinct payloads from one (system, source) collapses into one BURST row past the limit', async () => {
  const previousLimit = process.env.RAVON_QUARANTINE_BURST_LIMIT;
  process.env.RAVON_QUARANTINE_BURST_LIMIT = '2';
  quarantine.resetBurstTracking();
  try {
    const system = 'RESTAURANT';
    const source = 'EMPLOYEE_DEDUCTION';
    for (let i = 0; i < 5; i += 1) {
      assert.equal(await quarantine.recordIssue(pool, {
        system, source, kind: quarantine.KINDS.REJECTED,
        reason: `burst variant ${i} ${RUN}`, payload: { i, run: RUN }
      }), true);
    }

    const [distinctRows] = await pool.query(
      "SELECT id, reason, kind FROM collection_data_issues WHERE kind = 'REJECTED' AND reason LIKE ? ORDER BY id",
      [`burst variant%${RUN}`]
    );
    assert.equal(distinctRows.length, 2, 'only the first 2 distinct variants (the limit) get their own row');

    const [burstRows] = await pool.query(
      "SELECT id, seen_count, kind, raw_payload FROM collection_data_issues WHERE kind = 'BURST' AND source_system = ? AND source_type = ?",
      [system, source]
    );
    assert.equal(burstRows.length, 1, 'the remaining 3 variants collapse into one shared BURST row');
    assert.equal(burstRows[0].seen_count, 3);
    assert.equal(JSON.parse(burstRows[0].raw_payload).run, RUN);
  } finally {
    if (previousLimit === undefined) delete process.env.RAVON_QUARANTINE_BURST_LIMIT;
    else process.env.RAVON_QUARANTINE_BURST_LIMIT = previousLimit;
    quarantine.resetBurstTracking();
  }
});
