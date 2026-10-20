// Collection: individual POS card payments -> individual Card Ledger entries.
// Runs the REAL collectionService + cardLedgerService against a recording fake
// connection (no MySQL), asserting the exact rows that would be written.
//   * a shift's card total is never posted as one Card Ledger row: each POS card
//     payment becomes its own Pending card transaction (existing Card Ledger
//     helper), with its own date, POS reference, details and amount
//   * payments that do not add up to the card total block the approval (no
//     split, no balancing entry, nothing written)
//   * the same POS card payment can never be posted twice
const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../config/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async () => [[]] } };

const { cardPaymentsOf, reconcileCard, mapPosRecord, SOURCES } = require('../services/collectionMapper');
const { approveCollections } = require('../services/collectionService');

// Shape verified against the live POS (card.transactions[]).
const payment = (over) => ({
  type: 'sale', sale_id: 21127, order_id: null, receipt_no: 'RCP2610060142',
  payment_method: 'card', amount: 810, date_time: '2026-10-06T08:37:39.000000Z', ...over
});
const PAYMENTS = [
  payment({}),
  payment({ sale_id: 21138, receipt_no: 'RCP2610060149', amount: 900, date_time: '2026-10-06T09:03:50.000000Z' }),
  payment({ type: 'order_advance', sale_id: null, order_id: 614, receipt_no: null, amount: 5950, date_time: '2026-10-05T19:00:00.000000Z' }),
  payment({ sale_id: 21142, receipt_no: 'RCP2610060153', payment_method: 'card_and_cash', amount: 1740 })
];
const CARD_TOTAL = 810 + 900 + 5950 + 1740;
const shiftPayload = (payments = PAYMENTS, total = CARD_TOTAL) => ({
  shift_id: 211, shift_no: '0104', branch: { id: 6, name: 'Cafe - M' }, cashier: { id: 2, name: 'Imasha' },
  closed_at: '2026-10-06T08:36:35.000000Z',
  cash: { actual: 0 }, card: { total, count: payments.length, transactions: payments },
  online: { total: 0 }, credit: { total: 0 }, short_excess: { total: 0 }, collection: total
});

// ---------------------------------------------------------------- mapper
test('card payments are read exactly as the POS sent them; the summary is stored on the shift', () => {
  const details = cardPaymentsOf(JSON.stringify(shiftPayload()));
  assert.equal(details.available, true);
  assert.equal(details.count, 4);
  assert.equal(details.total, CARD_TOTAL);
  assert.deepEqual(details.payments.map((p) => p.key), ['sale-21127', 'sale-21138', 'order_advance-614', 'sale-21142']);
  assert.deepEqual(details.payments.map((p) => p.amount), [810, 900, 5950, 1740]);
  // 19:00 UTC on 5 Oct is 00:30 on 6 Oct in Sri Lanka
  assert.equal(details.payments[2].date, '2026-10-06');

  const mapped = mapPosRecord(SOURCES.SHIFT, shiftPayload());
  assert.equal(mapped.ok, true);
  assert.equal(mapped.record.card_amount, CARD_TOTAL);
  assert.equal(mapped.record.card_txn_count, 4);
  assert.equal(mapped.record.card_txn_total, CARD_TOTAL);
});

test('the same POS id twice in one shift is kept as two payments, never merged', () => {
  const details = cardPaymentsOf(shiftPayload([payment({}), payment({})], 1620));
  assert.deepEqual(details.payments.map((p) => p.key), ['sale-21127', 'sale-21127-2']);
  assert.equal(details.total, 1620);
});

test('reconciliation: sum of payments = card total, otherwise a clear reason', () => {
  assert.equal(reconcileCard(CARD_TOTAL, cardPaymentsOf(shiftPayload())).ok, true);

  const short = reconcileCard(CARD_TOTAL + 100, cardPaymentsOf(shiftPayload()));
  assert.equal(short.ok, false);
  assert.equal(short.difference, 100);
  assert.match(short.reason, /add up to 9400\.00, not the card total 9500\.00 \(difference 100\.00\)/);

  const missing = reconcileCard(500, cardPaymentsOf({ card: { total: 500 } }));
  assert.equal(missing.ok, false);
  assert.match(missing.reason, /no individual card payments/);

  const noId = reconcileCard(810, cardPaymentsOf(shiftPayload([payment({ sale_id: null, receipt_no: null })], 810)));
  assert.equal(noId.ok, false);
  assert.match(noId.reason, /no POS id/);

  assert.equal(reconcileCard(0, cardPaymentsOf({})).ok, true); // no card amount: nothing to reconcile
});

