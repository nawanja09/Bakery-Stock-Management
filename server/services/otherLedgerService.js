// server/services/otherLedgerService.js
//
// Linked ledger impact for Other Ledgers (Director, AR, Short, Excess, ...).
//
// The SOURCE transaction is always the primary record: a finance_transactions
// (Cash Ledger) row with reference_type CASH_RECEIVE or CASH_ISSUED. The row in
// other_ledger_transactions is only its linked ledger impact, keyed by
// (source_type, source_id) which is UNIQUE - so a source can never have two
// impacts, edits update in place, and voids switch the same row off.
//
// Accounting convention (Other Ledger = amount owed to / settled with the party):
//   Cash Receive + Other Ledger : Cash DEBIT,  Other Ledger CREDIT
//   Cash Issued  + Other Ledger : Cash CREDIT, Other Ledger DEBIT
//   Balance = SUM(credit) - SUM(debit)   (never stored)
//
// Every function that writes takes an open transaction `connection`; none of
// them commit, so they join the caller's DB transaction.

const SOURCE_CASH_RECEIVE = 'CASH_RECEIVE';
const SOURCE_CASH_ISSUED = 'CASH_ISSUED';
const OTHER_LEDGER_RECEIVE_TYPE = 'Other Ledger'; // finance_transactions.transaction_type for receipts
const CASH_ISSUED_TYPE = 'Cash Issued'; // finance_transactions.transaction_type for payments out

class OtherLedgerError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'OtherLedgerError';
    this.statusCode = statusCode;
  }
}

const round2 = (value) => Number((Number.parseFloat(value ?? 0) || 0).toFixed(2));

const normalizeName = (name) => String(name ?? '').trim().replace(/\s+/g, ' ');

/** Debit/credit of the Other Ledger side for a given source type. */
const impactForSource = (sourceType, amount) => {
  const value = round2(amount);
  if (sourceType === SOURCE_CASH_RECEIVE) return { debit: 0, credit: value };
  if (sourceType === SOURCE_CASH_ISSUED) return { debit: value, credit: 0 };
  throw new OtherLedgerError('Unknown Other Ledger source type');
};

const getLedgerById = async (connection, id, { forUpdate = false } = {}) => {
  const [rows] = await connection.query(
    `SELECT id, name, status FROM other_ledgers WHERE id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
    [id]
  );
  return rows[0] || null;
};

/** Loads an Other Ledger that may be used for a NEW transaction (must be Active). */
const requireActiveLedger = async (connection, id) => {
  if (id === undefined || id === null || id === '') {
    throw new OtherLedgerError('Other Ledger is required');
  }
  const ledger = await getLedgerById(connection, id, { forUpdate: true });
  if (!ledger) throw new OtherLedgerError('Other Ledger not found', 404);
  if (Number(ledger.status) !== 1) {
    throw new OtherLedgerError('This Other Ledger is inactive and cannot be used for new transactions');
  }
  return ledger;
};

/** Linked impact row for a source transaction (or null). */
const getImpactBySource = async (connection, sourceType, sourceId, { forUpdate = false } = {}) => {
  const [rows] = await connection.query(
    `SELECT * FROM other_ledger_transactions WHERE source_type = ? AND source_id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
    [sourceType, sourceId]
  );
  return rows[0] || null;
};

/** Id of the row the last INSERT on this connection created (MySQL/MariaDB). */
const lastInsertId = async (connection) => {
  const [rows] = await connection.query('SELECT LAST_INSERT_ID() AS id');
  return Number(rows[0]?.id) || null;
};

/**
 * Creates the linked impact for a source transaction. Fails (rather than
 * duplicating) if the source already has one.
 */
