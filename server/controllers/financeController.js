// server/controllers/financeController.js
const pool = require('../config/db');
const moneyMath = require('../utils/money');
const { sendServerError } = require('../utils/safeError');
const { actorId } = require('../utils/actor');
const {
  recordCashTransaction,
  recordBankTransaction,
  getCashBalance,
  getBankBalance,
  calculateDateRangeBalance,
  calculateRunningBalances
} = require('../utils/financeLedger');
const { checkDuplicateReference, DuplicateReferenceError } = require('../services/referenceValidationService');
const { getActiveBankAccounts } = require('../services/bankAccountService');
const { hasActiveLedgerEntry } = require('../services/chequeReleaseService');
const { isCardReceiveType, createPendingCardTransaction } = require('../services/cardLedgerService');
const otherLedger = require('../services/otherLedgerService');

const LEDGER_SELECT = `
  SELECT
    ft.id,
    DATE_FORMAT(ft.transaction_date, '%Y-%m-%d') AS date,
    ft.transaction_type,
    ft.reference_type,
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
  WHERE ft.status = 1
`;

const normalizeLedgerAmount = (value) => Number.parseFloat(value ?? 0) || 0;

const getOpeningBalanceBeforeDate = async ({ accountType, companyId, bankId, dateFrom }) => {
  if (!dateFrom) return 0;

  let query = `
    SELECT COALESCE(SUM(CAST(debit AS DECIMAL(14,2)) - CAST(credit AS DECIMAL(14,2))), 0) AS opening_balance
    FROM finance_transactions
    WHERE account_type = ?
      AND status = 1
      AND transaction_date < ?
  `;

  const params = [accountType, dateFrom];
  if (accountType === 'CASH') {
    query += ' AND company_id = ?';
    params.push(companyId);
  } else {
    query += ' AND bank_id = ?';
    params.push(bankId);
  }

  const [rows] = await pool.query(query, params);
  return Number(parseFloat(rows[0]?.opening_balance ?? 0).toFixed(2)) || 0;
};

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
  if (query.direction) {
    clauses.push('ft.transaction_direction = ?');
    params.push(String(query.direction).toUpperCase());
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

    let query = `${LEDGER_SELECT} AND ft.account_type = 'CASH' AND ft.company_id = ?`;
    const allParams = [companyId, ...params];
    if (clauses.length) query += ` AND ${clauses.join(' AND ')}`;
    query += ' ORDER BY ft.transaction_date ASC, ft.created_at ASC, ft.id ASC';

    const [rows] = await pool.query(query, allParams);
    const openingBalance = await getOpeningBalanceBeforeDate({ accountType: 'CASH', companyId, dateFrom: req.query.dateFrom });
    const transactions = calculateRunningBalances(rows, openingBalance);

    let currentBalance = await getCashBalance(companyId);

    if (req.query.dateTo) {
      const [closingRows] = await pool.query(
        `SELECT COALESCE(SUM(CAST(debit AS DECIMAL(14,2)) - CAST(credit AS DECIMAL(14,2))), 0) AS closing_balance
         FROM finance_transactions
         WHERE account_type = 'CASH' AND company_id = ? AND status = 1 AND transaction_date <= ?`,
        [companyId, req.query.dateTo]
      );
      const [afterRows] = await pool.query(
        `SELECT
           COALESCE(SUM(CAST(credit AS DECIMAL(14,2))), 0) AS credit_after_date,
           COALESCE(SUM(CAST(debit AS DECIMAL(14,2))), 0) AS debit_after_date
         FROM finance_transactions
         WHERE account_type = 'CASH' AND company_id = ? AND status = 1 AND transaction_date > ?`,
        [companyId, req.query.dateTo]
      );

      const closingBalance = Number.parseFloat(closingRows[0]?.closing_balance ?? 0) || 0;
      const creditAfterDate = Number.parseFloat(afterRows[0]?.credit_after_date ?? 0) || 0;
      const debitAfterDate = Number.parseFloat(afterRows[0]?.debit_after_date ?? 0) || 0;
      currentBalance = calculateDateRangeBalance({ closingBalance, creditAfterDate, debitAfterDate });
    }

    res.json({ transactions, current_balance: currentBalance });
  } catch (error) {
    console.error('Error fetching cash ledger:', error);
    res.status(500).json({ error: 'Failed to fetch cash ledger' });
  }
};

