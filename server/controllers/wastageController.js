const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Create new wastage
const createWastage = async (req, res) => {
 const { date, approved_by, reason, remarks, items, department_id } = req.body;  const user_id = req.user.userId;
  const wastage_note_number = `WN-${uuidv4().substr(0, 8).toUpperCase()}`;
  
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Insert wastage
    const [wastageResult] = await connection.query(
      `INSERT INTO wastages 
      (wastage_note_number, date, approved_by, reason, remarks, entered_by, department_id) 
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [wastage_note_number, date, approved_by, reason, remarks, user_id, department_id]
    );
    
    const wastageId = wastageResult.insertId;
    let totalEstimatedLoss = 0;

    // Insert wastage items
    for (const item of items) {
      await connection.query(
        `INSERT INTO wastage_items 
        (wastage_id, item_id, quantity, estimated_loss) 
        VALUES (?, ?, ?, ?)`,
        [wastageId, item.item_id, item.quantity, item.estimated_loss]
      );
      
      if (item.estimated_loss) {
        totalEstimatedLoss += item.estimated_loss;
      }
    }

    await connection.commit();
    res.status(201).json({ 
      message: 'Wastage recorded successfully!', 
      wastage_note_number,
      total_estimated_loss: totalEstimatedLoss.toFixed(2)
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Error creating wastage:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

// Get all wastages
const getAllWastages = async (req, res) => {
  try {
    const [wastages] = await pool.query(`
      SELECT 
        w.id,
        w.wastage_note_number,
        w.date,
        w.approved_by,
        w.reason,
        w.remarks,
        u.email AS entered_by
      FROM wastages w
      JOIN users u ON w.entered_by = u.id
      ORDER BY w.date DESC
    `);
    res.json(wastages);
  } catch (error) {
    console.error('Error fetching wastages:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get wastage by ID
const getWastageById = async (req, res) => {
  const { id } = req.params;
  
  try {
    const [wastage] = await pool.query(`
      SELECT 
        w.*,
        u.email AS entered_by
      FROM wastages w
      JOIN users u ON w.entered_by = u.id
      WHERE w.id = ?
    `, [id]);
    
    if (wastage.length === 0) {
      return res.status(404).json({ error: 'Wastage not found' });
    }
    
    const [items] = await pool.query(`
      SELECT 
        wi.*, 
        i.item_code, 
        i.name AS item_name,
        i.unit
      FROM wastage_items wi
      JOIN items i ON wi.item_id = i.id
      WHERE wi.wastage_id = ?
    `, [id]);
    
    res.json({
      ...wastage[0],
      items
    });
    
  } catch (error) {
    console.error('Error fetching wastage:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  createWastage,
  getAllWastages,
  getWastageById
};