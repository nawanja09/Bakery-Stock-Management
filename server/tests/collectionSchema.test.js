require('./helpers/noDatabase');
const test = require('node:test');
const assert = require('node:assert/strict');

const { checkContract, mode, CONTRACT_VERSION } = require('../services/collectionSchema');
const quarantine = require('../services/collectionQuarantine');
const { stagePending, approvedDifference } = require('../services/collectionSyncService');

// Audit M4: POS / Restaurant records must match the verified RAVON contract; anything else is
// quarantined, not guessed. Approved collections that change upstream are reported, not re-posted.

const shift = (over = {}) => ({
  shift_id: 211, shift_no: '0104', branch: { id: 6, name: 'Cafe - M' }, cashier: { id: 2, name: 'Imasha' },
  opened_at: '2026-10-06T00:36:51.000000Z', closed_at: '2026-10-06T08:36:35.000000Z', completed_at: '2026-10-06T10:19:28.000000Z',
  cash: { declared: 44560, actual: 44560, counted: 44560 },
  card: { total: 32929, count: 33, transactions: [] }, online: { total: 12380, count: 2, transactions: [] },
  credit: { total: 5440 }, short_excess: { by_method: {}, total: -120, status: 'short' }, collection: 95309, ...over
});
const credit = (over = {}) => ({
  id: 501, reference_no: 'CP-501', date_time: '2026-10-07T20:15:10.000000Z', customer: { id: 3, name: 'C' }, branch: { id: null, name: null },
  payment_method: 'Cash', cash: 1000, card: 0, bank_transfer: 0, setoff: 0, amount: 1000, collection: 1000, ...over
});
const deduction = (over = {}) => ({
  id: 31, deduction_date: '2026-09-25', employee: { id: 14, name: 'E' }, source: { shift_id: 211 }, amount: 750, status: 'active', ...over
});

test('the live shapes of all three sources match the contract', () => {
  assert.deepEqual(checkContract('SHIFT', shift()), { ok: true, problems: [], unknownFields: [] });
  assert.equal(checkContract('CREDIT_PAYMENT', credit()).ok, true);
  assert.equal(checkContract('EMPLOYEE_DEDUCTION', deduction()).ok, true);
  assert.match(CONTRACT_VERSION, /^ravon-collections-v1$/);
});

test('shift: cash.actual may be null when cash.counted is there; a Restaurant shift needs no branch', () => {
  assert.equal(checkContract('SHIFT', shift({ cash: { actual: null, counted: 44560 } })).ok, true);
  const { branch, ...noBranch } = shift();
  assert.equal(checkContract('SHIFT', noBranch).ok, true);
});

test('shift: a renamed / removed amount field is rejected, not read as 0', () => {
  const { online, ...renamed } = shift();
  const gone = checkContract('SHIFT', { ...renamed, bank_online: { total: 12380 } });
  assert.equal(gone.ok, false);
  assert.ok(gone.problems.includes('online is missing'));
  assert.deepEqual(gone.unknownFields, ['bank_online'], 'the new field is reported');

  assert.ok(checkContract('SHIFT', shift({ card: { count: 33 } })).problems.includes('card.total is missing or not a number'));
  assert.ok(checkContract('SHIFT', shift({ shift_no: '' })).problems.includes('shift_no is missing'));
  assert.ok(checkContract('SHIFT', shift({ closed_at: 'soon', completed_at: null })).problems.some((p) => /not a date/.test(p)));
  assert.ok(checkContract('SHIFT', shift({ collection: 'abc' })).problems.includes('collection is missing or not a number'));
});

test('shift: parts that do not add up to the POS collection total are rejected', () => {
  const bad = checkContract('SHIFT', shift({ card: { total: 100, count: 1, transactions: [] } }));
  assert.equal(bad.ok, false);
  assert.match(bad.problems[0], /does not equal collection/);
  assert.equal(checkContract('SHIFT', shift({ collection: 95309.01 })).ok, true, 'a cent of rounding is tolerated');
});

