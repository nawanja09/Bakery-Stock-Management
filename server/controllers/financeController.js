// server/controllers/financeController.js
const pool = require('../config/db');
const {
  recordCashTransaction,
  recordBankTransaction,
  getCashBalance,
  getBankBalance
} = require('../utils/financeLedger');
const { checkDuplicateReference, DuplicateReferenceError } = require('../services/referenceValidationService');

const LEDGER_SELECT = `
  SELECT
    ft.id,
    DATE_FORMAT(ft.transaction_date, '%Y-%m-%d') AS date,
    ft.transaction_type,
    ft.transaction_direction AS direction,
    ft.reference_number,
    ft.invoice_number,
    ft.party_name,
    ft.remark,
    ft.debit,
    ft.credit,
    ft.balance_after AS balance,
    u.name AS created_by_name,
    ft.created_at
  FROM finance_transactions ft
  LEFT JOIN users u ON ft.created_by = u.id
`;

// Build the WHERE clause + params for the optional ledger filters shared by
// both Cash and Bank ledgers (dateFrom, dateTo, referenceNumber, transactionType).
const buildLedgerFilters = (query) => {
  const clauses = [];
  const params = [];
  if (query.dateFrom) {
    clauses.push('ft.transaction_date >= ?');
    params.push(query.dateFrom);
  }
  if (query.dateTo) {
    clauses.push('ft.transaction_date <= ?');
    params.push(query.dateTo);
  }
  if (query.referenceNumber) {
    clauses.push('(ft.reference_number LIKE ? OR ft.invoice_number LIKE ?)');
    params.push(`%${query.referenceNumber}%`, `%${query.referenceNumber}%`);
  }
  if (query.transactionType) {
    clauses.push('ft.transaction_type = ?');
    params.push(query.transactionType);
  }
  return { clauses, params };
};

// ---------------------------------------------------------------- Cash -----

// GET /api/finance/cash/balance/:companyId
const getCashBalanceForCompany = async (req, res) => {
  try {
    const balance = await getCashBalance(req.params.companyId);
    res.json({ company_id: parseInt(req.params.companyId), balance });
  } catch (error) {
    console.error('Error fetching cash balance:', error);
    res.status(500).json({ error: 'Failed to fetch cash balance' });
  }
};

// GET /api/finance/cash/ledger/:companyId?dateFrom=&dateTo=&referenceNumber=&transactionType=
const getCashLedger = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { clauses, params } = buildLedgerFilters(req.query);

    let query = `${LEDGER_SELECT} WHERE ft.account_type = 'CASH' AND ft.company_id = ?`;
    const allParams = [companyId, ...params];
    if (clauses.length) query += ` AND ${clauses.join(' AND ')}`;
    query += ' ORDER BY ft.transaction_date ASC, ft.id ASC';

    const [rows] = await pool.query(query, allParams);
    const balance = await getCashBalance(companyId);
    res.json({ transactions: rows, current_balance: balance });
  } catch (error) {
    console.error('Error fetching cash ledger:', error);
    res.status(500).json({ error: 'Failed to fetch cash ledger' });
  }
};

