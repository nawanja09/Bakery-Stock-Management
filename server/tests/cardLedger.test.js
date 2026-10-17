// Card Ledger rules, tested against the REAL service + REAL recordBankTransaction
// helper using a tiny in-memory fake of the few SQL statements they issue
// (no MySQL server needed). The fake supports snapshot/rollback so the
// "everything rolls back" behaviour can be checked too.

const test = require('node:test');
const assert = require('node:assert/strict');

const fresh = () => ({
  card: [], ledger: [], hidden: [], realisations: [],
  nextCard: 1, nextLedger: 1, nextHidden: 1, nextReal: 1,
  banks: { 1: { company: 'JH', status: 'Active' }, 2: { company: 'JH', status: 'Active' } },
  departments: { 1: 'Cafe', 2: 'Bakery', 3: 'Pastry' },
  // Cafe 2 %, Bakery 3 % active; Pastry only has an INACTIVE rate.
  rates: [
    { id: 1, department_id: 1, rate: '2.0000', status: 1 },
    { id: 2, department_id: 2, rate: '3.0000', status: 1 },
    { id: 3, department_id: 3, rate: '1.5000', status: 0 }
  ]
});
let db = fresh();

const conn = {
  async query(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (s.startsWith('SELECT company FROM bank_details')) {
      const b = db.banks[params[0]];
      return [b && b.status === 'Active' ? [{ company: b.company }] : []];
    }
    if (s.includes("FROM finance_transactions WHERE account_type = 'BANK' AND bank_id = ?") && s.includes('current_balance')) {
      const sum = db.ledger.filter(r => r.bank_id === params[0] && r.status === 1).reduce((a, r) => a + r.debit - r.credit, 0);
      return [[{ current_balance: sum }]];
    }
    // balance at the row's own date / rows dated later (utils/financeLedger)
    if (s.includes('FROM finance_transactions WHERE account_type = ? AND bank_id = ? AND status = 1 AND transaction_date <=')) {
      const sum = db.ledger.filter(r => r.bank_id === params[1] && r.status === 1 && String(r.date) <= params[2]).reduce((a, r) => a + r.debit - r.credit, 0);
      return [[{ balance: sum }]];
    }
    if (s.includes('FROM finance_transactions WHERE account_type = ? AND bank_id = ? AND status = 1 AND transaction_date >')) {
      return [db.ledger.filter(r => r.bank_id === params[1] && r.status === 1 && String(r.date) > params[2]).map(() => ({ 1: 1 }))];
    }
    if (s.startsWith('SELECT id FROM company WHERE name')) return [[{ id: 1 }]];
    if (s.startsWith('INSERT INTO finance_transactions')) {
      // companyId, bankId, date, type, ref, invoice, party, direction, remark, debit, credit, balance, refType, refId, createdBy
      db.ledger.push({ id: db.nextLedger++, bank_id: params[1], date: params[2], type: params[3], reference_number: params[4],
        debit: params[9], credit: params[10], reference_type: params[12], reference_id: params[13], status: 1 });
      return [{}];
    }
    if (s.startsWith('UPDATE bank_details SET current_balance')) return [{}];

    if (s.startsWith('SELECT id, name FROM departments WHERE is_deleted = 0 AND id IN')) {
      return [params[0].filter(id => db.departments[id]).map(id => ({ id, name: db.departments[id] }))];
    }
    if (s.startsWith('SELECT id, department_id, rate FROM credit_card_rates WHERE status = 1')) {
      return [db.rates.filter(r => r.status === 1 && params[0].includes(r.department_id)).map(r => ({ ...r }))];
    }

    if (s.startsWith('SELECT id FROM card_transactions WHERE LOWER(TRIM(reference_number))')) {
      return [db.card.filter(c => (c.reference_number || '').toLowerCase() === params[0].toLowerCase()).map(c => ({ id: c.id }))];
    }
    if (s.startsWith('INSERT INTO card_transactions')) {
      const [company_id, bank_id, transaction_date, amount, reference_number, remark, , department_id, shift_no] = params;
      const row = { id: db.nextCard++, company_id, bank_id, transaction_date, amount, reference_number, remark, status: 'Pending',
        department_id, shift_no, realise_date: null, realisation_id: null, commission_rate: null };
      db.card.push(row);
      return [{ insertId: row.id }];
    }
    if (s.includes('FROM card_transactions WHERE id = ? FOR UPDATE')) {
      const c = db.card.find(x => x.id === params[0]);
      return [c ? [{ ...c }] : []];
    }
    if (s.includes('FROM card_transactions WHERE id IN (?)')) {
      return [db.card.filter(c => params[0].includes(c.id)).map(c => ({ ...c }))];
    }
    if (s.startsWith('INSERT INTO card_realisations')) {
      const [company_id, bank_id, realise_date, total_amount, realise_amount, remaining_balance, reference_number, , commission_amount] = params;
      const row = { id: db.nextReal++, company_id, bank_id, realise_date, total_amount, realise_amount, commission_amount,
        remaining_balance, reference_number, finance_transaction_id: null, commission_expense_id: null, bank_charge_expense_id: null };
      db.realisations.push(row);
      return [{ insertId: row.id }];
    }
    if (s.startsWith('SELECT id FROM finance_transactions WHERE reference_type')) {
      const rows = db.ledger.filter(r => r.reference_type === params[0] && r.reference_id === params[1]).sort((a, b) => b.id - a.id);
      return [rows.slice(0, 1).map(r => ({ id: r.id }))];
    }
    if (s.startsWith('INSERT INTO hidden_expenses')) {
      const [expense_date, amount, type, description, company_id, reference_number] = params;
      const row = { id: db.nextHidden++, expense_date, amount, type, description, company_id, reference_number };
      db.hidden.push(row);
      return [{ insertId: row.id }];
    }
    if (s.startsWith('UPDATE card_realisations SET finance_transaction_id')) {
      const r = db.realisations.find(x => x.id === params[3]);
      for (const [key, value] of [['commission_expense_id', params[1]], ['bank_charge_expense_id', params[2]]]) {
        if (value !== null && db.realisations.some(x => x !== r && x[key] === value)) {
          const e = new Error('Duplicate entry'); e.code = 'ER_DUP_ENTRY'; throw e; // UNIQUE key
        }
      }
      Object.assign(r, { finance_transaction_id: params[0], commission_expense_id: params[1], bank_charge_expense_id: params[2] });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith("UPDATE card_transactions SET status = 'Completed'")) {
      const [realise_date, realisation_id, , department_id, commission_rate, id] = params;
      const c = db.card.find(x => x.id === id && x.status === 'Pending');
      if (!c) return [{ affectedRows: 0 }];
      Object.assign(c, { status: 'Completed', realise_date, realisation_id, department_id, commission_rate });
      return [{ affectedRows: 1 }];
    }
    throw new Error('Unhandled SQL in fake: ' + s.slice(0, 100));
  }
};

