// server/services/inhandPostingService.js
//
// Finance Posting Engine for Inhand Adjustments.
// Called by inhandController when an entry is approved or cancelled.
//
// Guarantees:
//   1. Duplicate-post prevention  – finance_txn_id uniqueness check.
//   2. Account validation         – cash_accounts / bank_details status check.
//   3. Atomic DB transaction      – all ledger + inhand updates commit or roll back together.
//   4. Audit log                  – every action is written to inhand_audit_log.
//   5. Reversals                  – a contra-entry is created in finance_transactions,
//                                   the balance is restored, and reversal_txn_id is set.

const {
  recordCashTransaction,
  recordBankTransaction
} = require('../utils/financeLedger');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Writes a row to inhand_audit_log within an existing DB connection.
 */
async function writeAuditLog(connection, { inhandId, action, performedBy, details = null }) {
  await connection.query(
    `INSERT INTO inhand_audit_log (inhand_id, action, performed_by, details)
     VALUES (?, ?, ?, ?)`,
    [inhandId, action, performedBy, details ? JSON.stringify(details) : null]
  );
}

/**
 * Generates the next sequential reference number.
 * Format: IH-YYYY-NNNNN  (e.g. IH-2026-00001)
 * Uses FOR UPDATE to prevent race conditions under concurrent requests.
 */
