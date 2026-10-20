const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticate = require('../middleware/authenticate');
const restrictRoles = require('../middleware/restrictRoles');
// NOTE: Only a Petty Cash Reimbursement touches the Finance Cash Ledger (as a
// Credit - cash moving out of the company's main Cash Book into the petty
// cash float). Petty Cash Vouchers/Expenses and standalone Petty Cash
// Payments are paid out of the petty cash float itself and must never post
// to the Cash Ledger.
const periodLock = require('../services/periodLock');
const moneyMath = require('../utils/money');
const { softDelete } = require('../services/softDelete');
const { recordBankTransaction, recordCashTransaction, calculateRunningBalances, refreshBalancesOfReference, refreshAccounts } = require('../utils/financeLedger');
const { checkDuplicateReference, DuplicateReferenceError } = require('../services/referenceValidationService');
const { getActiveBankAccounts } = require('../services/bankAccountService');
const { isRmAdjustmentRequest, recordFinancialAdjustment, sameValue } = require('../utils/rmAdjustmentAudit');
const { resolveExpenseClassification, ExpenseClassificationError } = require('../utils/expenseClassification');

router.use(authenticate, restrictRoles('Store Keeper', 'Stores'));

// =============================================
// GET Petty Cash Balance
// =============================================
router.get('/petty-cash/balance', async (req, res) => {
  try {
    const [reimbursementRows] = await pool.query(
      'SELECT SUM(amount) as total FROM petty_cash_reimbursements'
    );
    const totalReimbursements = parseFloat(reimbursementRows[0].total) || 0;

    const [voucherRows] = await pool.query(
      'SELECT SUM(amount) as total FROM petty_cash_vouchers WHERE is_deleted = 0 '
    );
    const totalVouchers = parseFloat(voucherRows[0].total) || 0;

    const balance = totalReimbursements - totalVouchers;
    
    res.json({ 
      balance,
      totalReimbursements,
      totalVouchers
    });
  } catch (error) {
    console.error('Error fetching petty cash balance:', error);
    res.status(500).json({ error: 'Failed to fetch petty cash balance' });
  }
});

// =============================================
// GET Next Voucher Number
// =============================================
router.get('/petty-cash/next-voucher-number', async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT voucher_number FROM petty_cash_vouchers WHERE is_deleted = 0 ORDER BY id DESC LIMIT 1"
    );
    
    let nextNumber = 'PC-001';
    
    if (rows.length > 0 && rows[0].voucher_number) {
      const lastNumber = rows[0].voucher_number;
      const match = lastNumber.match(/\d+$/);
      if (match) {
        const num = parseInt(match[0]) + 1;
        nextNumber = `PC-${String(num).padStart(3, '0')}`;
      }
    }
    
    res.json({ voucher_number: nextNumber });
  } catch (error) {
    console.error('Error generating voucher number:', error);
    res.json({ voucher_number: `PC-${Date.now()}` });
  }
});

// =============================================
// GET Next Reference Number for Reimbursement
// =============================================
router.get('/petty-cash/next-reference-number', async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT reference_number FROM petty_cash_reimbursements ORDER BY id DESC LIMIT 1"
    );
    
    let nextNumber = 'REF-001';
    
    if (rows.length > 0 && rows[0].reference_number) {
      const lastNumber = rows[0].reference_number;
      const match = lastNumber.match(/\d+$/);
      if (match) {
        const num = parseInt(match[0]) + 1;
        nextNumber = `REF-${String(num).padStart(3, '0')}`;
      }
    }
    
    res.json({ reference_number: nextNumber });
  } catch (error) {
    console.error('Error generating reference number:', error);
    res.json({ reference_number: `REF-${Date.now()}` });
  }
});

// =============================================
// GET All Vouchers
// =============================================
router.get('/petty-cash/vouchers', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
        v.id, 
        v.voucher_number, 
        DATE_FORMAT(v.voucher_date, '%Y-%m-%d') as date,
        v.employee_name, 
        v.payee_name as payee, 
        v.expense_type, 
        v.expense_type_id,
        v.sub_expense_type_id,
        v.sub_expense_type,
        v.description, 
        v.vehicle_number, 
        v.amount,
        v.receipt_no,
        v.status,
        v.company_id,
        comp.name as company_name,
        DATE_FORMAT(v.created_at, '%Y-%m-%d') as created_date
       FROM petty_cash_vouchers v
       LEFT JOIN company comp ON v.company_id = comp.id WHERE v.is_deleted = 0
       
       ORDER BY v.created_at DESC 
       LIMIT 100`
    );
    
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching vouchers:', error);
    res.json([]);
  }
});

// =============================================
// GET All Reimbursements
// =============================================
router.get('/petty-cash/reimbursements', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
        r.id, 
        r.reference_number, 
        DATE_FORMAT(r.reimbursement_date, '%Y-%m-%d') as date,
        r.amount,
        r.funding_source,
        r.company_id,
        r.bank_id,
        comp.name as company_name,
        bank.bank_name as bank_name,
        r.status,
        u.name as created_by_name,
        DATE_FORMAT(r.created_at, '%Y-%m-%d') as created_date
       FROM petty_cash_reimbursements r
       LEFT JOIN users u ON r.created_by = u.id
       LEFT JOIN company comp ON r.company_id = comp.id
       LEFT JOIN bank_details bank ON r.bank_id = bank.id
       ORDER BY r.created_at DESC 
       LIMIT 100`
    );
    
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching reimbursements:', error);
    res.json([]);
  }
});

