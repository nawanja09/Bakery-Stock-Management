// server/routes/hiddenExpenseRoutes.js
//
// Hidden Expenses screen (Expenses > Hidden Expenses).
//
// IMPORTANT: Hidden Expenses are report-only records. Unlike every other
// expense route in this app, this file intentionally NEVER imports or
// calls recordCashTransaction / recordBankTransaction. Creating, editing
// or deleting a Hidden Expense must not create, update or reverse any
// Cash Book or Bank Book transaction, and must not touch the Cash/Bank
// ledger balances in any way.
//
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticate = require('../middleware/authenticate');
const restrictRoles = require('../middleware/restrictRoles');

const ALLOWED_TYPES = ['PickMe', 'Credit Card Charge'];

router.use(authenticate, restrictRoles('Store Keeper', 'Stores'));

// =============================================
// GET — list all hidden expenses
// =============================================
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         hidden_expenses.id,
         DATE_FORMAT(hidden_expenses.expense_date, '%Y-%m-%d') AS expense_date,
         hidden_expenses.amount,
         hidden_expenses.type,
         hidden_expenses.description,
         hidden_expenses.company_id,
         c.name AS company_name,
         hidden_expenses.reference_number,
         DATE_FORMAT(hidden_expenses.created_at, '%Y-%m-%d %H:%i') AS created_date
       FROM hidden_expenses
       LEFT JOIN company c ON c.id = hidden_expenses.company_id
       WHERE hidden_expenses.is_deleted = 0
       ORDER BY hidden_expenses.expense_date DESC, hidden_expenses.id DESC`
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching hidden expenses:', error);
    res.status(500).json({ error: 'Failed to fetch hidden expenses' });
  }
});

// =============================================
// POST — create a new hidden expense
// =============================================
router.post('/', async (req, res) => {
  const { expense_date, amount, type, description, company_id, reference_number } = req.body;
  const userId = req.user.userId;

  if (!expense_date || !amount || !type) {
    return res.status(400).json({ error: 'Date, Amount and Type are required' });
  }
  if (!ALLOWED_TYPES.includes(type)) {
    return res.status(400).json({ error: `Type must be one of: ${ALLOWED_TYPES.join(', ')}` });
  }
  if (!company_id || !Number.isInteger(Number(company_id)) || Number(company_id) <= 0) {
    return res.status(400).json({ error: 'A valid Company is required' });
  }
  const parsedAmount = parseFloat(amount);
  if (!parsedAmount || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Amount must be greater than zero' });
  }

  try {
    const [companies] = await pool.query('SELECT id FROM company WHERE id = ?', [company_id]);
    if (!companies.length) return res.status(400).json({ error: 'Selected Company does not exist' });
    // No Cash/Bank ledger call here by design — Hidden Expenses never
    // touch cash_transactions / bank_transactions / finance_transactions.
    const [result] = await pool.query(
      `INSERT INTO hidden_expenses (expense_date, amount, type, description, company_id, reference_number, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [expense_date, parsedAmount, type, description || null, company_id, reference_number || null, userId]
    );
    res.status(201).json({ id: result.insertId, message: 'Hidden expense saved successfully' });
  } catch (error) {
    console.error('Error creating hidden expense:', error);
    res.status(500).json({ error: 'Failed to save hidden expense' });
  }
});

// =============================================
// PUT — update a hidden expense
// =============================================
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { expense_date, amount, type, description, company_id, reference_number } = req.body;

  if (!expense_date || !amount || !type) {
    return res.status(400).json({ error: 'Date, Amount and Type are required' });
  }
  if (!ALLOWED_TYPES.includes(type)) {
    return res.status(400).json({ error: `Type must be one of: ${ALLOWED_TYPES.join(', ')}` });
  }
  if (!company_id || !Number.isInteger(Number(company_id)) || Number(company_id) <= 0) {
    return res.status(400).json({ error: 'A valid Company is required' });
  }
  const parsedAmount = parseFloat(amount);
  if (!parsedAmount || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Amount must be greater than zero' });
  }

  try {
    const [companies] = await pool.query('SELECT id FROM company WHERE id = ?', [company_id]);
    if (!companies.length) return res.status(400).json({ error: 'Selected Company does not exist' });
    // No Cash/Bank ledger call here by design.
    const [result] = await pool.query(
      `UPDATE hidden_expenses
       SET expense_date = ?, amount = ?, type = ?, description = ?, company_id = ?, reference_number = ?
       WHERE id = ? AND is_deleted = 0`,
      [expense_date, parsedAmount, type, description || null, company_id, reference_number || null, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Hidden expense not found' });
    }
    res.json({ message: 'Hidden expense updated successfully' });
  } catch (error) {
    console.error('Error updating hidden expense:', error);
    res.status(500).json({ error: 'Failed to update hidden expense' });
  }
});

// =============================================
// DELETE — soft delete a hidden expense
// =============================================
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // No Cash/Bank ledger call here by design — there is nothing to reverse.
    const [result] = await pool.query(
      'UPDATE hidden_expenses SET is_deleted = 1 WHERE id = ? AND is_deleted = 0',
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Hidden expense not found' });
    }
    res.json({ message: 'Hidden expense deleted successfully' });
  } catch (error) {
    console.error('Error deleting hidden expense:', error);
    res.status(500).json({ error: 'Failed to delete hidden expense' });
  }
});

module.exports = router;