// POST /api/finance/cash/receive - Cash Receive (Cash In)
const receiveCash = async (req, res) => {
  const { company_id, date, amount, receive_type, reference_number, remark } = req.body;
  const created_by = actorId(req); // never the client's created_by
  // classification: 'receive_type' (default - the original behaviour, so existing
  // API callers that never send it keep working) or 'other_ledger'.
  const classification = req.body.classification || 'receive_type';
  const otherLedgerId = req.body.other_ledger_id;
  const hasOtherLedger = otherLedgerId !== undefined && otherLedgerId !== null && otherLedgerId !== '';
  const hasReceiveType = receive_type !== undefined && receive_type !== null && String(receive_type).trim() !== '';

  if (!company_id) return res.status(400).json({ error: 'Company is required' });
  if (!date) return res.status(400).json({ error: 'Date is required' });
  if (!amount || moneyMath.round2(amount) <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });
  if (!['receive_type', 'other_ledger'].includes(classification)) {
    return res.status(400).json({ error: 'Classification must be receive_type or other_ledger' });
  }
  // Receive Type and Other Ledger are mutually exclusive - exactly one is required.
  if (hasReceiveType && hasOtherLedger) {
    return res.status(400).json({ error: 'Select either a Receive Type or an Other Ledger, not both' });
  }
  if (classification === 'receive_type') {
    if (!receive_type) {
      return res.status(400).json({ error: hasOtherLedger ? 'Classification does not match the selected Other Ledger' : 'Receive type is required' });
    }
  } else if (!hasOtherLedger) {
    return res.status(400).json({ error: 'Other Ledger is required' });
  } else if (hasReceiveType) {
    return res.status(400).json({ error: 'Select either a Receive Type or an Other Ledger, not both' });
  }
  if (!created_by) return res.status(400).json({ error: 'Created by is required' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await checkDuplicateReference(connection, reference_number, { includeLedger: true });

    if (classification === 'other_ledger') {
      // Cash Receive + Other Ledger: Cash Ledger DEBIT (the one primary
      // transaction) + a linked Other Ledger CREDIT for the same source row.
      const ledger = await otherLedger.requireActiveLedger(connection, otherLedgerId, { companyId: company_id });
      const balance = await recordCashTransaction(connection, {
        companyId: company_id,
        date,
        remark: remark || null,
        debit: moneyMath.round2(amount),
        transactionType: otherLedger.OTHER_LEDGER_RECEIVE_TYPE,
        referenceNumber: reference_number || null,
        partyName: ledger.name,
        referenceType: 'CASH_RECEIVE',
        createdBy: created_by
      });
      const sourceId = await otherLedger.lastInsertId(connection);
      if (!sourceId) throw new Error('Cash Ledger entry was not created for the Other Ledger receipt');
      await otherLedger.createImpact(connection, {
        otherLedgerId: ledger.id,
        sourceType: otherLedger.SOURCE_CASH_RECEIVE,
        sourceId,
        date,
        amount: moneyMath.round2(amount),
        companyId: company_id,
        referenceNo: reference_number || null,
        remark: remark || null,
        createdBy: created_by
      });
      await connection.commit();
      return res.status(201).json({ message: 'Cash receipt recorded successfully!', balance, id: sourceId });
    }

    const balance = await recordCashTransaction(connection, {
      companyId: company_id,
      date,
      remark: remark || null,
      debit: moneyMath.round2(amount),
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
    const clientError = error.name === 'InsufficientBalanceError' || error.name === 'DuplicateReferenceError' || error.name === 'OtherLedgerError';
    res.status(error.name === 'OtherLedgerError' ? error.statusCode : (clientError ? 400 : 500)).json({ error: error.message });
  } finally {
    connection.release();
  }
};

// POST /api/finance/cash/opening-balance - one-time (or edit-while-still-only-entry) setup
const setCashOpeningBalance = async (req, res) => {
  const { company_id, date, amount } = req.body;
  const created_by = actorId(req); // never the client's created_by

  if (!company_id) return res.status(400).json({ error: 'Company is required' });
  if (!date) return res.status(400).json({ error: 'Date is required' });
  if (amount === undefined || amount === null || moneyMath.round2(amount) < 0) {
    return res.status(400).json({ error: 'A valid opening balance amount is required' });
  }
  if (!created_by) return res.status(400).json({ error: 'Created by is required' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query(
      "SELECT id, transaction_type FROM finance_transactions WHERE status = 1 AND account_type = 'CASH' AND company_id = ? FOR UPDATE",
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
      await connection.query('UPDATE finance_transactions SET status = 0 WHERE id = ?', [existing[0].id]);
      await connection.query('UPDATE cash_accounts SET current_balance = 0 WHERE company_id = ?', [company_id]);
    }

    const balance = await recordCashTransaction(connection, {
      companyId: company_id,
      date,
      remark: 'Opening Balance',
      debit: moneyMath.round2(amount),
      transactionType: 'Opening Balance',
      referenceType: 'OPENING_BALANCE',
      createdBy: created_by
    });

    await connection.commit();
    res.status(201).json({ message: 'Cash opening balance set successfully!', balance });
  } catch (error) {
    await connection.rollback();
    console.error('Error setting cash opening balance:', error);
    sendServerError(res, error);
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
      'SELECT id, bank_name, account_number, company, current_balance FROM bank_details WHERE id = ? AND record_status = 1',
      [bankId]
    );
    if (bankRows.length === 0) return res.status(404).json({ error: 'Bank account not found' });

    const { clauses, params } = buildLedgerFilters(req.query);
    let query = `${LEDGER_SELECT} AND ft.account_type = 'BANK' AND ft.bank_id = ?`;
    const allParams = [bankId, ...params];
    if (clauses.length) query += ` AND ${clauses.join(' AND ')}`;
    query += ' ORDER BY ft.transaction_date ASC, ft.created_at ASC, ft.id ASC';

    const [rows] = await pool.query(query, allParams);
    const openingBalance = await getOpeningBalanceBeforeDate({ accountType: 'BANK', companyId: null, bankId, dateFrom: req.query.dateFrom });
    const transactions = calculateRunningBalances(rows, openingBalance);
    let currentBalance = await getBankBalance(bankId);

    if (req.query.dateTo) {
      const [closingRows] = await pool.query(
        `SELECT COALESCE(SUM(CAST(debit AS DECIMAL(14,2)) - CAST(credit AS DECIMAL(14,2))), 0) AS closing_balance
         FROM finance_transactions
         WHERE account_type = 'BANK' AND bank_id = ? AND status = 1 AND transaction_date <= ?`,
        [bankId, req.query.dateTo]
      );
      const [afterRows] = await pool.query(
        `SELECT
           COALESCE(SUM(CAST(credit AS DECIMAL(14,2))), 0) AS credit_after_date,
           COALESCE(SUM(CAST(debit AS DECIMAL(14,2))), 0) AS debit_after_date
         FROM finance_transactions
         WHERE account_type = 'BANK' AND bank_id = ? AND status = 1 AND transaction_date > ?`,
        [bankId, req.query.dateTo]
      );

      const closingBalance = Number.parseFloat(closingRows[0]?.closing_balance ?? 0) || 0;
      const creditAfterDate = Number.parseFloat(afterRows[0]?.credit_after_date ?? 0) || 0;
      const debitAfterDate = Number.parseFloat(afterRows[0]?.debit_after_date ?? 0) || 0;
      currentBalance = calculateDateRangeBalance({ closingBalance, creditAfterDate, debitAfterDate });
    }

    res.json({ bank: { ...bankRows[0], current_balance: currentBalance }, transactions });
  } catch (error) {
    console.error('Error fetching bank ledger:', error);
    res.status(500).json({ error: 'Failed to fetch bank ledger' });
  }
};

// GET /api/finance/bank/accounts?companyId= - active bank accounts, optionally
// scoped to one company. Used by the payment forms' "Bank Account" selector.
const getBankAccounts = async (req, res) => {
  try {
    res.json(await getActiveBankAccounts(req.query.companyId || null));
  } catch (error) {
    console.error('Error fetching bank accounts:', error);
    res.status(500).json({ error: 'Failed to fetch bank accounts' });
  }
};

// GET /api/finance/bank/accounts/all - every active bank account with its
// company, for the Bank ledger page's account picker.
const getAllBankAccounts = async (req, res) => {
  try {
    res.json(await getActiveBankAccounts());
  } catch (error) {
    console.error('Error fetching bank accounts:', error);
    res.status(500).json({ error: 'Failed to fetch bank accounts' });
  }
};

// The bank account must be active and belong to the selected company.
const isCompanyBankAccount = async (connection, bankId, companyId) => {
  const [accountRows] = await connection.query(
    `SELECT bd.id
     FROM bank_details bd
     INNER JOIN company c ON LOWER(TRIM(c.name)) = LOWER(TRIM(bd.company))
     WHERE bd.id = ? AND c.id = ? AND bd.status = 'Active' AND COALESCE(bd.record_status, 1) = 1`,
    [bankId, companyId]
  );
  return accountRows.length > 0;
};

const bankErrorStatus = (error) => {
  if (error.name === 'OtherLedgerError') return error.statusCode;
  return error.name === 'InsufficientBalanceError' || error.name === 'DuplicateReferenceError' || error.name === 'HttpError' ? 400 : 500;
};

// POST /api/finance/bank/receive - Bank Receive (Bank In)
// The selected bank account always receives the money (Bank DEBIT). The receipt
// is classified EITHER by a Receive Type (original behaviour) OR by an Other
// Ledger (Bank DEBIT + linked Other Ledger CREDIT) - never both, like Cash Receive.
const receiveBank = async (req, res) => {
  const { company_id, bank_id, date, amount, receive_type, reference_number, remark } = req.body;
  const created_by = req.user.userId;
  // classification defaults to 'receive_type' so existing callers keep working.
  const classification = req.body.classification || 'receive_type';
  const otherLedgerId = req.body.other_ledger_id;
  const hasOtherLedger = otherLedgerId !== undefined && otherLedgerId !== null && otherLedgerId !== '';
  const hasReceiveType = receive_type !== undefined && receive_type !== null && String(receive_type).trim() !== '';

  if (!company_id) return res.status(400).json({ error: 'Company is required' });
  if (!bank_id) return res.status(400).json({ error: 'Bank account is required' });
  if (!date) return res.status(400).json({ error: 'Date is required' });
  if (!amount || moneyMath.round2(amount) <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });
  if (!['receive_type', 'other_ledger'].includes(classification)) {
    return res.status(400).json({ error: 'Classification must be receive_type or other_ledger' });
  }
  if (hasReceiveType && hasOtherLedger) {
    return res.status(400).json({ error: 'Select either a Receive Type or an Other Ledger, not both' });
  }
  if (classification === 'receive_type' && !hasReceiveType) {
    return res.status(400).json({ error: hasOtherLedger ? 'Classification does not match the selected Other Ledger' : 'Receive type is required' });
  }
  if (classification === 'other_ledger' && !hasOtherLedger) return res.status(400).json({ error: 'Other Ledger is required' });
  if (!created_by) return res.status(401).json({ error: 'Authenticated user is required' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (!(await isCompanyBankAccount(connection, bank_id, company_id))) {
      await connection.rollback();
      return res.status(400).json({ error: 'Selected bank account is not active for the selected company' });
    }
    await checkDuplicateReference(connection, reference_number, { includeLedger: true });

    if (classification === 'other_ledger') {
      // Bank Ledger DEBIT (the one primary transaction) + a linked Other Ledger
      // CREDIT for the same source row.
      const ledger = await otherLedger.requireActiveLedger(connection, otherLedgerId, { companyId: company_id });
      const balance = await recordBankTransaction(connection, {
        bankId: bank_id,
        date,
        remark: remark || null,
        debit: moneyMath.round2(amount),
        transactionType: otherLedger.OTHER_LEDGER_RECEIVE_TYPE,
        referenceNumber: reference_number || null,
        partyName: ledger.name,
        referenceType: 'BANK_RECEIVE',
        createdBy: created_by
      });
      const sourceId = await otherLedger.lastInsertId(connection);
      if (!sourceId) throw new Error('Bank Ledger entry was not created for the Other Ledger receipt');
      await otherLedger.createImpact(connection, {
        otherLedgerId: ledger.id,
        sourceType: otherLedger.SOURCE_BANK_RECEIVE,
        sourceId,
        date,
        amount: moneyMath.round2(amount),
        companyId: company_id,
        referenceNo: reference_number || null,
        remark: remark || null,
        createdBy: created_by
      });
      await connection.commit();
      return res.status(201).json({ message: 'Bank receipt recorded successfully!', balance, id: sourceId });
    }

    // Card payments are not in the bank until the card settlement is realised.
    // File them as a PENDING card transaction (Finance -> Card Ledger) instead of
    // posting to the bank; the Bank Balance only rises when it is realised there.
    if (isCardReceiveType(receive_type)) {
      const cardId = await createPendingCardTransaction(connection, {
        companyId: company_id,
        bankId: bank_id,
        date,
        amount: moneyMath.round2(amount),
        referenceNumber: reference_number || null,
        remark: remark || null,
        createdBy: created_by
      });
      await connection.commit();
      return res.status(201).json({
        message: 'Card payment recorded as Pending. The bank balance will increase when it is realised in the Card Ledger.',
        pending: true,
        card_transaction_id: cardId
      });
    }

    const balance = await recordBankTransaction(connection, {
      bankId: bank_id,
      date,
      remark: remark || null,
      debit: moneyMath.round2(amount),
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
    res.status(bankErrorStatus(error)).json({ error: error.message });
  } finally {
    connection.release();
  }
};

// POST /api/finance/bank/issued - Bank Issued (Bank Out to an Other Ledger)
// Bank Ledger CREDIT on the source bank account (the primary transaction) +
// a linked Other Ledger DEBIT, in one DB transaction - the bank mirror of Cash Issued.
const issueBank = async (req, res) => {
  const { company_id, bank_id, date, amount, reference_number, remark } = req.body;
  const otherLedgerId = req.body.other_ledger_id;
  const created_by = req.user.userId;

  if (!company_id) return res.status(400).json({ error: 'Company is required' });
  if (!bank_id) return res.status(400).json({ error: 'Source bank account is required' });
  if (otherLedgerId === undefined || otherLedgerId === null || otherLedgerId === '') {
    return res.status(400).json({ error: 'Other Ledger is required' });
  }
  if (!date) return res.status(400).json({ error: 'Date is required' });
  if (!amount || moneyMath.round2(amount) <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });
  if (!created_by) return res.status(401).json({ error: 'Authenticated user is required' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (!(await isCompanyBankAccount(connection, bank_id, company_id))) {
      await connection.rollback();
      return res.status(400).json({ error: 'Selected bank account is not active for the selected company' });
    }
    await checkDuplicateReference(connection, reference_number, { includeLedger: true });
    const ledger = await otherLedger.requireActiveLedger(connection, otherLedgerId, { companyId: company_id });

    const balance = await recordBankTransaction(connection, {
      bankId: bank_id,
      date,
      remark: remark || null,
      credit: moneyMath.round2(amount),
      transactionType: otherLedger.BANK_ISSUED_TYPE,
      referenceNumber: reference_number || null,
      partyName: ledger.name,
      referenceType: 'BANK_ISSUED',
      createdBy: created_by
    });
    const sourceId = await otherLedger.lastInsertId(connection);
    if (!sourceId) throw new Error('Bank Ledger entry was not created for the Bank Issued transaction');
    // createImpact refuses a second entry for the same source row.
    await otherLedger.createImpact(connection, {
      otherLedgerId: ledger.id,
      sourceType: otherLedger.SOURCE_BANK_ISSUED,
      sourceId,
      date,
      amount: moneyMath.round2(amount),
      companyId: company_id,
      referenceNo: reference_number || null,
      remark: remark || null,
      createdBy: created_by
    });
    await connection.commit();
    res.status(201).json({ message: 'Bank issued recorded successfully!', balance, id: sourceId });
  } catch (error) {
    await connection.rollback();
    console.error('Error recording bank issued:', error);
    res.status(bankErrorStatus(error)).json({ error: error.message });
  } finally {
    connection.release();
  }
};

// ------------------------------------------------------------ Transfer -----

// POST /api/finance/transfer - Cash <-> Bank transfer
const transferFunds = async (req, res) => {
  const { company_id, from_account, to_account, bank_id, amount, date, remark, cheque_number } = req.body;
  const created_by = actorId(req); // never the client's created_by

  if (!company_id) return res.status(400).json({ error: 'Company is required' });
  if (!from_account || !to_account) return res.status(400).json({ error: 'From and To accounts are required' });
  if (from_account === to_account) return res.status(400).json({ error: 'From and To accounts must be different' });
  if (!['CASH', 'BANK'].includes(from_account) || !['CASH', 'BANK'].includes(to_account)) {
    return res.status(400).json({ error: 'From/To account must be Cash or Bank' });
  }
  if (!bank_id) return res.status(400).json({ error: 'Bank account is required for a Cash/Bank transfer' });
  if (!date) return res.status(400).json({ error: 'Date is required' });
  if (!amount || moneyMath.round2(amount) <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });
  if (!created_by) return res.status(400).json({ error: 'Created by is required' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const transferAmount = moneyMath.round2(amount);
    const isChequeTransfer = from_account === 'BANK'
      && to_account === 'CASH'
      && cheque_number
      && String(cheque_number).trim();
    let cashBalance = null;
    let bankBalance = null;

    if (isChequeTransfer) {
      const [transferResult] = await connection.query(
        `INSERT INTO finance_cheque_transfers
           (company_id, bank_id, amount, transfer_date, cheque_number, remark, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
        [company_id, bank_id, transferAmount, date, String(cheque_number).trim(), remark || null, created_by]
      );
      const transferId = transferResult.insertId;

      const [bankRows] = await connection.query(
        'SELECT bank_name, account_number FROM bank_details WHERE id = ? LIMIT 1',
        [bank_id]
      );
      const bankLabel = bankRows.length
        ? `${bankRows[0].bank_name}${bankRows[0].account_number ? ` (${bankRows[0].account_number})` : ''}`
        : `Bank ID ${bank_id}`;

      await connection.query(
        `INSERT INTO expenses_cheque_registry
           (source_type, type, source_id, date, name, cheque_number, amount, bank, bank_id, release_date, status)
         VALUES ('BANK_TO_CASH', 'Transfer', ?, ?, ?, ?, ?, ?, ?, NULL, 'Pending')
         ON DUPLICATE KEY UPDATE
           date = VALUES(date), name = VALUES(name), amount = VALUES(amount), bank = VALUES(bank), bank_id = VALUES(bank_id), status = 'Pending', type = 'Transfer'`,
        [transferId, date, bankLabel, String(cheque_number).trim(), transferAmount, bankLabel, bank_id || null]
      );

      // Bank Ledger is deducted immediately, on the Transfer Date - this is
      // the only Bank Ledger posting this transfer will ever make. The Cash
      // Ledger is only credited later, when the cheque is actually
      // Released (see chequeReleaseService.js), using the Released Date -
      // never here. hasActiveLedgerEntry guards against a duplicate Bank
      // deduction if this same transfer is re-submitted (the cheque_number
      // + bank_id unique key routes back to the same transferId above).
      const bankAlreadyPosted = await hasActiveLedgerEntry(connection, 'BANK_TO_CASH', transferId, 'BANK', bank_id);
      if (!bankAlreadyPosted) {
        bankBalance = await recordBankTransaction(connection, {
          bankId: bank_id,
          date,
          remark: remark || `Transfer to Cash (Cheque ${String(cheque_number).trim()})`,
          credit: transferAmount,
          transactionType: 'Bank Withdrawal',
          referenceNumber: String(cheque_number).trim(),
          partyName: bankLabel,
          referenceType: 'CASH_BANK_TRANSFER',
          referenceId: transferId,
          createdBy: created_by
        });
      } else {
        bankBalance = await getBankBalance(bank_id);
      }
    } else if (from_account === 'CASH' && to_account === 'BANK') {
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
      message: isChequeTransfer
        ? 'Cheque transfer recorded. Bank balance deducted on the Transfer Date; Cash balance will be credited when the cheque is Released.'
        : 'Transfer completed successfully!',
      is_cheque: !!isChequeTransfer,
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
  const { from_bank_id, to_bank_id, amount, date, reference_number, remark } = req.body;
  const created_by = actorId(req); // never the client's created_by

  if (!from_bank_id) return res.status(400).json({ error: 'From bank account is required' });
  if (!to_bank_id) return res.status(400).json({ error: 'To bank account is required' });
  if (String(from_bank_id) === String(to_bank_id))
    return res.status(400).json({ error: 'From and To bank accounts must be different' });
  if (!date) return res.status(400).json({ error: 'Transfer date is required' });
  if (!amount || moneyMath.round2(amount) <= 0)
    return res.status(400).json({ error: 'Transfer amount must be greater than 0' });
  if (!created_by) return res.status(400).json({ error: 'Created by is required' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [accountRows] = await connection.query(
      `SELECT id, company
       FROM bank_details
       WHERE id IN (?, ?) AND status = 'Active' AND COALESCE(record_status, 1) = 1
       FOR UPDATE`,
      [from_bank_id, to_bank_id]
    );
    if (accountRows.length !== 2) {
      await connection.rollback();
      return res.status(400).json({ error: 'Both bank accounts must be active' });
    }
    if (accountRows[0].company.toLowerCase() !== accountRows[1].company.toLowerCase()) {
      await connection.rollback();
      return res.status(400).json({ error: 'Bank accounts must belong to the same company' });
    }
    if (reference_number) {
      await checkDuplicateReference(connection, reference_number, { includeLedger: true });
    }

    const transferAmount = moneyMath.round2(amount);
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
  issueBank,
  transferFunds,
  bankToBankTransfer
};