// =============================================
// GET Petty Cash Transaction History (running balance)
// Combines Reimbursements (Debit) and Vouchers/Expenses (Credit) into a
// single chronological ledger. The balance column is never stored - it is
// always recalculated from the underlying transaction history on every
// request, reusing the same running-balance formula the Finance Cash Book
// ledger uses (balance = previous balance + debit - credit), so the two
// stay consistent and the value can never be manually edited.
//
// This is the single data source of the Petty Cash page's Recent Vouchers
// table (the separate Transaction History table was removed from the UI, its
// logic lives on here). Optional query params:
//   from_date / to_date (YYYY-MM-DD) - return every transaction in the range
//                                      (any limit is ignored)
//   limit                            - only used when NO date range is given
//                                      (the page sends 10 -> latest 10 rows,
//                                      displayed oldest-to-newest)
// The running balance is always calculated over the FULL history first and
// only then filtered, so a row's balance is the true petty cash balance at
// that point - not one that restarts from zero inside the selected range.
// =============================================
router.get('/petty-cash/transactions', async (req, res) => {
  try {
    const isIsoDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const fromDate = req.query.from_date || null;
    const toDate = req.query.to_date || null;
    if ((fromDate && !isIsoDate(fromDate)) || (toDate && !isIsoDate(toDate))) {
      return res.status(400).json({ error: 'from_date and to_date must be in YYYY-MM-DD format' });
    }
    if (fromDate && toDate && fromDate > toDate) {
      return res.status(400).json({ error: 'From Date cannot be after To Date' });
    }
    const limit = parseInt(req.query.limit, 10);

    const [reimbursementRows] = await pool.query(
      `SELECT
         r.id,
         'REIMBURSEMENT' AS source,
         DATE_FORMAT(r.reimbursement_date, '%Y-%m-%d') AS date,
         CONCAT('Petty Cash Reimbursement - ', r.reference_number) AS remark,
         r.reference_number,
         r.amount AS debit,
         0 AS credit,
         r.created_at,
         r.company_id,
         comp.name AS company_name,
         r.status
       FROM petty_cash_reimbursements r
       LEFT JOIN company comp ON r.company_id = comp.id`
    );

    const [voucherRows] = await pool.query(
      `SELECT
         v.id,
         'VOUCHER' AS source,
         DATE_FORMAT(v.voucher_date, '%Y-%m-%d') AS date,
         CONCAT('Petty Cash Expense - ', v.expense_type, ' (', v.payee_name, ')') AS remark,
         v.voucher_number AS reference_number,
         0 AS debit,
         v.amount AS credit,
         v.created_at,
         v.employee_name,
         v.payee_name,
         v.expense_type,
         v.expense_type_id,
         v.sub_expense_type_id,
         v.sub_expense_type,
         v.description,
         v.vehicle_number,
         v.receipt_no,
         v.status,
         v.company_id,
         comp.name AS company_name
       FROM petty_cash_vouchers v
       LEFT JOIN company comp ON v.company_id = comp.id WHERE v.is_deleted = 0 `
    );

    // Chronological order (oldest first) so the running balance builds up
    // correctly, exactly like the Finance Cash Book ledger does.
    const combined = [...reimbursementRows, ...voucherRows].sort((a, b) => {
      const dateDiff = new Date(a.date) - new Date(b.date);
      if (dateDiff !== 0) return dateDiff;
      const createdDiff = new Date(a.created_at) - new Date(b.created_at);
      if (createdDiff !== 0) return createdDiff;
      return a.id - b.id;
    });

    const withBalances = calculateRunningBalances(combined, 0);

    // Date-range filter (inclusive) - applied AFTER balances are calculated.
    const hasRange = Boolean(fromDate || toDate);
    let visible = withBalances.filter((t) =>
      (!fromDate || t.date >= fromDate) && (!toDate || t.date <= toDate)
    );

    // No date range -> select the latest N, then retain chronological order
    // for display. A date range always returns everything, oldest first.
    if (!hasRange && Number.isInteger(limit) && limit > 0) {
      visible = visible.slice(-limit);
    }

    const transactions = visible.map((t) => ({
      id: t.id,
      source: t.source,
      date: t.date,
      remark: t.remark,
      reference_number: t.reference_number,
      debit: parseFloat(t.debit) || 0,
      credit: parseFloat(t.credit) || 0,
      balance: t.balance,
      // Extra fields so the Recent Vouchers table can render / edit rows
      // without a second request (undefined for reimbursement rows).
      employee_name: t.employee_name,
      payee_name: t.payee_name,
      expense_type: t.expense_type,
      expense_type_id: t.expense_type_id,
      sub_expense_type_id: t.sub_expense_type_id,
      sub_expense_type: t.sub_expense_type,
      description: t.description,
      vehicle_number: t.vehicle_number,
      receipt_no: t.receipt_no,
      status: t.status,
      company_id: t.company_id,
      company_name: t.company_name
    }));

    res.json(transactions);
  } catch (error) {
    console.error('Error fetching petty cash transaction history:', error);
    res.status(500).json({ error: 'Failed to fetch petty cash transaction history' });
  }
});

