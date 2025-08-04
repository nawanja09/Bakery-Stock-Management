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
    items 
  } = req.body;

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Insert issuance
    const [issuanceResult] = await connection.query(
      `INSERT INTO issuances 
      (issuance_date, issued_by, department_id, received_by, remarks, approved_by) 
      VALUES (?, ?, ?, ?, ?, ?)`,
      [issuance_date, issued_by, department_id, received_by, remarks, approved_by]
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
        i.approved_by
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

module.exports = {
  createIssuance,
  getAllIssuances,
  getIssuanceById
};