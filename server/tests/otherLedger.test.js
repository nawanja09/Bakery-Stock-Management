// Other Ledger accounting + validation tests.
//
// These run the REAL controllers/services/ledger helper against a recording
// fake connection (no MySQL needed), asserting the exact rows that would be
// written: which side (debit/credit) hits the Cash Ledger and which hits the
// Other Ledger, plus the validation rules from the spec.
const test = require('node:test');
const assert = require('node:assert/strict');

let ledgerStatus = 1;
let existingImpact = null;
let mappedCompanies = [1, 2]; // other_ledger_company_map rows for ledger 3
const writes = [];
const state = { commits: 0, rollbacks: 0 };

const connection = {
  async query(sql, params = []) {
    const s = String(sql).replace(/\s+/g, ' ').trim();
    if (/^INSERT INTO finance_transactions/.test(s)) { writes.push({ table: 'finance', params }); return [{ insertId: 55 }]; }
    if (/^INSERT INTO other_ledger_transactions/.test(s)) { writes.push({ table: 'olt', params }); return [{ insertId: 9 }]; }
    if (/^UPDATE finance_transactions SET status = 0/.test(s)) { writes.push({ table: 'void-finance', params }); return [{}]; }
    if (/^UPDATE other_ledger_transactions SET status = 0/.test(s)) { writes.push({ table: 'void-olt', params }); return [{}]; }
    if (/^UPDATE other_ledger_transactions SET transaction_date/.test(s)) { writes.push({ table: 'sync-olt', params }); return [{}]; }
    if (/^UPDATE finance_transactions SET transaction_date/.test(s)) { writes.push({ table: 'update-finance', params }); return [{}]; }
    if (/^UPDATE cash_accounts/.test(s) || /^UPDATE finance_transactions SET balance_after/.test(s)) return [{}];
    if (/SELECT LAST_INSERT_ID/.test(s)) return [[{ id: 55 }]];
    if (/FROM finance_transactions WHERE account_type = 'CASH' AND company_id = \? AND status = 1 FOR UPDATE/.test(s)) return [[{ current_balance: 100000 }]];
    if (/FROM finance_transactions WHERE account_type = 'CASH' AND company_id = \? AND status = 1 ORDER BY/.test(s)) return [[]];
    if (/FROM finance_transactions WHERE id = \? AND account_type = 'CASH' AND reference_type = 'CASH_ISSUED'/.test(s)) return [[{ id: 55 }]];
    if (/FROM finance_transactions WHERE id = \? AND account_type = 'CASH' AND reference_type = \? AND status = 1/.test(s)) return [[{ id: 55, company_id: 1, status: 1 }]];
    if (/FROM other_ledger_company_map WHERE other_ledger_id = \? AND company_id = \?/.test(s)) return [mappedCompanies.includes(Number(params[1])) ? [{ 1: 1 }] : []];
    if (/^INSERT IGNORE INTO other_ledger_company_map/.test(s)) { writes.push({ table: 'map', params }); return [{}]; }
    if (/FROM other_ledgers WHERE is_system = 1/.test(s)) return [[{ id: 20, name: 'AR Account', status: 1, is_system: 1 }]];
    if (/FROM bank_details bd INNER JOIN company c/.test(s)) return [[1, 2, 3].includes(Number(params[1])) ? [{ id: params[0] }] : []];
    if (/SELECT company FROM bank_details WHERE id = \?/.test(s)) return [[{ company: 'Company A' }]];
    if (/FROM finance_transactions WHERE account_type = 'BANK' AND bank_id = \? AND status = 1 FOR UPDATE/.test(s)) return [[{ current_balance: 50000 }]];
    if (/^UPDATE bank_details/.test(s)) { writes.push({ table: 'bank-balance', params }); return [{}]; }
    if (/SELECT id FROM company/.test(s)) return [[{ id: 1 }]];
    if (/FROM other_ledgers WHERE id = \?/.test(s)) return [[{ id: 3, name: 'Director', status: ledgerStatus }]];
    if (/FROM other_ledger_transactions WHERE source_type = \? AND source_id = \?/.test(s)) return [existingImpact ? [existingImpact] : []];
    return [[]];
  },
  async beginTransaction() {},
  async commit() { state.commits += 1; },
  async rollback() { state.rollbacks += 1; },
  release() {}
};

const dbPath = require.resolve('../config/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { getConnection: async () => connection, query: (...a) => connection.query(...a) } };

const finance = require('../controllers/financeController');
const issued = require('../controllers/cashOtherLedgerController');
const svc = require('../services/otherLedgerService');

const run = async (handler, body = {}, params = {}) => {
  const out = { status: 200, body: null };
  const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } };
  await handler({ body, params, query: {}, user: { userId: 7 } }, res);
  return out;
};
const reset = () => { writes.length = 0; state.commits = 0; state.rollbacks = 0; ledgerStatus = 1; existingImpact = null; mappedCompanies = [1, 2]; };

