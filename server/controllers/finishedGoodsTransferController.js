// server/controllers/finishedGoodsTransferController.js

const pool = require('../config/db');
const withTransaction = require('../utils/withTransaction');
const { HttpError } = require('../utils/staffLoanUtils');

const generateTransferNumber = () => {
  return `TRF-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
};

const getAllTransfers = async (req, res) => {
  try {
    const { department_id } = req.query;
    
    let query = `
      SELECT t.*, d.name as destination_name, dept.name as department_name,
        COUNT(ti.id) as item_count,
        SUM(ti.quantity) as total_quantity
      FROM finished_goods_transfers t
      JOIN transfer_destinations d ON t.destination_id = d.id
      LEFT JOIN departments dept ON t.department_id = dept.id
      LEFT JOIN finished_goods_transfer_items ti ON t.id = ti.transfer_id
    `;
    
    const queryParams = [];
    
    if (department_id) {
      query += ' WHERE t.department_id = ?';
      queryParams.push(department_id);
    }
    
    query += ' GROUP BY t.id ORDER BY t.transfer_date DESC, t.created_at DESC';
    
    const [rows] = await pool.query(query, queryParams);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching transfers:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getTransferById = async (req, res) => {
  const { id } = req.params;

  try {
    const [transferRows] = await pool.query(`
      SELECT t.*, d.name as destination_name, dept.name as department_name
      FROM finished_goods_transfers t
      JOIN transfer_destinations d ON t.destination_id = d.id
      LEFT JOIN departments dept ON t.department_id = dept.id
      WHERE t.id = ?
    `, [id]);

    if (transferRows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const [itemRows] = await pool.query(`
      SELECT ti.*, fgi.item_code, fgi.name as item_name, fgi.category, fgi.unit_price
      FROM finished_goods_transfer_items ti
      JOIN finished_goods_items fgi ON ti.item_id = fgi.id
      WHERE ti.transfer_id = ?
    `, [id]);

    res.json({
      ...transferRows[0],
      items: itemRows
    });
  } catch (error) {
    console.error('Error fetching transfer:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const createTransfer = async (req, res) => {
  const { transfer_date, transferred_by, destination_id, remarks, items, department_id } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });

  // The authenticated user (was hard-coded to user 5).
  const created_by = req.user.userId;

  try {
    const transfer_number = generateTransferNumber();
    const transferId = await withTransaction(async (connection) => {
      // Insert transfer record with department_id
      const [transferResult] = await connection.query(
        'INSERT INTO finished_goods_transfers (transfer_date, transfer_number, transferred_by, destination_id, department_id, remarks, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [transfer_date, transfer_number, transferred_by, destination_id, department_id, remarks, created_by]
      );

      // Insert transfer items
      for (const item of items) {
        await connection.query(
          'INSERT INTO finished_goods_transfer_items (transfer_id, item_id, quantity) VALUES (?, ?, ?)',
          [transferResult.insertId, item.item_id, item.quantity]
        );
      }
      return transferResult.insertId;
    });

    res.status(201).json({
      id: transferId,
      transfer_number,
      message: 'Transfer created successfully'
    });
  } catch (error) {
    console.error('Error creating transfer:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateTransfer = async (req, res) => {
  const { id } = req.params;
  const { transfer_date, transferred_by, destination_id, remarks, items, department_id } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });

  try {
    await withTransaction(async (connection) => {
      // Update transfer record with department_id
      const [transferResult] = await connection.query(
        'UPDATE finished_goods_transfers SET transfer_date = ?, transferred_by = ?, destination_id = ?, department_id = ?, remarks = ? WHERE id = ?',
        [transfer_date, transferred_by, destination_id, department_id, remarks, id]
      );
      if (transferResult.affectedRows === 0) throw new HttpError(404, 'Transfer not found');

      // Delete existing items and insert new items
      await connection.query('DELETE FROM finished_goods_transfer_items WHERE transfer_id = ?', [id]);
      for (const item of items) {
        await connection.query(
          'INSERT INTO finished_goods_transfer_items (transfer_id, item_id, quantity) VALUES (?, ?, ?)',
          [id, item.item_id, item.quantity]
        );
      }
    });
    res.json({ message: 'Transfer updated successfully' });
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    console.error('Error updating transfer:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteTransfer = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query('DELETE FROM finished_goods_transfers WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }
    
    res.json({ message: 'Transfer deleted successfully' });
  } catch (error) {
    console.error('Error deleting transfer:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getDestinations = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM transfer_destinations ORDER BY name');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching destinations:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  createTransfer,
  getAllTransfers,
  getTransferById,
  updateTransfer,
  deleteTransfer,
  getDestinations
};