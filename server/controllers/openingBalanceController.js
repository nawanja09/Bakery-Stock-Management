const pool = require('../config/db');

const createOpeningBalance = async (req, res) => {
  try {
    const { date, item_id, quantity } = req.body;

    if (!date || !item_id || quantity === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const qtyNum = parseFloat(quantity);
    if (isNaN(qtyNum)) {
      return res.status(400).json({ error: 'Invalid quantity value' });
    }

    // Check if opening balance already exists
    const [existing] = await pool.query(
      'SELECT id FROM opening_balances WHERE item_id = ?',
      [item_id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Opening balance already exists for this item' });
    }

    await pool.query(
      'INSERT INTO opening_balances (date, item_id, quantity) VALUES (?, ?, ?)',
      [date, item_id, qtyNum]
    );

    return res.status(201).json({ message: 'Opening balance added successfully' });
  } catch (err) {
    console.error('Error creating opening balance:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

const getItemsWithoutOpeningBalance = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT i.* FROM items i
      LEFT JOIN opening_balances ob ON i.id = ob.item_id
      WHERE ob.item_id IS NULL
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getAllOpeningBalances = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT ob.id, ob.date, i.name AS item_name, ob.quantity, i.unit
      FROM opening_balances ob
      JOIN items i ON ob.item_id = i.id
      ORDER BY ob.date DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateOpeningBalance = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, quantity } = req.body;

    if (!date || quantity === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const qtyNum = parseFloat(quantity);
    if (isNaN(qtyNum)) {
      return res.status(400).json({ error: 'Invalid quantity value' });
    }

    const [result] = await pool.query(
      'UPDATE opening_balances SET date = ?, quantity = ? WHERE id = ?',
      [date, qtyNum, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Opening balance not found' });
    }

    res.json({ message: 'Opening balance updated successfully' });
  } catch (err) {
    console.error('Error updating opening balance:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  createOpeningBalance,
  getItemsWithoutOpeningBalance,
  getAllOpeningBalances,
  updateOpeningBalance
};
