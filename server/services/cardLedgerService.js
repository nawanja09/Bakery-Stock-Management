// server/services/cardLedgerService.js
//
// Finance -> Card Ledger business rules. Shared by the Card Ledger controller
// and by Bank Receive (which files "Visa Card Payment" receipts as PENDING card
// transactions instead of posting them to the bank straight away).
//
// Ledger convention (see utils/financeLedger.js): DEBIT = money IN to the bank.
//
// Realise (one or many Pending card transactions, ONE database transaction):
//   The user enters ONE Realise Amount for the whole selection. The server
//   ignores any total/remaining the browser may have calculated:
//     Total Transaction Amount = SUM of the selected rows' amounts (from the DB)
//     Remaining Balance        = Total - Realise Amount          (always > 0)
//   and then writes
//     * card_realisations : one record (total, realise amount, remaining, date)
//     * Bank Ledger       : one DEBIT of the Realise Amount, dated on the
//                           Realise Date, posted through the shared
//                           recordBankTransaction() helper (existing balance rules)
//     * Hidden Expenses   : one "Visa Card Payment" record for the Remaining
//                           Balance (report-only: nothing is posted to any ledger)
//     * card_transactions : every selected row -> Completed (original amount kept)
//   Rules: all selected rows share ONE company and ONE bank account; Realise
//   Amount must be > 0 and strictly LESS than the Total Transaction Amount.
//   Nothing is partially saved: the caller rolls back on any error.
//
// Duplicate protection: rows are locked (FOR UPDATE) in id order, status is
// re-checked under the lock, each status UPDATE is guarded with
// `AND status = 'Pending'`, and card_realisations.finance_transaction_id /
// hidden_expense_id are UNIQUE, so a repeated request is refused and writes
// nothing.

const { recordBankTransaction } = require('../utils/financeLedger');
const {
  HttpError, parseDateOnly, parseId, parsePositiveMoney, dbToCents, centsToNumber, formatCents
} = require('../utils/staffLoanUtils');

// Receive Type (Finance -> Receive Types) that represents a card settlement.
const CARD_RECEIVE_TYPE = 'visa card payment';
const CARD_LEDGER_TRANSACTION_TYPE = 'Visa Card Payment';
// Bank Ledger rows created by a (batch) realisation point at card_realisations.id.
// (The earlier per-row version used 'CARD_REALISE' with a card_transactions id.)
const CARD_LEDGER_REFERENCE_TYPE = 'CARD_REALISATION';
const HIDDEN_EXPENSE_TYPE = 'Visa Card Payment';
const MAX_BATCH = 200;
const REFERENCE_MAX = 100; // finance_transactions / hidden_expenses reference column size

const isCardReceiveType = (value) =>
  String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase() === CARD_RECEIVE_TYPE;

/**
 * Reference No stored on the Bank Ledger row and the Hidden Expense of a
 * realisation: the original card reference(s). One card -> its reference
 * unchanged; several -> comma-separated, shortened to "<first> (+N more)" when
 * the list would not fit the 100-character column.
 */
const combineReferences = (references) => {
  const refs = references.map((r) => String(r ?? '').trim()).filter(Boolean);
  if (refs.length === 0) return null;
  const joined = refs.join(', ');
  if (joined.length <= REFERENCE_MAX) return joined;
  const short = `${refs[0]} (+${refs.length - 1} more)`;
  return short.length <= REFERENCE_MAX ? short : short.slice(0, REFERENCE_MAX);
};

/**
 * Files a card transaction as PENDING. Does NOT touch any bank balance.
 * Requires an open connection (callers wrap it in their own DB transaction).
 */
const createPendingCardTransaction = async (connection, {
  companyId, bankId, date, amount, referenceNumber = null, remark = null, createdBy = null
}) => {
  const ref = referenceNumber ? String(referenceNumber).trim() : null;
  if (ref) {
    const [dupes] = await connection.query(
      'SELECT id FROM card_transactions WHERE LOWER(TRIM(reference_number)) = LOWER(?) LIMIT 1',
      [ref]
    );
    if (dupes.length > 0) {
      throw new HttpError(400, `Reference number "${ref}" is already used by another card transaction`);
    }
  }

  const [result] = await connection.query(
    `INSERT INTO card_transactions
       (company_id, bank_id, transaction_date, amount, reference_number, remark, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?)`,
    [companyId, bankId, date, amount, ref, remark || null, createdBy]
  );
  return result.insertId;
};

/**
 * Validates the shape of a realise request. Pure (no database). The amount is
 * checked against the real Total Transaction Amount later, from the database.
 * @returns {{ date: string, ids: number[], realiseCents: number }}
 */
const parseRealiseRequest = ({ transactionIds, realiseAmount, realiseDate } = {}) => {
  if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
    throw new HttpError(400, 'Select at least one card transaction to realise');
  }
  if (transactionIds.length > MAX_BATCH) {
    throw new HttpError(400, `You can realise at most ${MAX_BATCH} card transactions at a time`);
  }

  const seen = new Set();
  const ids = transactionIds.map((raw) => {
    const id = parseId(raw);
    if (!id) throw new HttpError(400, 'Invalid card transaction ID');
    if (seen.has(id)) throw new HttpError(400, 'The same card transaction was selected more than once');
    seen.add(id);
    return id;
  });
  ids.sort((a, b) => a - b); // fixed lock order: concurrent requests cannot deadlock

  const amount = parsePositiveMoney(realiseAmount, 'Realise Amount');
  if (amount.error) throw new HttpError(400, amount.error);

  if (realiseDate === undefined || realiseDate === null || String(realiseDate).trim() === '') {
    throw new HttpError(400, 'Realise Date is required');
  }
  const date = parseDateOnly(typeof realiseDate === 'string' ? realiseDate : '');
  if (!date) throw new HttpError(400, 'Please enter a valid Realise Date');

  return { date, ids, realiseCents: amount.cents };
};

