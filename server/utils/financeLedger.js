const pool = require('../config/db');
const periodLock = require('../services/periodLock');
const requestContext = require('../services/requestContext');
const { toYmd } = require('./dateOnly');
const moneyMath = require('./money');

class InsufficientBalanceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InsufficientBalanceError';
    this.status = 400;
    this.code = 'INSUFFICIENT_CASH';
  }
}

const money = (value) => Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Cash in hand cannot be negative (audit finding R5): a posting that would take the cash book's
// total below zero is refused. Only the TOTAL counts, not the balance at the posting's date -
// payments are often recorded before the collection that covers them is approved, so past dates
// do dip below zero in normal use. Money coming in is never refused. Bank accounts can have an
// overdraft and are not checked. CASH_ALLOW_NEGATIVE=on in .env switches the check off.
const cashOverdrawn = (currentBalance, newBalance) =>
  String(process.env.CASH_ALLOW_NEGATIVE || '').toLowerCase() !== 'on' && newBalance < -0.005 && newBalance < currentBalance;

const refuseOverdraft = (currentBalance, newBalance, spent) => {
  const error = new InsufficientBalanceError(
    `Not enough cash in hand: this payment of Rs. ${money(spent)} needs more than the Rs. ${money(Math.max(currentBalance, 0))} available. `
    + 'Record the cash received first (for example approve the collection), then try again.'
  );
  const store = requestContext.currentStore();
  if (store) store.insufficientError = error; // so a controller's catch-all 500 still reaches the user as this 400
  return error;
};

/**
 * Gets the current balance for a cash account from the ledger itself.
 * This keeps the displayed Cash In Hand value aligned with the posted
 * finance_transactions rows, includingreversals and chronological cash ins/outs.
 */
const getCashBalance = async (companyId) => {
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(CAST(debit AS DECIMAL(14,2)) - CAST(credit AS DECIMAL(14,2))), 0) AS balance
     FROM finance_transactions
     WHERE account_type = 'CASH' AND company_id = ? AND status = 1`,
    [companyId]
  );

  return moneyMath.round2(rows[0]?.balance);
};

/**
 * Gets the current balance for a bank account from the ledger itself.
 * This keeps the selected account's current balance aligned with the posted
 * finance_transactions rows and any reversals, instead of a stale cached value.
 */
const getBankBalance = async (bankId) => {
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(CAST(debit AS DECIMAL(14,2)) - CAST(credit AS DECIMAL(14,2))), 0) AS balance
     FROM finance_transactions
     WHERE account_type = 'BANK' AND bank_id = ? AND status = 1`,
    [bankId]
  );

  return moneyMath.round2(rows[0]?.balance);
};

// Exact decimal parse (utils/money.js): not a number -> 0, otherwise at most 4 decimals.
const safeNumber = (value) => moneyMath.round(value);

const calculateDateRangeBalance = ({ closingBalance = 0, creditAfterDate = 0, debitAfterDate = 0 }) => {
  const base = safeNumber(closingBalance);
  const credits = safeNumber(creditAfterDate);
  const debits = safeNumber(debitAfterDate);
  return moneyMath.round2(moneyMath.sub(moneyMath.add(base, debits), credits));
};

const calculateRunningBalances = (rows = [], openingBalance = 0) => {
  let previousBalance = safeNumber(openingBalance);

  return rows.map((row) => {
    const debit = safeNumber(row.debit);
    const credit = safeNumber(row.credit);
    previousBalance = moneyMath.round2(moneyMath.sub(moneyMath.add(previousBalance, debit), credit));

    return {
      ...row,
      balance: previousBalance
    };
  });
};

/**
 * Re-computes the stored balance_after of every ACTIVE row of one account, in
 * ledger order (transaction_date, created_at, id) - the order the Cash / Bank
 * ledger screens show - and, with it, the account's cached current_balance.
 *
 * Call it after anything that changes a row's date, amount or status, and after
 * posting a BACK-DATED row: that row sits in the middle of the ledger, so every
 * row after it has a new running balance. Needs an open transaction.
 */
