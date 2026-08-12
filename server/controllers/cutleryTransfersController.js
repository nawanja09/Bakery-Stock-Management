const pool = require('../config/db');

const getTransfers = async (req, res) => {
  try {
    // First get all transfers
    const [rows] = await pool.query(`
      SELECT 
        ct.*,
        cl_from.location_name as from_location_name,
        cl_to.location_name as to_location_name,
        u.name as created_by_name
      FROM cutlery_transfers ct
      LEFT JOIN cutlery_locations cl_from ON ct.location_from_id = cl_from.id
      LEFT JOIN cutlery_locations cl_to ON ct.location_to_id = cl_to.id
      LEFT JOIN users u ON ct.created_by = u.id
      WHERE COALESCE(ct.status, 1) = 1
      ORDER BY ct.transfer_date DESC, ct.created_at DESC
    `);
    
    console.log('Found transfers:', rows.length);
    
    // Now fetch items for each transfer
    const transfersWithItems = await Promise.all(rows.map(async (transfer) => {
      const [items] = await pool.query(`
        SELECT 
          cti.*,
          ca.asset_name,
          ca.asset_id as asset_code
        FROM cutlery_transfer_items cti
        LEFT JOIN cutlery_assets ca ON cti.asset_id = ca.id
        WHERE cti.transfer_id = ? AND COALESCE(cti.status, 1) = 1
      `, [transfer.id]);
      
      return {
        ...transfer,
        items: items
      };
    }));
    
    res.json({
      success: true,
      data: transfersWithItems
    });
  } catch (err) {
    console.error('Error fetching transfers:', err);
    res.status(500).json({ 
      success: false,
      error: 'Server error',
      message: err.message 
    });
  }
};

