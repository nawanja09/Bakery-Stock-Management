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
// Collection (see collectionService.js) adds two SYSTEM accounts, "AR Account"
// and "Short/Excess Account" (other_ledgers.is_system = 1). They are
// debit-normal (other_ledgers.normal_balance = 'DEBIT'): their balance is
// SUM(debit) - SUM(credit). Every other ledger keeps normal_balance 'CREDIT', so
// the convention above - and every existing balance - is unchanged.
//
// Every function that writes takes an open transaction `connection`; none of
// them commit, so they join the caller's DB transaction.

const SOURCE_CASH_RECEIVE = 'CASH_RECEIVE';
const SOURCE_CASH_ISSUED = 'CASH_ISSUED';
const SOURCE_COLLECTION_AR = 'COLLECTION_AR';
const SOURCE_COLLECTION_SHORT_EXCESS = 'COLLECTION_SHORT_EXCESS';
const AR_ACCOUNT_NAME = 'AR Account';
const SHORT_EXCESS_ACCOUNT_NAME = 'Short/Excess Account';
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
    `SELECT id, name, status, is_system, normal_balance FROM other_ledgers WHERE id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
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
  return insertImpactRow(connection, {
    otherLedgerId, date, debit, credit, sourceType, sourceId, companyId, referenceNo, remark, createdBy
  });
};

/**
 * Creates a linked entry with an explicit debit/credit. Used by Collection,
 * where the side depends on the collection component (e.g. Short vs Excess).
 * Same one-entry-per-source guarantee as createImpact.
 * @returns {Promise<number>} the new other_ledger_transactions id
 */
const createImpactEntry = async (connection, {
  otherLedgerId, sourceType, sourceId, date, debit = 0, credit = 0, companyId = null,
  referenceNo = null, remark = null, createdBy = null
}) => {
  if (!sourceId) throw new OtherLedgerError('Source transaction id is required for an Other Ledger entry', 500);
  const d = round2(debit);
  const c = round2(credit);
  if (d < 0 || c < 0 || (d === 0) === (c === 0)) {
    throw new OtherLedgerError('An Other Ledger entry needs exactly one positive debit or credit', 500);
  }
  const existing = await getImpactBySource(connection, sourceType, sourceId, { forUpdate: true });
  if (existing) throw new OtherLedgerError('This transaction already has an Other Ledger entry', 409);
  return insertImpactRow(connection, {
    otherLedgerId, date, debit: d, credit: c, sourceType, sourceId, companyId, referenceNo, remark, createdBy
  });
};

const insertImpactRow = async (connection, {
  otherLedgerId, date, debit, credit, sourceType, sourceId, companyId, referenceNo, remark, createdBy
}) => {
  const [result] = await connection.query(
    `INSERT INTO other_ledger_transactions
       (other_ledger_id, transaction_date, debit, credit, source_type, source_id,
        company_id, reference_no, remark, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [otherLedgerId, date, debit, credit, sourceType, sourceId, companyId, referenceNo, remark, createdBy]
  );
  return result?.insertId ?? null;
};

/** The active system account with this name (AR Account / Short/Excess Account), locked. */
const requireSystemLedger = async (connection, name) => {
  const [rows] = await connection.query(
    `SELECT id, name, status, is_system, normal_balance FROM other_ledgers
      WHERE is_system = 1 AND LOWER(TRIM(name)) = LOWER(?) ORDER BY id ASC LIMIT 1 FOR UPDATE`,
    [name]
  );
  if (!rows.length) throw new OtherLedgerError(`The "${name}" Other Ledger account is missing`, 500);
  if (Number(rows[0].status) !== 1) throw new OtherLedgerError(`The "${name}" Other Ledger account is inactive`, 500);
  return rows[0];
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

/** SQL for one row's signed effect on its ledger's balance (needs aliases olt + ol). */
const BALANCE_EFFECT_SQL = `CASE WHEN ol.normal_balance = 'DEBIT'
       THEN CAST(olt.debit AS DECIMAL(14,2)) - CAST(olt.credit AS DECIMAL(14,2))
       ELSE CAST(olt.credit AS DECIMAL(14,2)) - CAST(olt.debit AS DECIMAL(14,2)) END`;

/**
 * Balance over active rows. normal_balance 'CREDIT' (default, every ledger that
 * existed before Collection) = credits - debits; 'DEBIT' = debits - credits.
 */
const getLedgerBalance = async (queryable, otherLedgerId) => {
  const [rows] = await queryable.query(
    `SELECT COALESCE(SUM(${BALANCE_EFFECT_SQL}), 0) AS balance
       FROM other_ledger_transactions olt
       JOIN other_ledgers ol ON ol.id = olt.other_ledger_id
      WHERE olt.other_ledger_id = ? AND olt.status = 1`,
    [otherLedgerId]
  );
  return round2(rows[0]?.balance);
};

/** Signed effect of one row on a ledger with this normal balance. */
const balanceEffect = (row, normalBalance = 'CREDIT') => {
  const debit = Number(row.debit) || 0;
  const credit = Number(row.credit) || 0;
  return normalBalance === 'DEBIT' ? debit - credit : credit - debit;
};

/** Running balance, oldest first; same-date rows ordered by created_at then id. */
const withRunningBalance = (rows, normalBalance = 'CREDIT', opening = 0) => {
  let running = round2(opening);
  return rows.map((row) => {
    running = Number((running + balanceEffect(row, normalBalance)).toFixed(2));
    return { ...row, balance: running };
  });
};

module.exports = {
  SOURCE_CASH_RECEIVE,
  SOURCE_CASH_ISSUED,
  SOURCE_COLLECTION_AR,
  SOURCE_COLLECTION_SHORT_EXCESS,
  AR_ACCOUNT_NAME,
  SHORT_EXCESS_ACCOUNT_NAME,
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
  createImpactEntry,
  requireSystemLedger,
  syncImpactFromSource,
  voidImpactForSource,
  recalculateCashBalance,
  BALANCE_EFFECT_SQL,
  getLedgerBalance,
  balanceEffect,
  withRunningBalance
};
