const pool = require('../config/db');

const createOpeningBalance = async (req, res) => {
  try {
    const { date, item_id, quantity, entered_by } = req.body;

    if (!date || !item_id || !quantity || !entered_by) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const qtyNum = parseFloat(quantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      return res.status(400).json({ error: 'Quantity must be a positive number' });
    }

    // Check if opening balance already exists
    const [existing] = await pool.query(
      'SELECT id FROM opening_balances WHERE item_id = ?',
      [item_id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Opening balance already exists for this item' });
    }

    // Insert new opening balance
    await pool.query(
      `INSERT INTO opening_balances (date, item_id, quantity, entered_by)
       VALUES (?, ?, ?, ?)`,
      [date, item_id, qtyNum, entered_by]
    );

    return res.status(201).json({ message: 'Opening balance added successfully' });
  } catch (error) {
    console.error('Error in createOpeningBalance:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
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
  } catch (error) {
    console.error('Error fetching items without opening balances:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getAllOpeningBalances = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT ob.id, ob.date, i.name AS item_name, ob.quantity, i.unit, u.name AS entered_by
      FROM opening_balances ob
      JOIN items i ON ob.item_id = i.id
      JOIN users u ON ob.entered_by = u.id
      ORDER BY ob.date DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching opening balances:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  createOpeningBalance,
  getItemsWithoutOpeningBalance,
  getAllOpeningBalances
};