// =============================================
// POST Create Voucher
// =============================================
router.post('/petty-cash/voucher', authenticate, async (req, res) => {
  const { 
    voucher_number, 
    voucher_date, 
    employee_name, 
    payee_name, 
    expense_type, 
    expense_type_id,
    sub_expense_type_id,
    description, 
    vehicle_number, 
    amount,
    receipt_no,
    company_id
  } = req.body;
  
  const userId = req.user.userId;

  if (!voucher_number || !voucher_date || !payee_name || !(expense_type || expense_type_id) || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  // Petty Cash is tracked entirely inside the Petty Cash module. The company
  // is kept only so vouchers can be reported per company - it does NOT link
  // the voucher to any Cash Ledger / Cash Book.
  if (!company_id) {
    return res.status(400).json({ error: 'Company is required' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await checkDuplicateReference(connection, voucher_number);

    // Only confirm the company exists (no Cash Ledger / cash_accounts lookup).
    const [companyRows] = await connection.query('SELECT id, name FROM company WHERE is_deleted = 0 AND id = ?', [company_id]);
    if (companyRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Selected Company is not valid' });
    }

    // Expenses Type / Sub Expenses Type come from Expenses Type Management;
    // the stored names are taken from those tables, not from the request.
    const classification = await resolveExpenseClassification(connection, { expense_type, expense_type_id, sub_expense_type_id });

    // A Petty Cash voucher is paid out of the petty cash float the moment it
    // is submitted, so it is stored as Paid (also what the Expenses Report
    // shows). Nothing is posted to the main Cash Ledger.
    const [result] = await connection.query(
      `INSERT INTO petty_cash_vouchers 
       (voucher_number, voucher_date, employee_name, payee_name, company_id,
        expense_type, expense_type_id, sub_expense_type_id, sub_expense_type,
        description, vehicle_number, amount, receipt_no, created_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Paid')`,
      [
        voucher_number, 
        voucher_date, 
        employee_name || null, 
        payee_name, 
        company_id,
        classification.expenseTypeName,
        classification.expenseTypeId,
        classification.subExpenseTypeId,
        classification.subExpenseTypeName,
        description || null, 
        vehicle_number || null, 
        amount,
        receipt_no || null,
        userId
      ]
    );

    await connection.commit();
    await updatePettyCashBalance();
    
    res.status(201).json({ 
      id: result.insertId, 
      message: 'Voucher created successfully' 
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating voucher:', error);
    if (error instanceof ExpenseClassificationError) {
      res.status(400).json({ error: error.message });
    } else if (error.code === 'ER_DUP_ENTRY' || error.name === 'DuplicateReferenceError') {
      res.status(400).json({ error: error.name === 'DuplicateReferenceError' ? error.message : 'Voucher number already exists' });
    } else if (error.name === 'InsufficientBalanceError') {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to create voucher' });
    }
  } finally {
    connection.release();
  }
});

// =============================================
// PUT Update Voucher
// =============================================
router.put('/petty-cash/voucher/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { 
    voucher_number,
    voucher_date, 
    employee_name, 
    payee_name, 
    expense_type, 
    expense_type_id,
    sub_expense_type_id,
    description, 
    vehicle_number, 
    amount,
    receipt_no
  } = req.body;
  
  const userId = req.user.userId;

  if (!voucher_number || !voucher_date || !payee_name || !(expense_type || expense_type_id) || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await checkDuplicateReference(connection, voucher_number, { table: 'petty_cash_vouchers', id });

    const [oldRows] = await connection.query('SELECT * FROM petty_cash_vouchers WHERE is_deleted = 0 AND id = ? FOR UPDATE', [id]);
    if (oldRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Voucher not found' });
    }

    const old = oldRows[0];
    const classification = await resolveExpenseClassification(
      connection, { expense_type, expense_type_id, sub_expense_type_id }, old
    );
    const updated = { ...old, voucher_number, voucher_date, employee_name: employee_name || null, payee_name,
      expense_type: classification.expenseTypeName, expense_type_id: classification.expenseTypeId,
      sub_expense_type_id: classification.subExpenseTypeId, sub_expense_type: classification.subExpenseTypeName,
      description: description || null, vehicle_number: vehicle_number || null,
      amount, receipt_no: receipt_no || null };
    const changed = Object.keys(updated).some((key) => !sameValue(old[key], updated[key]));
    await connection.query(
      `UPDATE petty_cash_vouchers 
       SET voucher_number = ?, voucher_date = ?, employee_name = ?, payee_name = ?, 
           expense_type = ?, expense_type_id = ?, sub_expense_type_id = ?, sub_expense_type = ?,
           description = ?, vehicle_number = ?, 
           amount = ?, receipt_no = ?, updated_by = ?
       WHERE id = ?`,
      [
        voucher_number,
        voucher_date, 
        employee_name || null, 
        payee_name, 
        classification.expenseTypeName,
        classification.expenseTypeId,
        classification.subExpenseTypeId,
        classification.subExpenseTypeName,
        description || null, 
        vehicle_number || null, 
        amount, 
        receipt_no || null,
        userId,
        id
      ]
    );

    if (changed && isRmAdjustmentRequest(req)) {
      await recordFinancialAdjustment(connection, {
        category: 'Petty Cash Voucher', sourceRecordId: id, referenceId: voucher_number,
        updatedBy: userId, originalValues: old, updatedValues: updated
      });
    }
    
    await connection.commit();
    await updatePettyCashBalance();
    
    res.json({ message: 'Voucher updated successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating voucher:', error);
    if (error instanceof ExpenseClassificationError) {
      res.status(400).json({ error: error.message });
    } else if (error.code === 'ER_DUP_ENTRY' || error.name === 'DuplicateReferenceError') {
      res.status(400).json({ error: error.name === 'DuplicateReferenceError' ? error.message : 'Voucher number already exists' });
    } else {
      res.status(500).json({ error: 'Failed to update voucher' });
    }
  } finally {
    connection.release();
  }
});

// =============================================
// DELETE Voucher
// =============================================
router.delete('/petty-cash/voucher/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [oldRows] = await connection.query('SELECT amount FROM petty_cash_vouchers WHERE is_deleted = 0 AND id = ? FOR UPDATE', [id]);
    if (oldRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Voucher not found' });
    }

    // Soft delete: the voucher stays in the database, flagged deleted, and drops out of every list and total.
    await softDelete(connection, 'petty_cash_vouchers', { id, userId: req.user.userId });

    await connection.commit();
    await updatePettyCashBalance();

    res.json({ message: 'Voucher deleted successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting voucher:', error);
    res.status(500).json({ error: 'Failed to delete voucher' });
  } finally {
    connection.release();
  }
});

// =============================================
// POST Create Reimbursement
// =============================================
router.post('/petty-cash/reimbursement', authenticate, async (req, res) => {
  const { reference_number, reimbursement_date, amount, company_id } = req.body;
  const userId = req.user.userId;

  if (!reference_number || !reimbursement_date || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  // A Reimbursement tops up the Petty Cash float, funded out of the
  // Company's main Cash Book - so it is posted to the Cash Ledger as a
  // Credit (cash out of the company). The company is required both for
  // reporting and so the correct Cash Ledger is debited/credited.
  if (!company_id) {
    return res.status(400).json({ error: 'Company is required for reimbursement' });
  }
  const funding_source = 'CASH';

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await checkDuplicateReference(connection, reference_number);

    const [companyRows] = await connection.query('SELECT id, name FROM company WHERE is_deleted = 0 AND id = ?', [company_id]);
    if (companyRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Selected Company is not valid' });
    }

    const [result] = await connection.query(
      `INSERT INTO petty_cash_reimbursements 
       (reference_number, reimbursement_date, amount, company_id, funding_source, bank_id, created_by, status)
       VALUES (?, ?, ?, ?, ?, NULL, ?, 'Completed')`,
      [reference_number, reimbursement_date, amount, company_id, funding_source, userId]
    );

    // Post the Credit to the Company's Cash Ledger. This is the only Petty
    // Cash transaction type that ever touches finance_transactions.
    await recordCashTransaction(connection, {
      companyId: company_id,
      date: reimbursement_date,
      remark: `Petty Cash Reimbursement - ${reference_number}`,
      credit: moneyMath.round2(amount),
      transactionType: 'Petty Cash Reimbursement',
      referenceNumber: reference_number,
      referenceType: 'PETTY_CASH_REIMBURSEMENT',
      referenceId: result.insertId,
      createdBy: userId
    });

    await connection.commit();
    await updatePettyCashBalance();

    res.status(201).json({ 
      id: result.insertId, 
      message: 'Reimbursement recorded successfully' 
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating reimbursement:', error);
    if (error.name === 'DuplicateReferenceError' || error.name === 'InsufficientBalanceError') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Reference number already exists' });
    } else {
      res.status(500).json({ error: 'Failed to record reimbursement: ' + error.message });
    }
  } finally {
    connection.release();
  }
});

// =============================================
// PUT Update Reimbursement
// =============================================
router.put('/petty-cash/reimbursement/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { reference_number, reimbursement_date, amount } = req.body;
  const userId = req.user.userId;

  if (!reference_number || !reimbursement_date || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await checkDuplicateReference(connection, reference_number, { table: 'petty_cash_reimbursements', id });

    const [oldRows] = await connection.query(
      'SELECT company_id, amount FROM petty_cash_reimbursements WHERE id = ? FOR UPDATE',
      [id]
    );
    if (oldRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Reimbursement not found' });
    }
    const companyId = oldRows[0].company_id;

    const [result] = await connection.query(
      `UPDATE petty_cash_reimbursements 
       SET reference_number = ?, reimbursement_date = ?, amount = ?, updated_by = ?
       WHERE id = ?`,
      [reference_number, reimbursement_date, amount, userId, id]
    );
    
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Reimbursement not found' });
    }

    // Keep the mirrored Cash Ledger Credit in sync with the edited amount/date.
    if (companyId) {
      const [finRows] = await connection.query(
        'SELECT id, credit FROM finance_transactions WHERE reference_type = "PETTY_CASH_REIMBURSEMENT" AND reference_id = ? FOR UPDATE',
        [id]
      );
      const newCredit = moneyMath.round2(amount);

      if (finRows.length > 0) {
        const finId = finRows[0].id;
        const oldCredit = moneyMath.round2(finRows[0].credit);
        const difference = moneyMath.sub(newCredit, oldCredit);
        if (difference !== 0) {
          await connection.query('UPDATE cash_accounts SET current_balance = current_balance - ? WHERE company_id = ?', [difference, companyId]);
        }
        await connection.query(
          'UPDATE finance_transactions SET credit = ?, transaction_date = ?, remark = ?, reference_number = ? WHERE id = ?',
          [newCredit, reimbursement_date, `Petty Cash Reimbursement - ${reference_number}`, reference_number, finId]
        );
      } else {
        // Legacy reimbursement created before the Cash Ledger link existed.
        await recordCashTransaction(connection, {
          companyId,
          date: reimbursement_date,
          remark: `Petty Cash Reimbursement - ${reference_number}`,
          credit: newCredit,
          transactionType: 'Petty Cash Reimbursement',
          referenceNumber: reference_number,
          referenceType: 'PETTY_CASH_REIMBURSEMENT',
          referenceId: id,
          createdBy: userId
        });
      }
    }

    // The ledger row above was edited in place: refresh its stored running balances.
    await refreshBalancesOfReference(connection, 'PETTY_CASH_REIMBURSEMENT', id);

    await connection.commit();
    await updatePettyCashBalance();
    
    res.json({ message: 'Reimbursement updated successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating reimbursement:', error);
    if (error.code === 'ER_DUP_ENTRY' || error.name === 'DuplicateReferenceError') {
      res.status(400).json({ error: error.name === 'DuplicateReferenceError' ? error.message : 'Duplicate reference number. This number already exists and cannot be used again.' });
    } else {
      res.status(500).json({ error: 'Failed to update reimbursement' });
    }
  } finally {
    connection.release();
  }
});

// =============================================
// Helper function to update petty cash balance
// =============================================
async function updatePettyCashBalance() {
  try {
    const [voucherTotal] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM petty_cash_vouchers WHERE is_deleted = 0 `
    );
    
    const [reimbursementTotal] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM petty_cash_reimbursements`
    );
    
    const [todayVoucherTotal] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM petty_cash_vouchers 
       WHERE is_deleted = 0 AND DATE(voucher_date) = CURDATE()`
    );

    const [todayReimbursementTotal] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM petty_cash_reimbursements 
       WHERE DATE(reimbursement_date) = CURDATE()`
    );

    const totalVouchers = parseFloat(voucherTotal[0].total);
    const totalReimbursements = parseFloat(reimbursementTotal[0].total);
    const currentBalance = totalReimbursements - totalVouchers;
    
    const todayVouchers = parseFloat(todayVoucherTotal[0].total);
    const todayReimbursements = parseFloat(todayReimbursementTotal[0].total);
    const openingBalance = currentBalance - todayReimbursements + todayVouchers;

    await pool.query(
      `INSERT INTO petty_cash_balance 
       (balance_date, opening_balance, total_vouchers, total_reimbursements, closing_balance)
       VALUES (CURDATE(), ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       opening_balance = VALUES(opening_balance),
       total_vouchers = VALUES(total_vouchers),
       total_reimbursements = VALUES(total_reimbursements),
       closing_balance = VALUES(closing_balance)`,
      [openingBalance, todayVouchers, todayReimbursements, currentBalance]
    );
    
  } catch (error) {
    console.error('Error updating petty cash balance table:', error);
  }
}

// =============================================
// CHEQUE EXPENSES ROUTES
// =============================================

// GET all cheque vouchers
router.get('/cheque/vouchers', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, DATE_FORMAT(bill_date, '%Y-%m-%d') as date, 
              voucher_number, cheque_number, payee_name, 
              total_bill_amount as amount, is_realised
       FROM cheque_expenses 
        WHERE is_deleted = 0 ORDER BY created_at DESC`
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching cheque vouchers:', error);
    res.json([]);
  }
});

// GET unrealised cheques
router.get('/cheque/unrealised', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ce.id, DATE_FORMAT(ce.bill_date, '%Y-%m-%d') as date, 
              ce.bill_number, ce.payee_name, ce.vat_reg_number, ce.expense_type,
              ce.without_vat_amount, ce.vat_amount, ce.total_bill_amount as amount,
              ce.description, ce.voucher_number, ce.cheque_number, ce.is_realised,
              DATE_FORMAT(ce.realise_date, '%Y-%m-%d') as realise_date,
              ce.company_id, c.name as company_name
       FROM cheque_expenses ce
       LEFT JOIN company c ON ce.company_id = c.id
       WHERE ce.is_deleted = 0 AND ce.is_realised = 0
       ORDER BY ce.bill_date DESC`
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching unrealised cheques:', error);
    res.json([]);
  }
});