test('credit payment: the three method columns must exist and add up to collection', () => {
  const { bank_transfer, ...missing } = credit();
  assert.ok(checkContract('CREDIT_PAYMENT', missing).problems.includes('bank_transfer is missing or not a number'));
  assert.match(checkContract('CREDIT_PAYMENT', credit({ cash: 900 })).problems[0], /does not equal collection/);
  assert.equal(checkContract('CREDIT_PAYMENT', credit({ payment_method: 'Overpayment Setoff', cash: 0, setoff: 1000, collection: 0 })).ok, true);
  assert.ok(checkContract('CREDIT_PAYMENT', credit({ date_time: undefined })).problems.some((p) => /date_time/.test(p)));
});

test('employee deduction: id, date, employee and a non-negative amount are required', () => {
  assert.ok(checkContract('EMPLOYEE_DEDUCTION', deduction({ amount: 'x' })).problems.includes('amount is missing or not a number'));
  assert.ok(checkContract('EMPLOYEE_DEDUCTION', deduction({ amount: -5 })).problems.includes('amount is negative'));
  assert.ok(checkContract('EMPLOYEE_DEDUCTION', deduction({ employee: null })).problems.includes('employee (id or name) is missing'));
  assert.ok(checkContract('EMPLOYEE_DEDUCTION', deduction({ id: null })).problems.includes('id is missing'));
});

test('anything that is not a record, or an unknown source, is refused', () => {
  assert.equal(checkContract('SHIFT', null).ok, false);
  assert.equal(checkContract('SHIFT', []).ok, false);
  assert.equal(checkContract('REFUND', {}).ok, false);
});

test('COLLECTION_SCHEMA_MODE: strict by default; warn and off are explicit', () => {
  const before = process.env.COLLECTION_SCHEMA_MODE;
  try {
    delete process.env.COLLECTION_SCHEMA_MODE;
    assert.equal(mode(), 'strict');
    process.env.COLLECTION_SCHEMA_MODE = 'WARN';
    assert.equal(mode(), 'warn');
    process.env.COLLECTION_SCHEMA_MODE = 'off';
    assert.equal(mode(), 'off');
    process.env.COLLECTION_SCHEMA_MODE = 'nonsense';
    assert.equal(mode(), 'strict', 'an unknown value never weakens the check');
  } finally {
    if (before === undefined) delete process.env.COLLECTION_SCHEMA_MODE; else process.env.COLLECTION_SCHEMA_MODE = before;
  }
});

// ---- quarantine store
test('recordIssue upserts by a stable key, caps the payload, and never throws', async () => {
  const calls = [];
  const queryable = { query: async (sql, params) => { calls.push({ sql: String(sql), params }); return [{ affectedRows: 1 }]; } };
  const issue = { system: 'POS', source: 'SHIFT', kind: 'REJECTED', reason: 'online is missing', fields: ['shift_id'], payload: { shift_id: 1 }, sourceId: 1 };
  assert.equal(await quarantine.recordIssue(queryable, issue), true);
  assert.equal(await quarantine.recordIssue(queryable, issue), true);
  assert.match(calls[0].sql, /ON DUPLICATE KEY UPDATE seen_count = seen_count \+ 1/);
  assert.equal(calls[0].params[0], calls[1].params[0], 'the same record is the same issue');
  const other = await quarantine.recordIssue(queryable, { ...issue, payload: { shift_id: 2 } });
  assert.equal(other, true);
  assert.notEqual(calls[2].params[0], calls[0].params[0], 'a different payload is a different issue');

  const huge = await quarantine.recordIssue(queryable, { ...issue, payload: 'x'.repeat(200000) });
  assert.equal(huge, true);
  assert.equal(calls[3].params[7].length, 60000);

  const broken = { query: async () => { throw new Error('table missing'); } };
  const warn = console.warn; console.warn = () => {};
  try { assert.equal(await quarantine.recordIssue(broken, issue), false); } finally { console.warn = warn; }
});

