// server/routes/receiveTypeRoutes.js
// Backs the "Receive Type" dropdown on Cash Receive and Bank Receive forms.
// Mirrors the bankChargesTypeRoutes.js pattern exactly.
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticate = require('../middleware/authenticate');
const requireRoles = require('../middleware/requireRoles');

const adminOrAccountant = requireRoles('Admin', 'Accountant');

// GET all active receive types (used by Cash Receive / Bank Receive dropdowns)
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, type_name, status FROM receive_types WHERE status = 1 ORDER BY type_name ASC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching receive types:', error);
    res.status(500).json({ error: 'Failed to fetch receive types' });
  }
});

// GET all receive types including inactive (for management UI)
router.get('/all', authenticate, adminOrAccountant, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, type_name, status FROM receive_types ORDER BY type_name ASC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching all receive types:', error);
    res.status(500).json({ error: 'Failed to fetch receive types' });
  }
});

// POST create a new receive type
router.post('/', authenticate, adminOrAccountant, async (req, res) => {
  const { type_name } = req.body;
  if (!type_name || !type_name.trim()) {
    return res.status(400).json({ error: 'Type name is required' });
  }

  try {
    const [existing] = await pool.query(
      'SELECT id, status FROM receive_types WHERE type_name = ?',
      [type_name.trim()]
    );

    if (existing.length > 0) {
      if (existing[0].status === 0) {
        // Restore soft-deleted entry
        await pool.query('UPDATE receive_types SET status = 1 WHERE id = ?', [existing[0].id]);
        return res.json({ message: 'Receive type restored', id: existing[0].id });
      }
      return res.status(400).json({ error: 'Receive type already exists' });
    }

    const [result] = await pool.query(
      'INSERT INTO receive_types (type_name) VALUES (?)',
      [type_name.trim()]
    );
    res.status(201).json({ message: 'Receive type created', id: result.insertId });
  } catch (error) {
    console.error('Error creating receive type:', error);
    res.status(500).json({ error: 'Failed to create receive type' });
  }
});

// PUT update a receive type name
router.put('/:id', authenticate, adminOrAccountant, async (req, res) => {
  const { id } = req.params;
  const { type_name } = req.body;

  if (!type_name || !type_name.trim()) {
    return res.status(400).json({ error: 'Type name is required' });
  }

  try {
    const [existing] = await pool.query(
      'SELECT id FROM receive_types WHERE type_name = ? AND id != ?',
      [type_name.trim(), id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Another receive type with this name already exists' });
    }

    const [result] = await pool.query(
      'UPDATE receive_types SET type_name = ? WHERE id = ?',
      [type_name.trim(), id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Receive type not found' });
    }

    res.json({ message: 'Receive type updated' });
  } catch (error) {
    console.error('Error updating receive type:', error);
    res.status(500).json({ error: 'Failed to update receive type' });
  }
});

// DELETE (soft-delete) a receive type — sets status = 0
router.delete('/:id', authenticate, adminOrAccountant, async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      'UPDATE receive_types SET status = 0 WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Receive type not found' });
    }

    res.json({ message: 'Receive type deactivated' });
  } catch (error) {
    console.error('Error deactivating receive type:', error);
    res.status(500).json({ error: 'Failed to deactivate receive type' });
  }
});

// PATCH /:id/restore — re-activate a deactivated receive type
router.patch('/:id/restore', authenticate, adminOrAccountant, async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      'UPDATE receive_types SET status = 1 WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Receive type not found' });
    }

    res.json({ message: 'Receive type activated' });
  } catch (error) {
    console.error('Error activating receive type:', error);
    res.status(500).json({ error: 'Failed to activate receive type' });
  }
});

module.exports = router;
