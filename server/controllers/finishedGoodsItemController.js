const pool = require('../config/db');

const createFinishedGoodsItem = async (req, res) => {
  const { item_code, name, category, unit_price } = req.body;

  try {
    const [result] = await pool.query(
      'INSERT INTO finished_goods_items (item_code, name, category, unit_price) VALUES (?, ?, ?, ?)',
      [item_code, name, category, unit_price]
    );
    
    res.status(201).json({
      id: result.insertId,
      message: 'Finished Goods Item added successfully'
    });
  } catch (error) {
    console.error('Error adding finished goods item:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getAllFinishedGoodsItems = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, item_code, name, category, unit_price, created_at FROM finished_goods_items');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching finished goods items:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getFinishedGoodsItemById = async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query('SELECT * FROM finished_goods_items WHERE id = ?', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Finished Goods Item not found' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching finished goods item:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateFinishedGoodsItem = async (req, res) => {
  const { id } = req.params;
  const { item_code, name, category, unit_price } = req.body;

  try {
    const [result] = await pool.query(
      'UPDATE finished_goods_items SET item_code = ?, name = ?, category = ?, unit_price = ? WHERE id = ?',
      [item_code, name, category, unit_price, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Finished Goods Item not found' });
    }
    
    res.json({ message: 'Finished Goods Item updated successfully' });
  } catch (error) {
    console.error('Error updating finished goods item:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteFinishedGoodsItem = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query('DELETE FROM finished_goods_items WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Finished Goods Item not found' });
    }
    
    res.json({ message: 'Finished Goods Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting finished goods item:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getAllFinishedGoodsItems,
  createFinishedGoodsItem,
  getFinishedGoodsItemById,
  updateFinishedGoodsItem,
  deleteFinishedGoodsItem
};