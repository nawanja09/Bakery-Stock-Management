const pool = require('../config/db');

class InsufficientBalanceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InsufficientBalanceError';
  }
}

/**
 * Gets the current balance for a cash account (by companyId).
 */
const getCashBalance = async (companyId) => {
  const [rows] = await pool.query(
    'SELECT current_balance FROM cash_accounts WHERE company_id = ?',
    [companyId]
  );
  return rows.length ? parseFloat(rows[0].current_balance) : 0;
};

/**
 * Gets the current balance for a bank account (by bankId).
 */
const getBankBalance = async (bankId) => {
  const [rows] = await pool.query(
    'SELECT current_balance FROM bank_details WHERE id = ?',
    [bankId]
  );
  return rows.length ? parseFloat(rows[0].current_balance) : 0;
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
  // Lock the cash_accounts row for this company
  const [cashRows] = await connection.query(
    'SELECT current_balance FROM cash_accounts WHERE company_id = ? FOR UPDATE',
    [companyId]
  );

  if (cashRows.length === 0) {
    throw new Error('Cash account not found for this company. Please set an opening balance first.');
  }

  const currentBalance = parseFloat(cashRows[0].current_balance);
  const debitAmt = parseFloat(debit) || 0;
  const creditAmt = parseFloat(credit) || 0;
  const newBalance = currentBalance + debitAmt - creditAmt;

  if (newBalance < 0 && creditAmt > 0) {
    throw new InsufficientBalanceError('Insufficient cash balance for this transaction.');
  }

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
  // Lock the bank_details row
  const [bankRows] = await connection.query(
    'SELECT current_balance, company FROM bank_details WHERE id = ? FOR UPDATE',
    [bankId]
  );

  if (bankRows.length === 0) {
    throw new Error('Bank account not found.');
  }

  const currentBalance = parseFloat(bankRows[0].current_balance);
  const companyName = bankRows[0].company;
  
  // Find the company_id for the bank account's company name
  const [compRows] = await connection.query('SELECT id FROM company WHERE name = ?', [companyName]);
  const companyId = compRows.length ? compRows[0].id : 1; // Default fallback if needed

  const debitAmt = parseFloat(debit) || 0;
  const creditAmt = parseFloat(credit) || 0;
  const newBalance = currentBalance + debitAmt - creditAmt;

  if (newBalance < 0 && creditAmt > 0) {
    throw new InsufficientBalanceError('Insufficient bank balance for this transaction.');
  }

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