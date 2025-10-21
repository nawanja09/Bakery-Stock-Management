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

    // Insert return items
    for (const item of items) {
      await connection.query(
        `INSERT INTO return_items 
        (return_id, item_id, quantity, reason) 
        VALUES (?, ?, ?, ?)`,
        [returnId, item.item_id, item.quantity, item.reason]
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

// Get all returns
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

    // Get items for each return
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
      
      returnRecord.items = items;
    }
    
    res.json(returns);
  } catch (error) {
    console.error('Error fetching returns:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get return by ID
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
        i.unit
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

module.exports = {
  createReturn,
  getAllReturns,
  getReturnById
};