const pool = require('../config/db');

const createFinishedGoodsOpeningBalance = async (req, res) => {
  const { date, item_id, quantity } = req.body;

  try {
    // Check if item already has an opening balance
    const [existing] = await pool.query(
      'SELECT id FROM finished_goods_opening_balances WHERE item_id = ?',
      [item_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ 
        error: 'This finished goods item already has an opening balance. Please update the existing record instead.' 
      });
    }

    const [result] = await pool.query(
      'INSERT INTO finished_goods_opening_balances (date, item_id, quantity) VALUES (?, ?, ?)',
      [date, item_id, quantity]
    );
    
    res.status(201).json({
      id: result.insertId,
      message: 'Finished Goods Opening Balance added successfully'
    });
  } catch (error) {
    console.error('Error adding finished goods opening balance:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getAllFinishedGoodsOpeningBalances = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT fgob.*, fgi.item_code, fgi.name as item_name, fgi.category
      FROM finished_goods_opening_balances fgob
      JOIN finished_goods_items fgi ON fgob.item_id = fgi.id
      ORDER BY fgob.date DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching finished goods opening balances:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getFinishedGoodsOpeningBalanceById = async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(`
      SELECT fgob.*, fgi.item_code, fgi.name as item_name, fgi.category
      FROM finished_goods_opening_balances fgob
      JOIN finished_goods_items fgi ON fgob.item_id = fgi.id
      WHERE fgob.id = ?
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Finished Goods Opening Balance not found' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching finished goods opening balance:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateFinishedGoodsOpeningBalance = async (req, res) => {
  const { id } = req.params;
  const { date, quantity } = req.body;

  try {
    const [result] = await pool.query(
      'UPDATE finished_goods_opening_balances SET date = ?, quantity = ? WHERE id = ?',
      [date, quantity, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Finished Goods Opening Balance not found' });
    }
    
    res.json({ message: 'Finished Goods Opening Balance updated successfully' });
  } catch (error) {
    console.error('Error updating finished goods opening balance:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteFinishedGoodsOpeningBalance = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query('DELETE FROM finished_goods_opening_balances WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Finished Goods Opening Balance not found' });
    }
    
    res.json({ message: 'Finished Goods Opening Balance deleted successfully' });
  } catch (error) {
    console.error('Error deleting finished goods opening balance:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getFinishedGoodsItemsWithoutOpeningBalance = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT fgi.* 
      FROM finished_goods_items fgi
      LEFT JOIN finished_goods_opening_balances fgob ON fgi.id = fgob.item_id
      WHERE fgob.item_id IS NULL
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching finished goods items without opening balance:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getAllFinishedGoodsOpeningBalances,
  createFinishedGoodsOpeningBalance,
  getFinishedGoodsOpeningBalanceById,
  updateFinishedGoodsOpeningBalance,
  deleteFinishedGoodsOpeningBalance,
  getFinishedGoodsItemsWithoutOpeningBalance
};