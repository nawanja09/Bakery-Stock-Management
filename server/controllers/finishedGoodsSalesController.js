const pool = require('../config/db');

const generateSaleNumber = () => {
  return `SALE-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
};

const createFinishedGoodsSale = async (req, res) => {
  const { sale_date, designation, cashier_name, remarks, items } = req.body;
  const created_by = req.user?.id || 5;

  try {
    await pool.query('START TRANSACTION');

    const sale_number = generateSaleNumber();
    
    // Insert sale record
    const [saleResult] = await pool.query(
      'INSERT INTO finished_goods_sales (sale_number, sale_date, designation, cashier_name, remarks, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [sale_number, sale_date, designation, cashier_name, remarks, created_by]
    );

    const saleId = saleResult.insertId;

    // Insert sale items
    for (const item of items) {
      await pool.query(
        'INSERT INTO finished_goods_sale_items (sale_id, item_id, quantity, unit_price, total_value) VALUES (?, ?, ?, ?, ?)',
        [saleId, item.item_id, item.quantity, item.unit_price, item.total_value]
      );
    }

    await pool.query('COMMIT');

    res.status(201).json({
      id: saleId,
      sale_number,
      message: 'Sale recorded successfully'
    });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error creating sale:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Sale number already exists' });
    }
    
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

const getAllFinishedGoodsSales = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT s.*, 
        COUNT(si.id) as item_count,
        SUM(si.total_value) as total_value
      FROM finished_goods_sales s
      LEFT JOIN finished_goods_sale_items si ON s.id = si.sale_id
      GROUP BY s.id
      ORDER BY s.sale_date DESC, s.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching sales:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getFinishedGoodsSaleById = async (req, res) => {
  const { id } = req.params;

  try {
    const [saleRows] = await pool.query(`
      SELECT s.*, d.name as designation_name
      FROM finished_goods_sales s
      LEFT JOIN transfer_destinations d ON s.designation = d.id
      WHERE s.id = ?
    `, [id]);

    if (saleRows.length === 0) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const [itemRows] = await pool.query(`
      SELECT si.*, fgi.item_code, fgi.name as item_name, fgi.category
      FROM finished_goods_sale_items si
      JOIN finished_goods_items fgi ON si.item_id = fgi.id
      WHERE si.sale_id = ?
    `, [id]);

    res.json({
      ...saleRows[0],
      items: itemRows
    });
  } catch (error) {
    console.error('Error fetching sale:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteFinishedGoodsSale = async (req, res) => {
  const { id } = req.params;

  try {
    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // First delete related sale items
      await connection.query('DELETE FROM finished_goods_sale_items WHERE sale_id = ?', [id]);
      
      // Then delete the sale
      const [result] = await connection.query('DELETE FROM finished_goods_sales WHERE id = ?', [id]);
      
      if (result.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Sale not found' });
      }
      
      await connection.commit();
      res.json({ message: 'Sale deleted successfully' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error deleting sale:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  createFinishedGoodsSale,
  getAllFinishedGoodsSales,
  getFinishedGoodsSaleById,
  deleteFinishedGoodsSale
};