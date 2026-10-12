// server/controllers/finishedGoodsWastageController.js
const pool = require('../config/db');
const withTransaction = require('../utils/withTransaction');
const { HttpError } = require('../utils/staffLoanUtils');

const generateWastageNumber = () => {
  return `FG-WN-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
};

// Get all wastages with optional filtering by type AND department
const getAllFinishedGoodsWastages = async (req, res) => {
  const { type, department_id } = req.query;
  
  try {
    let query = `
      SELECT w.*, 
        COUNT(wi.id) as item_count,
        SUM(wi.estimated_loss) as total_loss,
        d.name as department_name
      FROM finished_goods_wastages w
      LEFT JOIN finished_goods_wastage_items wi ON w.id = wi.wastage_id
      LEFT JOIN departments d ON w.department_id = d.id
    `;
    
    const params = [];
    const conditions = [];
    
    if (type) {
      conditions.push('w.wastage_type = ?');
      params.push(type);
    }
    
    if (department_id) {
      conditions.push('w.department_id = ?');
      params.push(department_id);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' GROUP BY w.id ORDER BY w.date DESC, w.created_at DESC';
    
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching finished goods wastages:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Update create function to include department_id
const createFinishedGoodsWastage = async (req, res) => {
  const { date, approved_by, reason, remarks, items, wastage_type, production_id, department_id, destination_id } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });
  // The authenticated user (the JWT carries userId; req.user.id never existed, so this was always 5).
  const created_by = req.user.userId;

  try {
    const wastage_number = generateWastageNumber();
    const wastageId = await withTransaction(async (connection) => {
      // Insert wastage record - include both department_id and destination_id for general wastage
      const [wastageResult] = await connection.query(
        'INSERT INTO finished_goods_wastages (wastage_number, date, approved_by, reason, remarks, wastage_type, created_by, department_id, destination_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [wastage_number, date, approved_by, reason, remarks, wastage_type || 'General', created_by, department_id || null, destination_id || null]
      );

      // Insert wastage items
      for (const item of items) {
        await connection.query(
          'INSERT INTO finished_goods_wastage_items (wastage_id, item_id, quantity, estimated_loss, production_id) VALUES (?, ?, ?, ?, ?)',
          [wastageResult.insertId, item.item_id, item.quantity, item.estimated_loss || 0, production_id || null]
        );
      }
      return wastageResult.insertId;
    });

    res.status(201).json({
      id: wastageId,
      wastage_number,
      message: 'Finished Goods Wastage recorded successfully'
    });
  } catch (error) {
    console.error('Error creating finished goods wastage:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get wastage by ID
const getFinishedGoodsWastageById = async (req, res) => {
  const { id } = req.params;

  try {
    const [wastageRows] = await pool.query(`
      SELECT w.*, u.name as entered_by_name, p.id as production_id, p.production_date
      FROM finished_goods_wastages w
      LEFT JOIN users u ON w.created_by = u.id
      LEFT JOIN finished_goods_wastage_items wi ON w.id = wi.wastage_id
      LEFT JOIN finished_goods_productions p ON wi.production_id = p.id
      WHERE w.id = ?
      GROUP BY w.id
    `, [id]);

    if (wastageRows.length === 0) {
      return res.status(404).json({ error: 'Finished Goods Wastage not found' });
    }

    const [itemRows] = await pool.query(`
      SELECT wi.*, fgi.item_code, fgi.name as item_name, fgi.category, fgi.unit_price,
             p.id as production_id, p.production_date, p.prepared_by as production_prepared_by
      FROM finished_goods_wastage_items wi
      JOIN finished_goods_items fgi ON wi.item_id = fgi.id
      LEFT JOIN finished_goods_productions p ON wi.production_id = p.id
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

// Get production wastages specifically
const getProductionWastages = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT w.*, 
        COUNT(wi.id) as item_count,
        SUM(wi.estimated_loss) as total_loss,
        p.production_date,
        p.prepared_by as production_prepared_by
      FROM finished_goods_wastages w
      JOIN finished_goods_wastage_items wi ON w.id = wi.wastage_id
      JOIN finished_goods_productions p ON wi.production_id = p.id
      WHERE w.wastage_type = 'Production'
      GROUP BY w.id
      ORDER BY w.date DESC, w.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching production wastages:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateFinishedGoodsWastage = async (req, res) => {
  const { id } = req.params;
  const { date, approved_by, reason, remarks, items } = req.body;

  if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });

  try {
    await withTransaction(async (connection) => {
      // Update wastage record
      const [wastageResult] = await connection.query(
        'UPDATE finished_goods_wastages SET date = ?, approved_by = ?, reason = ?, remarks = ? WHERE id = ?',
        [date, approved_by, reason, remarks, id]
      );
      if (wastageResult.affectedRows === 0) throw new HttpError(404, 'Finished Goods Wastage not found');

      // Delete existing items, then insert the new ones
      await connection.query('DELETE FROM finished_goods_wastage_items WHERE wastage_id = ?', [id]);
      for (const item of items) {
        await connection.query(
          'INSERT INTO finished_goods_wastage_items (wastage_id, item_id, quantity, estimated_loss) VALUES (?, ?, ?, ?)',
          [id, item.item_id, item.quantity, item.estimated_loss || 0]
        );
      }
    });

    res.json({ message: 'Finished Goods Wastage updated successfully' });
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
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

// Get productions for production wastage
const getProductionsForWastage = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.* 
      FROM finished_goods_productions p
      WHERE p.status = 'Completed'
      ORDER BY p.production_date DESC, p.id DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching productions for wastage:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  createFinishedGoodsWastage,
  getAllFinishedGoodsWastages,
  getFinishedGoodsWastageById,
  updateFinishedGoodsWastage,
  deleteFinishedGoodsWastage,
  getProductionWastages,
  getProductionsForWastage
};