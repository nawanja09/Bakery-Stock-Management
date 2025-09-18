const pool = require('../config/db');

// Create new issuance
const createIssuance = async (req, res) => {
  const { 
    issuance_date, 
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

    // Insert issuance
    const [issuanceResult] = await connection.query(
      `INSERT INTO issuances 
      (issuance_date, issued_by, department_id, received_by, remarks, approved_by, check_number) 
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [issuance_date, issued_by, department_id, received_by, remarks, approved_by, check_number]
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

// Get all issuances
const getAllIssuances = async (req, res) => {
  try {
    const [issuances] = await pool.query(`
      SELECT
        i.id,
        i.issuance_date,
        u.email AS issued_by_email,
        d.name AS department_name,
        i.received_by,
        i.remarks,
        i.approved_by,
        i.check_number
      FROM issuances i
      JOIN users u ON i.issued_by = u.id
      JOIN departments d ON i.department_id = d.id
      ORDER BY i.issuance_date DESC
    `);
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

    // Update issuance
    await connection.query(
      `UPDATE issuances 
       SET issuance_date = ?, issued_by = ?, department_id = ?, received_by = ?, 
           remarks = ?, approved_by = ?, check_number = ?
       WHERE id = ?`,
      [issuance_date, issued_by, department_id, received_by, remarks, approved_by, check_number, id]
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