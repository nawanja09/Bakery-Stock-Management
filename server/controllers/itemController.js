const pool = require('../config/db');

const createItem = async (req, res) => {
  const { item_code, name, unit, reorder_level } = req.body;

  try {
    const [result] = await pool.query(
      'INSERT INTO items (item_code, name, unit, reorder_level) VALUES (?, ?, ?, ?)',
      [item_code, name, unit, reorder_level]
    );
    
    res.status(201).json({
      id: result.insertId,
      message: 'Item added successfully'
    });
  } catch (error) {
    console.error('Error adding item:', error);
    
    // Handle duplicate item_code error
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Item code already exists' });
    }
    
    res.status(500).json({ error: 'Server error' });
  }
};

const getAllItems = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, item_code, name, unit, reorder_level FROM items WHERE deleted = FALSE ORDER BY item_code'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getItemById = async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(
      'SELECT * FROM items WHERE id = ? AND deleted = FALSE', 
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateItem = async (req, res) => {
  const { id } = req.params;
  const { item_code, name, unit, reorder_level } = req.body;

  try {
    const [result] = await pool.query(
      'UPDATE items SET item_code = ?, name = ?, unit = ?, reorder_level = ? WHERE id = ? AND deleted = FALSE',
      [item_code, name, unit, reorder_level, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json({ message: 'Item updated successfully' });
  } catch (error) {
    console.error('Error updating item:', error);
    
    // Handle duplicate item_code error
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Item code already exists' });
    }
    
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteItem = async (req, res) => {
  const { id } = req.params;

  try {
    // Soft delete - mark as deleted instead of removing
    const [result] = await pool.query(
      'UPDATE items SET deleted = TRUE WHERE id = ?', 
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getItemsWithoutOpeningBalance = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT i.* 
      FROM items i
      LEFT JOIN opening_balances ob ON i.id = ob.item_id
      WHERE ob.item_id IS NULL AND i.deleted = FALSE
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching items without opening balance:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getAllItems,
  createItem,
  getItemById,
  updateItem,
  deleteItem,
  getItemsWithoutOpeningBalance
};