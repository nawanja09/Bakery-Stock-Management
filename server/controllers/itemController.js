const pool = require('../config/db');

// =============================================
// CREATE ITEM with Auto-Add functionality
// =============================================
const createItem = async (req, res) => {
  const { 
    item_code, 
    name, 
    unit, 
    item_type, 
    vat_applicable, 
    auto_add_to_stock, 
    reorder_level,
    status // Add status
  } = req.body;

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Insert item with status
    const [result] = await connection.query(
      'INSERT INTO items (item_code, name, unit, item_type, vat_applicable, auto_add_to_stock, reorder_level, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [item_code, name, unit, item_type || 'Other', vat_applicable || false, auto_add_to_stock !== undefined ? auto_add_to_stock : true, reorder_level, status !== undefined ? status : 1]
    );

    // Auto-add to stock if enabled (default is true)
    if (auto_add_to_stock !== false) {
      await connection.query(
        'INSERT INTO opening_balances (date, item_id, quantity, created_at) VALUES (CURDATE(), ?, 0, CURRENT_TIMESTAMP)',
        [result.insertId]
      );

      // Log stock movement
      await connection.query(
        `INSERT INTO stock_movements 
         (item_id, quantity, movement_type, reference_id, reference_type, movement_date, notes)
         VALUES (?, 0, 'ADJUSTMENT', ?, 'items', CURDATE(), 'Auto-created opening balance')`,
        [result.insertId, result.insertId]
      );
    }

    await connection.commit();
    
    res.status(201).json({
      id: result.insertId,
      message: 'Item added successfully',
      auto_added_to_stock: auto_add_to_stock !== false
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error adding item:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Item code already exists' });
    }
    
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

// =============================================
// GET ALL ITEMS with calculated stock
// =============================================
const getAllItems = async (req, res) => {
  try {
    const { auto_add_only, status } = req.query;
    
    let query = `
      SELECT 
        i.id, 
        i.item_code, 
        i.name, 
        i.unit,
        i.item_type,
        i.vat_applicable,
        i.auto_add_to_stock,
        i.reorder_level,
        i.status,
        COALESCE(
          (SELECT COALESCE(SUM(quantity), 0) FROM opening_balances WHERE item_id = i.id) +
          (SELECT COALESCE(SUM(pi.quantity), 0) 
           FROM purchase_items pi 
           JOIN purchases p ON pi.purchase_id = p.id 
           WHERE pi.item_id = i.id) -
          (SELECT COALESCE(SUM(ii.quantity), 0) 
           FROM issuance_items ii 
           JOIN issuances iss ON ii.issuance_id = iss.id 
           WHERE ii.item_id = i.id) -
          (SELECT COALESCE(SUM(wi.quantity), 0) 
           FROM wastage_items wi 
           JOIN wastages w ON wi.wastage_id = w.id 
           WHERE wi.item_id = i.id) +
          (SELECT COALESCE(SUM(ri.quantity), 0) 
           FROM return_items ri 
           JOIN returns r ON ri.return_id = r.id 
           WHERE ri.item_id = i.id),
        0) AS current_stock
      FROM items i
      WHERE i.deleted = FALSE
    `;
    
    if (auto_add_only === 'true') {
      query += ' AND i.auto_add_to_stock = 1';
    }
    
    // Add status filter
    if (status === 'active') {
      query += ' AND i.status = 1';
    } else if (status === 'inactive') {
      query += ' AND i.status = 0';
    }
    
    query += ' ORDER BY i.item_code';
    
    const [rows] = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// =============================================
// GET ITEM BY ID with calculated stock
// =============================================
const getItemById = async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(`
      SELECT 
        i.id, 
        i.item_code, 
        i.name, 
        i.unit,
        i.item_type,
        i.vat_applicable,
        i.auto_add_to_stock,
        i.reorder_level,
        i.status,
        COALESCE(
          (SELECT COALESCE(SUM(quantity), 0) FROM opening_balances WHERE item_id = i.id) +
          (SELECT COALESCE(SUM(pi.quantity), 0) 
           FROM purchase_items pi 
           JOIN purchases p ON pi.purchase_id = p.id 
           WHERE pi.item_id = i.id) -
          (SELECT COALESCE(SUM(ii.quantity), 0) 
           FROM issuance_items ii 
           JOIN issuances iss ON ii.issuance_id = iss.id 
           WHERE ii.item_id = i.id) -
          (SELECT COALESCE(SUM(wi.quantity), 0) 
           FROM wastage_items wi 
           JOIN wastages w ON wi.wastage_id = w.id 
           WHERE wi.item_id = i.id) +
          (SELECT COALESCE(SUM(ri.quantity), 0) 
           FROM return_items ri 
           JOIN returns r ON ri.return_id = r.id 
           WHERE ri.item_id = i.id),
        0) AS current_stock
      FROM items i
      WHERE i.id = ? AND i.deleted = FALSE
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// =============================================
// UPDATE ITEM
// =============================================
const updateItem = async (req, res) => {
  const { id } = req.params;
  const { 
    item_code, 
    name, 
    unit, 
    item_type, 
    vat_applicable, 
    auto_add_to_stock, 
    reorder_level,
    status // Add status
  } = req.body;

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Get current item data
    const [currentItem] = await connection.query(
      'SELECT auto_add_to_stock FROM items WHERE id = ?',
      [id]
    );

    // Update item with status
    const [result] = await connection.query(
      'UPDATE items SET item_code = ?, name = ?, unit = ?, item_type = ?, vat_applicable = ?, auto_add_to_stock = ?, reorder_level = ?, status = ? WHERE id = ? AND deleted = FALSE',
      [item_code, name, unit, item_type || 'Other', vat_applicable || false, auto_add_to_stock !== undefined ? auto_add_to_stock : true, reorder_level, status !== undefined ? status : 1, id]
    );
    
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Item not found' });
    }

    // If auto_add_to_stock changed from false to true, create opening balance if not exists
    if (auto_add_to_stock === true && currentItem[0]?.auto_add_to_stock === false) {
      const [existing] = await connection.query(
        'SELECT id FROM opening_balances WHERE item_id = ?',
        [id]
      );

      if (existing.length === 0) {
        await connection.query(
          'INSERT INTO opening_balances (date, item_id, quantity, created_at) VALUES (CURDATE(), ?, 0, CURRENT_TIMESTAMP)',
          [id]
        );

        await connection.query(
          `INSERT INTO stock_movements 
           (item_id, quantity, movement_type, reference_id, reference_type, movement_date, notes)
           VALUES (?, 0, 'ADJUSTMENT', ?, 'items', CURDATE(), 'Auto-add enabled - opening balance created')`,
          [id, id]
        );
      }
    }

    await connection.commit();
    
    res.json({ 
      message: 'Item updated successfully',
      auto_add_status: auto_add_to_stock ? 'enabled' : 'disabled'
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error updating item:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Item code already exists' });
    }
    
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

// =============================================
// DELETE ITEM (Soft Delete)
// =============================================
const deleteItem = async (req, res) => {
  const { id } = req.params;

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Check item details before deletion
    const [itemData] = await connection.query(
      'SELECT auto_add_to_stock FROM items WHERE id = ?',
      [id]
    );

    // Soft delete
    const [result] = await connection.query(
      'UPDATE items SET deleted = TRUE WHERE id = ?', 
      [id]
    );
    
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Item not found' });
    }

    // If auto-add was enabled, handle opening balance
    if (itemData[0]?.auto_add_to_stock) {
      await connection.query(
        'UPDATE opening_balances SET quantity = 0 WHERE item_id = ?',
        [id]
      );

      await connection.query(
        `INSERT INTO stock_movements 
         (item_id, quantity, movement_type, reference_id, reference_type, movement_date, notes)
         VALUES (?, 0, 'ADJUSTMENT', ?, 'items', CURDATE(), 'Item deleted - stock reset')`,
        [id, id]
      );
    }

    await connection.commit();
    
    res.json({ 
      message: 'Item deleted successfully',
      note: itemData[0]?.auto_add_to_stock ? 'Stock balance has been reset to 0' : undefined
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error deleting item:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

// =============================================
// GET ITEMS WITHOUT OPENING BALANCE (Manual items only)
// =============================================
const getItemsWithoutOpeningBalance = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT i.* 
      FROM items i
      LEFT JOIN opening_balances ob ON i.id = ob.item_id
      WHERE ob.item_id IS NULL 
        AND i.deleted = FALSE
        AND i.auto_add_to_stock = FALSE
        AND i.status = 1
      ORDER BY i.item_code
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching items without opening balance:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getAllItems,
  createItem,
  getItemById,
  updateItem,
  deleteItem,
  getItemsWithoutOpeningBalance
};