test('resolveIssue only closes an OPEN issue', async () => {
  const seen = [];
  const q = (affected) => ({ query: async (sql, params) => { seen.push({ sql: String(sql), params }); return [{ affectedRows: affected }]; } });
  assert.equal(await quarantine.resolveIssue(q(1), 4, { userId: 9, note: 'checked with POS' }), true);
  assert.match(seen[0].sql, /status = 'OPEN'/);
  assert.deepEqual(seen[0].params, [9, 'checked with POS', 4]);
  assert.equal(await quarantine.resolveIssue(q(0), 4, { userId: 9, note: 'again' }), false);
});

// ---- approved collections that change upstream
const approvedRow = (over = {}) => ({
  id: 12, status: 'completed', raw_payload: '{"a":1}', department_id: 3, pos_branch_name: 'Cafe',
  card_txn_count: null, card_txn_total: null, cash_amount: '44560.00', card_amount: '32929.00', bank_amount: '12380.00',
  ar_amount: '5440.00', short_excess_amount: '120.00', deduction_amount: '0.00', total_amount: '95309.00',
  collection_date: '2026-10-06', ...over
});
const incoming = (over = {}) => ({
  source_system: 'POS', source_type: 'SHIFT', source_id: '211', reference_no: '211-0104', collection_date: '2026-10-06',
  cash_amount: 44560, card_amount: 32929, bank_amount: 12380, ar_amount: 5440, short_excess_amount: 120,
  deduction_amount: 0, total_amount: 95309, raw_payload: '{"a":2}', ...over
});
const poolReturning = (row) => ({ query: async (sql) => (/^SELECT id, status, raw_payload/.test(String(sql).replace(/\s+/g, ' ').trim()) ? [[row]] : [[]]) });

test('approvedDifference lists exactly the figures that moved', () => {
  assert.equal(approvedDifference(approvedRow(), incoming()), '', 'only the payload text differs: no issue');
  assert.match(approvedDifference(approvedRow(), incoming({ cash_amount: 44000, total_amount: 94749 })),
    /cash 44560\.00 -> 44000\.00; total 95309\.00 -> 94749\.00/);
  assert.match(approvedDifference(approvedRow(), incoming({ collection_date: '2026-10-07' })), /date 2026-10-06 -> 2026-10-07/);
});

test('stagePending: an approved record that changed upstream is reported, never rewritten', async () => {
  const reports = [];
  const onChangedAfterApproval = async (info) => { reports.push(info); };
  const writes = [];
  const queryable = {
    query: async (sql, params) => {
      const s = String(sql).replace(/\s+/g, ' ').trim();
      if (/^(UPDATE|INSERT)/.test(s)) writes.push(s);
      return poolReturning(approvedRow()).query(sql, params);
    }
  };
  const outcome = await stagePending(queryable, incoming({ cash_amount: 40000, total_amount: 90749 }), { onChangedAfterApproval });
  assert.equal(outcome, 'changed');
  assert.equal(reports.length, 1);
  assert.equal(reports[0].collectionId, 12);
  assert.match(reports[0].reason, /the ledgers were not touched/);
  assert.deepEqual(writes, [], 'the approved collection is not modified');

  // identical figures: nothing reported
  const same = await stagePending(poolReturning(approvedRow()), incoming(), { onChangedAfterApproval });
  assert.equal(same, 'unchanged');
  assert.equal(reports.length, 1);

  // a rejected or pending record is not an "after approval" case
  assert.equal(await stagePending(poolReturning(approvedRow({ status: 'rejected' })), incoming({ cash_amount: 1 }), { onChangedAfterApproval }), 'unchanged');
  assert.equal(reports.length, 1);

  // without a callback it behaves exactly as before
  assert.equal(await stagePending(poolReturning(approvedRow()), incoming({ cash_amount: 1 })), 'unchanged');
});