const createImpact = async (connection, {
  otherLedgerId, sourceType, sourceId, date, amount, companyId = null,
  referenceNo = null, remark = null, createdBy = null
}) => {
  if (!sourceId) throw new OtherLedgerError('Source transaction id is required for an Other Ledger entry', 500);
  const existing = await getImpactBySource(connection, sourceType, sourceId, { forUpdate: true });
  if (existing) throw new OtherLedgerError('This transaction already has an Other Ledger entry', 409);

  const { debit, credit } = impactForSource(sourceType, amount);
  await connection.query(
    `INSERT INTO other_ledger_transactions
       (other_ledger_id, transaction_date, debit, credit, source_type, source_id,
        company_id, reference_no, remark, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [otherLedgerId, date, debit, credit, sourceType, sourceId, companyId, referenceNo, remark, createdBy]
  );
};

/**
 * Re-syncs the linked impact after its source row was edited (amount, date,
 * reference, remark). No-op when the source has no linked impact - which is
 * exactly the case for every pre-existing Cash Receive. Updates the SAME row;
 * never inserts.
 *
 * @returns {Promise<boolean>} true when a linked impact existed and was updated
 */
const syncImpactFromSource = async (connection, sourceType, sourceId, { date, amount, referenceNo, remark }) => {
  const impact = await getImpactBySource(connection, sourceType, sourceId, { forUpdate: true });
  if (!impact) return false;

  const { debit, credit } = impactForSource(sourceType, amount);
  await connection.query(
    `UPDATE other_ledger_transactions
        SET transaction_date = ?, debit = ?, credit = ?, reference_no = ?, remark = ?
      WHERE id = ?`,
    [date, debit, credit, referenceNo ?? null, remark ?? null, impact.id]
  );
  return true;
};

/**
 * Voids the linked impact when its source is voided (soft: status = 0, history
 * kept). Excluded from balances/ledger views, like voided finance rows.
 */
const voidImpactForSource = async (connection, sourceType, sourceId) => {
  const impact = await getImpactBySource(connection, sourceType, sourceId, { forUpdate: true });
  if (!impact) return false;
  await connection.query('UPDATE other_ledger_transactions SET status = 0 WHERE id = ?', [impact.id]);
  return true;
};

/**
 * Re-runs the stored per-row balance_after + cash_accounts.current_balance for
 * a company, in the existing ledger order. Same algorithm the Adjustment
 * module uses after an in-place edit, so back-dated edits stay consistent.
 */
const recalculateCashBalance = async (connection, companyId) => {
  await connection.query('SELECT id FROM cash_accounts WHERE company_id = ? FOR UPDATE', [companyId]);
  const [rows] = await connection.query(
    `SELECT id, debit, credit FROM finance_transactions
      WHERE account_type = 'CASH' AND company_id = ? AND status = 1
      ORDER BY transaction_date ASC, created_at ASC, id ASC FOR UPDATE`,
    [companyId]
  );
  let balance = 0;
  for (const row of rows) {
    balance = Number((balance + Number(row.debit || 0) - Number(row.credit || 0)).toFixed(2));
    await connection.query('UPDATE finance_transactions SET balance_after = ? WHERE id = ?', [balance, row.id]);
  }
  await connection.query('UPDATE cash_accounts SET current_balance = ? WHERE company_id = ?', [balance, companyId]);
  return balance;
};

/** Balance = credits - debits over active rows, optionally up to a date. */
const getLedgerBalance = async (queryable, otherLedgerId) => {
  const [rows] = await queryable.query(
    `SELECT COALESCE(SUM(CAST(credit AS DECIMAL(14,2)) - CAST(debit AS DECIMAL(14,2))), 0) AS balance
       FROM other_ledger_transactions
      WHERE other_ledger_id = ? AND status = 1`,
    [otherLedgerId]
  );
  return round2(rows[0]?.balance);
};

/** Running balance, oldest first; same-date rows ordered by created_at then id. */
const withRunningBalance = (rows) => {
  let running = 0;
  return rows.map((row) => {
    running = Number((running + (Number(row.credit) || 0) - (Number(row.debit) || 0)).toFixed(2));
    return { ...row, balance: running };
  });
};

module.exports = {
  SOURCE_CASH_RECEIVE,
  SOURCE_CASH_ISSUED,
  OTHER_LEDGER_RECEIVE_TYPE,
  CASH_ISSUED_TYPE,
  OtherLedgerError,
  round2,
  normalizeName,
  impactForSource,
  getLedgerById,
  requireActiveLedger,
  getImpactBySource,
  lastInsertId,
  createImpact,
  syncImpactFromSource,
  voidImpactForSource,
  recalculateCashBalance,
  getLedgerBalance,
  withRunningBalance
};