// GET realised cheques
router.get('/cheque/realised', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ce.id, DATE_FORMAT(ce.bill_date, '%Y-%m-%d') as date, 
              ce.bill_number, ce.payee_name, ce.vat_reg_number, ce.expense_type,
              ce.without_vat_amount, ce.vat_amount, ce.total_bill_amount as amount,
              ce.description, ce.voucher_number, ce.cheque_number, ce.is_realised, 
              DATE_FORMAT(ce.realise_date, '%Y-%m-%d') as realise_date,
              ce.company_id, c.name as company_name, ce.bank_id, bd.bank_name
       FROM cheque_expenses ce
       LEFT JOIN company c ON ce.company_id = c.id
       LEFT JOIN bank_details bd ON ce.bank_id = bd.id
       WHERE ce.is_deleted = 0 AND ce.is_realised = 1
       ORDER BY ce.realise_date DESC`
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching realised cheques:', error);
    res.json([]);
  }
});

// GET single cheque voucher by id
router.get('/cheque/voucher/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT id, DATE_FORMAT(bill_date, '%Y-%m-%d') as bill_date, bill_number,
              payee_name, vat_reg_number, expense_type, without_vat_amount,
              vat_amount, total_bill_amount, description, voucher_number,
              cheque_number, is_realised, DATE_FORMAT(realise_date, '%Y-%m-%d') as realise_date,
              company_id, bank_id
       FROM cheque_expenses
       WHERE is_deleted = 0 AND id = ?`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Cheque voucher not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching cheque voucher:', error);
    res.status(500).json({ error: 'Failed to fetch cheque voucher' });
  }
});

// PUT update cheque voucher
router.put('/cheque/voucher/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const {
    bill_date, bill_number, payee_name, vat_reg_number,
    expense_type, without_vat_amount, vat_amount,
    total_bill_amount, description, company_id
  } = req.body;

  if (!bill_date || !payee_name || !expense_type || !without_vat_amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const [result] = await pool.query(
      `UPDATE cheque_expenses
       SET bill_date = ?, company_id = ?, bill_number = ?, payee_name = ?, vat_reg_number = ?,
           expense_type = ?, without_vat_amount = ?, vat_amount = ?,
           total_bill_amount = ?, description = ?
       WHERE id = ?`,
      [
        bill_date,
        company_id || null,
        bill_number || null,
        payee_name,
        vat_reg_number || null,
        expense_type,
        without_vat_amount,
        vat_amount || 0,
        total_bill_amount,
        description || null,
        id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Cheque voucher not found' });
    }

    res.json({ message: 'Cheque voucher updated successfully' });
  } catch (error) {
    console.error('Error updating cheque voucher:', error);
    res.status(500).json({ error: 'Failed to update cheque voucher' });
  }
});

// DELETE cheque voucher
router.delete('/cheque/voucher/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const deleted = await softDelete(pool, 'cheque_expenses', { id, userId: req.user.userId });

    if (deleted === 0) {
      return res.status(404).json({ error: 'Cheque voucher not found' });
    }

    res.json({ message: 'Cheque voucher deleted successfully' });
  } catch (error) {
    console.error('Error deleting cheque voucher:', error);
    res.status(500).json({ error: 'Failed to delete cheque voucher' });
  }
});

