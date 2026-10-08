// Collection: Credit Payment -> Cash Ledger DEBIT + AR Account CREDIT.
// Runs the REAL collectionService / financeLedger / otherLedgerService against a
// recording fake connection (no MySQL), asserting the exact rows written.
//   * a Credit Payment debits the Cash Ledger under the record's company and
//     credits the AR Account by the same amount (customer's AR reduced)
//   * bank-transfer part keeps going to the Bank Ledger; the AR credit is the
//     whole amount received
//   * approving the same Credit Payment again creates nothing
//   * Shift Collection / Employee Deduction approvals post no AR settlement
const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../config/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async () => [[]] } };

const { approveCollections } = require('../services/collectionService');

const AR_LEDGER = { id: 31, name: 'AR Account', status: 1, is_system: 1, normal_balance: 'DEBIT' };
const SE_LEDGER = { id: 32, name: 'Short/Excess Account', status: 1, is_system: 1, normal_balance: 'DEBIT' };

const creditPaymentRow = (over = {}) => ({
  id: 41, source_type: 'CREDIT_PAYMENT', source_id: '501', reference_no: 'CP-501', collection_date: '2026-10-08',
  shift_id: null, cashier_name: 'Test Customer', employee_name: null, company_id: 2, pos_bank_account: null,
  pos_branch_name: null, department_id: null, cash_amount: 10000, card_amount: 0, bank_amount: 0, ar_amount: 0,
  short_excess_amount: 0, deduction_amount: 0, total_amount: 10000, pos_total_amount: 10000,
  linked_collection_id: null, status: 'pending', raw_payload: '{}', ...over
});

const makeConnection = (row) => {
  const writes = { lines: [], cash: [], bank: [], other: [], completed: 0 };
  let lineId = 500;
  let lastInsert = 0;
  const connection = {
    async query(sql, params = []) {
      const s = String(sql).replace(/\s+/g, ' ').trim();
      if (/FROM collections WHERE id = \? FOR UPDATE/.test(s)) return [[{ ...row }]];
      if (/SELECT id FROM collection_transactions WHERE collection_id/.test(s)) return [writes.lines.length ? [{ id: 1 }] : []];
      if (/SELECT id FROM collections WHERE source_type = \? AND reference_no/.test(s)) return [[]];
      if (/FROM bank_details bd INNER JOIN company/.test(s)) return [[{ id: params[0] }]];
      if (/FROM bank_details/.test(s)) return [[{ id: params[0], status: 'Active', company_id: row.company_id, current_balance: 0 }]];
      if (/^INSERT INTO collection_transactions/.test(s)) {
        lineId += 1; writes.lines.push({ id: lineId, method: params[3], amount: params[4], company: params[5] });
        return [{ insertId: lineId }];
      }
      if (/FROM other_ledgers WHERE is_system = 1/.test(s)) return [[/short/i.test(params[0]) ? SE_LEDGER : AR_LEDGER]];
      if (/FROM other_ledger_transactions WHERE source_type = \? AND source_id = \?/.test(s)) {
        return [writes.other.filter((o) => o.sourceType === params[0] && o.sourceId === params[1])];
      }
      if (/^INSERT INTO other_ledger_transactions/.test(s)) {
        lastInsert += 1;
        writes.other.push({ ledger: params[0], date: params[1], debit: params[2], credit: params[3], sourceType: params[4],
          sourceId: params[5], company: params[6], ref: params[7], remark: params[8] });
        return [{ insertId: lastInsert }];
      }
      if (/^INSERT INTO finance_transactions/.test(s)) {
        lastInsert += 1;
        const target = /'CASH'/.test(s) ? writes.cash : writes.bank;
        target.push({ params });
        return [{ insertId: lastInsert }];
      }
      if (/SELECT LAST_INSERT_ID/.test(s)) return [[{ id: lastInsert }]];
      if (/^UPDATE collections SET status = 'completed'/.test(s)) { writes.completed += 1; return [{ affectedRows: 1 }]; }
      return [[]];
    }
  };
  return { connection, writes };
};