const rebuildBalanceAfter = async (connection, accountType, accountId) => {
  const isBank = accountType === 'BANK';
  const keyColumn = isBank ? 'bank_id' : 'company_id';
  await connection.query(
    `UPDATE finance_transactions ft
       JOIN (
         SELECT id,
                SUM(CAST(debit AS DECIMAL(14,2)) - CAST(credit AS DECIMAL(14,2)))
                  OVER (ORDER BY transaction_date, created_at, id ROWS UNBOUNDED PRECEDING) AS running
           FROM finance_transactions
          WHERE account_type = ? AND ${keyColumn} = ? AND status = 1
       ) r ON r.id = ft.id
        SET ft.balance_after = r.running
      WHERE ft.balance_after <> r.running`,
    [accountType, accountId]
  );
  const [rows] = await connection.query(
    `SELECT COALESCE(SUM(CAST(debit AS DECIMAL(14,2)) - CAST(credit AS DECIMAL(14,2))), 0) AS balance
       FROM finance_transactions WHERE account_type = ? AND ${keyColumn} = ? AND status = 1`,
    [accountType, accountId]
  );
  const balance = moneyMath.round2(rows[0]?.balance);
  await connection.query(
    isBank ? 'UPDATE bank_details SET current_balance = ? WHERE id = ?'
           : 'UPDATE cash_accounts SET current_balance = ? WHERE company_id = ?',
    [balance, accountId]
  );
  return balance;
};

/**
 * balance_after for a row about to be inserted: the account's balance AFTER that
 * row, in ledger order. A new row sorts after every row dated on or before its own
 * date, so that is the sum of those rows plus the row itself - not the account's
 * total, which also counts rows dated later.
 */
const balanceAtDate = async (connection, accountType, accountId, date, effect) => {
  const keyColumn = accountType === 'BANK' ? 'bank_id' : 'company_id';
  const [rows] = await connection.query(
    `SELECT COALESCE(SUM(CAST(debit AS DECIMAL(14,2)) - CAST(credit AS DECIMAL(14,2))), 0) AS balance
       FROM finance_transactions
      WHERE account_type = ? AND ${keyColumn} = ? AND status = 1 AND transaction_date <= ?`,
    [accountType, accountId, date]
  );
  return moneyMath.round2(moneyMath.add(rows[0]?.balance, effect));
};

const hasRowsAfterDate = async (connection, accountType, accountId, date) => {
  const keyColumn = accountType === 'BANK' ? 'bank_id' : 'company_id';
  const [rows] = await connection.query(
    `SELECT 1 FROM finance_transactions
      WHERE account_type = ? AND ${keyColumn} = ? AND status = 1 AND transaction_date > ? LIMIT 1`,
    [accountType, accountId, date]
  );
  return rows.length > 0;
};

/** rebuildBalanceAfter for each distinct account in rows of { account_type, company_id, bank_id }. */
const refreshAccounts = async (connection, accounts) => {
  const done = new Set();
  for (const account of accounts) {
    const type = account.account_type;
    const id = type === 'BANK' ? account.bank_id : account.company_id;
    if (!type || !id || done.has(`${type}:${id}`)) continue;
    done.add(`${type}:${id}`);
    await rebuildBalanceAfter(connection, type, id);
  }
};

/**
 * After a ledger row was edited, moved to another date / account, or voided in
 * place: refresh the stored running balances of every account that row touches
 * (voided rows included) and of `before` (the account(s) it was in earlier).
 */
const refreshBalancesOfReference = async (connection, referenceTypes, referenceId, before = []) => {
  const [rows] = await connection.query(
    `SELECT DISTINCT account_type, company_id, bank_id FROM finance_transactions
      WHERE reference_type IN (?) AND reference_id = ?`,
    [[].concat(referenceTypes), referenceId]
  );
  await refreshAccounts(connection, [...before, ...rows]);
};

/**
 * Records a cash transaction and updates the running balance.
 * Requires an active transaction connection.
 */