const getTransferById = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Fetching transfer by ID:', id);

    // Get transfer header
    const [transfer] = await pool.query(`
      SELECT 
        ct.*,
        cl_from.location_name as from_location_name,
        cl_to.location_name as to_location_name,
        u.name as created_by_name
      FROM cutlery_transfers ct
      LEFT JOIN cutlery_locations cl_from ON ct.location_from_id = cl_from.id
      LEFT JOIN cutlery_locations cl_to ON ct.location_to_id = cl_to.id
      LEFT JOIN users u ON ct.created_by = u.id
      WHERE ct.id = ? AND COALESCE(ct.status, 1) = 1
    `, [id]);

    if (transfer.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Transfer not found' 
      });
    }

    // Get transfer items
    const [items] = await pool.query(`
      SELECT 
        cti.*,
        ca.asset_name,
        ca.asset_id as asset_code
      FROM cutlery_transfer_items cti
      LEFT JOIN cutlery_assets ca ON cti.asset_id = ca.id
      WHERE cti.transfer_id = ? AND COALESCE(cti.status, 1) = 1
    `, [id]);

    res.json({
      success: true,
      data: {
        ...transfer[0],
        items: items
      }
    });
  } catch (err) {
    console.error('Error fetching transfer:', err);
    res.status(500).json({ 
      success: false,
      error: 'Server error',
      message: err.message 
    });
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
      items,
      notes,
      transferred_by,
      status = 'Pending'
    } = req.body;

    console.log('Creating transfer with data:', req.body);

    // Validation
    if (!transfer_date || !location_from_id || !location_to_id || !transferred_by) {
      return res.status(400).json({ 
        success: false,
        error: 'All required fields must be filled' 
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'At least one asset must be added' 
      });
    }

    if (location_from_id === location_to_id) {
      return res.status(400).json({ 
        success: false,
        error: 'Source and destination locations cannot be the same' 
      });
    }

    // Validate each item
    for (const item of items) {
      if (!item.asset_id || item.quantity <= 0) {
        return res.status(400).json({ 
          success: false,
          error: 'Invalid item quantity or missing asset' 
        });
      }
    }

    // Get the next transfer ID
    const [maxId] = await connection.query(`
      SELECT transfer_id FROM cutlery_transfers 
      ORDER BY id DESC LIMIT 1
    `);

    let nextId = 'T001';
    if (maxId.length > 0) {
      const lastId = maxId[0].transfer_id;
      const lastNumber = parseInt(lastId.substring(1));
      nextId = 'T' + String(lastNumber + 1).padStart(3, '0');
    }

    console.log('Generated transfer ID:', nextId);

    // Get user ID
    const [users] = await connection.query('SELECT id FROM users LIMIT 1');
    const userId = users.length > 0 ? users[0].id : 1;

    // Insert transfer header
    const [transferResult] = await connection.query(
      `INSERT INTO cutlery_transfers 
       (transfer_id, transfer_date, location_from_id, location_to_id, 
        notes, transferred_by, status, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [nextId, transfer_date, location_from_id, location_to_id, 
       notes, transferred_by, status, userId]
    );

    const transferId = transferResult.insertId;
    console.log('Created transfer with ID:', transferId);

    // Insert transfer items
    for (const item of items) {
      await connection.query(
        `INSERT INTO cutlery_transfer_items 
         (transfer_id, asset_id, quantity) 
         VALUES (?, ?, ?)`,
        [transferId, item.asset_id, item.quantity]
      );
    }

    console.log('Inserted transfer items:', items.length);

    // Get created transfer with items
    const [newTransfer] = await connection.query(`
      SELECT 
        ct.*,
        cl_from.location_name as from_location_name,
        cl_to.location_name as to_location_name,
        u.name as created_by_name
      FROM cutlery_transfers ct
      LEFT JOIN cutlery_locations cl_from ON ct.location_from_id = cl_from.id
      LEFT JOIN cutlery_locations cl_to ON ct.location_to_id = cl_to.id
      LEFT JOIN users u ON ct.created_by = u.id
      WHERE ct.id = ?
    `, [transferId]);

    // Get items with asset details
    const [transferItems] = await connection.query(`
      SELECT 
        cti.*,
        ca.asset_name,
        ca.asset_id as asset_code
      FROM cutlery_transfer_items cti
      LEFT JOIN cutlery_assets ca ON cti.asset_id = ca.id
      WHERE cti.transfer_id = ?
    `, [transferId]);

    await connection.commit();

    res.status(201).json({ 
      success: true,
      message: 'Transfer created successfully',
      data: {
        ...newTransfer[0],
        items: transferItems
      }
    });

  } catch (err) {
    await connection.rollback();
    console.error('Error creating transfer:', err);
    
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid location, asset, or user selected' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Server error',
      message: err.message 
    });
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
      items,
      notes,
      transferred_by,
      status
    } = req.body;

    console.log('Updating transfer ID:', id, 'with data:', req.body);

    // Check if transfer exists
    const [existingTransfer] = await connection.query(
      'SELECT * FROM cutlery_transfers WHERE id = ? AND COALESCE(status, 1) = 1',
      [id]
    );

    if (existingTransfer.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Transfer not found' 
      });
    }

    // Validate items
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'At least one asset must be added' 
      });
    }

    // Update transfer header
    await connection.query(
      `UPDATE cutlery_transfers 
       SET transfer_date = ?, location_from_id = ?, location_to_id = ?, 
           notes = ?, transferred_by = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [transfer_date, location_from_id, location_to_id, notes, transferred_by, status, id]
    );

    // Soft delete existing items
    await connection.query('UPDATE cutlery_transfer_items SET status = 0 WHERE transfer_id = ? AND COALESCE(status, 1) = 1', [id]);

    // Insert new items
    for (const item of items) {
      await connection.query(
        `INSERT INTO cutlery_transfer_items 
         (transfer_id, asset_id, quantity) 
         VALUES (?, ?, ?)`,
        [id, item.asset_id, item.quantity]
      );
    }

    // Get updated transfer
    const [updatedTransfer] = await connection.query(`
      SELECT 
        ct.*,
        cl_from.location_name as from_location_name,
        cl_to.location_name as to_location_name,
        u.name as created_by_name
      FROM cutlery_transfers ct
      LEFT JOIN cutlery_locations cl_from ON ct.location_from_id = cl_from.id
      LEFT JOIN cutlery_locations cl_to ON ct.location_to_id = cl_to.id
      LEFT JOIN users u ON ct.created_by = u.id
      WHERE ct.id = ?
    `, [id]);

    // Get updated items
    const [updatedItems] = await connection.query(`
      SELECT 
        cti.*,
        ca.asset_name,
        ca.asset_id as asset_code
      FROM cutlery_transfer_items cti
      LEFT JOIN cutlery_assets ca ON cti.asset_id = ca.id
      WHERE cti.transfer_id = ?
    `, [id]);

    await connection.commit();

    res.json({ 
      success: true,
      message: 'Transfer updated successfully',
      data: {
        ...updatedTransfer[0],
        items: updatedItems
      }
    });

  } catch (err) {
    await connection.rollback();
    console.error('Error updating transfer:', err);
    res.status(500).json({ 
      success: false,
      error: 'Server error',
      message: err.message 
    });
  } finally {
    connection.release();
  }
};

const deleteTransfer = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Deleting transfer ID:', id);

    const [result] = await pool.query(
      'UPDATE cutlery_transfers SET status = 0 WHERE id = ? AND COALESCE(status, 1) = 1',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Transfer not found' 
      });
    }

    res.json({ 
      success: true,
      message: 'Transfer deleted successfully' 
    });
  } catch (err) {
    console.error('Error deleting transfer:', err);
    res.status(500).json({ 
      success: false,
      error: 'Server error',
      message: err.message 
    });
  }
};

// Helper function to get locations and assets for dropdowns
const getTransferFormData = async (req, res) => {
  try {
    console.log('Fetching transfer form data');
    
    const [locations] = await pool.query(`
      SELECT id, location_id, location_name 
      FROM cutlery_locations 
      WHERE COALESCE(status, 1) = 1
      ORDER BY location_name
    `);
    
    const [assets] = await pool.query(`
      SELECT id, asset_id, asset_name 
      FROM cutlery_assets 
      WHERE COALESCE(status, 1) = 1
      ORDER BY asset_name
    `);
    
    console.log('Found locations:', locations.length, 'assets:', assets.length);
    
    res.json({
      success: true,
      data: {
        locations,
        assets
      }
    });
  } catch (err) {
    console.error('Error fetching form data:', err);
    res.status(500).json({ 
      success: false,
      error: 'Server error',
      message: err.message 
    });
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