// POST create cheque voucher
router.post('/cheque/voucher', authenticate, async (req, res) => {
  const { 
    bill_date, bill_number, payee_name, vat_reg_number, 
    expense_type, without_vat_amount, vat_amount, 
    total_bill_amount, description, company_id
  } = req.body;
  const userId = req.user.userId;

  const voucher_number = `CHQ-${Date.now()}`;
  const cheque_number = `CHQ-${Math.floor(Math.random() * 1000000)}`;

  try {
    const [result] = await pool.query(
      `INSERT INTO cheque_expenses 
       (bill_date, company_id, bill_number, payee_name, vat_reg_number, expense_type, 
        without_vat_amount, vat_amount, total_bill_amount, description, 
        voucher_number, cheque_number, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [bill_date, company_id || null, bill_number, payee_name, vat_reg_number, expense_type,
       without_vat_amount, vat_amount, total_bill_amount, description,
       voucher_number, cheque_number, userId]
    );
    
    res.status(201).json({ 
      id: result.insertId, 
      message: 'Cheque expense voucher created successfully',
      voucher_number,
      cheque_number
    });
  } catch (error) {
    console.error('Error creating cheque voucher:', error);
    res.status(500).json({ error: 'Failed to create cheque voucher' });
  }
});

// PUT realise cheque
router.put('/cheque/realise/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { realise_date, bank_id } = req.body;
  const userId = req.user.userId;

  if (!realise_date) {
    return res.status(400).json({ error: 'Realise date is required' });
  }
  if (!bank_id) {
    return res.status(400).json({ error: 'Bank account is required to realise a cheque' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [chequeRows] = await connection.query(
      'SELECT id, payee_name, total_bill_amount, cheque_number, is_realised FROM cheque_expenses WHERE is_deleted = 0 AND id = ? FOR UPDATE',
      [id]
    );
    if (chequeRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Cheque not found' });
    }
    if (chequeRows[0].is_realised) {
      await connection.rollback();
      return res.status(400).json({ error: 'This cheque has already been realised' });
    }
    const cheque = chequeRows[0];

    const [result] = await connection.query(
      `UPDATE cheque_expenses 
       SET is_realised = 1, realise_date = ?, bank_id = ?
       WHERE id = ?`,
      [realise_date, bank_id, id]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Cheque not found' });
    }

    // Money leaves the bank account the moment the cheque clears, not when
    // it was written - so the ledger entry is posted here, at realise time.
    await recordBankTransaction(connection, {
      bankId: bank_id,
      date: realise_date,
      remark: `Cheque expense - ${cheque.cheque_number}`,
      credit: moneyMath.round2(cheque.total_bill_amount),
      transactionType: 'Cheque Expense',
      referenceNumber: cheque.cheque_number,
      partyName: cheque.payee_name,
      referenceType: 'CHEQUE_EXPENSE',
      referenceId: cheque.id,
      createdBy: userId
    });

    await connection.commit();
    res.json({ message: 'Cheque realised successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error realising cheque:', error);
    if (error.name === 'InsufficientBalanceError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to realise cheque: ' + error.message });
  } finally {
    connection.release();
  }
});

// =============================================
// BANK CHARGES ROUTES
// =============================================

const getCompanyBankAccount = async (connection, companyId, bankName, bankId) => {
  const [rows] = await connection.query(
    `SELECT bd.id
     FROM bank_details bd
     INNER JOIN company c ON LOWER(TRIM(c.name)) = LOWER(TRIM(bd.company))
     WHERE bd.id = ? AND bd.bank_name = ? AND c.id = ? AND bd.status = 'Active'`,
    [bankId, bankName, companyId]
  );
  return rows[0] || null;
};

// GET all bank charges
router.get('/bank-charges', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT bc.id, DATE_FORMAT(bc.charge_date, '%Y-%m-%d') as date,
              bc.bank_name, bc.bank_id, bc.reference_number, bc.charges_type, bc.bank_charge_type_id,
              bc.description, bc.amount, bc.company_id, c.name AS company_name
       FROM bank_charges bc
       LEFT JOIN company c ON c.id = bc.company_id WHERE bc.is_deleted = 0
       
       ORDER BY bc.charge_date DESC, bc.created_at DESC`
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching bank charges:', error);
    res.json([]);
  }
});

// POST create bank charge
router.post('/bank-charges', authenticate, async (req, res) => {
  const { date, bank_name, bank_id, reference_number, charges_type, bank_charge_type_id, description, amount, company_id } = req.body;
  const userId = req.user.userId;

  if (!date || !bank_name || !bank_id || !charges_type || !amount || !company_id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [companies] = await connection.query('SELECT id FROM company WHERE is_deleted = 0 AND id = ?', [company_id]);
    if (companies.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Selected company was not found' });
    }

    const bankAccount = await getCompanyBankAccount(connection, company_id, bank_name, bank_id);
    if (!bankAccount) {
      await connection.rollback();
      return res.status(400).json({ error: 'Selected bank account does not belong to the selected company and bank' });
    }

    await checkDuplicateReference(connection, reference_number);

    const [result] = await connection.query(
      `INSERT INTO bank_charges 
       (charge_date, bank_name, bank_id, reference_number, charges_type, bank_charge_type_id, description, amount, company_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [date, bank_name, bank_id || null, reference_number || null, charges_type, bank_charge_type_id || null, description || null, amount, company_id, userId]
    );

    // Bank charges leave the account immediately - post the ledger entry now,
    // but only if a real bank account was selected (older/free-text-only
    // entries without a bank_id are saved without a ledger post).
    if (bank_id) {
      await recordBankTransaction(connection, {
        bankId: bank_id,
        date,
        remark: `Bank charge - ${charges_type}`,
        credit: moneyMath.round2(amount),
        transactionType: 'Bank Charges',
        referenceNumber: reference_number || null,
        referenceType: 'BANK_CHARGE',
        referenceId: result.insertId,
        createdBy: userId
      });
    }

    await connection.commit();
    res.status(201).json({ 
      id: result.insertId, 
      message: 'Bank charge recorded successfully' 
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating bank charge:', error);
    if (error.name === 'DuplicateReferenceError' || error.name === 'InsufficientBalanceError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to record bank charge: ' + error.message });
  } finally {
    connection.release();
  }
});

// PUT update bank charge
router.put('/bank-charges/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { date, bank_name, bank_id, reference_number, charges_type, bank_charge_type_id, description, amount, company_id } = req.body;

  if (!date || !bank_name || !bank_id || !charges_type || !amount || !company_id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [companies] = await connection.query('SELECT id FROM company WHERE is_deleted = 0 AND id = ?', [company_id]);
    if (companies.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Selected company was not found' });
    }

    const bankAccount = await getCompanyBankAccount(connection, company_id, bank_name, bank_id);
    if (!bankAccount) {
      await connection.rollback();
      return res.status(400).json({ error: 'Selected bank account does not belong to the selected company and bank' });
    }

    await checkDuplicateReference(connection, reference_number, { table: 'bank_charges', id });

    const [oldRows] = await connection.query('SELECT amount, bank_id FROM bank_charges WHERE is_deleted = 0 AND id = ? FOR UPDATE', [id]);
    if (oldRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Bank charge not found' });
    }
    
    // The selected account has already been verified for this company and bank.
    const oldBankId = oldRows[0].bank_id;
    const newBankId = bank_id;

    const [result] = await connection.query(
      `UPDATE bank_charges 
       SET charge_date = ?, bank_name = ?, bank_id = ?, reference_number = ?, 
           charges_type = ?, bank_charge_type_id = ?, description = ?, amount = ?, company_id = ?
       WHERE id = ?`,
      [date, bank_name, newBankId || null, reference_number || null, charges_type, bank_charge_type_id || null, description || null, amount, company_id, id]
    );
    
    if (oldBankId) {
      // Find the finance transaction
      const [finRows] = await connection.query(
        'SELECT id, credit FROM finance_transactions WHERE reference_type = "BANK_CHARGE" AND reference_id = ?',
        [id]
      );
      if (finRows.length > 0) {
        const finId = finRows[0].id;
        const oldCredit = moneyMath.round2(finRows[0].credit);
        const newCredit = moneyMath.round2(amount);
        
        if (oldBankId === newBankId) {
          const difference = moneyMath.sub(newCredit, oldCredit);
          if (difference !== 0) {
            await connection.query('UPDATE bank_details SET current_balance = current_balance - ? WHERE id = ?', [difference, oldBankId]);
          }
          await connection.query(
            'UPDATE finance_transactions SET credit = ?, transaction_date = ?, remark = ?, reference_number = ? WHERE id = ?',
            [newCredit, date, `Bank charge - ${charges_type}`, reference_number || null, finId]
          );
        } else {
          // Bank changed - revert old, apply new
          await connection.query('UPDATE bank_details SET current_balance = current_balance + ? WHERE id = ?', [oldCredit, oldBankId]);
          await connection.query('UPDATE bank_details SET current_balance = current_balance - ? WHERE id = ?', [newCredit, newBankId]);
          await connection.query(
            'UPDATE finance_transactions SET bank_id = ?, credit = ?, transaction_date = ?, remark = ?, reference_number = ? WHERE id = ?',
            [newBankId, newCredit, date, `Bank charge - ${charges_type}`, reference_number || null, finId]
          );
        }
      }
    } else if (newBankId) {
      // Edge case: previously no bank_id, but now one is provided.
      await recordBankTransaction(connection, {
        bankId: newBankId,
        date,
        remark: `Bank charge - ${charges_type}`,
        credit: moneyMath.round2(amount),
        transactionType: 'Bank Charges',
        referenceNumber: reference_number || null,
        referenceType: 'BANK_CHARGE',
        referenceId: id,
        createdBy: req.user.userId
      });
    }

    // The charge's ledger row was edited / moved in place: refresh the running balances of
    // the bank it was in and the bank it is in now.
    await refreshBalancesOfReference(connection, 'BANK_CHARGE', id, oldBankId ? [{ account_type: 'BANK', bank_id: oldBankId }] : []);

    await connection.commit();
    res.json({ message: 'Bank charge updated successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating bank charge:', error);
    res.status(error.name === 'DuplicateReferenceError' ? 400 : 500).json({ error: error.name === 'DuplicateReferenceError' ? error.message : 'Failed to update bank charge' });
  } finally {
    connection.release();
  }
});

// DELETE bank charge
router.delete('/bank-charges/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [oldRows] = await connection.query('SELECT amount, bank_id FROM bank_charges WHERE is_deleted = 0 AND id = ? FOR UPDATE', [id]);
    if (oldRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Bank charge not found' });
    }

    await softDelete(connection, 'bank_charges', { id, userId: req.user.userId });
    
    if (oldRows[0].bank_id) {
      const [finRows] = await connection.query(
        'SELECT id, credit FROM finance_transactions WHERE reference_type = "BANK_CHARGE" AND reference_id = ?', [id]
      );
      if (finRows.length > 0) {
        const oldCredit = parseFloat(finRows[0].credit) || 0;
        await connection.query('UPDATE bank_details SET current_balance = current_balance + ? WHERE id = ?', [oldCredit, oldRows[0].bank_id]);
        // Void, never delete: the ledger row stays (status 0 = excluded from every balance).
        await connection.query('UPDATE finance_transactions SET status = 0 WHERE id = ?', [finRows[0].id]);
      }
      await refreshAccounts(connection, [{ account_type: 'BANK', bank_id: oldRows[0].bank_id }]);
    }
    
    await connection.commit();
    res.json({ message: 'Bank charge deleted successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting bank charge:', error);
    res.status(500).json({ error: 'Failed to delete bank charge' });
  } finally {
    connection.release();
  }
});

// =============================================
// ONLINE EXPENSES ROUTES - ✅ FIXED
// =============================================

// GET all online expenses
router.get('/online', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, DATE_FORMAT(bill_date, '%Y-%m-%d') as bill_date, 
              bill_number, payee_name, vat_reg_number, expense_type,
              without_vat_amount, vat_amount, total_bill_amount, 
              balance, description, payment_status, paid_amount,
              DATE_FORMAT(payment_date, '%Y-%m-%d') as payment_date
       FROM online_expenses 
        WHERE is_deleted = 0 ORDER BY bill_date DESC, created_at DESC`
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching online expenses:', error);
    res.json([]);
  }
});

// POST create online expense - ✅ FIXED: balance = total_bill_amount
router.post('/online', authenticate, async (req, res) => {
  const { 
    bill_date, 
    bill_number, 
    payee_name, 
    vat_reg_number, 
    expense_type, 
    without_vat_amount, 
    vat_amount, 
    total_bill_amount, 
    description 
  } = req.body;
  
  const userId = req.user.userId;

  if (!bill_date || !payee_name || !expense_type || !without_vat_amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO online_expenses 
       (bill_date, bill_number, payee_name, vat_reg_number, expense_type, 
        without_vat_amount, vat_amount, total_bill_amount, balance, 
        description, created_by, payment_status, paid_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 0)`,
      [
        bill_date, 
        bill_number || null, 
        payee_name, 
        vat_reg_number || null, 
        expense_type,
        without_vat_amount, 
        vat_amount || 0, 
        total_bill_amount, 
        total_bill_amount,  // ✅ FIXED: balance = total_bill_amount
        description || null, 
        userId
      ]
    );
    
    res.status(201).json({ 
      id: result.insertId, 
      message: 'Online expense recorded successfully',
      balance: total_bill_amount
    });
  } catch (error) {
    console.error('Error creating online expense:', error);
    res.status(500).json({ error: 'Failed to record online expense' });
  }
});

// PUT update online expense - ✅ FIXED: update balance properly
router.put('/online/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { 
    bill_date, 
    bill_number, 
    payee_name, 
    vat_reg_number, 
    expense_type, 
    without_vat_amount, 
    vat_amount, 
    total_bill_amount, 
    description 
  } = req.body;

  if (!bill_date || !payee_name || !expense_type || !without_vat_amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // ✅ Get current expense data
    const [currentExpense] = await pool.query(
      'SELECT total_bill_amount, paid_amount, balance FROM online_expenses WHERE is_deleted = 0 AND id = ?',
      [id]
    );

    if (currentExpense.length === 0) {
      return res.status(404).json({ error: 'Online expense not found' });
    }

    const oldTotalBill = parseFloat(currentExpense[0].total_bill_amount) || 0;
    const paidAmount = parseFloat(currentExpense[0].paid_amount) || 0;
    const newTotalBill = moneyMath.round2(total_bill_amount);

    // ✅ Recalculate balance: total_bill_amount - paid_amount (exact decimals, never below 0)
    const newBalance = moneyMath.max(0, moneyMath.sub(newTotalBill, paidAmount));

    const [result] = await pool.query(
      `UPDATE online_expenses 
       SET bill_date = ?, 
           bill_number = ?, 
           payee_name = ?, 
           vat_reg_number = ?, 
           expense_type = ?, 
           without_vat_amount = ?,
           vat_amount = ?, 
           total_bill_amount = ?, 
           balance = ?,
           payment_status = ?,
           description = ?
       WHERE id = ?`,
      [
        bill_date, 
        bill_number || null, 
        payee_name, 
        vat_reg_number || null, 
        expense_type, 
        without_vat_amount, 
        vat_amount || 0, 
        total_bill_amount, 
        newBalance,
        newBalance <= 0 ? 'Paid' : (paidAmount > 0 ? 'Partially Paid' : 'Pending'),
        description || null, 
        id
      ]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Online expense not found' });
    }
    
    res.json({ 
      message: 'Online expense updated successfully',
      balance: newBalance
    });
  } catch (error) {
    console.error('Error updating online expense:', error);
    res.status(500).json({ error: 'Failed to update online expense' });
  }
});

// DELETE online expense
router.delete('/online/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    // Soft delete the expense and its payments (flagged deleted, never removed).
    await softDelete(pool, 'online_expense_payments', { where: 'expense_id = ?', params: [id], userId: req.user.userId });
    const deleted = await softDelete(pool, 'online_expenses', { id, userId: req.user.userId });
    
    if (deleted === 0) {
      return res.status(404).json({ error: 'Online expense not found' });
    }
    
    res.json({ message: 'Online expense deleted successfully' });
  } catch (error) {
    console.error('Error deleting online expense:', error);
    res.status(500).json({ error: 'Failed to delete online expense' });
  }
});

// =============================================
// POST Pay Online Expenses - ✅ FIXED
// =============================================
router.post('/online/pay', authenticate, async (req, res) => {
  const { 
    expense_ids, 
    payment_date, 
    bank_name, 
    bank_id,
    voucher_number, 
    reference_number, 
    transfer_amount 
  } = req.body;
  
  const userId = req.user.userId;

  // ✅ Validate required fields
  if (!expense_ids || expense_ids.length === 0) {
    return res.status(400).json({ error: 'No expenses selected for payment' });
  }

  if (!payment_date) {
    return res.status(400).json({ error: 'Payment date is required' });
  }

  // ✅ Bank name is required
  if (!bank_name || bank_name.trim() === '') {
    return res.status(400).json({ error: 'Bank name is required' });
  }

  if (!bank_id) {
    return res.status(400).json({ error: 'Please select a bank account' });
  }

  // ✅ Voucher number is required
  if (!voucher_number || voucher_number.trim() === '') {
    return res.status(400).json({ error: 'Voucher number is required' });
  }

  const amountToPay = moneyMath.round2(transfer_amount);
  if (amountToPay <= 0) {
    return res.status(400).json({ error: 'Valid transfer amount is required' });
  }

  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    await checkDuplicateReference(connection, voucher_number);
    if (reference_number && String(reference_number).trim() !== String(voucher_number).trim()) {
      await checkDuplicateReference(connection, reference_number);
    }

    const placeholders = expense_ids.map(() => '?').join(',');
    
    // ✅ Get expenses with their current balance and total amount
    const [expenses] = await connection.query(
      `SELECT id, balance, total_bill_amount, paid_amount, payee_name, bill_number
       FROM online_expenses 
       WHERE is_deleted = 0 AND id IN (${placeholders})`,
      expense_ids
    );

    if (expenses.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'No valid expenses found' });
    }

    // ✅ Calculate total balance of ALL selected expenses
    const totalBalance = moneyMath.sum(expenses, (exp) => exp.balance || 0);
    
    // ✅ Check if transfer amount exceeds total balance
    if (moneyMath.compare(amountToPay, totalBalance) > 0) {
      await connection.rollback();
      return res.status(400).json({ 
        error: `Transfer amount (${amountToPay}) exceeds total balance (${totalBalance})` 
      });
    }

    let remainingAmount = amountToPay;
    const results = [];

    for (const expense of expenses) {
      if (remainingAmount <= 0) break;

      const payAmount = moneyMath.min(remainingAmount, expense.balance);
      const newBalance = moneyMath.sub(expense.balance, payAmount);
      const newPaidAmount = moneyMath.add(expense.paid_amount || 0, payAmount);
      const totalBill = parseFloat(expense.total_bill_amount || 0);

      // ✅ Determine payment status based on new balance
      let paymentStatus = 'Pending';
      if (newBalance <= 0) {
        paymentStatus = 'Paid';
      } else if (newPaidAmount > 0) {
        paymentStatus = 'Partially Paid';
      }

      // ✅ Update expense balance
      await connection.query(
        `UPDATE online_expenses 
         SET balance = ?,
             paid_amount = ?,
             payment_date = ?,
             payment_status = ?
         WHERE id = ?`,
        [newBalance, newPaidAmount, payment_date, paymentStatus, expense.id]
      );

      // ✅ Insert payment history
      await connection.query(
        `INSERT INTO online_expense_payments 
         (expense_id, payment_date, bank_id, amount, bank_name, voucher_number,
          reference_number, created_by, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Completed')`,
        [
          expense.id,
          payment_date,
          bank_id,
          payAmount,
          bank_name,
          voucher_number,
          reference_number || null,
          userId
        ]
      );

      remainingAmount = moneyMath.sub(remainingAmount, payAmount);

      results.push({
        expense_id: expense.id,
        amount_paid: payAmount,
        remaining_balance: newBalance,
        status: paymentStatus
      });
    }

    // One combined ledger entry for the whole payment - it's a single bank
    // transfer that happens to settle several bills at once.
    const payeeNames = [...new Set(expenses.map(e => e.payee_name).filter(Boolean))];
    const billNumbers = expenses.map(e => e.bill_number).filter(Boolean).join(', ');
    await recordBankTransaction(connection, {
      bankId: bank_id,
      date: payment_date,
      remark: `Online expense payment${billNumbers ? ` - Bill ${billNumbers}` : ''}`,
      credit: amountToPay,
      transactionType: 'Online Expense Payment',
      referenceNumber: voucher_number,
      invoiceNumber: billNumbers || null,
      partyName: payeeNames.length === 1 ? payeeNames[0] : (payeeNames.length > 1 ? 'Multiple Payees' : null),
      referenceType: 'ONLINE_EXPENSE_PAYMENT',
      createdBy: userId
    });

    await connection.commit();

    res.json({
      message: `Payment of ${amountToPay} completed successfully`,
      total_paid: amountToPay,
      remaining_amount: remainingAmount,
      results
    });

  } catch (error) {
    await connection.rollback();
    console.error('Payment error:', error);
    if (error.code === 'ER_DUP_ENTRY' || error.name === 'DuplicateReferenceError') {
      return res.status(400).json({ error: error.name === 'DuplicateReferenceError' ? error.message : 'Voucher number already exists' });
    }
    if (error.name === 'InsufficientBalanceError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Payment failed: ' + error.message });
  } finally {
    connection.release();
  }
});

