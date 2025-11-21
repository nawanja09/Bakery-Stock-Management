const pool = require('../config/db');

// Helper function to generate next item code starting from FG0001
const generateNextItemCode = async () => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT item_code FROM finished_goods_items 
       WHERE item_code LIKE 'FG%' 
       ORDER BY LENGTH(item_code), item_code DESC 
       LIMIT 1`
    );
    
    let nextNumber = 1;
    
    if (rows.length > 0) {
      const lastCode = rows[0].item_code;
      const numericPart = parseInt(lastCode.replace('FG', '')) || 0;
      nextNumber = numericPart + 1;
    }
    
    const newCode = 'FG' + nextNumber.toString().padStart(4, '0');
    
    await connection.commit();
    return newCode;
    
  } catch (error) {
    await connection.rollback();
    console.error('Error generating item code:', error);
    return 'FG0001';
  } finally {
    connection.release();
  }
};

const createFinishedGoodsItem = async (req, res) => {
  const { name, category, unit_price, output_quantity } = req.body;

  console.log('Received data:', { name, category, unit_price, output_quantity });

  // Validate required fields
  if (!name || !category) {
    return res.status(400).json({ error: 'Product name and category are required' });
  }

  if (!name.trim()) {
    return res.status(400).json({ error: 'Product name cannot be empty' });
  }

  // Validate output_quantity
  if (!output_quantity || output_quantity <= 0) {
    return res.status(400).json({ error: 'Valid output quantity is required' });
  }

  try {
    const item_code = await generateNextItemCode();
    
    console.log('Generated item code:', item_code);

    const [result] = await pool.query(
      'INSERT INTO finished_goods_items (item_code, name, category, unit_price, output_quantity) VALUES (?, ?, ?, ?, ?)',
      [item_code, name.trim(), category, unit_price || 0, output_quantity]
    );
    
    console.log('Item created successfully with ID:', result.insertId);
    
    res.status(201).json({
      id: result.insertId,
      item_code: item_code,
      message: 'Finished Goods Item added successfully'
    });
  } catch (error) {
    console.error('Error adding finished goods item:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      try {
        const new_item_code = await generateNextItemCode();
        const [retryResult] = await pool.query(
          'INSERT INTO finished_goods_items (item_code, name, category, unit_price, output_quantity) VALUES (?, ?, ?, ?, ?)',
          [new_item_code, name.trim(), category, unit_price || 0, output_quantity]
        );
        
        res.status(201).json({
          id: retryResult.insertId,
          item_code: new_item_code,
          message: 'Finished Goods Item added successfully'
        });
        return;
      } catch (retryError) {
        console.error('Error in retry:', retryError);
        res.status(500).json({ error: 'Failed to create item after retry' });
        return;
      }
    }
    
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

const updateFinishedGoodsItem = async (req, res) => {
  const { id } = req.params;
  const { name, category, unit_price, output_quantity } = req.body;

  // Validate required fields
  if (!name || !category) {
    return res.status(400).json({ error: 'Product name and category are required' });
  }

  if (!name.trim()) {
    return res.status(400).json({ error: 'Product name cannot be empty' });
  }

  // Validate output_quantity
  if (!output_quantity || output_quantity <= 0) {
    return res.status(400).json({ error: 'Valid output quantity is required' });
  }

  try {
    const [result] = await pool.query(
      'UPDATE finished_goods_items SET name = ?, category = ?, unit_price = ?, output_quantity = ? WHERE id = ?',
      [name.trim(), category, unit_price || 0, output_quantity, id]
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

const getAllFinishedGoodsItems = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT fgi.*, 
        (SELECT COUNT(*) FROM finished_goods_ingredients WHERE finished_good_id = fgi.id) as ingredient_count
      FROM finished_goods_items fgi 
      ORDER BY fgi.item_code
    `);
    
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

const deleteFinishedGoodsItem = async (req, res) => {
  const { id } = req.params;

  try {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      await connection.query('DELETE FROM finished_goods_ingredients WHERE finished_good_id = ?', [id]);
      
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