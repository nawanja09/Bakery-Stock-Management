const pool = require('../config/db');
const { softDelete } = require('../services/softDelete');

const getDamages = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        cd.*,
        cl.location_name,
        u.name as created_by_name,
        (SELECT SUM(total_loss) FROM cutlery_damage_items WHERE damage_id = cd.id) as total_loss
      FROM cutlery_damages cd
      LEFT JOIN cutlery_locations cl ON cd.location_id = cl.id
      LEFT JOIN users u ON cd.created_by = u.id WHERE cd.is_deleted = 0
      
      ORDER BY cd.damage_date DESC, cd.created_at DESC
    `);
    
    res.json(rows);
  } catch (err) {
    console.error('Error fetching damages:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const createDamage = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      damage_date,
      location_id,
      reason,
      notes,
      reported_by,
      status,
      items
    } = req.body;

    // Validate required fields
    if (!damage_date || !location_id || !reason || !reported_by || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'All required fields must be filled' });
    }

    // Validate items
    let totalLoss = 0;
    for (const item of items) {
      if (!item.asset_id || !item.quantity) {
        return res.status(400).json({ error: 'Each item must have asset and quantity' });
      }
      if (item.quantity <= 0) {
        return res.status(400).json({ error: 'Quantity must be greater than 0' });
      }
      const unitPrice = item.unit_price || 0;
      totalLoss += item.quantity * unitPrice;
    }

    // Get the next damage ID (D001, D002, etc.)
    const [maxId] = await connection.query(`
      SELECT damage_id FROM cutlery_damages 
      ORDER BY id DESC LIMIT 1
    `);

    let nextId = 'D001';
    if (maxId.length > 0) {
      const lastId = maxId[0].damage_id;
      const lastNumber = parseInt(lastId.substring(1));
      nextId = 'D' + String(lastNumber + 1).padStart(3, '0');
    }

    // Get a valid user ID
    const [users] = await connection.query('SELECT id FROM users LIMIT 1');
    const userId = users.length > 0 ? users[0].id : 1;

    // Insert damage header
    const [damageResult] = await connection.query(
      `INSERT INTO cutlery_damages 
       (damage_id, damage_date, location_id, reason, notes, reported_by, status, estimated_loss, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nextId, damage_date, location_id, reason, notes || '', reported_by, status || 'Reported', totalLoss, userId]
    );

    const damageId = damageResult.insertId;

    // Insert damage items
    for (const item of items) {
      await connection.query(
        `INSERT INTO cutlery_damage_items 
         (damage_id, asset_id, quantity, unit_price, notes) 
         VALUES (?, ?, ?, ?, ?)`,
        [damageId, item.asset_id, item.quantity, item.unit_price || 0, item.notes || '']
      );
    }

    await connection.commit();

    // Get the created damage with all data
    const damage = await getDamageWithItems(connection, damageId);

    res.status(201).json({ 
      message: 'Damage record created successfully',
      damage: damage
    });

  } catch (err) {
    await connection.rollback();
    console.error('Error creating damage:', err);
    
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ error: 'Invalid location or asset selected' });
    }
    
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

