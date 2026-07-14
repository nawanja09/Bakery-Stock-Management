const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Create new return
const createReturn = async (req, res) => {
  const { 
    return_date, 
    department_id, 
    received_by, 
    remarks, 
    items 
  } = req.body;
  
  const user_id = req.user.userId;
  const return_number = `RET-${uuidv4().substr(0, 8).toUpperCase()}`;

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Insert return record
    const [returnResult] = await connection.query(
      `INSERT INTO returns 
      (return_number, return_date, department_id, received_by, remarks, entered_by) 
      VALUES (?, ?, ?, ?, ?, ?)`,
      [return_number, return_date, department_id, received_by, remarks, user_id]
    );
    
    const returnId = returnResult.insertId;

    // Insert return items and update stock
    for (const item of items) {
      // Insert return item
      await connection.query(
        `INSERT INTO return_items 
        (return_id, item_id, quantity, reason) 
        VALUES (?, ?, ?, ?)`,
        [returnId, item.item_id, item.quantity, item.reason]
      );

      // Update current_stock in items table (increase stock since items are being returned)
      await connection.query(
        `UPDATE items 
         SET current_stock = current_stock + ? 
         WHERE id = ?`,
        [item.quantity, item.item_id]
      );

      // Record stock movement
      await connection.query(
        `INSERT INTO stock_movements 
        (item_id, quantity, movement_type, reference_id, reference_type, reference_number, movement_date, notes) 
        VALUES (?, ?, 'RETURN_FROM_DEPT', ?, 'return', ?, NOW(), ?)`,
        [item.item_id, item.quantity, returnId, return_number, `Return from department: ${remarks || 'N/A'}`]
      );
    }

    await connection.commit();
    res.status(201).json({ 
      message: 'Return recorded successfully!', 
      return_number,
      return_id: returnId 
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Error creating return:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

// Get all returns with current stock
const getAllReturns = async (req, res) => {
  try {
    const [returns] = await pool.query(`
      SELECT 
        r.id,
        r.return_number,
        r.return_date,
        r.department_id,
        d.name AS department_name,
        r.received_by,
        r.remarks,
        u.email AS entered_by,
        r.created_at
      FROM returns r
      JOIN departments d ON r.department_id = d.id
      JOIN users u ON r.entered_by = u.id
      ORDER BY r.return_date DESC
    `);

    // Get items for each return with current stock
    for (let returnRecord of returns) {
      const [items] = await pool.query(`
        SELECT 
          ri.*, 
          i.item_code, 
          i.name AS item_name,
          i.unit,
          COALESCE(i.current_stock, 0) AS current_stock_quantity
        FROM return_items ri
        JOIN items i ON ri.item_id = i.id
        WHERE ri.return_id = ?
      `, [returnRecord.id]);
      
      returnRecord.items = items;
    }
    
    res.json(returns);
  } catch (error) {
    console.error('Error fetching returns:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get return by ID with current stock
const getReturnById = async (req, res) => {
  const { id } = req.params;
  
  try {
    const [returnRecord] = await pool.query(`
      SELECT 
        r.*, 
        d.name AS department_name,
        u.email AS entered_by
      FROM returns r
      JOIN departments d ON r.department_id = d.id
      JOIN users u ON r.entered_by = u.id
      WHERE r.id = ?
    `, [id]);
    
    if (returnRecord.length === 0) {
      return res.status(404).json({ error: 'Return not found' });
    }
    
    const [items] = await pool.query(`
      SELECT 
        ri.*, 
        i.item_code, 
        i.name AS item_name,
        i.unit,
        COALESCE(i.current_stock, 0) AS current_stock_quantity
      FROM return_items ri
      JOIN items i ON ri.item_id = i.id
      WHERE ri.return_id = ?
    `, [id]);
    
    res.json({
      ...returnRecord[0],
      items
    });
    
  } catch (error) {
    console.error('Error fetching return:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get item current stock - IMPROVED VERSION
const getItemCurrentStock = async (req, res) => {
  const { itemId } = req.params;
  
  try {
    // First, check if we should calculate stock from movements or use current_stock field
    const [result] = await pool.query(
      `SELECT 
        id, 
        item_code, 
        name,
        COALESCE(current_stock, 0) AS current_stock 
      FROM items 
      WHERE id = ? AND deleted = FALSE`,
      [itemId]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Optional: Calculate actual stock from movements for verification
    const [movementResult] = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE 
          WHEN movement_type IN ('PURCHASE', 'RETURN_FROM_DEPT', 'ADJUSTMENT_POSITIVE') THEN quantity
          WHEN movement_type IN ('ISSUANCE', 'WASTAGE', 'RETURN_TO_SUPPLIER', 'ADJUSTMENT_NEGATIVE') THEN -quantity
          ELSE 0
        END), 0) AS calculated_stock
      FROM stock_movements
      WHERE item_id = ?
    `, [itemId]);

    // Return both values for debugging
    res.json({ 
      item_id: itemId,
      current_stock: parseFloat(result[0].current_stock) || 0,
      calculated_stock: parseFloat(movementResult[0].calculated_stock) || 0,
      item_code: result[0].item_code,
      item_name: result[0].name
    });
    
  } catch (error) {
    console.error('Error fetching current stock:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Calculate and update stock for all items (for initial stock sync)
const syncAllStock = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Get all items
    const [items] = await connection.query(
      'SELECT id FROM items WHERE deleted = FALSE'
    );
    
    let updatedCount = 0;
    
    for (const item of items) {
      // Calculate stock from movements
      const [movementResult] = await connection.query(`
        SELECT 
          COALESCE(SUM(CASE 
            WHEN movement_type IN ('PURCHASE', 'RETURN_FROM_DEPT', 'ADJUSTMENT_POSITIVE') THEN quantity
            WHEN movement_type IN ('ISSUANCE', 'WASTAGE', 'RETURN_TO_SUPPLIER', 'ADJUSTMENT_NEGATIVE') THEN -quantity
            ELSE 0
          END), 0) AS calculated_stock
        FROM stock_movements
        WHERE item_id = ?
      `, [item.id]);
      
      const calculatedStock = parseFloat(movementResult[0].calculated_stock) || 0;
      
      // Update current_stock
      await connection.query(
        'UPDATE items SET current_stock = ? WHERE id = ?',
        [calculatedStock, item.id]
      );
      
      updatedCount++;
    }
    
    await connection.commit();
    
    res.json({ 
      message: 'Stock synchronized successfully',
      updated_count: updatedCount
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Error syncing stock:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

module.exports = {
  createReturn,
  getAllReturns,
  getReturnById,
  getItemCurrentStock,
  syncAllStock  // Add this export
};