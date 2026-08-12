const express = require('express');
const pool = require('../config/db');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

// GET all payees
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, payee_name, vat_reg_number FROM payees WHERE COALESCE(status, 1) = 1 ORDER BY payee_name ASC'
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching payees:', error);
    res.status(500).json({ error: 'Failed to fetch payees' });
  }
});

// POST create a payee
router.post('/', authenticate, async (req, res) => {
  const { payee_name, vat_reg_number } = req.body;

  if (!payee_name || !payee_name.trim()) {
    return res.status(400).json({ error: 'Payee name is required' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO payees (payee_name, vat_reg_number, created_at, updated_at)
       VALUES (?, ?, NOW(), NOW())`,
      [payee_name.trim(), vat_reg_number || null]
    );

    res.status(201).json({
      id: result.insertId,
      payee_name: payee_name.trim(),
      vat_reg_number: vat_reg_number || null
    });
  } catch (error) {
    console.error('Error creating payee:', error);
    res.status(500).json({ error: 'Failed to create payee' });
  }
});

// PUT update payee
router.put('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { payee_name, vat_reg_number } = req.body;

  if (!payee_name || !payee_name.trim()) {
    return res.status(400).json({ error: 'Payee name is required' });
  }

  try {
    const [result] = await pool.query(
      `UPDATE payees
       SET payee_name = ?, vat_reg_number = ?, updated_at = NOW()
       WHERE id = ?`,
      [payee_name.trim(), vat_reg_number || null, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Payee not found' });
    }

    res.json({ message: 'Payee updated successfully' });
  } catch (error) {
    console.error('Error updating payee:', error);
    res.status(500).json({ error: 'Failed to update payee' });
  }
});

// DELETE payee
router.delete('/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      'UPDATE payees SET status = 0 WHERE id = ? AND COALESCE(status, 1) = 1',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Payee not found' });
    }

    res.json({ message: 'Payee deleted successfully' });
  } catch (error) {
    console.error('Error deleting payee:', error);
    res.status(500).json({ error: 'Failed to delete payee' });
  }
});

module.exports = router;
