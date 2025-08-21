const pool = require('../config/db');

const createOpeningBalance = async (req, res) => {
  try {
    const { date, item_id, quantity, unit_cost, entered_by } = req.body;

    // Validate inputs
    if (!date || !item_id || !quantity || !unit_cost || !entered_by) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate numeric fields
    const qtyNum = parseFloat(quantity);
    const costNum = parseFloat(unit_cost);

    if (isNaN(qtyNum) || qtyNum <= 0 || isNaN(costNum) || costNum <= 0) {
      return res.status(400).json({ error: 'Quantity and Unit Cost must be positive numbers' });
    }

    const total_value = qtyNum * costNum;

    // Check if opening balance already exists for this item
    const [existing] = await pool.query(
      'SELECT id FROM opening_balances WHERE item_id = ?',
      [item_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Opening balance already exists for this item' });
    }

    // Insert opening balance
    const [result] = await pool.query(
      `INSERT INTO opening_balances (date, item_id, quantity, unit_cost, total_value, entered_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [date, item_id, qtyNum, costNum, total_value, entered_by]
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
      SELECT ob.id, ob.date, i.name AS item_name, ob.quantity, i.unit, ob.unit_cost, ob.total_value, u.name AS entered_by
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
