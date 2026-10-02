// Card Ledger rules, tested against the REAL service + REAL recordBankTransaction
// helper using a tiny in-memory fake of the few SQL statements they issue
// (no MySQL server needed). The fake supports snapshot/rollback so the
// "everything rolls back" behaviour can be checked too.

const test = require('node:test');
const assert = require('node:assert/strict');

const fresh = () => ({
  card: [], ledger: [], hidden: [], realisations: [],
  nextCard: 1, nextLedger: 1, nextHidden: 1, nextReal: 1,
  banks: { 1: { company: 'JH', status: 'Active' }, 2: { company: 'JH', status: 'Active' } }
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
    if (s.startsWith('SELECT id FROM company WHERE name')) return [[{ id: 1 }]];
    if (s.startsWith('INSERT INTO finance_transactions')) {
      // companyId, bankId, date, type, ref, invoice, party, direction, remark, debit, credit, balance, refType, refId, createdBy
      db.ledger.push({ id: db.nextLedger++, bank_id: params[1], date: params[2], type: params[3], reference_number: params[4],
        debit: params[9], credit: params[10], reference_type: params[12], reference_id: params[13], status: 1 });
      return [{}];
    }
    if (s.startsWith('UPDATE bank_details SET current_balance')) return [{}];

    if (s.startsWith('SELECT id FROM card_transactions WHERE LOWER(TRIM(reference_number))')) {
      return [db.card.filter(c => (c.reference_number || '').toLowerCase() === params[0].toLowerCase()).map(c => ({ id: c.id }))];
    }
    if (s.startsWith('INSERT INTO card_transactions')) {
      const [company_id, bank_id, transaction_date, amount, reference_number, remark] = params;
      const row = { id: db.nextCard++, company_id, bank_id, transaction_date, amount, reference_number, remark, status: 'Pending',
        realise_date: null, realisation_id: null };
      db.card.push(row);
      return [{ insertId: row.id }];
    }
    if (s.includes('FROM card_transactions WHERE id = ? FOR UPDATE')) {
      const c = db.card.find(x => x.id === params[0]);
      return [c ? [{ ...c }] : []];
    }
    if (s.startsWith('INSERT INTO card_realisations')) {
      const [company_id, bank_id, realise_date, total_amount, realise_amount, remaining_balance, reference_number] = params;
      const row = { id: db.nextReal++, company_id, bank_id, realise_date, total_amount, realise_amount, remaining_balance,
        reference_number, finance_transaction_id: null, hidden_expense_id: null };
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
      const r = db.realisations.find(x => x.id === params[2]);
      r.finance_transaction_id = params[0]; r.hidden_expense_id = params[1];
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith("UPDATE card_transactions SET status = 'Completed'")) {
      const [realise_date, realisation_id, , id] = params;
      const c = db.card.find(x => x.id === id && x.status === 'Pending');
      if (!c) return [{ affectedRows: 0 }];
      Object.assign(c, { status: 'Completed', realise_date, realisation_id });
      return [{ affectedRows: 1 }];
    }
    throw new Error('Unhandled SQL in fake: ' + s.slice(0, 100));
  }
};

const dbModulePath = require.resolve('../config/db');
require.cache[dbModulePath] = { id: dbModulePath, filename: dbModulePath, loaded: true, exports: { query: conn.query } };

const svc = require('../services/cardLedgerService');

const bankBalance = (bankId = 1) => db.ledger.filter(r => r.bank_id === bankId).reduce((a, r) => a + r.debit - r.credit, 0);
const newCard = (over = {}) => svc.createPendingCardTransaction(conn, {
  companyId: 1, bankId: 1, date: '2026-10-01', amount: 100000, referenceNumber: null, remark: 'Visa', createdBy: 1, ...over
});
// Mimics the controller: BEGIN ... COMMIT / ROLLBACK (snapshot restore).
const realise = async (transactionIds, realiseAmount, realiseDate = '2026-10-02') => {
  const snapshot = JSON.stringify(db);
  try {
    return await svc.realiseCardTransactions(conn, { transactionIds, realiseAmount, realiseDate, userId: 3 });
  } catch (e) {
    db = JSON.parse(snapshot); // ROLLBACK
    throw e;
  }
};

test.beforeEach(() => { db = fresh(); });

test('isCardReceiveType matches the Visa Card Payment receive type only', () => {
  assert.equal(svc.isCardReceiveType('Visa Card Payment'), true);
  assert.equal(svc.isCardReceiveType('  visa   card payment '), true);
  assert.equal(svc.isCardReceiveType('Direct Banking'), false);
});

test('a Pending card transaction does not change any balance or create ledger/hidden rows', async () => {
  await newCard();
  assert.equal(db.ledger.length, 0);
  assert.equal(db.hidden.length, 0);
  assert.equal(db.realisations.length, 0);
});

