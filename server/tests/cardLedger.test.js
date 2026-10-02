// Card Ledger rules, tested against the REAL service + REAL recordBankTransaction
// helper using a tiny in-memory fake of the few SQL statements they issue
// (no MySQL server needed).

const test = require('node:test');
const assert = require('node:assert/strict');

// ---- in-memory "database" --------------------------------------------------
const db = { card: [], ledger: [], banks: { 1: { company: 'JH', status: 'Active', balance: 1000 } }, nextCard: 1, nextLedger: 1 };

const conn = {
  async query(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (s.startsWith('SELECT company FROM bank_details')) {
      const b = db.banks[params[0]];
      return [b && b.status === 'Active' ? [{ company: b.company }] : []];
    }
    if (s.includes("FROM finance_transactions WHERE account_type = 'BANK' AND bank_id = ?") && s.includes('current_balance')) {
      const sum = db.ledger.filter(r => r.bank_id === params[0] && r.status === 1)
        .reduce((a, r) => a + r.debit - r.credit, 0);
      return [[{ current_balance: sum }]];
    }
    if (s.startsWith('SELECT id FROM company WHERE name')) return [[{ id: 1 }]];
    if (s.startsWith('INSERT INTO finance_transactions')) {
      // params: companyId, bankId, date, type, ref, invoice, party, direction, remark, debit, credit, balance, refType, refId, createdBy
      db.ledger.push({ id: db.nextLedger++, bank_id: params[1], date: params[2], type: params[3], debit: params[9], credit: params[10],
        reference_type: params[12], reference_id: params[13], status: 1 });
      return [{}];
    }
    if (s.startsWith('UPDATE bank_details SET current_balance')) { db.banks[params[1]].balance = params[0]; return [{}]; }

    if (s.startsWith('SELECT id FROM card_transactions WHERE LOWER(TRIM(reference_number))')) {
      return [db.card.filter(c => (c.reference_number || '').toLowerCase() === params[0].toLowerCase()).map(c => ({ id: c.id }))];
    }
    if (s.startsWith('INSERT INTO card_transactions')) {
      const [company_id, bank_id, transaction_date, amount, reference_number, remark, created_by] = params;
      const row = { id: db.nextCard++, company_id, bank_id, transaction_date, amount, reference_number, remark, status: 'Pending',
        realise_date: null, finance_transaction_id: null };
      db.card.push(row);
      return [{ insertId: row.id }];
    }
    if (s.includes('FROM card_transactions WHERE id = ? FOR UPDATE')) {
      const c = db.card.find(x => x.id === params[0]);
      return [c ? [{ ...c }] : []];
    }
    if (s.startsWith('SELECT id FROM finance_transactions WHERE reference_type')) {
      const rows = db.ledger.filter(r => r.reference_type === params[0] && r.reference_id === params[1]).sort((a, b) => b.id - a.id);
      return [rows.slice(0, 1).map(r => ({ id: r.id }))];
    }
    if (s.startsWith("UPDATE card_transactions SET status = 'Completed'")) {
      const [realise_date, ftId, , id] = params;
      const c = db.card.find(x => x.id === id && x.status === 'Pending');
      if (!c) return [{ affectedRows: 0 }];
      Object.assign(c, { status: 'Completed', realise_date, finance_transaction_id: ftId });
      return [{ affectedRows: 1 }];
    }
    throw new Error('Unhandled SQL in fake: ' + s.slice(0, 90));
  }
};

// Stop the real pool from opening a MySQL connection.
const dbModulePath = require.resolve('../config/db');
require.cache[dbModulePath] = { id: dbModulePath, filename: dbModulePath, loaded: true, exports: { query: conn.query } };

const { getBankBalance } = require('../utils/financeLedger');
const svc = require('../services/cardLedgerService');

const bankBalance = () => db.ledger.filter(r => r.bank_id === 1).reduce((a, r) => a + r.debit - r.credit, 0);
const newCard = (over = {}) => svc.createPendingCardTransaction(conn, {
  companyId: 1, bankId: 1, date: '2026-09-10', amount: 2500.5, referenceNumber: null, remark: 'Visa', createdBy: 1, ...over
});