const updateDamage = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      damage_date,
      location_id,
      reason,
      notes,
      reported_by,
      status,
      items
    } = req.body;

    // Check if damage exists
    const [existingDamage] = await connection.query(
      'SELECT * FROM cutlery_damages WHERE is_deleted = 0 AND id = ?',
      [id]
    );

    if (existingDamage.length === 0) {
      return res.status(404).json({ error: 'Damage record not found' });
    }

    // Validate items if provided
    let totalLoss = 0;
    if (items && Array.isArray(items)) {
      for (const item of items) {
        if (!item.asset_id || !item.quantity) {
          return res.status(400).json({ error: 'Each item must have asset and quantity' });
        }
        const unitPrice = item.unit_price || 0;
        totalLoss += item.quantity * unitPrice;
      }
    } else {
      // Calculate from existing items
      const [existingItems] = await connection.query(
        'SELECT SUM(quantity * unit_price) as total FROM cutlery_damage_items WHERE damage_id = ?',
        [id]
      );
      totalLoss = existingItems[0].total || 0;
    }

    // Update damage header
    const [result] = await connection.query(
      `UPDATE cutlery_damages 
       SET damage_date = ?, location_id = ?, reason = ?, notes = ?, 
           reported_by = ?, status = ?, estimated_loss = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [damage_date, location_id, reason, notes || '', reported_by, status, totalLoss, id]
    );

    // Update items if provided
    if (items && Array.isArray(items)) {
      // Delete existing items
      await connection.query(
        'DELETE FROM cutlery_damage_items WHERE damage_id = ?',
        [id]
      );

      // Insert new items
      for (const item of items) {
        await connection.query(
          `INSERT INTO cutlery_damage_items 
           (damage_id, asset_id, quantity, unit_price, notes) 
           VALUES (?, ?, ?, ?, ?)`,
          [id, item.asset_id, item.quantity, item.unit_price || 0, item.notes || '']
        );
      }
    }

    await connection.commit();

    // Get updated damage
    const damage = await getDamageWithItems(connection, id);

    res.json({ 
      message: 'Damage record updated successfully',
      damage: damage
    });

  } catch (err) {
    await connection.rollback();
    console.error('Error updating damage:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

const deleteDamage = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // Check if damage exists
    const [existingDamage] = await connection.query(
      'SELECT * FROM cutlery_damages WHERE is_deleted = 0 AND id = ?',
      [id]
    );

    if (existingDamage.length === 0) {
      return res.status(404).json({ error: 'Damage record not found' });
    }

    // Soft delete: the damage record (and its items) stay in the database, flagged deleted, and drop out of
    // every list and of the stock report.
    await softDelete(connection, 'cutlery_damages', { id, userId: req.user?.userId });

    await connection.commit();

    res.json({ message: 'Damage record deleted successfully' });

  } catch (err) {
    await connection.rollback();
    console.error('Error deleting damage:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

// Helper function to get damage with items
const getDamageWithItems = async (connection, damageId) => {
  // Get damage header
  const [damageRows] = await connection.query(`
    SELECT 
      cd.*,
      cl.location_name,
      u.name as created_by_name
    FROM cutlery_damages cd
    LEFT JOIN cutlery_locations cl ON cd.location_id = cl.id
    LEFT JOIN users u ON cd.created_by = u.id
    WHERE cd.is_deleted = 0 AND cd.id = ?
  `, [damageId]);

  // Get damage items with asset name
  const [itemRows] = await connection.query(`
    SELECT 
      cdi.*,
      ca.asset_name,  -- Make sure this is included
      ca.asset_id as asset_code
    FROM cutlery_damage_items cdi
    LEFT JOIN cutlery_assets ca ON cdi.asset_id = ca.id
    WHERE cdi.damage_id = ?
  `, [damageId]);

  const damage = damageRows[0];
  damage.items = itemRows;

  // Calculate total loss
  const totalLoss = itemRows.reduce((sum, item) => sum + (item.total_loss || 0), 0);
  damage.total_loss = totalLoss;

  return damage;
};

const getDamageById = async (req, res) => {
  try {
    const { id } = req.params;

    // Get damage header
    const [damageRows] = await pool.query(`
      SELECT 
        cd.*,
        cl.location_name,
        u.name as created_by_name
      FROM cutlery_damages cd
      LEFT JOIN cutlery_locations cl ON cd.location_id = cl.id
      LEFT JOIN users u ON cd.created_by = u.id
      WHERE cd.is_deleted = 0 AND cd.id = ?
    `, [id]);

    if (damageRows.length === 0) {
      return res.status(404).json({ error: 'Damage record not found' });
    }

    // Get damage items with asset name
    const [itemRows] = await pool.query(`
      SELECT 
        cdi.*,
        ca.asset_name,  -- This is crucial
        ca.asset_id as asset_code
      FROM cutlery_damage_items cdi
      LEFT JOIN cutlery_assets ca ON cdi.asset_id = ca.id
      WHERE cdi.damage_id = ?
    `, [id]);

    const damage = damageRows[0];
    damage.items = itemRows;

    // Calculate total loss
    const totalLoss = itemRows.reduce((sum, item) => sum + (item.total_loss || 0), 0);
    damage.total_loss = totalLoss;

    res.json(damage);
  } catch (err) {
    console.error('Error fetching damage:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Helper function to get form data for dropdowns
const getDamageFormData = async (req, res) => {
  try {
    const [locations] = await pool.query('SELECT id, location_id, location_name FROM cutlery_locations  WHERE is_deleted = 0 ORDER BY location_name');
    const [assets] = await pool.query('SELECT id, asset_id, asset_name FROM cutlery_assets ORDER BY asset_name');
    
    res.json({
      locations,
      assets,
      reasons: [
        { value: 'Broken', label: 'Broken' },
        { value: 'Lost', label: 'Lost' },
        { value: 'Worn Out', label: 'Worn Out' },
        { value: 'Theft', label: 'Theft' },
        { value: 'Other', label: 'Other' }
      ],
      statuses: [
        { value: 'Reported', label: 'Reported' },
        { value: 'Confirmed', label: 'Confirmed' },
        { value: 'Repaired', label: 'Repaired' },
        { value: 'Written Off', label: 'Written Off' }
      ]
    });
  } catch (err) {
    console.error('Error fetching form data:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getDamages,
  getDamageById,
  createDamage,
  updateDamage,
  deleteDamage,
  getDamageFormData,
  getDamageWithItems
};