/**
 * Realises the selected Pending card transactions with ONE Realise Amount
 * (see header). Requires an open DB transaction on `connection`; the caller
 * commits / rolls back.
 */
const realiseCardTransactions = async (connection, { transactionIds, realiseAmount, realiseDate, userId = null }) => {
  const request = parseRealiseRequest({ transactionIds, realiseAmount, realiseDate });
  const { date, ids, realiseCents } = request;

  // 1) Lock + load every selected row (the database is the only source of amounts).
  const cards = [];
  for (const id of ids) {
    const [rows] = await connection.query(
      `SELECT id, company_id, bank_id, amount, reference_number, status,
              DATE_FORMAT(transaction_date, '%Y-%m-%d') AS transaction_date
       FROM card_transactions WHERE id = ? FOR UPDATE`,
      [id]
    );
    if (rows.length === 0) throw new HttpError(404, `Card transaction #${id} not found`);
    cards.push(rows[0]);
  }

  // 2) Validate everything BEFORE any write.
  const label = (card) => (card.reference_number ? `"${card.reference_number}"` : `#${card.id}`);
  for (const card of cards) {
    if (card.status !== 'Pending') {
      throw new HttpError(409, `Card transaction ${label(card)} has already been realised`);
    }
  }
  const first = cards[0];
  if (cards.some((c) => Number(c.company_id) !== Number(first.company_id))) {
    throw new HttpError(400, 'Selected card transactions must belong to the same Company');
  }
  if (cards.some((c) => Number(c.bank_id) !== Number(first.bank_id))) {
    throw new HttpError(400, 'Selected card transactions must belong to the same Bank Account');
  }
  for (const card of cards) {
    if (date < card.transaction_date) {
      throw new HttpError(400, `Realise Date cannot be earlier than the transaction date of ${label(card)}`);
    }
  }

  const totalCents = cards.reduce((sum, c) => sum + dbToCents(c.amount), 0);
  if (realiseCents >= totalCents) {
    throw new HttpError(
      400,
      `Realise Amount must be less than the Total Transaction Amount of Rs. ${formatCents(totalCents)}`
    );
  }
  const remainingCents = totalCents - realiseCents; // always > 0 here
  const reference = combineReferences(cards.map((c) => c.reference_number));

  // 3) Write.
  const [created] = await connection.query(
    `INSERT INTO card_realisations
       (company_id, bank_id, realise_date, total_amount, realise_amount, remaining_balance, reference_number, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      first.company_id, first.bank_id, date,
      centsToNumber(totalCents), centsToNumber(realiseCents), centsToNumber(remainingCents),
      reference, userId
    ]
  );
  const realisationId = created.insertId;

  let bankBalance;
  try {
    bankBalance = await recordBankTransaction(connection, {
      bankId: first.bank_id,
      date,
      remark: cards.length === 1
        ? `Card settlement realised (transaction dated ${first.transaction_date})`
        : `Card settlement realised (${cards.length} transactions)`,
      debit: centsToNumber(realiseCents),
      credit: 0,
      transactionType: CARD_LEDGER_TRANSACTION_TYPE,
      referenceNumber: reference,
      referenceType: CARD_LEDGER_REFERENCE_TYPE,
      referenceId: realisationId,
      createdBy: userId
    });
  } catch (error) {
    if (error.message === 'Bank account not found.') {
      throw new HttpError(400, 'The bank account for these card transactions is not active');
    }
    throw error;
  }

  const [ledgerRows] = await connection.query(
    `SELECT id FROM finance_transactions
     WHERE reference_type = ? AND reference_id = ? AND account_type = 'BANK' AND status = 1
     ORDER BY id DESC LIMIT 1`,
    [CARD_LEDGER_REFERENCE_TYPE, realisationId]
  );
  const financeTransactionId = ledgerRows[0]?.id ?? null;

  const [hidden] = await connection.query(
    `INSERT INTO hidden_expenses
       (expense_date, amount, type, description, company_id, reference_number, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      date, centsToNumber(remainingCents), HIDDEN_EXPENSE_TYPE,
      'Card Ledger remaining balance', first.company_id, reference, userId
    ]
  );
  const hiddenExpenseId = hidden.insertId;

  await connection.query(
    'UPDATE card_realisations SET finance_transaction_id = ?, hidden_expense_id = ? WHERE id = ?',
    [financeTransactionId, hiddenExpenseId, realisationId]
  );

  for (const card of cards) {
    const [update] = await connection.query(
      `UPDATE card_transactions
          SET status = 'Completed', realise_date = ?, realisation_id = ?, realised_by = ?, realised_at = NOW()
        WHERE id = ? AND status = 'Pending'`,
      [date, realisationId, userId, card.id]
    );
    if (update.affectedRows !== 1) {
      // Completed by someone else between our check and now: undo everything.
      throw new HttpError(409, `Card transaction ${label(card)} has already been realised`);
    }
  }

  return {
    realisationId,
    transactionIds: cards.map((c) => c.id),
    totals: {
      totalTransactionAmount: centsToNumber(totalCents),
      realiseAmount: centsToNumber(realiseCents),
      remainingBalance: centsToNumber(remainingCents)
    },
    financeTransactionId,
    hiddenExpenseId,
    bankBalance
  };
};

module.exports = {
  CARD_LEDGER_TRANSACTION_TYPE,
  CARD_LEDGER_REFERENCE_TYPE,
  HIDDEN_EXPENSE_TYPE,
  isCardReceiveType,
  combineReferences,
  createPendingCardTransaction,
  parseRealiseRequest,
  realiseCardTransactions
};
