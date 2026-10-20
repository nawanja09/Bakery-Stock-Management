require('./helpers/noDatabase');
const test = require('node:test');
const assert = require('node:assert/strict');
const { versionSql, VERSION_FIELDS } = require('../services/collectionVersion');
const { approveCollections } = require('../services/collectionService');

// Audit M3: an approval posts only the figures the accountant reviewed. The POS sync can rewrite a
// pending record; the version fingerprint then differs and that record is skipped, not posted.

const rowOf = (version) => ({
  id: 7, source_system: 'POS', source_type: 'SHIFT', source_id: '907', reference_no: 'SH-907',
  collection_date: '2026-10-13', shift_id: '907', shift_no: '7', cashier_name: 'C', employee_name: null,
  company_id: 1, pos_bank_account: null, pos_branch_name: 'Cafe', department_id: 3,
  cash_amount: '100.00', card_amount: '0.00', bank_amount: '0.00', ar_amount: '0.00',
  short_excess_amount: '0.00', deduction_amount: '0.00', total_amount: '100.00', pos_total_amount: null,
  linked_collection_id: null, status: 'pending', raw_payload: '{}', version
});

const connectionFor = (version) => {
  const log = [];
  const query = async (sql) => {
    const s = String(sql).replace(/\s+/g, ' ').trim();
    log.push(s);
    if (/FROM collections WHERE id = \? FOR UPDATE/.test(s)) return [[rowOf(version)]];
    if (/SELECT id FROM collection_transactions/.test(s)) return [[]];
    if (/^SELECT id FROM collections WHERE source_type/.test(s)) return [[]];
    if (/COALESCE\(SUM/.test(s)) return [[{ current_balance: '0.00' }]];
    return [{ insertId: 10, affectedRows: 1 }];
  };
  return { connection: { query }, log };
};

test('the fingerprint covers every posted figure and the raw payload, but not last_synced_at', () => {
  const sql = versionSql('c');
  for (const f of ['cash_amount', 'card_amount', 'bank_amount', 'ar_amount', 'total_amount', 'raw_payload', 'collection_date']) {
    assert.ok(VERSION_FIELDS.includes(f), f);
    assert.match(sql, new RegExp(`c\.${f}`));
  }
  assert.doesNotMatch(sql, /last_synced_at/);
  assert.match(sql, /SHA2\(/);
});

test('approve: the version the accountant saw matches -> posted', async () => {
  const { connection } = connectionFor('abc');
  const result = await approveCollections(connection, { items: [{ id: 7, version: 'abc' }], userId: 4 });
  assert.deepEqual(result.approved.map((a) => a.id), [7]);
  assert.equal(result.skipped.length, 0);
});

test('approve: the record changed after it was viewed -> skipped, nothing posted', async () => {
  const { connection, log } = connectionFor('NEW');
  const result = await approveCollections(connection, { items: [{ id: 7, version: 'OLD' }], userId: 4 });
  assert.equal(result.approved.length, 0);
  assert.equal(result.skipped[0].id, 7);
  assert.match(result.skipped[0].reason, /changed after you opened it/);
  assert.equal(log.some((s) => /^(INSERT|UPDATE)/.test(s)), false, 'nothing written');
});

test('approve: no version sent (old page / direct API call) -> skipped, nothing posted', async () => {
  const { connection, log } = connectionFor('abc');
  const result = await approveCollections(connection, { items: [{ id: 7 }], userId: 4 });
  assert.equal(result.approved.length, 0);
  assert.match(result.skipped[0].reason, /did not send the record version/);
  assert.equal(log.some((s) => /^(INSERT|UPDATE)/.test(s)), false);
});
