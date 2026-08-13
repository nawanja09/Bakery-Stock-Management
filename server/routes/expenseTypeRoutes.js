// routes/expenseTypeRoutes.js
// Backs the "Expenses Type" dropdown on the New Expenses form.
const express = require('express');
const pool = require('../config/db');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

// GET all active expense types
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name FROM expense_types WHERE COALESCE(status, 1) = 1 ORDER BY name ASC'
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching expense types:', error);
    res.status(500).json({ error: 'Failed to fetch expense types' });
  }
});

// POST create an expense type
router.post('/', authenticate, async (req, res) => {
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Expense type name is required' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO expense_types (name, created_by, created_at, updated_at)
       VALUES (?, ?, NOW(), NOW())`,
      [name.trim(), req.user.userId]
    );

    res.status(201).json({ id: result.insertId, name: name.trim() });
  } catch (error) {
    console.error('Error creating expense type:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'This expense type already exists' });
    }
    res.status(500).json({ error: 'Failed to create expense type' });
  }
});

// PUT update expense type
router.put('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Expense type name is required' });
  }

  try {
    const [result] = await pool.query(
      'UPDATE expense_types SET name = ?, updated_at = NOW() WHERE id = ?',
      [name.trim(), id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Expense type not found' });
    }

    res.json({ message: 'Expense type updated successfully' });
  } catch (error) {
    console.error('Error updating expense type:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'This expense type already exists' });
    }
    res.status(500).json({ error: 'Failed to update expense type' });
  }
});

// DELETE (soft delete) expense type
router.delete('/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      'UPDATE expense_types SET status = 0 WHERE id = ? AND COALESCE(status, 1) = 1',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Expense type not found' });
    }

    res.json({ message: 'Expense type deleted successfully' });
  } catch (error) {
    console.error('Error deleting expense type:', error);
    res.status(500).json({ error: 'Failed to delete expense type' });
  }
});

module.exports = router;