// GET Payment History for an Expense
router.get('/online/:id/payments', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT id, DATE_FORMAT(payment_date, '%Y-%m-%d') as payment_date, 
              amount, bank_name, voucher_number, reference_number, status,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as created_at
       FROM online_expense_payments 
       WHERE is_deleted = 0 AND expense_id = ?
       ORDER BY payment_date DESC, created_at DESC`,
      [id]
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

// =============================================
// BANK DETAILS API ENDPOINTS
// =============================================

// GET all banks (for dropdown) - active only
router.get('/banks', async (req, res) => {
  try {
    res.json(await getActiveBankAccounts(req.query.company_id || null));
  } catch (error) {
    console.error('Error fetching banks:', error);
    res.status(500).json({ error: 'Failed to fetch banks' });
  }
});

// GET all banks including inactive (for Bank Details management page)
router.get('/banks/all', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, bank_name, account_number, branch_name, account_type,
              currency, opening_balance, current_balance,
              company, notes, status
       FROM bank_details 
       ORDER BY bank_name ASC`
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching all banks:', error);
    res.status(500).json({ error: 'Failed to fetch banks' });
  }
});

// GET single bank by ID
router.get('/banks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      'SELECT * FROM bank_details WHERE id = ?',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Bank not found' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching bank:', error);
    res.status(500).json({ error: 'Failed to fetch bank' });
  }
});

