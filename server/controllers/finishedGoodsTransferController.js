// server/controllers/finishedGoodsTransferController.js

const pool = require('../config/db');

const generateTransferNumber = () => {
  return `TRF-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
};

const createTransfer = async (req, res) => {
  const { transfer_date, transferred_by, destination_id, remarks, items } = req.body;
  
  // For now, use a default user ID since auth isn't implemented
  const created_by = 5; // Default admin user ID

  try {
    await pool.query('START TRANSACTION');

    const transfer_number = generateTransferNumber();
    
    // Insert transfer record
    const [transferResult] = await pool.query(
      'INSERT INTO finished_goods_transfers (transfer_date, transfer_number, transferred_by, destination_id, remarks, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [transfer_date, transfer_number, transferred_by, destination_id, remarks, created_by]
    );

    const transferId = transferResult.insertId;

    // Insert transfer items
    for (const item of items) {
      await pool.query(
        'INSERT INTO finished_goods_transfer_items (transfer_id, item_id, quantity) VALUES (?, ?, ?)',
        [transferId, item.item_id, item.quantity]
      );
    }

    await pool.query('COMMIT');

    res.status(201).json({
      id: transferId,
      transfer_number,
      message: 'Transfer created successfully'
    });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error creating transfer:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getAllTransfers = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT t.*, d.name as destination_name,
        COUNT(ti.id) as item_count,
        SUM(ti.quantity) as total_quantity
      FROM finished_goods_transfers t
      JOIN transfer_destinations d ON t.destination_id = d.id
      LEFT JOIN finished_goods_transfer_items ti ON t.id = ti.transfer_id
      GROUP BY t.id
      ORDER BY t.transfer_date DESC, t.created_at DESC
    `);
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
      SELECT t.*, d.name as destination_name
      FROM finished_goods_transfers t
      JOIN transfer_destinations d ON t.destination_id = d.id
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

const updateTransfer = async (req, res) => {
  const { id } = req.params;
  const { transfer_date, transferred_by, destination_id, remarks, items } = req.body;

  try {
    await pool.query('START TRANSACTION');

    // Update transfer record
    const [transferResult] = await pool.query(
      'UPDATE finished_goods_transfers SET transfer_date = ?, transferred_by = ?, destination_id = ?, remarks = ? WHERE id = ?',
      [transfer_date, transferred_by, destination_id, remarks, id]
    );

    if (transferResult.affectedRows === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    // Delete existing items
    await pool.query('DELETE FROM finished_goods_transfer_items WHERE transfer_id = ?', [id]);

    // Insert new items
    for (const item of items) {
      await pool.query(
        'INSERT INTO finished_goods_transfer_items (transfer_id, item_id, quantity) VALUES (?, ?, ?)',
        [id, item.item_id, item.quantity]
      );
    }

    await pool.query('COMMIT');

    res.json({ message: 'Transfer updated successfully' });
  } catch (error) {
    await pool.query('ROLLBACK');
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