test('Credit Payment (cash): Cash Ledger DEBIT under the company + AR Account CREDIT of the same amount', async () => {
  const { connection, writes } = makeConnection(creditPaymentRow());
  const result = await approveCollections(connection, { items: [{ id: 41 }], userId: 9 });

  // Cash Ledger: one DEBIT of 10,000 for company 2, reference CP-CP-501.
  assert.equal(writes.cash.length, 1);
  const [companyId, date, type, ref, , party, direction, , debit, credit] = writes.cash[0].params;
  assert.deepEqual({ companyId, date, type, ref, party, direction, debit, credit }, {
    companyId: 2, date: '2026-10-08', type: 'Collection - Cash', ref: 'CP-CP-501', party: 'Test Customer',
    direction: 'IN', debit: 10000, credit: 0
  });

  // AR Account: one CREDIT of 10,000, same company / date / reference.
  assert.equal(writes.other.length, 1);
  assert.deepEqual(
    { ledger: writes.other[0].ledger, debit: writes.other[0].debit, credit: writes.other[0].credit,
      sourceType: writes.other[0].sourceType, company: writes.other[0].company, ref: writes.other[0].ref, date: writes.other[0].date },
    { ledger: AR_LEDGER.id, debit: 0, credit: 10000, sourceType: 'COLLECTION_AR_SETTLEMENT', company: 2, ref: 'CP-CP-501', date: '2026-10-08' }
  );
  assert.match(writes.other[0].remark, /AR settled - Credit Payment - Test Customer/);

  assert.deepEqual(writes.lines.map((l) => [l.method, l.amount, l.company]), [['CASH', 10000, 2], ['AR_SETTLEMENT', 10000, 2]]);
  assert.equal(writes.completed, 1);
  assert.deepEqual(result.approved[0].postings.map((p) => p.method), ['CASH', 'AR_SETTLEMENT']);
});

test('Credit Payment paid partly by bank transfer: Bank Ledger keeps the bank part; AR credit = whole amount received', async () => {
  const { connection, writes } = makeConnection(creditPaymentRow({ cash_amount: 2000, bank_amount: 8000 }));
  await approveCollections(connection, { items: [{ id: 41, bank_account_id: 5 }], userId: 9 });
  assert.equal(writes.cash.length, 1);
  assert.equal(writes.cash[0].params[8], 2000);
  assert.equal(writes.bank.length, 1);
  assert.equal(writes.other.length, 1);
  assert.equal(writes.other[0].credit, 10000);
  assert.deepEqual(writes.lines.map((l) => l.method), ['CASH', 'BANK', 'AR_SETTLEMENT']);
});

test('the same Credit Payment approved again creates no second Cash Ledger or AR entry', async () => {
  const row = creditPaymentRow();
  const { connection, writes } = makeConnection(row);
  await approveCollections(connection, { items: [{ id: 41 }], userId: 9 });
  row.status = 'completed';
  const again = await approveCollections(connection, { items: [{ id: 41 }], userId: 9 });
  assert.equal(again.approved.length, 0);
  assert.equal(again.skipped[0].reason, 'already completed');
  assert.equal(writes.cash.length, 1);
  assert.equal(writes.other.length, 1);
});

test('Shift Collection and Employee Deduction approvals post no AR settlement (unchanged)', async () => {
  const shift = makeConnection(creditPaymentRow({
    source_type: 'SHIFT', source_id: '211', reference_no: '211-0104', department_id: 7, pos_branch_name: 'Cafe - M',
    cash_amount: 5000, ar_amount: 1500, total_amount: 6500, pos_total_amount: 6500
  }));
  await approveCollections(shift.connection, { items: [{ id: 41 }], userId: 9 });
  assert.deepEqual(shift.writes.lines.map((l) => l.method), ['CASH', 'AR']);
  assert.deepEqual(shift.writes.other.map((o) => [o.sourceType, o.debit, o.credit]), [['COLLECTION_AR', 1500, 0]]);

  const ded = makeConnection(creditPaymentRow({
    source_type: 'EMPLOYEE_DEDUCTION', source_id: '31', reference_no: null, cash_amount: 0, deduction_amount: 750,
    total_amount: 750, pos_total_amount: null, employee_name: 'Test Employee'
  }));
  await approveCollections(ded.connection, { items: [{ id: 41 }], userId: 9 });
  assert.deepEqual(ded.writes.lines.map((l) => l.method), ['SHORT_EXCESS']);
  assert.deepEqual(ded.writes.other.map((o) => [o.sourceType, o.debit, o.credit]), [['COLLECTION_SHORT_EXCESS', 0, 750]]);
  assert.equal(ded.writes.cash.length, 0);
});
