const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { getItemStock } = require('../services/rmStockService');
const { requireDate, requireDepartment, prepareStockLines } = require('../utils/documentLines');

// Live stock from the one shared formula (services/rmStockService), never the
// stale items.current_stock column (audit finding R10).
const attachLiveStock = async (lines) => {
  for (const line of lines) {
    const stock = await getItemStock(pool, line.item_id);
    line.current_stock_quantity = stock ? Number(stock.current_stock) || 0 : 0;
  }
};

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

    // Checked on the server (audit finding R7): a real date and department, real items, quantities above 0.
    requireDate(return_date, 'Return date');
    await requireDepartment(connection, department_id);
    const items = (await prepareStockLines(connection, req.body.items))
      .map((line) => ({ item_id: line.itemId, quantity: line.quantity, reason: line.source.reason }));

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
    if (error.name === 'DocumentError') return res.status(error.status).json({ error: error.message });
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
        u.username AS entered_by,
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
          i.unit
                  FROM return_items ri
        JOIN items i ON ri.item_id = i.id
        WHERE ri.return_id = ?
      `, [returnRecord.id]);
      
      await attachLiveStock(items);
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
        u.username AS entered_by
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
        i.unit
              FROM return_items ri
      JOIN items i ON ri.item_id = i.id
      WHERE ri.return_id = ?
    `, [id]);
    
    await attachLiveStock(items);
    res.json({
      ...returnRecord[0],
      items
    });
    
  } catch (error) {
    console.error('Error fetching return:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get item current stock (live, from rmStockService)
const getItemCurrentStock = async (req, res) => {
  try {
    const stock = await getItemStock(pool, req.params.itemId);
    if (!stock) return res.status(404).json({ error: 'Item not found' });
    res.json({
      item_id: req.params.itemId,
      current_stock: Number(stock.current_stock) || 0,
      item_code: stock.item_code,
      item_name: stock.name
    });
  } catch (error) {
    console.error('Error fetching current stock:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  createReturn,
  getAllReturns,
  getReturnById,
  getItemCurrentStock
};