const pool = require('../config/db');

const createProduction = async (req, res) => {
  const { production_date, prepared_by, remarks, items, department_id } = req.body;

  try {
    await pool.query('START TRANSACTION');

    // Insert production record with department_id
    const [productionResult] = await pool.query(
      'INSERT INTO finished_goods_productions (production_date, prepared_by, remarks, department_id) VALUES (?, ?, ?, ?)',
      [production_date, prepared_by, remarks, department_id]
    );

    const productionId = productionResult.insertId;

    // Insert production items
    for (const item of items) {
      await pool.query(
        'INSERT INTO finished_goods_production_items (production_id, item_id, quantity) VALUES (?, ?, ?)',
        [productionId, item.item_id, item.quantity]
      );
    }

    await pool.query('COMMIT');

    res.status(201).json({
      id: productionId,
      message: 'Production created successfully'
    });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error creating production:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateProduction = async (req, res) => {
  const { id } = req.params;
  const { production_date, prepared_by, remarks, items, department_id } = req.body;

  try {
    await pool.query('START TRANSACTION');

    // Update production record with department_id
    const [productionResult] = await pool.query(
      'UPDATE finished_goods_productions SET production_date = ?, prepared_by = ?, remarks = ?, department_id = ? WHERE id = ?',
      [production_date, prepared_by, remarks, department_id, id]
    );

    if (productionResult.affectedRows === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Production not found' });
    }

    // Delete existing items and insert new items (same as before)
    await pool.query('DELETE FROM finished_goods_production_items WHERE production_id = ?', [id]);
    
    for (const item of items) {
      await pool.query(
        'INSERT INTO finished_goods_production_items (production_id, item_id, quantity) VALUES (?, ?, ?)',
        [id, item.item_id, item.quantity]
      );
    }

    await pool.query('COMMIT');
    res.json({ message: 'Production updated successfully' });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error updating production:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getAllProductions = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.*, 
        d.name as department_name,
        COUNT(pi.id) as item_count
      FROM finished_goods_productions p
      LEFT JOIN departments d ON p.department_id = d.id
      LEFT JOIN finished_goods_production_items pi ON p.id = pi.production_id
      GROUP BY p.id
      ORDER BY p.production_date DESC, p.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching productions:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getProductionById = async (req, res) => {
  const { id } = req.params;

  try {
    const [productionRows] = await pool.query(`
      SELECT p.*, d.name as department_name
      FROM finished_goods_productions p
      LEFT JOIN departments d ON p.department_id = d.id
      WHERE p.id = ?
    `, [id]);

    if (productionRows.length === 0) {
      return res.status(404).json({ error: 'Production not found' });
    }

    const [itemRows] = await pool.query(`
      SELECT pi.*, fgi.item_code, fgi.name as item_name, fgi.category
      FROM finished_goods_production_items pi
      JOIN finished_goods_items fgi ON pi.item_id = fgi.id
      WHERE pi.production_id = ?
    `, [id]);

    res.json({
      ...productionRows[0],
      items: itemRows
    });
  } catch (error) {
    console.error('Error fetching production:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/*
const getProductionById = async (req, res) => {
  const { id } = req.params;

  try {
    const [productionRows] = await pool.query(`
      SELECT p.*
      FROM finished_goods_productions p
      WHERE p.id = ?
    `, [id]);

    if (productionRows.length === 0) {
      return res.status(404).json({ error: 'Production not found' });
    }

    const [itemRows] = await pool.query(`
      SELECT pi.*, fgi.item_code, fgi.name as item_name, fgi.category
      FROM finished_goods_production_items pi
      JOIN finished_goods_items fgi ON pi.item_id = fgi.id
      WHERE pi.production_id = ?
    `, [id]);

    res.json({
      ...productionRows[0],
      items: itemRows
    });
  } catch (error) {
    console.error('Error fetching production:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
*/

const deleteProduction = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query('DELETE FROM finished_goods_productions WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Production not found' });
    }
    
    res.json({ message: 'Production deleted successfully' });
  } catch (error) {
    console.error('Error deleting production:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  createProduction,
  getAllProductions,
  getProductionById,
  updateProduction,
  deleteProduction
};