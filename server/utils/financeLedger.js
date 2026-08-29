const pool = require('../config/db');

class InsufficientBalanceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InsufficientBalanceError';
  }
}

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

  const balance = Number.parseFloat(rows[0]?.balance ?? 0) || 0;
  return Number(balance.toFixed(2));
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

  const balance = Number.parseFloat(rows[0]?.balance ?? 0) || 0;
  return Number(balance.toFixed(2));
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
  createdBy
}) => {
  const [balanceRows] = await connection.query(
    `SELECT COALESCE(SUM(CAST(debit AS DECIMAL(14,2)) - CAST(credit AS DECIMAL(14,2))), 0) AS current_balance
     FROM finance_transactions
     WHERE account_type = 'CASH' AND company_id = ? AND status = 1 FOR UPDATE`,
    [companyId]
  );

  const currentBalance = Number.parseFloat(balanceRows[0]?.current_balance ?? 0) || 0;
  const debitAmt = parseFloat(debit) || 0;
  const creditAmt = parseFloat(credit) || 0;
  const newBalance = Number((currentBalance + debitAmt - creditAmt).toFixed(2));

  const direction = debitAmt > 0 ? 'IN' : 'OUT';

  await connection.query(
    `INSERT INTO finance_transactions 
      (account_type, company_id, transaction_date, transaction_type, 
       reference_number, invoice_number, party_name, transaction_direction, 
       remark, debit, credit, balance_after, reference_type, reference_id, created_by)
     VALUES ('CASH', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      companyId, date, transactionType, referenceNumber, invoiceNumber, partyName,
      direction, remark, debitAmt, creditAmt, newBalance, referenceType, referenceId, createdBy
    ]
  );

  await connection.query(
    'UPDATE cash_accounts SET current_balance = ? WHERE company_id = ?',
    [newBalance, companyId]
  );

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
  createdBy
}) => {
  const [bankRows] = await connection.query(
    'SELECT company FROM bank_details WHERE id = ? AND record_status = 1 FOR UPDATE',
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

  const currentBalance = Number.parseFloat(balanceRows[0]?.current_balance ?? 0) || 0;
  const companyName = bankRows[0].company;

  const [compRows] = await connection.query('SELECT id FROM company WHERE name = ?', [companyName]);
  const companyId = compRows.length ? compRows[0].id : 1;

  const debitAmt = parseFloat(debit) || 0;
  const creditAmt = parseFloat(credit) || 0;
  const newBalance = Number((currentBalance + debitAmt - creditAmt).toFixed(2));

  const direction = debitAmt > 0 ? 'IN' : 'OUT';

  await connection.query(
    `INSERT INTO finance_transactions 
      (account_type, company_id, bank_id, transaction_date, transaction_type, 
       reference_number, invoice_number, party_name, transaction_direction, 
       remark, debit, credit, balance_after, reference_type, reference_id, created_by)
     VALUES ('BANK', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      companyId, bankId, date, transactionType, referenceNumber, invoiceNumber, partyName,
      direction, remark, debitAmt, creditAmt, newBalance, referenceType, referenceId, createdBy
    ]
  );

  await connection.query(
    'UPDATE bank_details SET current_balance = ? WHERE id = ?',
    [newBalance, bankId]
  );

  return newBalance;
};

module.exports = {
  getCashBalance,
  getBankBalance,
  recordCashTransaction,
  recordBankTransaction
};