const dbModulePath = require.resolve('../config/db');
require.cache[dbModulePath] = { id: dbModulePath, filename: dbModulePath, loaded: true, exports: { query: conn.query } };

const svc = require('../services/cardLedgerService');
const rates = require('../services/creditCardRateService');

const bankBalance = (bankId = 1) => db.ledger.filter(r => r.bank_id === bankId).reduce((a, r) => a + r.debit - r.credit, 0);
const newCard = (over = {}) => svc.createPendingCardTransaction(conn, {
  companyId: 1, bankId: 1, date: '2026-10-01', amount: 10000, referenceNumber: null, remark: 'Visa', createdBy: 1,
  departmentId: 1, shiftNo: '0104', ...over
});
// Mimics the controller: BEGIN ... COMMIT / ROLLBACK (snapshot restore).
const realise = async (transactionIds, realiseAmount, realiseDate = '2026-10-02', extra = {}) => {
  const snapshot = JSON.stringify(db);
  try {
    return await svc.realiseCardTransactions(conn, { transactionIds, realiseAmount, realiseDate, userId: 3, ...extra });
  } catch (e) {
    db = JSON.parse(snapshot); // ROLLBACK
    throw e;
  }
};
const nothingWritten = () => db.ledger.length + db.hidden.length + db.realisations.length === 0
  && db.card.every(c => c.status === 'Pending');

