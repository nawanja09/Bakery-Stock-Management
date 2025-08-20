const pool = require('../config/db');

const createOpeningBalance = async (req, res) => {
  const { date, item_id, quantity, unit_cost, entered_by } = req.body;
  
  try {
    // Check if opening balance already exists for item
    const [existing] = await pool.query(
      'SELECT id FROM opening_balances WHERE item_id = ?',
      [item_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ 
        error: 'Opening balance already exists for this item' 
      });
    }

    // Calculate total value
    const total_value = quantity * unit_cost;
    
    const [result] = await pool.query(
      `INSERT INTO opening_balances 
      (date, item_id, quantity, unit_cost, total_value, entered_by)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [date, item_id, quantity, unit_cost, total_value, entered_by]
    );
    
    res.status(201).json({
      id: result.insertId,
      message: 'Opening balance recorded successfully'
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ 
        error: 'Opening balance already exists for this item' 
      });
    }
    console.error('Error creating opening balance:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Add new controller function
const getItemsWithoutOpeningBalance = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT i.* 
      FROM items i
      LEFT JOIN opening_balances ob ON i.id = ob.item_id
      WHERE ob.item_id IS NULL
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getAllOpeningBalances = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        ob.id, 
        ob.date, 
        i.name AS item_name, 
        ob.quantity, 
        i.unit, 
        ob.unit_cost, 
        ob.total_value,
        u.name AS entered_by
      FROM opening_balances ob
      JOIN items i ON ob.item_id = i.id
      JOIN users u ON ob.entered_by = u.id
      ORDER BY ob.date DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching opening balances:', error.message);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

module.exports = {
    createOpeningBalance,
    getAllOpeningBalances,
    getItemsWithoutOpeningBalance
};