const pool = require('../config/db');

const generateWastageNumber = () => {
  return `FG-WN-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
};

const createFinishedGoodsWastage = async (req, res) => {
  const { date, approved_by, reason, remarks, items } = req.body;
  const created_by = req.user?.id || 5; // Default user if auth not implemented

  try {
    await pool.query('START TRANSACTION');

    const wastage_number = generateWastageNumber();
    
    // Insert wastage record
    const [wastageResult] = await pool.query(
      'INSERT INTO finished_goods_wastages (wastage_number, date, approved_by, reason, remarks, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [wastage_number, date, approved_by, reason, remarks, created_by]
    );

    const wastageId = wastageResult.insertId;

    // Insert wastage items
    for (const item of items) {
      await pool.query(
        'INSERT INTO finished_goods_wastage_items (wastage_id, item_id, quantity, estimated_loss) VALUES (?, ?, ?, ?)',
        [wastageId, item.item_id, item.quantity, item.estimated_loss || 0]
      );
    }

    await pool.query('COMMIT');

    res.status(201).json({
      id: wastageId,
      wastage_number,
      message: 'Finished Goods Wastage recorded successfully'
    });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error creating finished goods wastage:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getAllFinishedGoodsWastages = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT w.*, 
        COUNT(wi.id) as item_count,
        SUM(wi.estimated_loss) as total_loss
      FROM finished_goods_wastages w
      LEFT JOIN finished_goods_wastage_items wi ON w.id = wi.wastage_id
      GROUP BY w.id
      ORDER BY w.date DESC, w.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching finished goods wastages:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getFinishedGoodsWastageById = async (req, res) => {
  const { id } = req.params;

  try {
    const [wastageRows] = await pool.query(`
      SELECT w.*, u.name as entered_by_name
      FROM finished_goods_wastages w
      LEFT JOIN users u ON w.created_by = u.id
      WHERE w.id = ?
    `, [id]);

    if (wastageRows.length === 0) {
      return res.status(404).json({ error: 'Finished Goods Wastage not found' });
    }

    const [itemRows] = await pool.query(`
      SELECT wi.*, fgi.item_code, fgi.name as item_name, fgi.category, fgi.unit_price
      FROM finished_goods_wastage_items wi
      JOIN finished_goods_items fgi ON wi.item_id = fgi.id
      WHERE wi.wastage_id = ?
    `, [id]);

    res.json({
      ...wastageRows[0],
      items: itemRows
    });
  } catch (error) {
    console.error('Error fetching finished goods wastage:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateFinishedGoodsWastage = async (req, res) => {
  const { id } = req.params;
  const { date, approved_by, reason, remarks, items } = req.body;

  try {
    await pool.query('START TRANSACTION');

    // Update wastage record
    const [wastageResult] = await pool.query(
      'UPDATE finished_goods_wastages SET date = ?, approved_by = ?, reason = ?, remarks = ? WHERE id = ?',
      [date, approved_by, reason, remarks, id]
    );

    if (wastageResult.affectedRows === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Finished Goods Wastage not found' });
    }

    // Delete existing items
    await pool.query('DELETE FROM finished_goods_wastage_items WHERE wastage_id = ?', [id]);

    // Insert new items
    for (const item of items) {
      await pool.query(
        'INSERT INTO finished_goods_wastage_items (wastage_id, item_id, quantity, estimated_loss) VALUES (?, ?, ?, ?)',
        [id, item.item_id, item.quantity, item.estimated_loss || 0]
      );
    }

    await pool.query('COMMIT');

    res.json({ message: 'Finished Goods Wastage updated successfully' });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error updating finished goods wastage:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteFinishedGoodsWastage = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query('DELETE FROM finished_goods_wastages WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Finished Goods Wastage not found' });
    }
    
    res.json({ message: 'Finished Goods Wastage deleted successfully' });
  } catch (error) {
    console.error('Error deleting finished goods wastage:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  createFinishedGoodsWastage,
  getAllFinishedGoodsWastages,
  getFinishedGoodsWastageById,
  updateFinishedGoodsWastage,
  deleteFinishedGoodsWastage
};