// finance_transactions INSERT params: [company, date, type, ref, invoice, party, direction, remark, debit, credit, balance_after, refType, refId, createdBy]
const financeRow = () => writes.find((w) => w.table === 'finance').params;
const oltRow = () => writes.find((w) => w.table === 'olt').params; // [ledger, date, debit, credit, srcType, srcId, company, ref, remark, createdBy]

test('Cash Receive + Other Ledger: Cash DEBIT 10,000 and Director CREDIT 10,000, linked to the source row', async () => {
  reset();
  const r = await run(finance.receiveCash, { company_id: 2, date: '2026-10-01', amount: 10000, classification: 'other_ledger', other_ledger_id: 3, created_by: 7 });
  assert.equal(r.status, 201);
  const f = financeRow();
  assert.equal(f[8], 10000); assert.equal(f[9], 0); // cash debit / credit
  assert.equal(f[11], 'CASH_RECEIVE'); assert.equal(f[5], 'Director');
  assert.equal(f[10], 110000); // 100,000 + 10,000
  const o = oltRow();
  assert.equal(o[2], 0); assert.equal(o[3], 10000); // other-ledger debit / credit
  assert.equal(o[4], 'CASH_RECEIVE'); assert.equal(o[5], 55); // source link
  assert.equal(o[6], 2); // transaction company
  assert.equal(state.commits, 1);
});

test('Cash Issued: Cash CREDIT 4,000 and Director DEBIT 4,000, linked to the source row', async () => {
  reset();
  const r = await run(issued.createCashIssued, { company_id: 1, date: '2026-10-05', amount: 4000, other_ledger_id: 3 });
  assert.equal(r.status, 201);
  const f = financeRow();
  assert.equal(f[8], 0); assert.equal(f[9], 4000);
  assert.equal(f[11], 'CASH_ISSUED'); assert.equal(f[10], 96000);
  const o = oltRow();
  assert.equal(o[2], 4000); assert.equal(o[3], 0);
  assert.equal(o[4], 'CASH_ISSUED'); assert.equal(o[5], 55);
  assert.equal(o[6], 1); // transaction company
});

test('existing Receive Type flow is unchanged: Cash DEBIT only, no Other Ledger entry', async () => {
  reset();
  for (const body of [
    { company_id: 1, date: '2026-10-01', amount: 500, receive_type: 'Customer Payment', created_by: 7 },
    { company_id: 1, date: '2026-10-01', amount: 500, receive_type: 'Customer Payment', classification: 'receive_type', created_by: 7 }
  ]) {
    writes.length = 0;
    const r = await run(finance.receiveCash, body);
    assert.equal(r.status, 201);
    assert.equal(financeRow()[2], 'Customer Payment');
    assert.equal(financeRow()[8], 500);
    assert.equal(writes.some((w) => w.table === 'olt'), false);
  }
});

test('mutual exclusivity and empty classification are rejected', async () => {
  reset();
  const base = { company_id: 1, date: '2026-10-01', amount: 100, created_by: 7 };
  for (const [body, msg] of [
    [{ ...base, receive_type: 'Customer Payment', other_ledger_id: 3 }, /not both/],
    [{ ...base, classification: 'other_ledger', receive_type: 'Customer Payment', other_ledger_id: 3 }, /not both/],
    [{ ...base }, /Receive type is required/],
    [{ ...base, classification: 'other_ledger' }, /Other Ledger is required/]
  ]) {
    const r = await run(finance.receiveCash, body);
    assert.equal(r.status, 400); assert.match(r.body.error, msg);
  }
  assert.equal(writes.length, 0);
});

test('inactive Other Ledger cannot be used for new Cash Receive or Cash Issued; nothing is written', async () => {
  reset(); ledgerStatus = 0;
  const a = await run(finance.receiveCash, { company_id: 1, date: '2026-10-01', amount: 100, classification: 'other_ledger', other_ledger_id: 3, created_by: 7 });
  const b = await run(issued.createCashIssued, { company_id: 1, date: '2026-10-05', amount: 100, other_ledger_id: 3 });
  for (const r of [a, b]) { assert.equal(r.status, 400); assert.match(r.body.error, /inactive/); }
  assert.equal(writes.length, 0);
  assert.equal(state.rollbacks, 2);
});

