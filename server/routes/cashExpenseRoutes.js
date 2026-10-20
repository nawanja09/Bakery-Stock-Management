// server/routes/cashExpenseRoutes.js
//
// REST API for the Cash Expenses screen.
// Pattern mirrors expenseRoutes.js (Petty Cash section).
// Every expense creation debits the company's Cash ledger via
// the shared recordCashTransaction() utility.
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticate = require('../middleware/authenticate');
const restrictRoles = require('../middleware/restrictRoles');
const moneyMath = require('../utils/money');
const { recordCashTransaction } = require('../utils/financeLedger');
const { checkDuplicateReference } = require('../services/referenceValidationService');
const { resolveExpenseClassification, ExpenseClassificationError } = require('../utils/expenseClassification');

// Block Store Keeper / Stores from the Expenses module (same guard as other expense routes)
router.use(authenticate, restrictRoles('Store Keeper', 'Stores'));

// =============================================
// GET — next auto-generated voucher number
// Returns CE-001, CE-002, … based on the last row
// =============================================
router.get('/next-voucher-number', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT voucher_number FROM cash_expenses ORDER BY id DESC LIMIT 1'
    );

    let nextNumber = 'CE-001';

    if (rows.length > 0 && rows[0].voucher_number) {
      const match = rows[0].voucher_number.match(/\d+$/);
      if (match) {
        const num = parseInt(match[0]) + 1;
        nextNumber = `CE-${String(num).padStart(3, '0')}`;
      }
    }

    res.json({ voucher_number: nextNumber });
  } catch (error) {
    console.error('Error generating Cash Expense voucher number:', error);
    res.json({ voucher_number: `CE-${Date.now()}` });
  }
});

// =============================================
// GET — list all cash expenses (latest 200)
// =============================================
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         ce.id,
         DATE_FORMAT(ce.expense_date, '%Y-%m-%d') AS expense_date,
         ce.voucher_number,
         ce.expense_type,
         ce.expense_type_id,
         ce.sub_expense_type_id,
         ce.sub_expense_type,
         ce.description,
         ce.amount,
         ce.company_id,
         c.name AS company_name,
         DATE_FORMAT(ce.created_at, '%Y-%m-%d') AS created_date
       FROM cash_expenses ce
       LEFT JOIN company c ON ce.company_id = c.id
       WHERE ce.status = 1
       ORDER BY ce.created_at DESC
       LIMIT 200`
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching cash expenses:', error);
    res.status(500).json({ error: 'Failed to fetch cash expenses' });
  }
});

// =============================================
// POST — create a new cash expense
// =============================================
router.post('/', async (req, res) => {
  const {
    expense_date,
    voucher_number,
    company_id,
    expense_type,
    expense_type_id,
    sub_expense_type_id,
    description,
    amount
  } = req.body;

  const userId = req.user.userId;

  // --- Validation ---
  if (!expense_date || !voucher_number || !company_id || !(expense_type || expense_type_id) || !amount) {
    return res.status(400).json({ error: 'Date, Voucher No., Company, Expense Type and Amount are required' });
  }
  if (moneyMath.round2(amount) <= 0) {
    return res.status(400).json({ error: 'Amount must be greater than zero' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Duplicate voucher-number guard (shared service used by all expense modules)
    await checkDuplicateReference(connection, voucher_number);

    // Confirm the selected company has a valid Cash Book (cash_accounts row)
    const [cashAccRows] = await connection.query(
      'SELECT company_id FROM cash_accounts WHERE company_id = ?',
      [company_id]
    );
    if (cashAccRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Selected Company has no valid Cash Book' });
    }

    // Expenses Type / Sub Expenses Type come from Expenses Type Management;
    // the stored names are taken from those tables, not from the request.
    const classification = await resolveExpenseClassification(connection, { expense_type, expense_type_id, sub_expense_type_id });
    const expenseTypeName = classification.expenseTypeName;

    // Insert the expense record
    const [result] = await connection.query(
      `INSERT INTO cash_expenses
         (expense_date, voucher_number, company_id, expense_type, expense_type_id,
          sub_expense_type_id, sub_expense_type, description, amount, created_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        expense_date,
        voucher_number,
        company_id,
        expenseTypeName,
        classification.expenseTypeId,
        classification.subExpenseTypeId,
        classification.subExpenseTypeName,
        description || null,
        amount,
        userId
      ]
    );

    // Post a CREDIT (money out) to the company's Cash ledger
    await recordCashTransaction(connection, {
      companyId:       company_id,
      date:            expense_date,
      remark:          `Cash Expense - ${expenseTypeName}`,
      credit:          moneyMath.round2(amount),
      transactionType: 'Cash Expense',
      referenceNumber: voucher_number,
      referenceType:   'CASH_EXPENSE',
      referenceId:     result.insertId,
      createdBy:       userId
    });

    await connection.commit();

    res.status(201).json({
      id:      result.insertId,
      message: 'Cash expense created successfully'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating cash expense:', error);
    if (error instanceof ExpenseClassificationError) {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 'ER_DUP_ENTRY' || error.name === 'DuplicateReferenceError') {
      return res.status(400).json({
        error: error.name === 'DuplicateReferenceError'
          ? error.message
          : 'Voucher number already exists'
      });
    }
    if (error.name === 'InsufficientBalanceError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create cash expense' });
  } finally {
    connection.release();
  }
});