// ---------------------------------------------------------------- approval
const makeConnection = ({ payload, cardAmount = CARD_TOTAL, postedKeys = [], usedRefs = [] }) => {
  const writes = { card: [], ccp: [], lines: [], statusUpdates: 0 };
  let nextId = 100;
  const connection = {
    async query(sql, params = []) {
      const s = String(sql).replace(/\s+/g, ' ').trim();
      if (/FROM collections WHERE id = \? FOR UPDATE/.test(s)) {
        return [[{
          id: 7, source_type: 'SHIFT', source_id: '211', reference_no: '211-0104', collection_date: '2026-10-06',
          shift_id: '211', shift_no: '0104', cashier_name: 'Imasha', employee_name: null, company_id: 1, pos_bank_account: null,
          pos_branch_name: 'Cafe - M', department_id: 7, cash_amount: 0, card_amount: cardAmount, bank_amount: 0,
          ar_amount: 0, short_excess_amount: 0, deduction_amount: 0, total_amount: cardAmount, pos_total_amount: null,
          linked_collection_id: null, status: 'pending', version: 'v1', raw_payload: JSON.stringify(payload)
        }]];
      }
      if (/SELECT id FROM collection_transactions WHERE collection_id/.test(s)) return [[]];
      if (/SELECT id FROM collections WHERE source_type = \? AND reference_no/.test(s)) return [[]];
      if (/FROM bank_details bd INNER JOIN company/.test(s)) return [[{ id: params[0] }]];
      if (/SELECT pos_card_key FROM collection_card_payments WHERE pos_card_key IN/.test(s)) {
        return [params[0].filter((k) => postedKeys.includes(k)).map((k) => ({ pos_card_key: k }))];
      }
      if (/FROM card_transactions WHERE LOWER\(TRIM\(reference_number\)\)/.test(s)) {
        return [usedRefs.includes(params[0].toLowerCase()) ? [{ id: 1 }] : []];
      }
      if (/^INSERT INTO collection_transactions/.test(s)) { writes.lines.push(params); return [{ insertId: 50 }]; }
      if (/^INSERT INTO card_transactions/.test(s)) { nextId += 1; writes.card.push({ id: nextId, params }); return [{ insertId: nextId }]; }
      if (/^INSERT INTO collection_card_payments/.test(s)) {
        if (postedKeys.includes(params[2])) { const e = new Error('dup'); e.code = 'ER_DUP_ENTRY'; throw e; }
        writes.ccp.push(params); return [{ insertId: 1 }];
      }
      if (/^UPDATE collections SET status = 'completed'/.test(s)) { writes.statusUpdates += 1; return [{ affectedRows: 1 }]; }
      return [[]];
    }
  };
  return { connection, writes };
};

