const pool = require('../config/db');

const getPurchases = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        cp.*,
        cs.supplier_name,
        cs.contact_person,
        cs.phone as supplier_phone,
        u.name as created_by_name,
        (SELECT SUM(total_price) FROM cutlery_purchase_items WHERE purchase_id = cp.id) as calculated_total
      FROM cutlery_purchases cp
      LEFT JOIN cutlery_suppliers cs ON cp.supplier_id = cs.id
      LEFT JOIN users u ON cp.created_by = u.id
      ORDER BY cp.purchase_date DESC, cp.created_at DESC
    `);
    
    res.json(rows);
  } catch (err) {
    console.error('Error fetching purchases:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getPurchaseById = async (req, res) => {
  try {
    const { id } = req.params;

    // Get purchase header with supplier details
    const [purchaseRows] = await pool.query(`
      SELECT 
        cp.*,
        cs.supplier_name,
        cs.contact_person,
        cs.phone as supplier_phone,
        cs.email as supplier_email,
        cs.address as supplier_address,
        u.name as created_by_name
      FROM cutlery_purchases cp
      LEFT JOIN cutlery_suppliers cs ON cp.supplier_id = cs.id
      LEFT JOIN users u ON cp.created_by = u.id
      WHERE cp.id = ?
    `, [id]);

    if (purchaseRows.length === 0) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    // Get purchase items with asset details
    const [itemRows] = await pool.query(`
      SELECT 
        cpi.id,
        cpi.asset_id,
        cpi.quantity,
        cpi.unit_price,
        cpi.total_price,
        ca.asset_name,
        ca.asset_id as asset_code
      FROM cutlery_purchase_items cpi
      LEFT JOIN cutlery_assets ca ON cpi.asset_id = ca.id
      WHERE cpi.purchase_id = ?
      ORDER BY cpi.id
    `, [id]);

    const purchase = purchaseRows[0];
    purchase.items = itemRows || [];

    // Calculate total from items if needed
    if (!purchase.total_amount && itemRows.length > 0) {
      const total = itemRows.reduce((sum, item) => sum + (item.total_price || 0), 0);
      purchase.total_amount = total;
    }

    res.json(purchase);
  } catch (err) {
    console.error('Error fetching purchase:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const createPurchase = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      purchase_date,
      supplier_id,
      invoice_number,
      payment_method,
      payment_status,
      notes,
      items
    } = req.body;

    // Validate required fields
    if (!purchase_date || !supplier_id || !invoice_number || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'All required fields must be filled' });
    }

    // Validate items
    let totalAmount = 0;
    for (const item of items) {
      if (!item.asset_id || !item.quantity || !item.unit_price) {
        return res.status(400).json({ error: 'Each item must have asset, quantity, and unit price' });
      }
      if (item.quantity <= 0) {
        return res.status(400).json({ error: 'Quantity must be greater than 0' });
      }
      if (item.unit_price <= 0) {
        return res.status(400).json({ error: 'Unit price must be greater than 0' });
      }
      totalAmount += item.quantity * item.unit_price;
    }

    // Get the next purchase ID (P001, P002, etc.)
    const [maxId] = await connection.query(`
      SELECT purchase_id FROM cutlery_purchases 
      ORDER BY id DESC LIMIT 1
    `);

    let nextId = 'P001';
    if (maxId.length > 0) {
      const lastId = maxId[0].purchase_id;
      const lastNumber = parseInt(lastId.substring(1));
      nextId = 'P' + String(lastNumber + 1).padStart(3, '0');
    }

    // Get a valid user ID
    const [users] = await connection.query('SELECT id FROM users LIMIT 1');
    const userId = users.length > 0 ? users[0].id : 1;

    // Insert purchase header
    const [purchaseResult] = await connection.query(
      `INSERT INTO cutlery_purchases 
       (purchase_id, purchase_date, supplier_id, invoice_number, total_amount, 
        payment_method, payment_status, notes, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nextId, purchase_date, supplier_id, invoice_number, totalAmount, 
       payment_method || 'CASH', payment_status || 'PENDING', notes || '', userId]
    );

    const purchaseId = purchaseResult.insertId;

    // Insert purchase items
    for (const item of items) {
      await connection.query(
        `INSERT INTO cutlery_purchase_items 
         (purchase_id, asset_id, quantity, unit_price) 
         VALUES (?, ?, ?, ?)`,
        [purchaseId, item.asset_id, item.quantity, item.unit_price]
      );
    }

    await connection.commit();

    // Get the created purchase with all data
    const purchase = await getPurchaseWithItems(connection, purchaseId);

    res.status(201).json({ 
      message: 'Purchase created successfully',
      purchase: purchase
    });

  } catch (err) {
    await connection.rollback();
    console.error('Error creating purchase:', err);
    
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Invoice number already exists' });
    }
    
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ error: 'Invalid supplier or asset selected' });
    }
    
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

