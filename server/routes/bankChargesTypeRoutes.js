const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticate = require('../middleware/authenticate');
const restrictRoles = require('../middleware/restrictRoles');

// Fetch all bank charge types
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, type_name, status FROM bank_charges_types WHERE status = 1 ORDER BY type_name ASC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching bank charge types:', error);
    res.status(500).json({ error: 'Failed to fetch bank charge types' });
  }
});

// Create a new bank charge type
router.post('/', authenticate, restrictRoles('Admin', 'Accountant', 'Manager'), async (req, res) => {
  const { type_name } = req.body;
  if (!type_name || !type_name.trim()) {
    return res.status(400).json({ error: 'Type name is required' });
  }

  try {
    const [existing] = await pool.query(
      'SELECT id, status FROM bank_charges_types WHERE type_name = ?',
      [type_name.trim()]
    );
    
    if (existing.length > 0) {
      if (existing[0].status === 0) {
        await pool.query('UPDATE bank_charges_types SET status = 1 WHERE id = ?', [existing[0].id]);
        return res.json({ message: 'Bank charge type restored', id: existing[0].id });
      }
      return res.status(400).json({ error: 'Bank charge type already exists' });
    }

    const [result] = await pool.query(
      'INSERT INTO bank_charges_types (type_name) VALUES (?)',
      [type_name.trim()]
    );
    res.status(201).json({ message: 'Bank charge type created', id: result.insertId });
  } catch (error) {
    console.error('Error creating bank charge type:', error);
    res.status(500).json({ error: 'Failed to create bank charge type' });
  }
});

// Update a bank charge type
router.put('/:id', authenticate, restrictRoles('Admin', 'Accountant', 'Manager'), async (req, res) => {
  const { id } = req.params;
  const { type_name } = req.body;

  if (!type_name || !type_name.trim()) {
    return res.status(400).json({ error: 'Type name is required' });
  }

  try {
    const [existing] = await pool.query(
      'SELECT id FROM bank_charges_types WHERE type_name = ? AND id != ?',
      [type_name.trim(), id]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Another bank charge type with this name already exists' });
    }

    const [result] = await pool.query(
      'UPDATE bank_charges_types SET type_name = ? WHERE id = ?',
      [type_name.trim(), id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Bank charge type not found' });
    }

    res.json({ message: 'Bank charge type updated' });
  } catch (error) {
    console.error('Error updating bank charge type:', error);
    res.status(500).json({ error: 'Failed to update bank charge type' });
  }
});

// Delete (soft delete) a bank charge type
router.delete('/:id', authenticate, restrictRoles('Admin', 'Accountant', 'Manager'), async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      'UPDATE bank_charges_types SET status = 0 WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Bank charge type not found' });
    }

    res.json({ message: 'Bank charge type deleted' });
  } catch (error) {
    console.error('Error deleting bank charge type:', error);
    res.status(500).json({ error: 'Failed to delete bank charge type' });
  }
});

module.exports = router;
