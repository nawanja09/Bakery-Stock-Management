const crypto = require('crypto');

class DuplicateReferenceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DuplicateReferenceError';
  }
}

// Some deployments do not install every optional finance module. A missing
// optional table must not block edits to an otherwise available module.
const unavailableReferenceTables = new Set();
let referenceLocksUnavailable = false;

/**
 * Takes a row lock on the normalised reference number (table reference_locks) that the
 * transaction keeps until it commits or rolls back. Two requests saving the same number
 * therefore run one after the other, and the second one finds the first one's record.
 * Outside a transaction the lock is released at once (nothing to protect there).
 */
const lockReference = async (connection, ref) => {
  if (referenceLocksUnavailable) return;
  const normalised = ref.trim().toLowerCase();
  // PRIMARY KEY is VARCHAR(100): hash anything longer so distinct long numbers never collide by truncation.
  const key = normalised.length <= 100
    ? normalised
    : `sha256:${crypto.createHash('sha256').update(normalised).digest('hex')}`;
  try {
    await connection.query(
      'INSERT INTO reference_locks (ref_norm) VALUES (?) ON DUPLICATE KEY UPDATE locked_at = CURRENT_TIMESTAMP',
      [key]
    );
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      referenceLocksUnavailable = true;
      console.warn('reference_locks table is missing (migrations/041_reference_locks.sql): duplicate references are checked without a lock');
      return;
    }
    throw error;
  }
};

// The numbers committed by other transactions RIGHT NOW. The transaction's own connection reads
// from the snapshot it took earlier (REPEATABLE READ), which cannot show a record another request
// committed after that - so the check is repeated here on a separate connection. A plain read:
// it takes no locks on the 11 tables.
const committedReader = (connection) => {
  const pool = require('../config/db');
  return connection === pool ? connection : pool;
};

/**
 * Checks if a given reference number is already used in any of the financial transactions across the system.
 * 
 * @param {Object} connection - The database connection to use (can be a transaction connection or pool)
 * @param {string} referenceNo - The reference number to check (e.g. invoice no, voucher no)
 * @param {Object} excludeConfig - Configuration to exclude the current record being updated
 * @param {string} excludeConfig.table - The name of the table to exclude from the check
 * @param {number|string} excludeConfig.id - The ID of the record to exclude in the table
 * @throws {DuplicateReferenceError} If the reference number already exists
 */
const checkDuplicateReference = async (connection, referenceNo, excludeConfig = {}) => {
  if (!referenceNo) return;
  const ref = String(referenceNo).trim();
  if (!ref) return;

  const queries = [
    { table: 'purchases', column: 'invoice_no' },
    { table: 'petty_cash_vouchers', column: 'voucher_number', softDeleted: true },
    { table: 'cheque_expenses', column: 'voucher_number', softDeleted: true },
    { table: 'online_expense_payments', column: 'voucher_number', softDeleted: true },
    { table: 'online_expense_payments', column: 'reference_number', softDeleted: true },
    { table: 'payment_history', column: 'voucher_number' },
    { table: 'supplier_overpayments', column: 'voucher_number' },
    { table: 'supplier_overpayments', column: 'reference_number' },
    { table: 'petty_cash_reimbursements', column: 'reference_number' },
    { table: 'bank_charges', column: 'reference_number', softDeleted: true },
    { table: 'inhand_adjustments', column: 'reference_no' }
  ];

  // Source transactions often have a matching finance-ledger row with the
  // same number. Include ledger-only entries only for direct ledger saves;
  // otherwise an edit would incorrectly detect its own ledger mirror.
  if (excludeConfig.includeLedger) {
    queries.push(
      { table: 'finance_transactions', column: 'reference_number' },
      { table: 'finance_transactions', column: 'invoice_number' }
    );
  }

  await lockReference(connection, ref);

  const readers = [connection];
  const latest = committedReader(connection);
  if (latest !== connection) readers.push(latest);

  for (const reader of readers) for (const { table, column, softDeleted } of queries) {
    if (unavailableReferenceTables.has(table)) continue;

    // Treat surrounding whitespace and letter case consistently, so " INV-1 "
    // and "inv-1" cannot be used to bypass the validation.
    // A soft-deleted voucher no longer holds its number (as when it was removed for good).
    let query = `SELECT id FROM ?? WHERE LOWER(TRIM(??)) = LOWER(?)${softDeleted ? ' AND is_deleted = 0' : ''}`;
    let params = [table, column, ref];

    // If updating an existing record, exclude its ID from the check for its specific table
    if (excludeConfig.table === table && excludeConfig.id) {
      query += ` AND id != ?`;
      params.push(excludeConfig.id);
    }

    query += ` LIMIT 1`;

    let rows;
    try {
      [rows] = await reader.query(query, params);
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_FIELD_ERROR') {
        unavailableReferenceTables.add(table);
        console.warn(`Skipping unavailable reference-validation table: ${table}`);
        continue;
      }
      throw error;
    }
    
    if (rows && rows.length > 0) {
      throw new DuplicateReferenceError('Duplicate reference number. This number already exists and cannot be used again.');
    }
  }
};

module.exports = {
  checkDuplicateReference,
  lockReference,
  DuplicateReferenceError
};