// POST /api/finance/cash/receive - Cash Receive (Cash In)
const receiveCash = async (req, res) => {
  const { company_id, date, amount, receive_type, reference_number, remark, created_by } = req.body;

  if (!company_id) return res.status(400).json({ error: 'Company is required' });
  if (!date) return res.status(400).json({ error: 'Date is required' });
  if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });
  if (!receive_type) return res.status(400).json({ error: 'Receive type is required' });
  if (!created_by) return res.status(400).json({ error: 'Created by is required' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await checkDuplicateReference(connection, reference_number, { includeLedger: true });
    const balance = await recordCashTransaction(connection, {
      companyId: company_id,
      date,
      remark: remark || null,
      debit: parseFloat(amount),
      transactionType: receive_type,
      referenceNumber: reference_number || null,
      referenceType: 'CASH_RECEIVE',
      createdBy: created_by
    });
    await connection.commit();
    res.status(201).json({ message: 'Cash receipt recorded successfully!', balance });
  } catch (error) {
    await connection.rollback();
    console.error('Error recording cash receipt:', error);
    res.status(error.name === 'InsufficientBalanceError' || error.name === 'DuplicateReferenceError' ? 400 : 500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

// POST /api/finance/cash/opening-balance - one-time (or edit-while-still-only-entry) setup
const setCashOpeningBalance = async (req, res) => {
  const { company_id, date, amount, created_by } = req.body;

  if (!company_id) return res.status(400).json({ error: 'Company is required' });
  if (!date) return res.status(400).json({ error: 'Date is required' });
  if (amount === undefined || amount === null || parseFloat(amount) < 0) {
    return res.status(400).json({ error: 'A valid opening balance amount is required' });
  }
  if (!created_by) return res.status(400).json({ error: 'Created by is required' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query(
      "SELECT id, transaction_type FROM finance_transactions WHERE account_type = 'CASH' AND company_id = ? FOR UPDATE",
      [company_id]
    );

    if (existing.length > 0 && !(existing.length === 1 && existing[0].transaction_type === 'Opening Balance')) {
      await connection.rollback();
      return res.status(409).json({
        error: 'Opening balance can only be set before other transactions exist. Use Cash Receive/Transfer to adjust the balance instead.'
      });
    }

    // If the only existing entry is a prior opening balance, remove it (and
    // its effect on the running balance) before re-inserting the new one.
    if (existing.length === 1) {
      await connection.query('DELETE FROM finance_transactions WHERE id = ?', [existing[0].id]);
      await connection.query('UPDATE cash_accounts SET current_balance = 0 WHERE company_id = ?', [company_id]);
    }

    const balance = await recordCashTransaction(connection, {
      companyId: company_id,
      date,
      remark: 'Opening Balance',
      debit: parseFloat(amount),
      transactionType: 'Opening Balance',
      referenceType: 'OPENING_BALANCE',
      createdBy: created_by
    });

    await connection.commit();
    res.status(201).json({ message: 'Cash opening balance set successfully!', balance });
  } catch (error) {
    await connection.rollback();
    console.error('Error setting cash opening balance:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  } finally {
    connection.release();
  }
};

// ---------------------------------------------------------------- Bank -----

// GET /api/finance/bank/balance/:bankId
const getBankBalanceForAccount = async (req, res) => {
  try {
    const balance = await getBankBalance(req.params.bankId);
    res.json({ bank_id: parseInt(req.params.bankId), balance });
  } catch (error) {
    console.error('Error fetching bank balance:', error);
    res.status(500).json({ error: 'Failed to fetch bank balance' });
  }
};

// GET /api/finance/bank/ledger/:bankId?dateFrom=&dateTo=&referenceNumber=&transactionType=
const getBankLedger = async (req, res) => {
  try {
    const { bankId } = req.params;
    const [bankRows] = await pool.query(
      'SELECT id, bank_name, account_number, company, current_balance FROM bank_details WHERE id = ?',
      [bankId]
    );
    if (bankRows.length === 0) return res.status(404).json({ error: 'Bank account not found' });

    const { clauses, params } = buildLedgerFilters(req.query);
    let query = `${LEDGER_SELECT} WHERE ft.account_type = 'BANK' AND ft.bank_id = ?`;
    const allParams = [bankId, ...params];
    if (clauses.length) query += ` AND ${clauses.join(' AND ')}`;
    query += ' ORDER BY ft.transaction_date ASC, ft.id ASC';

    const [rows] = await pool.query(query, allParams);
    res.json({ bank: bankRows[0], transactions: rows });
  } catch (error) {
    console.error('Error fetching bank ledger:', error);
    res.status(500).json({ error: 'Failed to fetch bank ledger' });
  }
};

// GET /api/finance/bank/accounts?companyId= - active bank accounts, optionally
// scoped to one company. Used by the payment forms' "Bank Account" selector.
const getBankAccounts = async (req, res) => {
  try {
    const { companyId } = req.query;
    let query = `SELECT id, bank_name, account_number, branch_name, company, current_balance
                 FROM bank_details WHERE status = 'Active'`;
    const params = [];

    if (companyId) {
      const [companyRows] = await pool.query('SELECT name FROM company WHERE id = ? LIMIT 1', [companyId]);
      if (companyRows.length === 0) return res.json([]);
      query += ' AND company = ?';
      params.push(companyRows[0].name);
    }

    query += ' ORDER BY bank_name ASC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching bank accounts:', error);
    res.status(500).json({ error: 'Failed to fetch bank accounts' });
  }
};

// GET /api/finance/bank/accounts/all - every active bank account with its
// company, for the Bank ledger page's account picker.
const getAllBankAccounts = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, bank_name, account_number, company, current_balance
       FROM bank_details WHERE status = 'Active' ORDER BY company ASC, bank_name ASC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching bank accounts:', error);
    res.status(500).json({ error: 'Failed to fetch bank accounts' });
  }
};

// POST /api/finance/bank/receive - Bank Receive (Bank In)
const receiveBank = async (req, res) => {
  const { bank_id, date, amount, receive_type, reference_number, remark, created_by } = req.body;

  if (!bank_id) return res.status(400).json({ error: 'Bank account is required' });
  if (!date) return res.status(400).json({ error: 'Date is required' });
  if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });
  if (!receive_type) return res.status(400).json({ error: 'Receive type is required' });
  if (!created_by) return res.status(400).json({ error: 'Created by is required' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await checkDuplicateReference(connection, reference_number, { includeLedger: true });
    const balance = await recordBankTransaction(connection, {
      bankId: bank_id,
      date,
      remark: remark || null,
      debit: parseFloat(amount),
      transactionType: receive_type,
      referenceNumber: reference_number || null,
      referenceType: 'BANK_RECEIVE',
      createdBy: created_by
    });
    await connection.commit();
    res.status(201).json({ message: 'Bank receipt recorded successfully!', balance });
  } catch (error) {
    await connection.rollback();
    console.error('Error recording bank receipt:', error);
    res.status(error.name === 'InsufficientBalanceError' || error.name === 'DuplicateReferenceError' ? 400 : 500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

// ------------------------------------------------------------ Transfer -----

// POST /api/finance/transfer - Cash <-> Bank transfer
const transferFunds = async (req, res) => {
  const { company_id, from_account, to_account, bank_id, amount, date, remark, created_by } = req.body;

  if (!company_id) return res.status(400).json({ error: 'Company is required' });
  if (!from_account || !to_account) return res.status(400).json({ error: 'From and To accounts are required' });
  if (from_account === to_account) return res.status(400).json({ error: 'From and To accounts must be different' });
  if (!['CASH', 'BANK'].includes(from_account) || !['CASH', 'BANK'].includes(to_account)) {
    return res.status(400).json({ error: 'From/To account must be Cash or Bank' });
  }
  if (!bank_id) return res.status(400).json({ error: 'Bank account is required for a Cash/Bank transfer' });
  if (!date) return res.status(400).json({ error: 'Date is required' });
  if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });
  if (!created_by) return res.status(400).json({ error: 'Created by is required' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const transferAmount = parseFloat(amount);
    let cashBalance = null;
    let bankBalance = null;

    if (from_account === 'CASH' && to_account === 'BANK') {
      // Depositing cash into the bank - same label on both ledger entries so
      // the two rows are recognizable as the same event.
      cashBalance = await recordCashTransaction(connection, {
        companyId: company_id,
        date,
        remark: remark || 'Transfer to Bank',
        credit: transferAmount,
        transactionType: 'Bank Deposit',
        referenceType: 'CASH_BANK_TRANSFER',
        createdBy: created_by
      });
      bankBalance = await recordBankTransaction(connection, {
        bankId: bank_id,
        date,
        remark: remark || 'Transfer from Cash',
        debit: transferAmount,
        transactionType: 'Bank Deposit',
        referenceType: 'CASH_BANK_TRANSFER',
        createdBy: created_by
      });
    } else {
      // BANK -> CASH - withdrawing from the bank to get cash.
      bankBalance = await recordBankTransaction(connection, {
        bankId: bank_id,
        date,
        remark: remark || 'Transfer to Cash',
        credit: transferAmount,
        transactionType: 'Bank Withdrawal',
        referenceType: 'CASH_BANK_TRANSFER',
        createdBy: created_by
      });
      cashBalance = await recordCashTransaction(connection, {
        companyId: company_id,
        date,
        remark: remark || 'Transfer from Bank',
        debit: transferAmount,
        transactionType: 'Bank Withdrawal',
        referenceType: 'CASH_BANK_TRANSFER',
        createdBy: created_by
      });
    }

    await connection.commit();
    res.status(201).json({
      message: 'Transfer completed successfully!',
      cash_balance: cashBalance,
      bank_balance: bankBalance
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error processing transfer:', error);
    res.status(error.name === 'InsufficientBalanceError' ? 400 : 500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

// ------------------------------------------------- Bank-to-Bank Transfer ---

// POST /api/finance/bank/transfer - Bank-to-Bank Transfer
// Moves money between two company bank accounts without affecting income/expense.
const bankToBankTransfer = async (req, res) => {
  const { from_bank_id, to_bank_id, amount, date, reference_number, remark, created_by } = req.body;

  if (!from_bank_id) return res.status(400).json({ error: 'From bank account is required' });
  if (!to_bank_id) return res.status(400).json({ error: 'To bank account is required' });
  if (String(from_bank_id) === String(to_bank_id))
    return res.status(400).json({ error: 'From and To bank accounts must be different' });
  if (!date) return res.status(400).json({ error: 'Transfer date is required' });
  if (!amount || parseFloat(amount) <= 0)
    return res.status(400).json({ error: 'Transfer amount must be greater than 0' });
  if (!created_by) return res.status(400).json({ error: 'Created by is required' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (reference_number) {
      await checkDuplicateReference(connection, reference_number, { includeLedger: true });
    }

    const transferAmount = parseFloat(amount);
    const ref = reference_number || null;
    const note = remark || null;

    // Deduct from source bank (credit = money out)
    const fromBalance = await recordBankTransaction(connection, {
      bankId: from_bank_id,
      date,
      remark: note || 'Bank to Bank Transfer',
      credit: transferAmount,
      transactionType: 'Bank Transfer',
      referenceNumber: ref,
      referenceType: 'BANK_TO_BANK_TRANSFER',
      createdBy: created_by
    });

    // Add to destination bank (debit = money in)
    const toBalance = await recordBankTransaction(connection, {
      bankId: to_bank_id,
      date,
      remark: note || 'Bank to Bank Transfer',
      debit: transferAmount,
      transactionType: 'Bank Transfer',
      referenceNumber: ref,
      referenceType: 'BANK_TO_BANK_TRANSFER',
      createdBy: created_by
    });

    await connection.commit();
    res.status(201).json({
      message: 'Bank-to-Bank transfer completed successfully!',
      from_balance: fromBalance,
      to_balance: toBalance
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error processing bank-to-bank transfer:', error);
    res.status(
      error.name === 'InsufficientBalanceError' || error.name === 'DuplicateReferenceError'
        ? 400
        : 500
    ).json({ error: error.message });
  } finally {
    connection.release();
  }
};

module.exports = {
  getCashBalanceForCompany,
  getCashLedger,
  receiveCash,
  setCashOpeningBalance,
  getBankBalanceForAccount,
  getBankLedger,
  getBankAccounts,
  getAllBankAccounts,
  receiveBank,
  transferFunds,
  bankToBankTransfer
};
