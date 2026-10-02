// server/services/cardLedgerService.js
//
// Finance -> Card Ledger business rules. Shared by the Card Ledger controller
// and by Bank Receive (which files "Visa Card Payment" receipts as PENDING card
// transactions instead of posting them to the bank straight away).
//
// Ledger convention (see utils/financeLedger.js): DEBIT = money IN to the bank.
//
// Rules enforced here:
//   1. Pending card transactions never touch finance_transactions / any bank
//      balance.
//   2. Realising posts exactly one bank DEBIT, dated on the Realise Date, and
//      flips the row to Completed inside ONE database transaction.
//   3. A row can be realised only once: the row is locked (FOR UPDATE), its
//      status is re-checked under the lock, and the status UPDATE is itself
//      guarded with `AND status = 'Pending'`. finance_transaction_id is UNIQUE.

const { recordBankTransaction } = require('../utils/financeLedger');
const { HttpError, parseDateOnly } = require('../utils/staffLoanUtils');

// Receive Type (Finance -> Receive Types) that represents a card settlement.
const CARD_RECEIVE_TYPE = 'visa card payment';
const CARD_LEDGER_TRANSACTION_TYPE = 'Visa Card Payment';
const CARD_LEDGER_REFERENCE_TYPE = 'CARD_REALISE';

const isCardReceiveType = (value) =>
  String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase() === CARD_RECEIVE_TYPE;

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
 * Realises one Pending card transaction: posts the bank debit and marks the
 * row Completed with its Realise Date. Requires an open DB transaction on
 * `connection`; the caller commits/rolls back.
 * Returns { bankBalance, financeTransactionId }.
 */
const realiseCardTransaction = async (connection, { id, realiseDate, userId = null }) => {
  const date = parseDateOnly(typeof realiseDate === 'string' ? realiseDate : '');
  if (!realiseDate) throw new HttpError(400, 'Realise Date is required');
  if (!date) throw new HttpError(400, 'Please enter a valid Realise Date');

  // Lock the row: two simultaneous "Realise" clicks serialise here, and the
  // second one then sees status = 'Completed' and is refused.
  const [rows] = await connection.query(
    `SELECT id, company_id, bank_id, amount, reference_number, remark, status,
            DATE_FORMAT(transaction_date, '%Y-%m-%d') AS transaction_date
     FROM card_transactions WHERE id = ? FOR UPDATE`,
    [id]
  );
  if (rows.length === 0) throw new HttpError(404, 'Card transaction not found');
  const card = rows[0];

  if (card.status !== 'Pending') {
    throw new HttpError(409, 'This card transaction has already been realised');
  }
  if (date < card.transaction_date) {
    throw new HttpError(400, 'Realise Date cannot be earlier than the transaction date');
  }

  let bankBalance;
  try {
    bankBalance = await recordBankTransaction(connection, {
      bankId: card.bank_id,
      date,
      remark: card.remark || `Card settlement realised (transaction dated ${card.transaction_date})`,
      debit: Number.parseFloat(card.amount),
      transactionType: CARD_LEDGER_TRANSACTION_TYPE,
      referenceNumber: card.reference_number || null,
      referenceType: CARD_LEDGER_REFERENCE_TYPE,
      referenceId: card.id,
      createdBy: userId
    });
  } catch (error) {
    if (error.message === 'Bank account not found.') {
      throw new HttpError(400, 'The bank account for this card transaction is not active');
    }
    throw error;
  }

  // Link back to the exact Bank Ledger row that was just written.
  const [ledgerRows] = await connection.query(
    `SELECT id FROM finance_transactions
     WHERE reference_type = ? AND reference_id = ? AND account_type = 'BANK' AND status = 1
     ORDER BY id DESC LIMIT 1`,
    [CARD_LEDGER_REFERENCE_TYPE, card.id]
  );
  const financeTransactionId = ledgerRows[0]?.id ?? null;

  const [update] = await connection.query(
    `UPDATE card_transactions
        SET status = 'Completed', realise_date = ?, finance_transaction_id = ?,
            realised_by = ?, realised_at = NOW()
      WHERE id = ? AND status = 'Pending'`,
    [date, financeTransactionId, userId, card.id]
  );
  if (update.affectedRows !== 1) {
    // Someone else completed it between our check and now: undo the whole thing.
    throw new HttpError(409, 'This card transaction has already been realised');
  }

  return { bankBalance, financeTransactionId };
};

module.exports = {
  CARD_LEDGER_TRANSACTION_TYPE,
  CARD_LEDGER_REFERENCE_TYPE,
  isCardReceiveType,
  createPendingCardTransaction,
  realiseCardTransaction
};
