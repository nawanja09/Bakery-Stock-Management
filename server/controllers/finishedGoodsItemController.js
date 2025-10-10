const pool = require('../config/db');

const createFinishedGoodsItem = async (req, res) => {
  const { item_code, name, category } = req.body;

  console.log('Received data:', { item_code, name, category });

  // Validate required fields
  if (!item_code || !name || !category) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    // Check for duplicate item_code first
    const [existing] = await pool.query(
      'SELECT id FROM finished_goods_items WHERE item_code = ?',
      [item_code.trim()]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Item code already exists' });
    }

    const [result] = await pool.query(
      'INSERT INTO finished_goods_items (item_code, name, category) VALUES (?, ?, ?)',
      [item_code.trim(), name.trim(), category]
    );
    
    console.log('Item created successfully with ID:', result.insertId);
    
    res.status(201).json({
      id: result.insertId,
      message: 'Finished Goods Item added successfully'
    });
  } catch (error) {
    console.error('Error adding finished goods item:', error);
    
    // Provide more specific error messages
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Item code already exists' });
    }
    
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

const getAllFinishedGoodsItems = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT fgi.*, 
        (SELECT COUNT(*) FROM finished_goods_ingredients WHERE finished_good_id = fgi.id) as ingredient_count
      FROM finished_goods_items fgi 
      ORDER BY fgi.name
    `);
    
    // Format the response to include has_ingredients field
    const formattedRows = rows.map(row => ({
      ...row,
      has_ingredients: row.ingredient_count > 0 ? `${row.ingredient_count} ingredients` : null
    }));
    
    res.json(formattedRows);
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
  const { item_code, name, category } = req.body;

  // Validate required fields
  if (!item_code || !name || !category) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    // Check for duplicate item_code (excluding current item)
    const [existing] = await pool.query(
      'SELECT id FROM finished_goods_items WHERE item_code = ? AND id != ?',
      [item_code.trim(), id]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Item code already exists' });
    }

    const [result] = await pool.query(
      'UPDATE finished_goods_items SET item_code = ?, name = ?, category = ? WHERE id = ?',
      [item_code.trim(), name.trim(), category, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Finished Goods Item not found' });
    }
    
    res.json({ message: 'Finished Goods Item updated successfully' });
  } catch (error) {
    console.error('Error updating finished goods item:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Item code already exists' });
    }
    
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteFinishedGoodsItem = async (req, res) => {
  const { id } = req.params;

  try {
    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // First delete related ingredients
      await connection.query('DELETE FROM finished_goods_ingredients WHERE finished_good_id = ?', [id]);
      
      // Then delete the item
      const [result] = await connection.query('DELETE FROM finished_goods_items WHERE id = ?', [id]);
      
      if (result.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Finished Goods Item not found' });
      }
      
      await connection.commit();
      res.json({ message: 'Finished Goods Item deleted successfully' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
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