test('approve: every POS card payment becomes its own Card Ledger entry; the total is never posted as one', async () => {
  const { connection, writes } = makeConnection({ payload: shiftPayload() });
  const result = await approveCollections(connection, { items: [{ id: 7, version: 'v1', card_bank_account_id: 3 }], userId: 9 });

  // One CARD summary line (amount = total) ...
  assert.equal(writes.lines.length, 1);
  assert.equal(writes.lines[0][3], 'CARD');
  assert.equal(writes.lines[0][4], CARD_TOTAL);
  // ... and FOUR Card Ledger rows, one per POS payment, with the POS amounts (never the total).
  assert.equal(writes.card.length, 4);
  const cardRows = writes.card.map(({ params }) => ({
    company: params[0], bank: params[1], date: params[2], amount: params[3], ref: params[4], remark: params[5], status: 'Pending'
  }));
  assert.deepEqual(cardRows.map((r) => r.amount), [810, 900, 5950, 1740]);
  assert.equal(cardRows.some((r) => r.amount === CARD_TOTAL), false);
  assert.deepEqual(cardRows.map((r) => r.ref), [
    'SHIFT-211-0104/SALE-21127', 'SHIFT-211-0104/SALE-21138', 'SHIFT-211-0104/ORDER-614', 'SHIFT-211-0104/SALE-21142'
  ]);
  assert.ok(cardRows.every((r) => r.company === 1 && r.bank === 3));
  assert.deepEqual(cardRows.map((r) => r.date), ['2026-10-06', '2026-10-06', '2026-10-06', '2026-10-06']);
  assert.match(cardRows[0].remark, /Sale #21127, receipt RCP2610060142 14:07 - SHIFT-211-0104 - Cafe - M/);
  assert.match(cardRows[2].remark, /Order advance #614/);
  assert.match(cardRows[3].remark, /\(card_and_cash\)/);
  // Branch / Department (Credit Card Rate) and Shift No (Card Ledger filters) travel with every row.
  assert.ok(writes.card.every(({ params }) => params[7] === 7 && params[8] === '0104'));

  // Each linked by its unique POS key (source + shift + POS payment id).
  assert.deepEqual(writes.ccp.map((p) => p[2]), ['SHIFT:211:sale-21127', 'SHIFT:211:sale-21138', 'SHIFT:211:order_advance-614', 'SHIFT:211:sale-21142']);
  assert.deepEqual(writes.ccp.map((p) => p[11]), writes.card.map((c) => c.id));
  assert.equal(writes.statusUpdates, 1);
  assert.equal(result.approved[0].postings[0].cardPayments, 4);
});

test('approve: payments that do not add up to the card total -> refused, nothing written', async () => {
  const { connection, writes } = makeConnection({ payload: shiftPayload(), cardAmount: CARD_TOTAL + 100 });
  await assert.rejects(
    approveCollections(connection, { items: [{ id: 7, version: 'v1', card_bank_account_id: 3 }], userId: 9 }),
    (e) => e.status === 400 && /card cannot be posted - the 4 individual card payments add up to 9400\.00, not the card total 9500\.00/.test(e.message)
  );
  assert.equal(writes.card.length + writes.ccp.length + writes.lines.length + writes.statusUpdates, 0);
});

test('approve: a shift without individual card payments is refused (the total is never posted)', async () => {
  const payload = shiftPayload();
  delete payload.card.transactions;
  const { connection, writes } = makeConnection({ payload });
  await assert.rejects(
    approveCollections(connection, { items: [{ id: 7, version: 'v1', card_bank_account_id: 3 }], userId: 9 }),
    /no individual card payments/
  );
  assert.equal(writes.card.length, 0);
});

test('approve: a card payment already in the Card Ledger -> 409, nothing written', async () => {
  const { connection, writes } = makeConnection({ payload: shiftPayload(), postedKeys: ['SHIFT:211:order_advance-614'] });
  await assert.rejects(
    approveCollections(connection, { items: [{ id: 7, version: 'v1', card_bank_account_id: 3 }], userId: 9 }),
    (e) => e.status === 409 && /SHIFT:211:order_advance-614/.test(e.message)
  );
  assert.equal(writes.card.length + writes.lines.length, 0);
});

test('approve: the existing Card Ledger reference check still guards duplicates', async () => {
  const { connection } = makeConnection({ payload: shiftPayload(), usedRefs: ['shift-211-0104/sale-21138'] });
  await assert.rejects(
    approveCollections(connection, { items: [{ id: 7, version: 'v1', card_bank_account_id: 3 }], userId: 9 }),
    /Reference number "SHIFT-211-0104\/SALE-21138" is already used/
  );
});

test('receipt numbers such as "CASH" (sent by the live POS, not unique) never clash: references use the POS sale id', async () => {
  const payments = [payment({ sale_id: 20835, receipt_no: 'CASH', amount: 660 }), payment({ sale_id: 20836, receipt_no: 'CASH', amount: 340 })];
  const { connection, writes } = makeConnection({ payload: shiftPayload(payments, 1000), cardAmount: 1000 });
  await approveCollections(connection, { items: [{ id: 7, version: 'v1', card_bank_account_id: 3 }], userId: 9 });
  assert.deepEqual(writes.card.map((c) => c.params[4]), ['SHIFT-211-0104/SALE-20835', 'SHIFT-211-0104/SALE-20836']);
  assert.match(writes.card[0].params[5], /receipt CASH/);
});

test('atomic: a Card Ledger failure part-way through rolls the whole approval back (never Completed with partial cards)', async () => {
  const { connection, writes } = makeConnection({ payload: shiftPayload(), usedRefs: ['shift-211-0104/order-614'] });
  const tx = { begun: 0, commits: 0, rollbacks: 0, released: 0 };
  Object.assign(connection, {
    beginTransaction: async () => { tx.begun += 1; },
    commit: async () => { tx.commits += 1; },
    rollback: async () => { tx.rollbacks += 1; },
    release: () => { tx.released += 1; }
  });
  const db = require('../config/db');
  db.getConnection = async () => connection;
  db.collectionsSchemaReady = Promise.resolve();
  // User 9's own POS account may see POS shifts (integrationAccess.test.js covers
  // how that is validated); this test is about the transaction.
  const integrationAccess = require('../services/integrationAccess');
  const realGetAccess = integrationAccess.getAccess;
  integrationAccess.getAccess = async () => ({
    systems: {
      pos: { system: 'POS', label: 'RAVON POS', configured: true, connected: true, state: 'connected', abilities: ['collection.shifts'], branchIds: null },
      restaurant: { system: 'RESTAURANT', label: 'RAVON Restaurant', configured: false, connected: false, state: 'not_configured', abilities: [], branchIds: null }
    },
    collection: { POS: { sources: ['SHIFT'], branchIds: null }, RESTAURANT: { sources: [], branchIds: null } },
    canCollection: true,
    canFgItems: false
  });
  const controller = require('../controllers/collectionController');
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  try {
    await controller.approve({ user: { userId: 9, role: 'Accountant' }, body: { items: [{ id: 7, version: 'v1', card_bank_account_id: 3 }] } }, res);
  } finally {
    integrationAccess.getAccess = realGetAccess;
  }

  // Two card rows were written before the third failed - and the transaction was
  // rolled back, not committed: never Completed with a partial Card Ledger.
  assert.equal(writes.card.length, 2);
  assert.equal(writes.statusUpdates, 0);
  assert.deepEqual(tx, { begun: 1, commits: 0, rollbacks: 1, released: 1 });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /ORDER-614" is already used/);
});