test('Cash Issued validation: ledger, amount and date are required', async () => {
  reset();
  for (const [body, msg] of [
    [{ company_id: 1, date: '2026-10-05', amount: 100 }, /Other Ledger is required/],
    [{ company_id: 1, date: '2026-10-05', amount: 0, other_ledger_id: 3 }, /greater than 0/],
    [{ company_id: 1, date: '2026-10-05', amount: -5, other_ledger_id: 3 }, /greater than 0/],
    [{ company_id: 1, amount: 100, other_ledger_id: 3 }, /valid date/]
  ]) {
    const r = await run(issued.createCashIssued, body);
    assert.equal(r.status, 400); assert.match(r.body.error, msg);
  }
  assert.equal(writes.length, 0);
});

test('editing a Cash Receive 10,000 -> 12,000 updates the SAME linked entry (no duplicate insert)', async () => {
  reset(); existingImpact = { id: 9, other_ledger_id: 3, status: 1 };
  const r = await run(issued.updateOtherLedgerCashReceive, { date: '2026-10-01', amount: 12000 }, { id: 55 });
  assert.equal(r.status, 200);
  assert.equal(writes.some((w) => w.table === 'olt'), false); // no INSERT
  const sync = writes.find((w) => w.table === 'sync-olt').params; // [date, debit, credit, ref, remark, id]
  assert.equal(sync[1], 0); assert.equal(sync[2], 12000); assert.equal(sync[5], 9);
});

test('voiding switches off both the Cash Ledger row and its Other Ledger entry (soft, no delete)', async () => {
  reset(); existingImpact = { id: 9, other_ledger_id: 3, status: 1 };
  const r = await run(issued.voidCashIssued, {}, { id: 55 });
  assert.equal(r.status, 200);
  assert.ok(writes.some((w) => w.table === 'void-finance'));
  assert.ok(writes.some((w) => w.table === 'void-olt'));
});

test('a plain Receive-Type receipt (no linked entry) cannot be edited/voided through the Other Ledger routes', async () => {
  reset(); existingImpact = null;
  const e = await run(issued.updateOtherLedgerCashReceive, { date: '2026-10-01', amount: 1 }, { id: 55 });
  const v = await run(issued.voidOtherLedgerCashReceive, {}, { id: 55 });
  assert.equal(e.status, 404); assert.equal(v.status, 404);
  assert.equal(writes.length, 0);
});

test('direction: Issued TO the ledger (Debit) is IN, Received FROM it (Credit) is OUT; balance = Debit - Credit', () => {
  const rows = svc.withRunningBalance([
    { date: '2026-10-01', debit: 10000, credit: 0 }, // Cash/Bank Issued to the ledger
    { date: '2026-10-05', debit: 0, credit: 4000 } // Cash/Bank Received from the ledger
  ]);
  assert.deepEqual(rows.map((r) => r.balance), [10000, 6000]);
  assert.deepEqual(rows.map((r) => r.direction), ['IN', 'OUT']);
  // Same rows, read the other way round only if a ledger were still credit-normal.
  assert.deepEqual(svc.withRunningBalance([{ debit: 0, credit: 10 }], 'CREDIT').map((r) => r.direction), ['IN']);
  assert.deepEqual(svc.impactForSource('CASH_RECEIVE', 10), { debit: 0, credit: 10 });
  assert.deepEqual(svc.impactForSource('CASH_ISSUED', 10), { debit: 10, credit: 0 });
});

// ---- Bank Received / Bank Issued + Other Ledger -------------------------------
// bank finance_transactions INSERT params: [company, bank, date, type, ref, invoice, party, direction, remark, debit, credit, balance_after, refType, refId, createdBy]
const bankRow = () => writes.find((w) => w.table === 'finance').params;

test('Bank Received + Other Ledger: Bank DEBIT 2,500 and Director CREDIT 2,500, linked to the source row', async () => {
  reset();
  const r = await run(finance.receiveBank, { company_id: 1, bank_id: 4, date: '2026-10-09', amount: 2500, classification: 'other_ledger', other_ledger_id: 3 });
  assert.equal(r.status, 201);
  const b = bankRow();
  assert.equal(b[9], 2500); assert.equal(b[10], 0); assert.equal(b[11], 52500);
  assert.equal(b[12], 'BANK_RECEIVE'); assert.equal(b[6], 'Director');
  const o = oltRow();
  assert.equal(o[2], 0); assert.equal(o[3], 2500);
  assert.equal(o[4], 'BANK_RECEIVE'); assert.equal(o[5], 55); assert.equal(o[6], 1);
});