const updatePurchase = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      purchase_date,
      supplier_id,
      invoice_number,
      payment_method,
      payment_status,
      notes,
      items
    } = req.body;

    // Check if purchase exists
    const [existingPurchase] = await connection.query(
      'SELECT * FROM cutlery_purchases WHERE id = ?',
      [id]
    );

    if (existingPurchase.length === 0) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    // Validate items if provided
    let totalAmount = existingPurchase[0].total_amount;
    if (items && Array.isArray(items)) {
      totalAmount = 0;
      for (const item of items) {
        if (!item.asset_id || !item.quantity || !item.unit_price) {
          return res.status(400).json({ error: 'Each item must have asset, quantity, and unit price' });
        }
        totalAmount += item.quantity * item.unit_price;
      }
    }

    // Update purchase header
    const [result] = await connection.query(
      `UPDATE cutlery_purchases 
       SET purchase_date = ?, supplier_id = ?, invoice_number = ?, total_amount = ?,
           payment_method = ?, payment_status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [purchase_date, supplier_id, invoice_number, totalAmount, 
       payment_method, payment_status, notes || '', id]
    );

    // Update items if provided
    if (items && Array.isArray(items)) {
      // Delete existing items
      await connection.query(
        'DELETE FROM cutlery_purchase_items WHERE purchase_id = ?',
        [id]
      );

      // Insert new items
      for (const item of items) {
        await connection.query(
          `INSERT INTO cutlery_purchase_items 
           (purchase_id, asset_id, quantity, unit_price) 
           VALUES (?, ?, ?, ?)`,
          [id, item.asset_id, item.quantity, item.unit_price]
        );
      }
    }

    await connection.commit();

    // Get updated purchase
    const purchase = await getPurchaseWithItems(connection, id);

    res.json({ 
      message: 'Purchase updated successfully',
      purchase: purchase
    });

  } catch (err) {
    await connection.rollback();
    console.error('Error updating purchase:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

const deletePurchase = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // Check if purchase exists
    const [existingPurchase] = await connection.query(
      'SELECT * FROM cutlery_purchases WHERE id = ?',
      [id]
    );

    if (existingPurchase.length === 0) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    // Delete purchase items (cascade should handle this, but we do it explicitly)
    await connection.query(
      'DELETE FROM cutlery_purchase_items WHERE purchase_id = ?',
      [id]
    );

    // Delete purchase
    const [result] = await connection.query(
      'DELETE FROM cutlery_purchases WHERE id = ?',
      [id]
    );

    await connection.commit();

    res.json({ message: 'Purchase deleted successfully' });

  } catch (err) {
    await connection.rollback();
    console.error('Error deleting purchase:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

// Helper function to get purchase with items
const getPurchaseWithItems = async (connection, purchaseId) => {
  // Get purchase header
  const [purchaseRows] = await connection.query(`
    SELECT 
      cp.*,
      cs.supplier_name,
      cs.contact_person,
      cs.phone as supplier_phone,
      cs.email as supplier_email,
      cs.address as supplier_address,
      u.name as created_by_name
    FROM cutlery_purchases cp
    LEFT JOIN cutlery_suppliers cs ON cp.supplier_id = cs.id
    LEFT JOIN users u ON cp.created_by = u.id
    WHERE cp.id = ?
  `, [purchaseId]);

  // Get purchase items
  const [itemRows] = await connection.query(`
    SELECT 
      cpi.*,
      ca.asset_name,
      ca.asset_id as asset_code
    FROM cutlery_purchase_items cpi
    LEFT JOIN cutlery_assets ca ON cpi.asset_id = ca.id
    WHERE cpi.purchase_id = ?
  `, [purchaseId]);

  const purchase = purchaseRows[0];
  purchase.items = itemRows;

  return purchase;
};

// Helper function to get form data for dropdowns
const getPurchaseFormData = async (req, res) => {
  try {
    const [suppliers] = await pool.query('SELECT id, supplier_name, contact_person FROM cutlery_suppliers ORDER BY supplier_name');
    const [assets] = await pool.query('SELECT id, asset_id, asset_name FROM cutlery_assets ORDER BY asset_name');
    
    res.json({
      suppliers,
      assets
    });
  } catch (err) {
    console.error('Error fetching form data:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getPurchases,
  getPurchaseById,
  createPurchase,
  updatePurchase,
  deletePurchase,
  getPurchaseFormData
};