test('spec example: 40k + 30k + 30k, ONE Realise Amount 70k -> total 100k, bank debit 70k, hidden expense 30k', async () => {
  const a = await newCard({ referenceNumber: 'REF001', amount: 40000 });
  const b = await newCard({ referenceNumber: 'REF002', amount: 30000 });
  const c = await newCard({ referenceNumber: 'REF003', amount: 30000 });
  const out = await realise([c, a, b], '70000');

  // server-calculated figures
  assert.deepEqual(out.totals, { totalTransactionAmount: 100000, realiseAmount: 70000, remainingBalance: 30000 });

  // ONE bank debit for the Realise Amount on the Realise Date
  assert.equal(db.ledger.length, 1);
  assert.equal(bankBalance(), 70000);
  const bankRow = db.ledger[0];
  assert.deepEqual(
    { debit: bankRow.debit, credit: bankRow.credit, date: bankRow.date, ref: bankRow.reference_number },
    { debit: 70000, credit: 0, date: '2026-10-02', ref: 'REF001, REF002, REF003' }
  );

  // ONE hidden expense for the Remaining Balance only
  assert.equal(db.hidden.length, 1);
  assert.deepEqual(
    { amount: db.hidden[0].amount, type: db.hidden[0].type, date: db.hidden[0].expense_date, company: db.hidden[0].company_id },
    { amount: 30000, type: 'Visa Card Payment', date: '2026-10-02', company: 1 }
  );
  assert.equal(bankRow.debit + db.hidden[0].amount, 100000);

  // ONE realisation record linked to both; all three cards Completed with original amounts
  assert.equal(db.realisations.length, 1);
  const r = db.realisations[0];
  assert.deepEqual(
    { total: r.total_amount, realise: r.realise_amount, remaining: r.remaining_balance, ft: r.finance_transaction_id, he: r.hidden_expense_id },
    { total: 100000, realise: 70000, remaining: 30000, ft: bankRow.id, he: db.hidden[0].id }
  );
  assert.ok(db.card.every(x => x.status === 'Completed' && x.realisation_id === r.id && x.realise_date === '2026-10-02'));
  assert.deepEqual(db.card.map(x => x.amount), [40000, 30000, 30000]);
});

test('single transaction works the same way (reference kept unchanged)', async () => {
  const id = await newCard({ referenceNumber: 'VCP-1' });
  await realise([id], '70000');
  assert.equal(db.ledger[0].reference_number, 'VCP-1');
  assert.equal(db.hidden[0].reference_number, 'VCP-1');
  assert.equal(db.hidden[0].amount, 30000);
});

test('the server computes the total from the database; client totals are ignored', async () => {
  const a = await newCard({ amount: 40000 });
  const b = await newCard({ amount: 30000 });
  // extra fields a tampering client might send are not even read
  const out = await svc.realiseCardTransactions(conn, {
    transactionIds: [a, b], realiseAmount: '50000', realiseDate: '2026-10-02', userId: 1,
    totalTransactionAmount: 1, remainingBalance: 999999
  });
  assert.equal(out.totals.totalTransactionAmount, 70000);
  assert.equal(out.totals.remainingBalance, 20000);
  assert.equal(db.hidden[0].amount, 20000);
});

test('Realise Amount must be > 0 and strictly less than the Total Transaction Amount', async () => {
  const a = await newCard({ amount: 40000 });
  const b = await newCard({ amount: 30000 });
  for (const bad of ['70000', '70000.01', '150000', '0', '-5', '', null, 'abc', '10.123']) {
    await assert.rejects(realise([a, b], bad), (e) => e.status === 400, `value ${bad}`);
  }
  await assert.rejects(realise([a, b], '70000'), (e) => /less than the Total Transaction Amount of Rs\. 70,000\.00/.test(e.message));
  assert.ok(db.card.every(c => c.status === 'Pending'));
  assert.equal(db.ledger.length + db.hidden.length + db.realisations.length, 0);
});

test('different Company or Bank Account cannot be realised together (backend check)', async () => {
  const a = await newCard({ referenceNumber: 'A' });
  const otherCompany = await newCard({ referenceNumber: 'B', companyId: 2 });
  const otherBank = await newCard({ referenceNumber: 'C', bankId: 2 });

  await assert.rejects(realise([a, otherCompany], 10), (e) => e.status === 400 && /same Company/.test(e.message));
  await assert.rejects(realise([a, otherBank], 10), (e) => e.status === 400 && /same Bank Account/.test(e.message));
  assert.equal(db.ledger.length, 0);
  assert.ok(db.card.every(c => c.status === 'Pending'));
});

test('a repeated request does not create another Bank Ledger, Hidden Expense or realisation', async () => {
  const id = await newCard({ referenceNumber: 'R1' });
  await realise([id], 70000);
  const snapshot = JSON.stringify(db);

  await assert.rejects(realise([id], 70000, '2026-10-05'), (e) => e.status === 409);
  assert.equal(JSON.stringify(db), snapshot);
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

test('failure part-way (after bank debit and hidden expense) rolls everything back', async () => {
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
  assert.equal(db.ledger.length + db.hidden.length + db.realisations.length, 0);
  assert.equal(db.card[0].status, 'Pending');
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