test('Bank Issued: Bank CREDIT 2,500 from the source account and Director DEBIT 2,500', async () => {
  reset();
  const r = await run(finance.issueBank, { company_id: 1, bank_id: 4, date: '2026-10-09', amount: 2500, other_ledger_id: 3 });
  assert.equal(r.status, 201);
  const b = bankRow();
  assert.equal(b[1], 4); assert.equal(b[9], 0); assert.equal(b[10], 2500); assert.equal(b[11], 47500);
  assert.equal(b[7], 'OUT'); assert.equal(b[12], 'BANK_ISSUED');
  const o = oltRow();
  assert.equal(o[2], 2500); assert.equal(o[3], 0); assert.equal(o[4], 'BANK_ISSUED'); assert.equal(o[6], 1);
});

test('Bank Received: Receive Type and Other Ledger are mutually exclusive; Bank Issued needs a ledger and a source bank', async () => {
  reset();
  const base = { company_id: 1, bank_id: 4, date: '2026-10-09', amount: 100 };
  for (const [handler, body, msg] of [
    [finance.receiveBank, { ...base, receive_type: 'Customer Payment', other_ledger_id: 3 }, /not both/],
    [finance.receiveBank, { ...base }, /Receive type is required/],
    [finance.receiveBank, { ...base, classification: 'other_ledger' }, /Other Ledger is required/],
    [finance.issueBank, { ...base }, /Other Ledger is required/],
    [finance.issueBank, { ...base, bank_id: '', other_ledger_id: 3 }, /Source bank account is required/]
  ]) {
    const r = await run(handler, body);
    assert.equal(r.status, 400); assert.match(r.body.error, msg);
  }
  assert.equal(writes.length, 0);
});

test('a second Other Ledger entry for the same bank row is refused and rolled back', async () => {
  reset(); existingImpact = { id: 9, other_ledger_id: 3, status: 1 };
  const r = await run(finance.issueBank, { company_id: 1, bank_id: 4, date: '2026-10-09', amount: 100, other_ledger_id: 3 });
  assert.equal(r.status, 409);
  assert.equal(state.commits, 0); assert.equal(state.rollbacks, 1);
});

// ---- Company-wise Other Ledgers -------------------------------------------------

test('every Other Ledger integration rejects a ledger not linked to the transaction company; nothing is committed', async () => {
  reset(); mappedCompanies = [1]; // Director is linked to company 1 only
  const results = [
    await run(finance.receiveCash, { company_id: 3, date: '2026-10-01', amount: 100, classification: 'other_ledger', other_ledger_id: 3, created_by: 7 }),
    await run(issued.createCashIssued, { company_id: 3, date: '2026-10-05', amount: 100, other_ledger_id: 3 }),
    await run(finance.receiveBank, { company_id: 3, bank_id: 4, date: '2026-10-09', amount: 100, classification: 'other_ledger', other_ledger_id: 3 }),
    await run(finance.issueBank, { company_id: 3, bank_id: 4, date: '2026-10-09', amount: 100, other_ledger_id: 3 })
  ];
  for (const r of results) { assert.equal(r.status, 400); assert.match(r.body.error, /not linked to the selected company/); }
  assert.equal(writes.some((w) => w.table === 'olt'), false);
  assert.equal(state.commits, 0);
});

test('moving a Cash Issued to a ledger of another company is rejected', async () => {
  reset(); mappedCompanies = [2]; existingImpact = { id: 9, other_ledger_id: 8, status: 1 };
  const r = await run(issued.updateCashIssued, { date: '2026-10-05', amount: 100, other_ledger_id: 3 }, { id: 55 });
  assert.equal(r.status, 400); assert.match(r.body.error, /not linked/);
  assert.equal(state.commits, 0);
});

test('the Other Ledger entry always carries the transaction company', async () => {
  reset();
  await run(finance.receiveCash, { company_id: 2, date: '2026-10-01', amount: 10, classification: 'other_ledger', other_ledger_id: 3, created_by: 7 });
  assert.equal(oltRow()[6], 2);
});

test('system accounts (Collection) are linked to the posting company on use', async () => {
  reset();
  const ledger = await svc.requireSystemLedger(connection, 'AR Account', { companyId: 2 });
  assert.equal(ledger.id, 20);
  assert.deepEqual(writes.find((w) => w.table === 'map').params, [20, 2]);
});

test('company balance only counts that company', async () => {
  const seen = [];
  const q = { query: async (sql, params) => { seen.push({ sql: String(sql), params }); return [[{ balance: 75 }]]; } };
  assert.equal(await svc.getLedgerBalance(q, 3, 2), 75);
  assert.match(seen[0].sql, /olt\.company_id = \?/); assert.deepEqual(seen[0].params, [3, 2]);
  await svc.getLedgerBalance(q, 3);
  assert.doesNotMatch(seen[1].sql, /company_id/); assert.deepEqual(seen[1].params, [3]);
});