// =============================================
// PUT — update an existing cash expense
// =============================================
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    expense_date,
    voucher_number,
    company_id,
    expense_type,
    expense_type_id,
    sub_expense_type_id,
    description,
    amount
  } = req.body;

  const userId = req.user.userId;

  if (!expense_date || !voucher_number || !company_id || !(expense_type || expense_type_id) || !amount) {
    return res.status(400).json({ error: 'Date, Voucher No., Company, Expense Type and Amount are required' });
  }
  if (moneyMath.round2(amount) <= 0) {
    return res.status(400).json({ error: 'Amount must be greater than zero' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Duplicate voucher guard (exclude this record's own voucher)
    await checkDuplicateReference(connection, voucher_number, { table: 'cash_expenses', id });

    // Fetch old amount to compute the ledger adjustment
    const [oldRows] = await connection.query(
      `SELECT amount, company_id, voucher_number, expense_type, expense_type_id,
              sub_expense_type_id, sub_expense_type
       FROM cash_expenses WHERE id = ? AND status = 1 FOR UPDATE`,
      [id]
    );
    if (oldRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Cash expense not found' });
    }

    const classification = await resolveExpenseClassification(
      connection, { expense_type, expense_type_id, sub_expense_type_id }, oldRows[0]
    );
    const expenseTypeName = classification.expenseTypeName;

    const oldAmount    = moneyMath.round2(oldRows[0].amount);
    const newAmount    = moneyMath.round2(amount);
    const amountDelta  = moneyMath.sub(newAmount, oldAmount);  // positive = more credit, negative = partial reversal

    // Update the expense row
    await connection.query(
      `UPDATE cash_expenses
       SET expense_date = ?, voucher_number = ?, company_id = ?,
           expense_type = ?, expense_type_id = ?, sub_expense_type_id = ?, sub_expense_type = ?,
           description = ?, amount = ?
       WHERE id = ?`,
      [expense_date, voucher_number, company_id, expenseTypeName, classification.expenseTypeId,
        classification.subExpenseTypeId, classification.subExpenseTypeName, description || null, amount, id]
    );

    // Adjust the Cash ledger by the delta (avoids reversing and re-posting the full amount)
    if (amountDelta !== 0) {
      if (amountDelta > 0) {
        // Extra credit (expense increased)
        await recordCashTransaction(connection, {
          companyId:       company_id,
          date:            expense_date,
          remark:          `Cash Expense Edit (increase) - ${expenseTypeName}`,
          credit:          amountDelta,
          transactionType: 'Cash Expense Edit',
          referenceNumber: voucher_number,
          referenceType:   'CASH_EXPENSE',
          referenceId:     parseInt(id),
          createdBy:       userId
        });
      } else {
        // Debit to reverse part of the previous credit (expense decreased)
        await recordCashTransaction(connection, {
          companyId:       company_id,
          date:            expense_date,
          remark:          `Cash Expense Edit (decrease) - ${expenseTypeName}`,
          debit:           Math.abs(amountDelta),
          transactionType: 'Cash Expense Edit',
          referenceNumber: voucher_number,
          referenceType:   'CASH_EXPENSE',
          referenceId:     parseInt(id),
          createdBy:       userId
        });
      }
    }

    await connection.commit();
    res.json({ message: 'Cash expense updated successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating cash expense:', error);
    if (error instanceof ExpenseClassificationError) {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 'ER_DUP_ENTRY' || error.name === 'DuplicateReferenceError') {
      return res.status(400).json({
        error: error.name === 'DuplicateReferenceError'
          ? error.message
          : 'Voucher number already exists'
      });
    }
    if (error.name === 'InsufficientBalanceError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update cash expense' });
  } finally {
    connection.release();
  }
});

// =============================================
// DELETE — soft-delete + reverse the ledger entry
// =============================================
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      'SELECT amount, company_id, expense_date, voucher_number, expense_type FROM cash_expenses WHERE id = ? AND status = 1 FOR UPDATE',
      [id]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Cash expense not found' });
    }

    const { amount, company_id, expense_date, voucher_number, expense_type } = rows[0];

    // Soft-delete the expense
    await connection.query(
      'UPDATE cash_expenses SET status = 0 WHERE id = ?',
      [id]
    );

    // Reverse the ledger entry — debit to undo the original credit
    await recordCashTransaction(connection, {
      companyId:       company_id,
      date:            expense_date,
      remark:          `Cash Expense Reversal - ${expense_type}`,
      debit:           moneyMath.round2(amount),
      transactionType: 'Cash Expense Reversal',
      referenceNumber: voucher_number,
      referenceType:   'CASH_EXPENSE',
      referenceId:     parseInt(id),
      createdBy:       userId
    });

    await connection.commit();
    res.json({ message: 'Cash expense deleted successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting cash expense:', error);
    res.status(500).json({ error: 'Failed to delete cash expense' });
  } finally {
    connection.release();
  }
});

module.exports = router;