// POST create new bank
router.post('/banks', authenticate, async (req, res) => {
  const {
    bank_name,
    account_number,
    branch_name,
    account_type,
    currency,
    opening_balance,
    current_balance,
    company,
    notes
  } = req.body;
  
  const userId = req.user.userId;

  if (!bank_name) {
    return res.status(400).json({ error: 'Bank name is required' });
  }

  try {
    const resolvedOpeningBalance = Number.isFinite(parseFloat(opening_balance)) ? parseFloat(opening_balance) : 0;
    const resolvedCurrentBalance = current_balance !== undefined && current_balance !== null && Number.isFinite(parseFloat(current_balance))
      ? parseFloat(current_balance)
      : resolvedOpeningBalance;

    const [result] = await pool.query(
      `INSERT INTO bank_details 
       (bank_name, account_number, branch_name, account_type, currency, 
        opening_balance, current_balance, company, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bank_name,
        account_number || null,
        branch_name || null,
        account_type || 'Current',
        currency || 'LKR',
        resolvedOpeningBalance,
        resolvedCurrentBalance,
        company || 'JH',
        notes || null,
        userId
      ]
    );

    // Record the opening balance as the first Finance ledger entry for this account
    if (resolvedOpeningBalance !== 0) {
      const [companyRows] = await pool.query('SELECT id FROM company WHERE name = ? LIMIT 1', [company || 'JH']);
      const isPositive = resolvedOpeningBalance >= 0;
      const debit = isPositive ? resolvedOpeningBalance : 0;
      const credit = isPositive ? 0 : Math.abs(resolvedOpeningBalance);
      const direction = isPositive ? 'IN' : 'OUT';
      await pool.query(
        `INSERT INTO finance_transactions
           (account_type, company_id, bank_id, transaction_date, transaction_type, transaction_direction, remark, debit, credit, balance_after, reference_type, created_by)
         VALUES ('BANK', ?, ?, CURDATE(), 'Opening Balance', ?, 'Opening Balance', ?, ?, ?, 'OPENING_BALANCE', ?)`,
        [companyRows[0]?.id || null, result.insertId, direction, debit, credit, resolvedCurrentBalance, userId]
      );
    }
    
    res.status(201).json({ 
      id: result.insertId, 
      message: 'Bank added successfully' 
    });
  } catch (error) {
    console.error('Error creating bank:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      const duplicateField = /account_number/i.test(error.sqlMessage || '')
        ? 'account number'
        : 'bank details';
      return res.status(400).json({ error: `A bank with the same ${duplicateField} already exists` });
    }
    res.status(500).json({ error: 'Failed to add bank' });
  }
});

// PUT update bank
router.put('/banks/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const {
    bank_name,
    account_number,
    branch_name,
    account_type,
    currency,
    opening_balance,
    company,
    notes,
    status
  } = req.body;

  if (!bank_name) {
    return res.status(400).json({ error: 'Bank name is required' });
  }

  try {
    const [existingRows] = await pool.query('SELECT * FROM bank_details WHERE id = ?', [id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Bank not found' });
    }
    const existingBank = existingRows[0];

    const oldOpening = parseFloat(existingBank.opening_balance) || 0;
    const oldCurrent = parseFloat(existingBank.current_balance) || 0;
    const existingTransactions = moneyMath.round2(moneyMath.sub(oldCurrent, oldOpening));

    const newOpening = opening_balance !== undefined && opening_balance !== null && Number.isFinite(parseFloat(opening_balance))
      ? parseFloat(opening_balance)
      : oldOpening;

    const recalculatedCurrentBalance = moneyMath.round2(moneyMath.add(newOpening, existingTransactions));

    // Changing the opening balance changes the opening row, which is dated in the past:
    // that month must be open (services/periodLock.js).
    if (moneyMath.compare(newOpening, oldOpening) !== 0) {
      const [openingDates] = await pool.query(
        "SELECT DATE_FORMAT(transaction_date, '%Y-%m-%d') AS d FROM finance_transactions WHERE bank_id = ? AND reference_type = 'OPENING_BALANCE' AND status = 1",
        [id]
      );
      await periodLock.assertOpen(pool, req.user.userId, openingDates.map((row) => row.d));
    }

    const [result] = await pool.query(
      `UPDATE bank_details 
       SET bank_name = ?, account_number = ?, branch_name = ?, 
           account_type = ?, currency = ?, opening_balance = ?, 
           current_balance = ?, company = ?, notes = ?, status = ?
       WHERE id = ?`,
      [
        bank_name,
        account_number || null,
        branch_name || null,
        account_type || 'Current',
        currency || 'LKR',
        newOpening,
        recalculatedCurrentBalance,
        company || existingBank.company || 'JH',
        notes || null,
        status || 'Active',
        id
      ]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Bank not found' });
    }

    const [opRows] = await pool.query(
      "SELECT id FROM finance_transactions WHERE bank_id = ? AND reference_type = 'OPENING_BALANCE' AND status = 1 LIMIT 1",
      [id]
    );

    const isPositive = newOpening >= 0;
    const debit = isPositive ? newOpening : 0;
    const credit = isPositive ? 0 : Math.abs(newOpening);
    const direction = isPositive ? 'IN' : 'OUT';

    if (opRows.length > 0) {
      if (newOpening !== 0) {
        await pool.query(
          `UPDATE finance_transactions 
           SET debit = ?, credit = ?, transaction_direction = ?, balance_after = ?
           WHERE id = ?`,
          [debit, credit, direction, recalculatedCurrentBalance, opRows[0].id]
        );
      } else {
        await pool.query(
          'UPDATE finance_transactions SET debit = 0, credit = 0, status = 0 WHERE id = ?',
          [opRows[0].id]
        );
      }
    } else if (newOpening !== 0) {
      const [companyRows] = await pool.query('SELECT id FROM company WHERE name = ? LIMIT 1', [company || existingBank.company || 'JH']);
      await pool.query(
        `INSERT INTO finance_transactions
           (account_type, company_id, bank_id, transaction_date, transaction_type, transaction_direction, remark, debit, credit, balance_after, reference_type, created_by)
         VALUES ('BANK', ?, ?, CURDATE(), 'Opening Balance', ?, 'Opening Balance', ?, ?, ?, 'OPENING_BALANCE', ?)`,
        [companyRows[0]?.id || null, id, direction, debit, credit, recalculatedCurrentBalance, req.user?.userId || null]
      );
    }
    // The opening row was changed / added: refresh the running balances after it.
    await refreshAccounts(pool, [{ account_type: 'BANK', bank_id: id }]);
    
    res.json({ message: 'Bank updated successfully', current_balance: recalculatedCurrentBalance });
  } catch (error) {
    if (error.name === 'PeriodClosedError') return res.status(409).json({ error: error.message, code: error.code });
    console.error('Error updating bank:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Bank name already exists' });
    }
    res.status(500).json({ error: 'Failed to update bank' });
  }
});

// DELETE bank (soft delete by setting status to Inactive)
router.delete('/banks/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      'UPDATE bank_details SET status = "Inactive" WHERE id = ?',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Bank not found' });
    }
    
    res.json({ message: 'Bank deleted successfully' });
  } catch (error) {
    console.error('Error deleting bank:', error);
    res.status(500).json({ error: 'Failed to delete bank' });
  }
});

module.exports = router;
