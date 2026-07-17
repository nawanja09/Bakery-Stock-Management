const pool = require('../config/db');

// Create new issuance
const createIssuance = async (req, res) => {
  const { 
    issuance_date,  // "2026-07-02" (date only)
    issuance_time,  // "14:30" (time only)
    issued_by, 
    department_id, 
    received_by, 
    remarks, 
    approved_by,
    check_number,
    items 
  } = req.body;

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Combine date and time into one datetime
    const datetime = issuance_time 
      ? `${issuance_date} ${issuance_time}:00`
      : `${issuance_date} 00:00:00`;

    // Insert issuance
    const [issuanceResult] = await connection.query(
      `INSERT INTO issuances 
      (issuance_date, issued_by, department_id, received_by, remarks, approved_by, check_number) 
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [datetime, issued_by, department_id, received_by, remarks, approved_by, check_number]
    );
    
    const issuanceId = issuanceResult.insertId;

    // Insert issuance items
    for (const item of items) {
      await connection.query(
        `INSERT INTO issuance_items 
        (issuance_id, item_id, quantity) 
        VALUES (?, ?, ?)`,
        [issuanceId, item.item_id, item.quantity]
      );
    }

    await connection.commit();
    res.status(201).json({ 
      message: 'Issuance created successfully!', 
      issuance_id: issuanceId 
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Error creating issuance:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

// Get all issuances with items and quantities
// Supports optional filters (all backward compatible - omit any/all to get original behavior):
//   department_id  - filter to a single department
//   item_id        - filter to issuances that contain a specific item
//   startDate/endDate - inclusive date range (YYYY-MM-DD) on issuance_date
const getAllIssuances = async (req, res) => {
  try {
    const { department_id, item_id, startDate, endDate } = req.query;

    let query = `
      SELECT
        i.id,
        i.issuance_date,
        DATE_FORMAT(i.issuance_date, '%Y-%m-%d') AS issuance_date_only,
        TIME_FORMAT(i.issuance_date, '%H:%i') AS issuance_time,
        u.email AS issued_by_email,
        d.name AS department_name,
        i.department_id,
        i.received_by,
        i.remarks,
        i.approved_by,
        i.check_number
      FROM issuances i
      JOIN users u ON i.issued_by = u.id
      JOIN departments d ON i.department_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (department_id) {
      query += ` AND i.department_id = ?`;
      params.push(department_id);
    }

    if (startDate && endDate) {
      query += ` AND DATE(i.issuance_date) BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    }

    if (item_id) {
      query += ` AND EXISTS (
        SELECT 1 FROM issuance_items ii2 WHERE ii2.issuance_id = i.id AND ii2.item_id = ?
      )`;
      params.push(item_id);
    }

    query += ` ORDER BY i.issuance_date DESC`;

    const [issuances] = await pool.query(query, params);

    // Get items for each issuance
    for (let issuance of issuances) {
      const [items] = await pool.query(`
        SELECT 
          it.item_code, 
          it.name AS item_name,
          it.unit,
          ii.item_id,
          ii.quantity
        FROM issuance_items ii
        JOIN items it ON ii.item_id = it.id
        WHERE ii.issuance_id = ?
      `, [issuance.id]);
      
      issuance.items = items;
    }
    
    res.json(issuances);
  } catch (error) {
    console.error('Error fetching issuances:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get issuance by ID
const getIssuanceById = async (req, res) => {
  const { id } = req.params;
  
  try {
    const [issuance] = await pool.query(`
      SELECT 
        i.*,
        DATE_FORMAT(i.issuance_date, '%Y-%m-%d') AS issuance_date_only,
        TIME_FORMAT(i.issuance_date, '%H:%i') AS issuance_time,
        u.email AS issued_by_email,
        d.name AS department_name
      FROM issuances i
      JOIN users u ON i.issued_by = u.id
      JOIN departments d ON i.department_id = d.id
      WHERE i.id = ?
    `, [id]);
    
    if (issuance.length === 0) {
      return res.status(404).json({ error: 'Issuance not found' });
    }
    
    const [items] = await pool.query(`
      SELECT 
        ii.*, 
        it.item_code, 
        it.name AS item_name,
        it.unit
      FROM issuance_items ii
      JOIN items it ON ii.item_id = it.id
      WHERE ii.issuance_id = ?
    `, [id]);
    
    res.json({
      ...issuance[0],
      items
    });
    
  } catch (error) {
    console.error('Error fetching issuance:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Update issuance
const updateIssuance = async (req, res) => {
  const { id } = req.params;
  const { 
    issuance_date,
    issuance_time,
    issued_by, 
    department_id, 
    received_by, 
    remarks, 
    approved_by, 
    check_number,
    items 
  } = req.body;

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Combine date and time into one datetime
    const datetime = issuance_time 
      ? `${issuance_date} ${issuance_time}:00`
      : `${issuance_date} 00:00:00`;

    // Update issuance
    await connection.query(
      `UPDATE issuances 
       SET issuance_date = ?, issued_by = ?, department_id = ?, received_by = ?, 
           remarks = ?, approved_by = ?, check_number = ?
       WHERE id = ?`,
      [datetime, issued_by, department_id, received_by, remarks, approved_by, check_number, id]
    );

    // Delete existing items
    await connection.query(
      `DELETE FROM issuance_items WHERE issuance_id = ?`,
      [id]
    );

    // Insert updated items
    for (const item of items) {
      await connection.query(
        `INSERT INTO issuance_items 
        (issuance_id, item_id, quantity) 
        VALUES (?, ?, ?)`,
        [id, item.item_id, item.quantity]
      );
    }

    await connection.commit();
    res.json({ message: 'Issuance updated successfully!' });
    
  } catch (error) {
    await connection.rollback();
    console.error('Error updating issuance:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

// Get items with current stock
const getItemsWithStock = async (req, res) => {
  try {
    const [items] = await pool.query(`
      SELECT 
        i.*,
        COALESCE(
          (SELECT SUM(ob.quantity) 
           FROM opening_balances ob 
           WHERE ob.item_id = i.id AND ob.date <= CURDATE()
          ), 0
        ) + 
        COALESCE(
          (SELECT SUM(pi.quantity) 
           FROM purchase_items pi 
           JOIN purchases p ON pi.purchase_id = p.id 
           WHERE pi.item_id = i.id AND DATE(p.purchase_date) <= CURDATE()
          ), 0
        ) - 
        COALESCE(
          (SELECT SUM(ii.quantity) 
           FROM issuance_items ii 
           JOIN issuances iss ON ii.issuance_id = iss.id 
           WHERE ii.item_id = i.id AND DATE(iss.issuance_date) <= CURDATE()
          ), 0
        ) - 
        COALESCE(
          (SELECT SUM(wi.quantity) 
           FROM wastage_items wi 
           JOIN wastages w ON wi.wastage_id = w.id 
           WHERE wi.item_id = i.id AND w.date <= CURDATE()
          ), 0
        ) AS current_stock
      FROM items i
      ORDER BY i.name
    `);
    
    res.json(items);
  } catch (error) {
    console.error('Error fetching items with stock:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  createIssuance,
  getAllIssuances,
  getIssuanceById,
  updateIssuance,
  getItemsWithStock
};