const recordCashTransaction = async (connection, {
  companyId,
  date,
  remark,
  debit = 0,
  credit = 0,
  transactionType,
  referenceNumber = null,
  invoiceNumber = null,
  partyName = null,
  referenceType = null,
  referenceId = null,
  createdBy,
  periodActor = null,
  system = false
}) => {
  // Period close: nothing is posted into a closed month (services/periodLock.js).
  // periodActor = the signed-in user when the row is attributed to someone else.
  await periodLock.assertOpen(connection, periodActor ?? createdBy, date, { system });

  const [balanceRows] = await connection.query(
    `SELECT COALESCE(SUM(CAST(debit AS DECIMAL(14,2)) - CAST(credit AS DECIMAL(14,2))), 0) AS current_balance
     FROM finance_transactions
     WHERE account_type = 'CASH' AND company_id = ? AND status = 1 FOR UPDATE`,
    [companyId]
  );

  const currentBalance = moneyMath.round2(balanceRows[0]?.current_balance);
  const debitAmt = moneyMath.round2(debit);
  const creditAmt = moneyMath.round2(credit);
  const newBalance = moneyMath.round2(moneyMath.sub(moneyMath.add(currentBalance, debitAmt), creditAmt));
  // The row's own balance_after is the balance at ITS date, not the account total.
  const ymd = toYmd(date);
  const balanceAfter = ymd
    ? await balanceAtDate(connection, 'CASH', companyId, ymd, moneyMath.sub(debitAmt, creditAmt))
    : newBalance;

  if (cashOverdrawn(currentBalance, newBalance)) throw refuseOverdraft(currentBalance, newBalance, moneyMath.sub(creditAmt, debitAmt));

  const direction = debitAmt > 0 ? 'IN' : 'OUT';

  await connection.query(
    `INSERT INTO finance_transactions 
      (account_type, company_id, transaction_date, transaction_type, 
       reference_number, invoice_number, party_name, transaction_direction, 
       remark, debit, credit, balance_after, reference_type, reference_id, created_by)
     VALUES ('CASH', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      companyId, date, transactionType, referenceNumber, invoiceNumber, partyName,
      direction, remark, debitAmt, creditAmt, balanceAfter, referenceType, referenceId, createdBy
    ]
  );

  await connection.query(
    'UPDATE cash_accounts SET current_balance = ? WHERE company_id = ?',
    [newBalance, companyId]
  );
  // A back-dated row sits in the middle of the ledger: every later row's running balance changes.
  if (ymd && await hasRowsAfterDate(connection, 'CASH', companyId, ymd)) {
    await rebuildBalanceAfter(connection, 'CASH', companyId);
  }

  return newBalance;
};

/**
 * Records a bank transaction and updates the running balance.
 * Requires an active transaction connection.
 */
const recordBankTransaction = async (connection, {
  bankId,
  date,
  remark,
  debit = 0,
  credit = 0,
  transactionType,
  referenceNumber = null,
  invoiceNumber = null,
  partyName = null,
  referenceType = null,
  referenceId = null,
  createdBy,
  periodActor = null,
  system = false
}) => {
  // Period close: nothing is posted into a closed month (services/periodLock.js).
  // periodActor = the signed-in user when the row is attributed to someone else.
  await periodLock.assertOpen(connection, periodActor ?? createdBy, date, { system });

  const [bankRows] = await connection.query(
    "SELECT company FROM bank_details WHERE id = ? AND status = 'Active' AND COALESCE(record_status, 1) = 1 FOR UPDATE",
    [bankId]
  );

  if (bankRows.length === 0) {
    throw new Error('Bank account not found.');
  }

  const [balanceRows] = await connection.query(
    `SELECT COALESCE(SUM(CAST(debit AS DECIMAL(14,2)) - CAST(credit AS DECIMAL(14,2))), 0) AS current_balance
     FROM finance_transactions
     WHERE account_type = 'BANK' AND bank_id = ? AND status = 1 FOR UPDATE`,
    [bankId]
  );

  const currentBalance = moneyMath.round2(balanceRows[0]?.current_balance);
  const companyName = bankRows[0].company;

  const [compRows] = await connection.query('SELECT id FROM company WHERE name = ?', [companyName]);
  const companyId = compRows.length ? compRows[0].id : 1;

  const debitAmt = moneyMath.round2(debit);
  const creditAmt = moneyMath.round2(credit);
  const newBalance = moneyMath.round2(moneyMath.sub(moneyMath.add(currentBalance, debitAmt), creditAmt));
  // The row's own balance_after is the balance at ITS date, not the account total.
  const ymd = toYmd(date);
  const balanceAfter = ymd
    ? await balanceAtDate(connection, 'BANK', bankId, ymd, moneyMath.sub(debitAmt, creditAmt))
    : newBalance;

  const direction = debitAmt > 0 ? 'IN' : 'OUT';

  await connection.query(
    `INSERT INTO finance_transactions 
      (account_type, company_id, bank_id, transaction_date, transaction_type, 
       reference_number, invoice_number, party_name, transaction_direction, 
       remark, debit, credit, balance_after, reference_type, reference_id, created_by)
     VALUES ('BANK', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      companyId, bankId, date, transactionType, referenceNumber, invoiceNumber, partyName,
      direction, remark, debitAmt, creditAmt, balanceAfter, referenceType, referenceId, createdBy
    ]
  );

  await connection.query(
    'UPDATE bank_details SET current_balance = ? WHERE id = ?',
    [newBalance, bankId]
  );
  // A back-dated row sits in the middle of the ledger: every later row's running balance changes.
  if (ymd && await hasRowsAfterDate(connection, 'BANK', bankId, ymd)) {
    await rebuildBalanceAfter(connection, 'BANK', bankId);
  }

  return newBalance;
};

module.exports = {
  getCashBalance,
  getBankBalance,
  calculateDateRangeBalance,
  calculateRunningBalances,
  recordCashTransaction,
  recordBankTransaction,
  InsufficientBalanceError,
  rebuildBalanceAfter,
  refreshAccounts,
  refreshBalancesOfReference
};