async function generateReferenceNo(connection) {
  const year = new Date().getFullYear();
  const prefix = `IH-${year}-`;

  const [rows] = await connection.query(
    `SELECT reference_no FROM inhand_adjustments
     WHERE reference_no LIKE ? ORDER BY id DESC LIMIT 1 FOR UPDATE`,
    [`${prefix}%`]
  );

  let nextSeq = 1;
  if (rows.length > 0) {
    const last = rows[0].reference_no; // e.g. IH-2026-00042
    const lastSeq = parseInt(last.split('-')[2], 10);
    if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
  }

  return `${prefix}${String(nextSeq).padStart(5, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// postInhand – runs inside an existing DB transaction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Posts an approved Inhand entry to the Finance ledger.
 *
 * @param {object} connection  – active mysql2 connection with an open transaction
 * @param {object} inhand      – full row from inhand_adjustments
 * @param {number} approvedBy  – user ID of the approver
 * @returns {number}           – the new finance_transactions.id
 */
async function postInhand(connection, inhand, approvedBy) {
  const { id, payment_type, company_id, bank_id, amount, party_name,
    cheque_number, bank_name, cheque_date, reference_no, remark } = inhand;

  // ── Duplicate-post guard ────────────────────────────────────────────────
  const [guard] = await connection.query(
    'SELECT finance_txn_id FROM inhand_adjustments WHERE id = ? FOR UPDATE',
    [id]
  );
  if (guard[0]?.finance_txn_id) {
    await writeAuditLog(connection, {
      inhandId: id, action: 'DUPLICATE_BLOCKED',
      performedBy: approvedBy,
      details: { existing_txn_id: guard[0].finance_txn_id }
    });
    const err = new Error('This Inhand entry has already been posted to the Finance ledger.');
    err.statusCode = 409;
    throw err;
  }

  let finTxnId;

  if (payment_type === 'Cash In') {
    // ── Validate cash account ──────────────────────────────────────────────
    const [cashRows] = await connection.query(
      'SELECT id FROM cash_accounts WHERE company_id = ?',
      [company_id]
    );
    if (cashRows.length === 0) {
      const err = new Error('No cash account exists for this company. Set an opening balance first.');
      err.statusCode = 400;
      throw err;
    }

    // ── Post to Cash Ledger ───────────────────────────────────────────────
    await recordCashTransaction(connection, {
      companyId : company_id,
      date      : inhand.transaction_date,
      remark    : remark || `Cash In – Ref: ${reference_no}`,
      debit     : parseFloat(amount),
      credit    : 0,
      transactionType  : 'Cash In',
      referenceNumber  : reference_no,
      partyName        : party_name || null,
      referenceType    : 'INHAND_ADJUSTMENT',
      referenceId      : id,
      createdBy        : approvedBy
    });

    // Retrieve the ID of the row we just inserted
    const [txnRow] = await connection.query(
      `SELECT id FROM finance_transactions
       WHERE reference_type = 'INHAND_ADJUSTMENT' AND reference_id = ?
         AND account_type = 'CASH'
       ORDER BY id DESC LIMIT 1`,
      [id]
    );
    finTxnId = txnRow[0]?.id;

  } else {
    // payment_type === 'Cheque In'

    // ── Validate bank account ──────────────────────────────────────────────
    const [bankRows] = await connection.query(
      `SELECT id, status FROM bank_details WHERE id = ?`,
      [bank_id]
    );
    if (bankRows.length === 0) {
      const err = new Error('Selected bank account not found.');
      err.statusCode = 400;
      throw err;
    }
    if (bankRows[0].status !== 'Active') {
      const err = new Error('Selected bank account is inactive. Please choose an active account.');
      err.statusCode = 400;
      throw err;
    }

    // ── Post to Bank Ledger ───────────────────────────────────────────────
    await recordBankTransaction(connection, {
      bankId    : bank_id,
      date      : inhand.transaction_date,
      remark    : remark || `Cheque In – ${bank_name} | Chq: ${cheque_number}`,
      debit     : parseFloat(amount),
      credit    : 0,
      transactionType  : 'Cheque In',
      referenceNumber  : cheque_number,
      invoiceNumber    : reference_no,
      partyName        : party_name || bank_name || null,
      referenceType    : 'INHAND_ADJUSTMENT',
      referenceId      : id,
      createdBy        : approvedBy
    });

    const [txnRow] = await connection.query(
      `SELECT id FROM finance_transactions
       WHERE reference_type = 'INHAND_ADJUSTMENT' AND reference_id = ?
         AND account_type = 'BANK'
       ORDER BY id DESC LIMIT 1`,
      [id]
    );
    finTxnId = txnRow[0]?.id;
  }

  if (!finTxnId) {
    throw new Error('Finance transaction was not recorded correctly.');
  }

  // ── Update inhand_adjustments ─────────────────────────────────────────
  const now = new Date();
  await connection.query(
    `UPDATE inhand_adjustments
     SET status = 'Approved', finance_txn_id = ?, posted_at = ?,
         approved_by = ?, approved_at = ?
     WHERE id = ?`,
    [finTxnId, now, approvedBy, now, id]
  );

  // ── Audit log ─────────────────────────────────────────────────────────
  await writeAuditLog(connection, {
    inhandId     : id,
    action       : 'APPROVED',
    performedBy  : approvedBy,
    details      : { finance_txn_id: finTxnId, amount, payment_type }
  });

  return finTxnId;
}

// ─────────────────────────────────────────────────────────────────────────────
// reverseInhand – runs inside an existing DB transaction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reverses an Approved Inhand posting by creating a contra-entry.
 *
 * @param {object} connection  – active mysql2 connection with an open transaction
 * @param {object} inhand      – full row from inhand_adjustments (must be Approved)
 * @param {number} cancelledBy – user ID of the canceller
 */
async function reverseInhand(connection, inhand, cancelledBy) {
  const { id, payment_type, company_id, bank_id, amount, reference_no, remark } = inhand;

  const now = new Date();
  const reversalRemark = `Reversal of Inhand – Ref: ${reference_no}`;

  let reversalTxnId;

  if (payment_type === 'Cash In') {
    await recordCashTransaction(connection, {
      companyId : company_id,
      date      : now.toISOString().slice(0, 10),
      remark    : reversalRemark,
      debit     : 0,
      credit    : parseFloat(amount),
      transactionType  : 'Inhand Reversal',
      referenceNumber  : reference_no,
      referenceType    : 'INHAND_REVERSAL',
      referenceId      : id,
      createdBy        : cancelledBy
    });

    const [txnRow] = await connection.query(
      `SELECT id FROM finance_transactions
       WHERE reference_type = 'INHAND_REVERSAL' AND reference_id = ?
         AND account_type = 'CASH'
       ORDER BY id DESC LIMIT 1`,
      [id]
    );
    reversalTxnId = txnRow[0]?.id;

  } else {
    await recordBankTransaction(connection, {
      bankId    : bank_id,
      date      : now.toISOString().slice(0, 10),
      remark    : reversalRemark,
      debit     : 0,
      credit    : parseFloat(amount),
      transactionType  : 'Inhand Reversal',
      referenceNumber  : reference_no,
      referenceType    : 'INHAND_REVERSAL',
      referenceId      : id,
      createdBy        : cancelledBy
    });

    const [txnRow] = await connection.query(
      `SELECT id FROM finance_transactions
       WHERE reference_type = 'INHAND_REVERSAL' AND reference_id = ?
         AND account_type = 'BANK'
       ORDER BY id DESC LIMIT 1`,
      [id]
    );
    reversalTxnId = txnRow[0]?.id;
  }

  // Update inhand row
  await connection.query(
    `UPDATE inhand_adjustments
     SET status = 'Cancelled', reversal_txn_id = ?,
         cancelled_by = ?, cancelled_at = ?
     WHERE id = ?`,
    [reversalTxnId, cancelledBy, now, id]
  );

  // Audit log
  await writeAuditLog(connection, {
    inhandId     : id,
    action       : 'REVERSED',
    performedBy  : cancelledBy,
    details      : { reversal_txn_id: reversalTxnId, amount, payment_type }
  });
}

module.exports = { generateReferenceNo, postInhand, reverseInhand, writeAuditLog };