test('isCardReceiveType matches the Visa Card Payment receive type only', () => {
  assert.equal(svc.isCardReceiveType('Visa Card Payment'), true);
  assert.equal(svc.isCardReceiveType('  visa   card payment '), true);
  assert.equal(svc.isCardReceiveType('Direct Banking'), false);
  assert.equal(svc.isCardReceiveType(null), false);
});

test('a Pending card transaction does not change the Bank Balance or write a ledger row', async () => {
  const before = bankBalance();
  const id = await newCard();
  assert.equal(db.card.find(c => c.id === id).status, 'Pending');
  assert.equal(bankBalance(), before);
  assert.equal(db.ledger.length, 0);
});

test('realising posts ONE bank debit on the Realise Date and completes the row', async () => {
  const id = await newCard({ referenceNumber: 'VCP-1' });
  const before = bankBalance();
  const out = await svc.realiseCardTransaction(conn, { id, realiseDate: '2026-09-12', userId: 3 });

  const card = db.card.find(c => c.id === id);
  assert.equal(card.status, 'Completed');
  assert.equal(card.realise_date, '2026-09-12');
  assert.equal(card.finance_transaction_id, out.financeTransactionId);
  assert.equal(bankBalance(), before + 2500.5);

  const row = db.ledger.find(r => r.id === out.financeTransactionId);
  assert.equal(row.date, '2026-09-12');
  assert.equal(row.debit, 2500.5);
  assert.equal(row.reference_type, 'CARD_REALISE');
});

test('the same card transaction cannot be realised (or added to the bank) twice', async () => {
  const id = await newCard();
  await svc.realiseCardTransaction(conn, { id, realiseDate: '2026-09-11', userId: 1 });
  const afterFirst = bankBalance();
  const ledgerRows = db.ledger.length;

  await assert.rejects(
    svc.realiseCardTransaction(conn, { id, realiseDate: '2026-09-15', userId: 1 }),
    (e) => e.status === 409
  );
  assert.equal(bankBalance(), afterFirst);
  assert.equal(db.ledger.length, ledgerRows);
  assert.equal(db.card.find(c => c.id === id).realise_date, '2026-09-11'); // date not overwritten
});

test('validation: missing/invalid date, earlier than transaction date, unknown id', async () => {
  const id = await newCard({ date: '2026-09-20' });
  const ledgerRows = db.ledger.length;
  await assert.rejects(svc.realiseCardTransaction(conn, { id, realiseDate: '' }), (e) => e.status === 400 && /required/i.test(e.message));
  await assert.rejects(svc.realiseCardTransaction(conn, { id, realiseDate: '2026-02-31' }), (e) => e.status === 400);
  await assert.rejects(svc.realiseCardTransaction(conn, { id, realiseDate: '2026-09-19' }), (e) => e.status === 400 && /earlier/i.test(e.message));
  await assert.rejects(svc.realiseCardTransaction(conn, { id: 9999, realiseDate: '2026-09-21' }), (e) => e.status === 404);
  assert.equal(db.ledger.length, ledgerRows);
  assert.equal(db.card.find(c => c.id === id).status, 'Pending');
});

test('duplicate reference numbers between card transactions are refused', async () => {
  await newCard({ referenceNumber: 'DUP-9' });
  await assert.rejects(newCard({ referenceNumber: 'dup-9' }), (e) => e.status === 400);
});

test('inactive bank account: realise is refused and the card stays Pending', async () => {
  const id = await newCard();
  db.banks[1].status = 'Inactive';
  const ledgerRows = db.ledger.length;
  await assert.rejects(svc.realiseCardTransaction(conn, { id, realiseDate: '2026-09-25' }), (e) => e.status === 400);
  db.banks[1].status = 'Active';
  assert.equal(db.ledger.length, ledgerRows);
  assert.equal(db.card.find(c => c.id === id).status, 'Pending');
});
