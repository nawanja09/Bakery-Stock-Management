// Adjustment -> Cash Receive / Bank Receive editor (adjustmentController.updateFinancialAdjustmentRecord),
// card-sourced Bank Receive rows only: every entry is editable (Pending or
// Completed), tested against the REAL controller + REAL cardLedgerService
// cascade using a tiny in-memory fake of the few SQL statements they issue
// (no MySQL server needed). Role gating (Super Admin only) is the standard
// requireRoles middleware, already covered by tests/accessControl.test.js -
// this file only exercises what changed: the status gate being lifted and
// the amount-edit cascade into card_realisations / the Bank Ledger / Hidden
// Expenses for an already-realised card receipt.

const test = require('node:test');
const assert = require('node:assert/strict');

const fresh = () => ({
  card: [], ledger: [], hidden: [], realisations: [], rmAdjustments: [],
  company: [{ id: 1, name: 'JH' }, { id: 2, name: 'RD' }],
  bankDetails: [
    { id: 1, company: 'JH', status: 'Active', record_status: 1 },
    { id: 2, company: 'RD', status: 'Active', record_status: 1 }
  ],
  nextLedger: 1, nextHidden: 1
});
let db = fresh();

const conn = {
  async query(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (s.startsWith("SELECT ct.id, 'card' AS source")) {
      const c = db.card.find((x) => String(x.id) === String(params[0]));
      if (!c) return [[]];
      const real = c.realisation_id ? db.realisations.find((r) => r.id === c.realisation_id) : null;
      return [[{ ...c, finance_transaction_id: real ? real.finance_transaction_id : null }]];
    }
    if (s.startsWith('INSERT INTO reference_locks')) return [{}];
    if (s.startsWith('SELECT id FROM ?? WHERE LOWER(TRIM(??)) = LOWER(?)')) {
      // checkDuplicateReference's generic per-table check: params = [table, column, ref, ...excludeIds]
      const [table, , ref, ...excludeIds] = params;
      if (table === 'finance_transactions') {
        const excluded = excludeIds.map(String);
        const match = db.ledger.find((r) => r.status === 1
          && String(r.reference_number || '').toLowerCase() === String(ref).toLowerCase()
          && !excluded.includes(String(r.id)));
        return [match ? [{ id: match.id }] : []];
      }
      return [[]]; // the other 10 reference-validation tables: no collisions in these tests
    }
    if (s.startsWith('SELECT id FROM card_transactions WHERE LOWER(TRIM(reference_number)) = LOWER(?) AND id <> ?')) {
      const [ref, excludeId] = params;
      const match = db.card.find((c) => String(c.id) !== String(excludeId)
        && String(c.reference_number || '').toLowerCase() === String(ref).toLowerCase());
      return [match ? [{ id: match.id }] : []];
    }
    if (s === 'SELECT id FROM company WHERE id = ? AND is_deleted = 0') {
      const c = db.company.find((x) => x.id === params[0]);
      return [c ? [{ id: c.id }] : []];
    }
    if (s.startsWith('SELECT bd.id FROM bank_details bd')) {
      const bank = db.bankDetails.find((b) => b.id === params[0]);
      const company = db.company.find((c) => c.id === params[1]);
      const ok = !!bank && !!company && bank.company.toLowerCase().trim() === company.name.toLowerCase().trim()
        && bank.status === 'Active' && (bank.record_status ?? 1) === 1;
      return [ok ? [{ id: bank.id }] : []];
    }
    if (s === 'SELECT commission_amount, realise_amount FROM card_realisations WHERE id = ?') {
      const r = db.realisations.find((x) => x.id === params[0]);
      return [r ? [{ commission_amount: r.commission_amount, realise_amount: r.realise_amount }] : []];
    }
    if (s.includes('FROM card_realisations WHERE id = ? FOR UPDATE')) {
      const r = db.realisations.find((x) => x.id === params[0]);
      return [r ? [{ ...r }] : []];
    }
    if (s.includes('FROM card_transactions WHERE realisation_id = ? FOR UPDATE')) {
      return [db.card.filter((c) => c.realisation_id === params[0]).map((c) => ({ ...c }))];
    }
    if (s.startsWith('UPDATE card_realisations SET total_amount = ?')) {
      const [total_amount, commission_amount, realise_amount, remaining_balance, updated_by, id] = params;
      const r = db.realisations.find((x) => x.id === id);
      if (r) Object.assign(r, { total_amount, commission_amount, realise_amount, remaining_balance, updated_by });
      return [{}];
    }
    if (/^UPDATE card_realisations SET (commission|bank_charge)_expense_id/.test(s)) {
      const field = s.includes('commission_expense_id') ? 'commission_expense_id' : 'bank_charge_expense_id';
      const isNull = s.includes('= NULL');
      const r = db.realisations.find((x) => x.id === params[isNull ? 0 : 1]);
      if (r) r[field] = isNull ? null : params[0];
      return [{}];
    }
    if (s.startsWith('UPDATE finance_transactions SET debit = ?')) {
      const row = db.ledger.find((r) => r.id === params[1] && r.status === 1);
      if (row) row.debit = params[0];
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (s.startsWith('UPDATE finance_transactions ft')) return [{}]; // rebuildBalanceAfter: balance_after rewrite (not asserted)
    if (s.includes('FROM finance_transactions WHERE account_type = ? AND bank_id = ? AND status = 1') && !s.includes('transaction_date')) {
      const sum = db.ledger.filter((r) => r.bank_id === params[1] && r.status === 1).reduce((a, r) => a + r.debit - r.credit, 0);
      return [[{ balance: sum }]];
    }
    if (s.startsWith('UPDATE bank_details SET current_balance')) return [{}];
    if (s.startsWith('UPDATE hidden_expenses SET is_deleted = 1')) {
      const row = db.hidden.find((h) => h.id === params[0]);
      if (row) row.is_deleted = 1;
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (s.startsWith('UPDATE hidden_expenses SET amount = ?, description = ?')) {
      const row = db.hidden.find((h) => h.id === params[2]);
      if (row) Object.assign(row, { amount: params[0], description: params[1] });
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (s.startsWith('INSERT INTO hidden_expenses')) {
      const [expense_date, amount, type, description, company_id, reference_number] = params;
      const row = { id: db.nextHidden++, expense_date, amount, type, description, company_id, reference_number };
      db.hidden.push(row);
      return [{ insertId: row.id }];
    }
    if (s.startsWith('INSERT INTO rm_adjustment_records')) {
      db.rmAdjustments.push({ category: params[0], source_record_id: params[1] });
      return [{}];
    }
    if (s.startsWith('UPDATE card_transactions SET amount') || s.startsWith('UPDATE card_transactions SET department_id')) {
      // editCardRealisation's own single-card field update (amount and/or department_id).
      const hasAmount = s.includes('amount = ?');
      const hasDept = s.includes('department_id = ?');
      const id = params[params.length - 1];
      const c = db.card.find((x) => String(x.id) === String(id));
      if (c) {
        if (hasAmount) c.amount = params[0];
        if (hasDept) c.department_id = params[hasAmount ? 1 : 0];
      }
      return [{ affectedRows: c ? 1 : 0 }];
    }
    if (s.startsWith('UPDATE card_transactions SET transaction_date = ?, reference_number = ?, amount = ?, remark = ?')) {
      const [transaction_date, reference_number, amount, remark, company_id, bank_id, id] = params;
      const c = db.card.find((x) => String(x.id) === String(id));
      if (c) Object.assign(c, { transaction_date, reference_number, amount, remark, company_id, bank_id });
      return [{ affectedRows: c ? 1 : 0 }];
    }
    throw new Error('Unhandled SQL in fake: ' + s.slice(0, 120));
  }
};

const fakeConnection = {
  query: (...args) => conn.query(...args),
  async beginTransaction() {},
  async commit() {},
  async rollback() {},
  release() {}
};

const dbModulePath = require.resolve('../config/db');
require.cache[dbModulePath] = {
  id: dbModulePath, filename: dbModulePath, loaded: true,
  exports: { query: conn.query, getConnection: async () => fakeConnection }
};

const { updateFinancialAdjustmentRecord } = require('../controllers/adjustmentController');

const call = async (id, body) => {
  let status = 200;
  let payload = null;
  const req = { params: { category: 'Bank Receive', source: 'card', id: String(id) }, body, user: { userId: 9 } };
  const res = { status(code) { status = code; return this; }, json(data) { payload = data; } };
  await updateFinancialAdjustmentRecord(req, res);
  return { status, payload };
};

const newCard = (over = {}) => {
  const row = {
    id: db.card.length + 1, company_id: 1, bank_id: 1, transaction_date: '2026-10-01',
    amount: 10000, reference_number: null, remark: 'Visa', status: 'Pending',
    realisation_id: null, created_by: 9, ...over
  };
  db.card.push(row);
  return row.id;
};

const realiseInto = (cardId, {
  realisationId, totalAmount, commissionAmount, realiseAmount, remainingBalance,
  financeTransactionId = 1, ledgerReference = null
}) => {
  db.realisations.push({
    id: realisationId, company_id: 1, bank_id: 1, realise_date: '2026-10-02',
    total_amount: totalAmount, commission_amount: commissionAmount, realise_amount: realiseAmount,
    remaining_balance: remainingBalance, reference_number: ledgerReference,
    finance_transaction_id: financeTransactionId, commission_expense_id: null, bank_charge_expense_id: null, status: 1
  });
  db.ledger.push({ id: financeTransactionId, bank_id: 1, debit: realiseAmount, credit: 0, status: 1, reference_number: ledgerReference });
  const card = db.card.find((c) => c.id === cardId);
  Object.assign(card, { status: 'Completed', realisation_id: realisationId });
};

const baseBody = (over = {}) => ({
  date: '2026-10-01', amount: '10000', receive_type: 'Visa Card Payment', company_id: 1, bank_id: 1, ...over
});

test.beforeEach(() => { db = fresh(); });

test('Pending: date / reference / remark / amount are all editable, unchanged from before', async () => {
  const id = newCard();
  const { status, payload } = await call(id, baseBody({ amount: '12000', remark: 'fixed' }));
  assert.equal(status, 200);
  assert.equal(payload.message, 'Bank Receive adjustment saved successfully');
  assert.deepEqual([db.card[0].amount, db.card[0].remark], [12000, 'fixed']);
  assert.equal(db.rmAdjustments.length, 1); // audited
});

test('Completed, amount unchanged: date / reference / remark still editable, no realisation touched', async () => {
  const id = newCard({ amount: 10000 });
  realiseInto(id, { realisationId: 1, totalAmount: 10000, commissionAmount: 200, realiseAmount: 9700, remainingBalance: 100 });

  const { status } = await call(id, baseBody({ amount: '10000', remark: 'typo fix' }));
  assert.equal(status, 200);
  assert.equal(db.card[0].remark, 'typo fix');
  assert.equal(db.realisations[0].total_amount, 10000); // untouched
  assert.equal(db.ledger[0].debit, 9700); // Bank Ledger untouched
});

test('Completed, single-card realisation, amount changed: cascades into card_realisations, the Bank Charge Hidden Expense and the card row itself', async () => {
  const id = newCard({ amount: 10000 });
  realiseInto(id, { realisationId: 1, totalAmount: 10000, commissionAmount: 200, realiseAmount: 9700, remainingBalance: 100 });
  db.hidden.push({ id: 1, amount: 100, type: 'Credit Card Bank Charge' });
  db.realisations[0].bank_charge_expense_id = 1;

  const { status, payload } = await call(id, baseBody({ amount: '10500' })); // +500, realise/commission unchanged
  assert.equal(status, 200, JSON.stringify(payload));
  assert.deepEqual(
    { total: db.realisations[0].total_amount, realise: db.realisations[0].realise_amount, remaining: db.realisations[0].remaining_balance, editor: db.realisations[0].updated_by },
    { total: 10500, realise: 9700, remaining: 600, editor: 9 }
  );
  assert.equal(db.ledger[0].debit, 9700); // Realise Amount (the bank debit) is unchanged - only the total moved
  assert.equal(db.hidden[0].amount, 600); // Bank Charge grows with the extra 500
  assert.equal(db.card[0].amount, 10500);
});

test('Completed, multi-card realisation, amount changed: refused - nothing written', async () => {
  const a = newCard({ amount: 6000 });
  const b = newCard({ amount: 4000 });
  realiseInto(a, { realisationId: 1, totalAmount: 10000, commissionAmount: 200, realiseAmount: 9700, remainingBalance: 100 });
  db.card.find((c) => c.id === b).status = 'Completed';
  db.card.find((c) => c.id === b).realisation_id = 1;

  const { status, payload } = await call(a, baseBody({ amount: '7000' }));
  assert.equal(status, 400);
  assert.match(payload.error, /single card transaction/);
  assert.equal(db.card[0].amount, 6000); // untouched
  assert.equal(db.realisations[0].total_amount, 10000);
});

test('Pending: Company and Bank Account can be moved to another valid pair', async () => {
  const id = newCard();
  const { status, payload } = await call(id, baseBody({ company_id: 2, bank_id: 2 }));
  assert.equal(status, 200, JSON.stringify(payload));
  assert.deepEqual([db.card[0].company_id, db.card[0].bank_id], [2, 2]);
});

test('Completed: Company / Bank Account cannot be changed - reverse to Pending first', async () => {
  const id = newCard();
  realiseInto(id, { realisationId: 1, totalAmount: 10000, commissionAmount: 200, realiseAmount: 9700, remainingBalance: 100 });
  const { status, payload } = await call(id, baseBody({ company_id: 2, bank_id: 2 }));
  assert.equal(status, 400);
  assert.match(payload.error, /reverse it to Pending/);
  assert.deepEqual([db.card[0].company_id, db.card[0].bank_id], [1, 1]); // untouched
});

test('Completed: saving with the SAME Company / Bank Account is fine (not a change)', async () => {
  const id = newCard();
  realiseInto(id, { realisationId: 1, totalAmount: 10000, commissionAmount: 200, realiseAmount: 9700, remainingBalance: 100 });
  const { status } = await call(id, baseBody({ remark: 'typo' })); // company_id: 1, bank_id: 1 - unchanged
  assert.equal(status, 200);
});

test('Completed: keeping the same Reference No. unchanged does not flag its own realisation Bank Ledger row as a duplicate', async () => {
  const id = newCard({ referenceNumber: 'VCP-1' });
  realiseInto(id, { realisationId: 1, totalAmount: 10000, commissionAmount: 200, realiseAmount: 9700, remainingBalance: 100, ledgerReference: 'VCP-1' });
  const { status, payload } = await call(id, baseBody({ reference_number: 'VCP-1', remark: 'typo fix' }));
  assert.equal(status, 200, JSON.stringify(payload));
  assert.equal(db.card[0].remark, 'typo fix');
});

test('Completed: a Reference No. that collides with an UNRELATED Bank Ledger row is still refused', async () => {
  const id = newCard({ referenceNumber: 'VCP-1' });
  realiseInto(id, { realisationId: 1, totalAmount: 10000, commissionAmount: 200, realiseAmount: 9700, remainingBalance: 100, ledgerReference: 'VCP-1' });
  db.ledger.push({ id: 99, bank_id: 1, debit: 500, credit: 0, status: 1, reference_number: 'OTHER-REF' });
  const { status, payload } = await call(id, baseBody({ reference_number: 'OTHER-REF' }));
  assert.equal(status, 400);
  assert.match(payload.error, /Duplicate reference number/);
});

test('an unknown Company, or a Bank Account that does not belong to it, is refused', async () => {
  const id = newCard();
  const bad1 = await call(id, baseBody({ company_id: 999 }));
  assert.equal(bad1.status, 400);
  assert.match(bad1.payload.error, /valid Company/);

  const bad2 = await call(id, baseBody({ company_id: 1, bank_id: 2 })); // bank 2 belongs to company 2
  assert.equal(bad2.status, 400);
  assert.match(bad2.payload.error, /valid Bank Account/);
});

test('unknown record id is 404', async () => {
  const { status, payload } = await call(999, baseBody());
  assert.equal(status, 404);
  assert.equal(payload.error, 'Receive record not found');
});
