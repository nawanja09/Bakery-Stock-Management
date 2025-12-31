const pool = require('../config/db');

const getTransfers = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        ct.*,
        cl_from.location_name as from_location_name,
        cl_to.location_name as to_location_name,
        ca.asset_name,
        ca.asset_id as asset_code,
        u.name as created_by_name
      FROM cutlery_transfers ct
      LEFT JOIN cutlery_locations cl_from ON ct.location_from_id = cl_from.id
      LEFT JOIN cutlery_locations cl_to ON ct.location_to_id = cl_to.id
      LEFT JOIN cutlery_assets ca ON ct.asset_id = ca.id
      LEFT JOIN users u ON ct.created_by = u.id
      ORDER BY ct.transfer_date DESC, ct.created_at DESC
    `);
    
    res.json(rows);
  } catch (err) {
    console.error('Error fetching transfers:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getTransferById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(`
      SELECT 
        ct.*,
        cl_from.location_name as from_location_name,
        cl_to.location_name as to_location_name,
        ca.asset_name,
        ca.asset_id as asset_code,
        u.name as created_by_name
      FROM cutlery_transfers ct
      LEFT JOIN cutlery_locations cl_from ON ct.location_from_id = cl_from.id
      LEFT JOIN cutlery_locations cl_to ON ct.location_to_id = cl_to.id
      LEFT JOIN cutlery_assets ca ON ct.asset_id = ca.id
      LEFT JOIN users u ON ct.created_by = u.id
      WHERE ct.id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching transfer:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const createTransfer = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      transfer_date,
      location_from_id,
        location_to_id,
        asset_id,
        quantity,
        items, // optional array of { asset_id, quantity }
      notes,
      transferred_by
    } = req.body;

    // Validate required fields
    if (!transfer_date || !location_from_id || !location_to_id || !asset_id || !quantity || !transferred_by) {
      return res.status(400).json({ error: 'All required fields must be filled' });
    }

    if (location_from_id === location_to_id) {
      return res.status(400).json({ error: 'Source and destination locations cannot be the same' });
    }

    if (quantity <= 0) {
      return res.status(400).json({ error: 'Quantity must be greater than 0' });
    }

    // Get user ID from token or session - use a valid user ID (fallback to first user)
    const [users] = await connection.query('SELECT id FROM users LIMIT 1');
    const userId = users.length > 0 ? users[0].id : 1;

    // Get the last transfer id to base new sequential ids
    const [maxIdRows] = await connection.query(`
      SELECT transfer_id FROM cutlery_transfers 
      ORDER BY id DESC LIMIT 1
    `);
    let lastNumber = 0;
    if (maxIdRows.length > 0 && maxIdRows[0].transfer_id) {
      const lastId = maxIdRows[0].transfer_id;
      lastNumber = parseInt(lastId.substring(1)) || 0;
    }

    const createdIds = [];

    if (Array.isArray(items) && items.length > 0) {
      // Insert one transfer row per item
      for (const it of items) {
        const aid = it.asset_id;
        const qty = parseInt(it.quantity, 10) || 0;
        if (!aid || qty <= 0) {
          await connection.rollback();
          return res.status(400).json({ error: 'Each item must have asset_id and quantity > 0' });
        }
        lastNumber += 1;
        const nextId = 'T' + String(lastNumber).padStart(3, '0');

        const [r] = await connection.query(
          `INSERT INTO cutlery_transfers 
           (transfer_id, transfer_date, location_from_id, location_to_id, asset_id, quantity, notes, transferred_by, created_by) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [nextId, transfer_date, location_from_id, location_to_id, aid, qty, notes, transferred_by, userId]
        );
        createdIds.push(r.insertId);
      }
    } else {
      // legacy single asset payload
      const [result] = await connection.query(
        `INSERT INTO cutlery_transfers 
         (transfer_id, transfer_date, location_from_id, location_to_id, asset_id, quantity, notes, transferred_by, created_by) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['T' + String(lastNumber + 1).padStart(3, '0'), transfer_date, location_from_id, location_to_id, asset_id, quantity, notes, transferred_by, userId]
      );
      createdIds.push(result.insertId);
    }

    await connection.commit();

    // Fetch created transfers
    const [newTransfers] = await connection.query(`
      SELECT 
        ct.*,
        cl_from.location_name as from_location_name,
        cl_to.location_name as to_location_name,
        ca.asset_name,
        ca.asset_id as asset_code,
        u.name as created_by_name
      FROM cutlery_transfers ct
      LEFT JOIN cutlery_locations cl_from ON ct.location_from_id = cl_from.id
      LEFT JOIN cutlery_locations cl_to ON ct.location_to_id = cl_to.id
      LEFT JOIN cutlery_assets ca ON ct.asset_id = ca.id
      LEFT JOIN users u ON ct.created_by = u.id
      WHERE ct.id IN (?);
    `, [createdIds]);

    res.status(201).json({ 
      message: 'Transfer(s) created successfully',
      transfers: newTransfers
    });

  } catch (err) {
    await connection.rollback();
    console.error('Error creating transfer:', err);
    
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ error: 'Invalid location, asset, or user selected' });
    }
    
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

const updateTransfer = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      transfer_date,
      location_from_id,
      location_to_id,
      asset_id,
      quantity,
      notes,
      transferred_by,
      status
    } = req.body;

    // Check if transfer exists
    const [existingTransfer] = await connection.query(
      'SELECT * FROM cutlery_transfers WHERE id = ?',
      [id]
    );

    if (existingTransfer.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    // Update transfer
    const [result] = await connection.query(
      `UPDATE cutlery_transfers 
       SET transfer_date = ?, location_from_id = ?, location_to_id = ?, asset_id = ?, 
           quantity = ?, notes = ?, transferred_by = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [transfer_date, location_from_id, location_to_id, asset_id, quantity, notes, transferred_by, status, id]
    );

    await connection.commit();

    // Get updated transfer
    const [updatedTransfer] = await connection.query(`
      SELECT 
        ct.*,
        cl_from.location_name as from_location_name,
        cl_to.location_name as to_location_name,
        ca.asset_name,
        ca.asset_id as asset_code,
        u.name as created_by_name
      FROM cutlery_transfers ct
      LEFT JOIN cutlery_locations cl_from ON ct.location_from_id = cl_from.id
      LEFT JOIN cutlery_locations cl_to ON ct.location_to_id = cl_to.id
      LEFT JOIN cutlery_assets ca ON ct.asset_id = ca.id
      LEFT JOIN users u ON ct.created_by = u.id
      WHERE ct.id = ?
    `, [id]);

    res.json({ 
      message: 'Transfer updated successfully',
      transfer: updatedTransfer[0]
    });

  } catch (err) {
    await connection.rollback();
    console.error('Error updating transfer:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

const deleteTransfer = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.query(
      'DELETE FROM cutlery_transfers WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    res.json({ message: 'Transfer deleted successfully' });
  } catch (err) {
    console.error('Error deleting transfer:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Helper function to get locations and assets for dropdowns
const getTransferFormData = async (req, res) => {
  try {
    const [locations] = await pool.query('SELECT id, location_id, location_name FROM cutlery_locations ORDER BY location_name');
    const [assets] = await pool.query('SELECT id, asset_id, asset_name FROM cutlery_assets ORDER BY asset_name');
    
    res.json({
      locations,
      assets
    });
  } catch (err) {
    console.error('Error fetching form data:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getTransfers,
  getTransferById,
  createTransfer,
  updateTransfer,
  deleteTransfer,
  getTransferFormData
};