test.beforeEach(() => { db = fresh(); });

test('isCardReceiveType matches the Visa Card Payment receive type only', () => {
  assert.equal(svc.isCardReceiveType('Visa Card Payment'), true);
  assert.equal(svc.isCardReceiveType('  visa   card payment '), true);
  assert.equal(svc.isCardReceiveType('Direct Banking'), false);
});

test('a Pending card transaction does not change any balance and keeps its Branch / Department + Shift No', async () => {
  await newCard({ departmentId: 2, shiftNo: ' 0207 ' });
  assert.equal(db.ledger.length + db.hidden.length + db.realisations.length, 0);
  assert.deepEqual({ d: db.card[0].department_id, s: db.card[0].shift_no }, { d: 2, s: '0207' });
  await newCard({ departmentId: null, shiftNo: '' }); // Bank Receive: unknown
  assert.deepEqual({ d: db.card[1].department_id, s: db.card[1].shift_no }, { d: null, s: null });
});

test('Test Case 1: 10,000 at 2 %, Realise 9,700 -> commission 200 + bank charge 100, two separate Hidden Expenses', async () => {
  const id = await newCard({ referenceNumber: 'VCP-1' });
  const out = await realise([id], '9700');

  assert.deepEqual(out.totals, {
    totalTransactionAmount: 10000, expectedCommission: 200, realiseAmount: 9700, remainingBalance: 100, bankCharge: 100
  });
  // Bank Ledger: ONE debit of the Realise Amount only (commission / charge never reach the bank)
  assert.equal(db.ledger.length, 1);
  assert.equal(bankBalance(), 9700);
  assert.deepEqual({ debit: db.ledger[0].debit, date: db.ledger[0].date, ref: db.ledger[0].reference_number },
    { debit: 9700, date: '2026-10-02', ref: 'VCP-1' });

  assert.deepEqual(db.hidden.map(h => ({ type: h.type, amount: h.amount, company: h.company_id, date: h.expense_date, ref: h.reference_number })), [
    { type: 'Visa Card Payment commission', amount: 200, company: 1, date: '2026-10-02', ref: 'VCP-1' },
    { type: 'Credit Card Bank Charge', amount: 100, company: 1, date: '2026-10-02', ref: 'VCP-1' }
  ]);
  assert.match(db.hidden[0].description, /realisation #1 - Cafe 2\.00% of 10,000\.00 = 200\.00/);

  const r = db.realisations[0];
  assert.deepEqual(
    { total: r.total_amount, realise: r.realise_amount, commission: r.commission_amount, remaining: r.remaining_balance,
      ft: r.finance_transaction_id, ce: r.commission_expense_id, be: r.bank_charge_expense_id },
    { total: 10000, realise: 9700, commission: 200, remaining: 100, ft: db.ledger[0].id, ce: db.hidden[0].id, be: db.hidden[1].id }
  );
  assert.deepEqual({ s: db.card[0].status, r: db.card[0].realisation_id, rate: db.card[0].commission_rate }, { s: 'Completed', r: r.id, rate: 2 });
  assert.equal(r.realise_amount + r.commission_amount + r.remaining_balance, r.total_amount);
});

test('Test Case 2: Realise 9,800 -> Remaining 0: commission expense only, no bank charge, no error', async () => {
  const id = await newCard();
  const out = await realise([id], '9800');
  assert.equal(out.totals.expectedCommission, 200);
  assert.equal(out.totals.remainingBalance, 0);
  assert.deepEqual(db.hidden.map(h => [h.type, h.amount]), [['Visa Card Payment commission', 200]]);
  assert.equal(out.bankChargeExpenseId, null);
  assert.equal(db.realisations[0].bank_charge_expense_id, null);
  assert.equal(bankBalance(), 9800);
});

test('Test Case 3: missing or inactive Credit Card Rate -> clear error, nothing saved', async () => {
  db.rates = db.rates.filter(r => r.department_id !== 2);
  const noRate = await newCard({ departmentId: 2, referenceNumber: 'B' });
  await assert.rejects(realise([noRate], '9000'),
    (e) => e.status === 400 && /No active Credit Card Rate is configured for Branch \/ Department "Bakery"/.test(e.message));
  const inactive = await newCard({ departmentId: 3, referenceNumber: 'P' });
  await assert.rejects(realise([inactive], '9000'), (e) => e.status === 400 && /"Pastry"/.test(e.message));
  assert.ok(nothingWritten());
});

test('Test Case 4: several Branches / Departments - each rate applies to its own rows only', async () => {
  const a = await newCard({ departmentId: 1, amount: 10000, referenceNumber: 'A' }); // Cafe 2 %   -> 200
  const b = await newCard({ departmentId: 2, amount: 5000, referenceNumber: 'B' });  // Bakery 3 % -> 150
  const c = await newCard({ departmentId: 1, amount: 2500, referenceNumber: 'C' });  // Cafe 2 %   ->  50
  const out = await realise([a, b, c], '17000');

  assert.equal(out.totals.totalTransactionAmount, 17500);
  assert.equal(out.totals.expectedCommission, 400);
  assert.equal(out.totals.remainingBalance, 100);
  assert.deepEqual(out.commissionGroups.map(g => [g.department_name, g.rate, g.amount, g.expected_commission]),
    [['Bakery', 3, 5000, 150], ['Cafe', 2, 12500, 250]]);
  assert.deepEqual(db.card.map(x => x.commission_rate), [2, 3, 2]);
  assert.deepEqual(db.hidden.map(h => [h.type, h.amount, h.company_id]),
    [['Visa Card Payment commission', 400, 1], ['Credit Card Bank Charge', 100, 1]]);
});

test('Test Case 5: a repeated request (retry / double click) creates nothing more', async () => {
  const id = await newCard({ referenceNumber: 'R1' });
  await realise([id], 9700);
  const snapshot = JSON.stringify(db);
  await assert.rejects(realise([id], 9700), (e) => e.status === 409);
  await assert.rejects(realise([id], 9700, '2026-10-05'), (e) => e.status === 409);
  assert.equal(JSON.stringify(db), snapshot);
  assert.equal(db.hidden.length, 2);
});

test('Realise Amount must be > 0 and at most Total - Expected Commission (no negative Remaining Balance)', async () => {
  const a = await newCard({ amount: 6000 });
  const b = await newCard({ amount: 4000 }); // total 10,000, commission 200 -> max 9,800
  for (const bad of ['9800.01', '10000', '15000', '0', '-5', '', null, 'abc', '10.123']) {
    await assert.rejects(realise([a, b], bad), (e) => e.status === 400, `value ${bad}`);
  }
  await assert.rejects(realise([a, b], '9900'),
    (e) => /cannot be more than Rs\. 9,800\.00 \(Total Transaction Amount Rs\. 10,000\.00 - Expected Commission Rs\. 200\.00\)/.test(e.message));
  assert.ok(nothingWritten());
});

test('0 % rate and Realise Amount = Total: realised with no Hidden Expense at all', async () => {
  db.rates[0].rate = '0.0000';
  const id = await newCard();
  const out = await realise([id], '10000');
  assert.deepEqual([out.totals.expectedCommission, out.totals.remainingBalance], [0, 0]);
  assert.equal(db.hidden.length, 0);
  assert.equal(bankBalance(), 10000);
});

test('commission is rounded per department to the cent', async () => {
  db.rates[0].rate = '2.2500';
  const a = await newCard({ amount: 333.33 });
  const b = await newCard({ amount: 333.33 }); // 666.66 x 2.25 % = 14.99985 -> 15.00
  const out = await realise([a, b], '600');
  assert.equal(out.totals.expectedCommission, 15);
  assert.equal(out.totals.remainingBalance, 51.66);
});

test('rows without a Branch / Department: refused unless one is chosen; the choice is saved on the row', async () => {
  const id = await newCard({ departmentId: null, referenceNumber: 'BR-1' });
  await assert.rejects(realise([id], '9000'), (e) => e.status === 400 && /"BR-1" has no Branch \/ Department/.test(e.message));
  assert.ok(nothingWritten());

  const out = await realise([id], '9000', '2026-10-02', { departmentId: 2 });
  assert.equal(out.totals.expectedCommission, 300); // Bakery 3 %
  assert.deepEqual([db.card[0].department_id, db.card[0].commission_rate], [2, 3]);
});

test('the chosen Branch / Department never overrides a row that already has one', async () => {
  const a = await newCard({ departmentId: 1, amount: 10000 });
  const b = await newCard({ departmentId: null, amount: 10000 });
  const out = await realise([a, b], '19000', '2026-10-02', { departmentId: 2 });
  assert.equal(out.totals.expectedCommission, 500); // 200 (Cafe) + 300 (Bakery)
  assert.deepEqual(db.card.map(c => c.department_id), [1, 2]);
});

test('previewCommission returns the same figures, read-only', async () => {
  const a = await newCard({ departmentId: 1, amount: 10000 });
  const b = await newCard({ departmentId: 2, amount: 5000 });
  const before = JSON.stringify(db);
  const p = await svc.previewCommission(conn, { transactionIds: [String(a), String(b)] });
  assert.equal(JSON.stringify(db), before);
  assert.deepEqual({ total: p.total_amount, commission: p.expected_commission, max: p.max_realise_amount, problems: p.problems },
    { total: 15000, commission: 350, max: 14650, problems: [] });

  db.rates = db.rates.filter(r => r.department_id !== 2);
  const missing = await svc.previewCommission(conn, { transactionIds: [a, b] });
  assert.equal(missing.expected_commission, null);
  assert.match(missing.problems[0], /"Bakery"/);
});

test('the server computes everything from the database; client totals are ignored', async () => {
  const a = await newCard({ amount: 40000 });
  const b = await newCard({ amount: 30000 });
  const out = await svc.realiseCardTransactions(conn, {
    transactionIds: [a, b], realiseAmount: '50000', realiseDate: '2026-10-02', userId: 1,
    totalTransactionAmount: 1, expectedCommission: 0, remainingBalance: 999999
  });
  assert.equal(out.totals.totalTransactionAmount, 70000);
  assert.equal(out.totals.expectedCommission, 1400);
  assert.equal(out.totals.remainingBalance, 18600);
});

test('different Company or Bank Account cannot be realised together (backend check)', async () => {
  const a = await newCard({ referenceNumber: 'A' });
  const otherCompany = await newCard({ referenceNumber: 'B', companyId: 2 });
  const otherBank = await newCard({ referenceNumber: 'C', bankId: 2 });

  await assert.rejects(realise([a, otherCompany], 10), (e) => e.status === 400 && /same Company/.test(e.message));
  await assert.rejects(realise([a, otherBank], 10), (e) => e.status === 400 && /same Bank Account/.test(e.message));
  assert.ok(nothingWritten());
});

test('a batch containing an already-realised row is refused entirely', async () => {
  const a = await newCard({ referenceNumber: 'A' });
  const b = await newCard({ referenceNumber: 'B' });
  await realise([a], 1000);
  const before = JSON.stringify(db);
  await assert.rejects(realise([a, b], 1000), (e) => e.status === 409);
  assert.equal(JSON.stringify(db), before);
  assert.equal(db.card.find(c => c.id === b).status, 'Pending');
});

test('duplicate ids / empty selection / unknown id are refused', async () => {
  const id = await newCard();
  await assert.rejects(realise([id, id], 10), (e) => e.status === 400);
  await assert.rejects(realise([], 10), (e) => e.status === 400);
  await assert.rejects(realise([9999], 10), (e) => e.status === 404);
  assert.equal(db.ledger.length, 0);
});

test('failure part-way (after bank debit and both hidden expenses) rolls everything back', async () => {
  const a = await newCard({ referenceNumber: 'A' });
  const b = await newCard({ referenceNumber: 'B' });
  const original = JSON.stringify(db);
  const realQuery = conn.query;
  let updates = 0;
  conn.query = async (sql, params) => {
    // blow up on the SECOND card status update, after everything else was written
    if (/^\s*UPDATE\s+card_transactions\s+SET\s+status = 'Completed'/i.test(sql) && ++updates === 2) throw new Error('boom');
    return realQuery.call(conn, sql, params);
  };
  try {
    await assert.rejects(realise([a, b], 10), /boom/);
  } finally { conn.query = realQuery; }
  assert.equal(JSON.stringify(db), original);
});

test('validation: missing/invalid Realise Date and Realise Date earlier than a transaction date', async () => {
  const id = await newCard({ date: '2026-10-10' });
  await assert.rejects(realise([id], 10, ''), (e) => e.status === 400 && /required/i.test(e.message));
  await assert.rejects(realise([id], 10, '2026-02-31'), (e) => e.status === 400);
  await assert.rejects(realise([id], 10, '2026-10-09'), (e) => e.status === 400 && /earlier/i.test(e.message));
  assert.equal(db.ledger.length, 0);
});

test('inactive bank account: realise refused, nothing saved', async () => {
  const id = await newCard();
  db.banks[1].status = 'Inactive';
  await assert.rejects(realise([id], 10), (e) => e.status === 400);
  assert.ok(nothingWritten());
});

test('combineReferences: one ref unchanged, several joined, long lists shortened to fit 100 chars', () => {
  assert.equal(svc.combineReferences(['A']), 'A');
  assert.equal(svc.combineReferences(['A', null, ' B ', '']), 'A, B');
  assert.equal(svc.combineReferences([null, '']), null);
  const many = Array.from({ length: 30 }, (_, i) => `VISA-REF-${i}`);
  const out = svc.combineReferences(many);
  assert.ok(out.length <= 100);
  assert.match(out, /^VISA-REF-0 \(\+29 more\)$/);
});

test('duplicate reference numbers between card transactions are refused', async () => {
  await newCard({ referenceNumber: 'DUP-9' });
  await assert.rejects(newCard({ referenceNumber: 'dup-9' }), (e) => e.status === 400);
});

test('displayRemark drops the collection card label, Sale ID and Shift No; user remarks are unchanged', () => {
  assert.equal(svc.displayRemark('Collection card - Sale #21127, receipt RCP2610060142 14:07 - SHIFT-211-0104 - Cafe - M'),
    'Sale receipt RCP2610060142 14:07 - Cafe - M');
  assert.equal(svc.displayRemark('Collection card - Order advance #614, receipt R9 (card_and_cash) 09:15 - SHIFT-211-0104'),
    'Order advance #614, receipt R9 (card_and_cash) 09:15');
  assert.equal(svc.displayRemark('Collection - Card (SHIFT-211-0104)'), '');
  assert.equal(svc.displayRemark('Collection - Card (CP-55)'), 'CP-55');
  assert.equal(svc.displayRemark('Visa settlement SHIFT-9 manual'), 'Visa settlement SHIFT-9 manual');
  assert.equal(svc.displayRemark(null), '');
});

test('parseRatePercent: numeric 0 - 100 with at most 2 decimals', () => {
  assert.deepEqual(rates.parseRatePercent('2'), { basisPoints: 200 });
  assert.deepEqual(rates.parseRatePercent('2.25'), { basisPoints: 225 });
  assert.deepEqual(rates.parseRatePercent(0), { basisPoints: 0 });
  assert.deepEqual(rates.parseRatePercent('100'), { basisPoints: 10000 });
  for (const bad of ['', null, '-1', '100.01', '101', 'abc', '2.255', '1e2', '.']) {
    assert.ok(rates.parseRatePercent(bad).error, `value ${bad}`);
  }
  assert.equal(rates.commissionCents(1000000, 200), 20000);
});
