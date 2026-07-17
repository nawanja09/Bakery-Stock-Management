// controllers/paymentMethodController.js
const pool = require('../config/db');

// GET /api/payment-methods
// By default returns only active methods (what the Purchasing page dropdown
// should show). Pass ?include_inactive=true for the management page so it
// can also show/manage disabled methods.
const getAllPaymentMethods = async (req, res) => {
  try {
    const includeInactive = req.query.include_inactive === 'true';

    let query = `SELECT id, name, is_active, created_at, updated_at FROM payment_methods`;
    if (!includeInactive) {
      query += ` WHERE is_active = 1`;
    }
    query += ` ORDER BY name ASC`;

    const [rows] = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /api/payment-methods
const createPaymentMethod = async (req, res) => {
  try {
    const name = (req.body.name || '').trim();

    if (!name) {
      return res.status(400).json({ error: 'Payment method name is required' });
    }

    const [existing] = await pool.query(
      'SELECT id FROM payment_methods WHERE name = ?',
      [name]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'A payment method with this name already exists' });
    }

    const [result] = await pool.query(
      'INSERT INTO payment_methods (name, is_active) VALUES (?, 1)',
      [name]
    );

    res.status(201).json({
      message: 'Payment method added successfully.',
      id: result.insertId,
      name,
      is_active: 1
    });
  } catch (error) {
    console.error('Error creating payment method:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// PUT /api/payment-methods/:id
// Supports renaming and/or toggling is_active in one call.
const updatePaymentMethod = async (req, res) => {
  const { id } = req.params;
  const { name, is_active } = req.body;

  try {
    const [existing] = await pool.query('SELECT id FROM payment_methods WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Payment method not found' });
    }

    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (!trimmedName) {
        return res.status(400).json({ error: 'Payment method name cannot be empty' });
      }

      const [duplicate] = await pool.query(
        'SELECT id FROM payment_methods WHERE name = ? AND id != ?',
        [trimmedName, id]
      );
      if (duplicate.length > 0) {
        return res.status(400).json({ error: 'A payment method with this name already exists' });
      }

      await pool.query('UPDATE payment_methods SET name = ? WHERE id = ?', [trimmedName, id]);
    }

    if (is_active !== undefined) {
      await pool.query('UPDATE payment_methods SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, id]);
    }

    res.json({ message: 'Payment method updated successfully.' });
  } catch (error) {
    console.error('Error updating payment method:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// DELETE /api/payment-methods/:id
// Only hard-deletes if no purchase references it (protected by the FK too).
// Otherwise, tells the caller to deactivate instead so historical purchase
// records are never left pointing at a missing payment method.
// DELETE /api/payment-methods/:id
const deletePaymentMethod = async (req, res) => {
  const { id } = req.params;

  try {
    const [existing] = await pool.query('SELECT id, name FROM payment_methods WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Payment method not found' });
    }

    // Get the payment method name to check against purchases table
    const methodName = existing[0].name;

    // Check if this payment method is used in any purchase
    const [inUse] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM purchases WHERE payment_method = ?',
      [methodName]
    );

    if (inUse[0].cnt > 0) {
      return res.status(409).json({
        error: `This payment method is used on ${inUse[0].cnt} purchase record(s) and cannot be deleted. You can deactivate it instead so it no longer appears in the dropdown.`
      });
    }

    await pool.query('DELETE FROM payment_methods WHERE id = ?', [id]);
    res.json({ message: 'Payment method deleted successfully.' });
  } catch (error) {
    console.error('Error deleting payment method:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Seed the three built-in payment methods (Cash, Cheque, Bank) if the table
// is completely empty. This runs once at server startup so the management page
// always shows sensible defaults out of the box.
const seedDefaultPaymentMethods = async () => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM payment_methods');
    if (rows[0].cnt > 0) return; // Already seeded — do nothing

    const defaults = ['Cash', 'Cheque', 'Bank'];
    for (const name of defaults) {
      await pool.query(
        'INSERT INTO payment_methods (name, is_active) VALUES (?, 1)',
        [name]
      );
    }
    console.log('✅ Default payment methods seeded: Cash, Cheque, Bank');
  } catch (error) {
    console.error('⚠️  Could not seed default payment methods:', error.message);
    // Non-fatal — the server still starts normally
  }
};

// Run seed immediately when this module is first required by server.js
seedDefaultPaymentMethods();

module.exports = {
  getAllPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  seedDefaultPaymentMethods
};