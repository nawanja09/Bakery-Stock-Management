const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Create wastage
const createWastage = async (req, res) => {
  const { date, approved_by, reason, remarks, items } = req.body;
  const user_id = req.user.userId;
  const wastage_note_number = `WN-${uuidv4().substr(0, 8).toUpperCase()}`;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [wastageResult] = await connection.query(
      `INSERT INTO wastages 
      (wastage_note_number, date, approved_by, reason, remarks, entered_by) 
      VALUES (?, ?, ?, ?, ?, ?)`,
      [wastage_note_number, date, approved_by, reason, remarks, user_id]
    );

    const wastageId = wastageResult.insertId;

    let totalEstimatedLoss = 0;

    for (const item of items) {
      await connection.query(
        `INSERT INTO wastage_items 
        (wastage_id, item_id, quantity, estimated_loss) 
        VALUES (?, ?, ?, ?)`,
        [wastageId, item.item_id, item.quantity, item.estimated_loss]
      );

      if (item.estimated_loss) {
        totalEstimatedLoss += parseFloat(item.estimated_loss);
      }
    }

    await connection.commit();

    res.status(201).json({
      message: 'Wastage recorded successfully!',
      wastage_note_number,
      total_estimated_loss: totalEstimatedLoss.toFixed(2),
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error creating wastage:', error.stack);
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

// Get all wastages (excluding soft-deleted) with total loss
// Supports optional filters (all backward compatible - omit any/all to get original behavior):
//   reason            - exact match on the wastage reason enum
//   item_id           - filter to wastages that contain a specific item
//   startDate/endDate - inclusive date range (YYYY-MM-DD) on date
const getAllWastages = async (req, res) => {
  try {
    const { reason, item_id, startDate, endDate } = req.query;

    let query = `
      SELECT 
        w.id,
        w.wastage_note_number,
        w.date,
        w.approved_by,
        w.reason,
        w.remarks,
        COALESCE(w.deleted, 0) AS deleted,
        u.username AS entered_by,
        COALESCE((
          SELECT SUM(wi.estimated_loss) 
          FROM wastage_items wi 
          WHERE wi.wastage_id = w.id
        ), 0) AS total_loss
      FROM wastages w
      LEFT JOIN users u ON w.entered_by = u.id
      WHERE COALESCE(w.deleted, 0) = 0
    `;
    const params = [];

    if (reason) {
      query += ` AND w.reason = ?`;
      params.push(reason);
    }

    if (startDate && endDate) {
      query += ` AND w.date BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    }

    if (item_id) {
      query += ` AND EXISTS (
        SELECT 1 FROM wastage_items wi2 WHERE wi2.wastage_id = w.id AND wi2.item_id = ?
      )`;
      params.push(item_id);
    }

    query += ` ORDER BY w.date DESC`;

    const [wastages] = await pool.query(query, params);

    // Optionally, also fetch items for each wastage if you want to display them
    // in the history list (though you already fetch them in the modal view)
    const wastageIds = wastages.map(w => w.id);
    if (wastageIds.length > 0) {
      const [items] = await pool.query(`
        SELECT 
          wi.wastage_id,
          wi.item_id,
          wi.quantity,
          wi.estimated_loss,
          i.item_code,
          i.name AS item_name,
          i.unit
        FROM wastage_items wi
        JOIN items i ON wi.item_id = i.id
        WHERE wi.wastage_id IN (?)
      `, [wastageIds]);

      // Attach items to their wastages
      wastages.forEach(wastage => {
        wastage.items = items.filter(item => item.wastage_id === wastage.id);
      });
    }

    res.json(wastages);

  } catch (error) {
    console.error('Error fetching wastages:', error.stack);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

// Get wastage by ID
const getWastageById = async (req, res) => {
  const { id } = req.params;

  try {
    const [wastage] = await pool.query(`
      SELECT 
        w.*, u.username AS entered_by
      FROM wastages w
      JOIN users u ON w.entered_by = u.id
      WHERE w.id = ? AND COALESCE(w.deleted, 0) = 0
    `, [id]);

    if (wastage.length === 0) {
      return res.status(404).json({ error: 'Wastage not found' });
    }

    const [items] = await pool.query(`
      SELECT 
        wi.*, i.item_code, i.name AS item_name, i.unit
      FROM wastage_items wi
      JOIN items i ON wi.item_id = i.id
      WHERE wi.wastage_id = ?
    `, [id]);

    res.json({
      ...wastage[0],
      items
    });

  } catch (error) {
    console.error('Error fetching wastage:', error.stack);
    res.status(500).json({ error: 'Server error' });
  }
};

// UPDATE wastage
const updateWastage = async (req, res) => {
  const { id } = req.params;
  const { date, approved_by, reason, remarks, items } = req.body;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Check if wastage exists and is not deleted
    const [existing] = await connection.query(
      `SELECT id, wastage_note_number FROM wastages 
       WHERE id = ? AND COALESCE(deleted, 0) = 0`,
      [id]
    );

    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Wastage not found' });
    }

    const wastageNoteNumber = existing[0].wastage_note_number;

    // Update wastage header
    await connection.query(
      `UPDATE wastages 
       SET date = ?, approved_by = ?, reason = ?, remarks = ?
       WHERE id = ?`,
      [date, approved_by, reason, remarks, id]
    );

    // Delete existing items
    await connection.query(
      `DELETE FROM wastage_items WHERE wastage_id = ?`,
      [id]
    );

    // Insert updated items
    let totalEstimatedLoss = 0;
    for (const item of items) {
      await connection.query(
        `INSERT INTO wastage_items 
        (wastage_id, item_id, quantity, estimated_loss) 
        VALUES (?, ?, ?, ?)`,
        [id, item.item_id, item.quantity, item.estimated_loss]
      );

      if (item.estimated_loss) {
        totalEstimatedLoss += parseFloat(item.estimated_loss);
      }
    }

    await connection.commit();

    res.status(200).json({
      message: 'Wastage updated successfully!',
      wastage_note_number: wastageNoteNumber,
      total_estimated_loss: totalEstimatedLoss.toFixed(2),
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error updating wastage:', error.stack);
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

// Soft delete wastage
const deleteWastage = async (req, res) => {
  const { id } = req.params;

  try {
    const [checkResult] = await pool.query(
      `SELECT id FROM wastages WHERE id = ? AND COALESCE(deleted, 0) = 0`,
      [id]
    );

    if (checkResult.length === 0) {
      return res.status(404).json({ error: 'Wastage not found or already deleted' });
    }

    await pool.query(
      `UPDATE wastages SET deleted = 1 WHERE id = ?`,
      [id]
    );

    res.json({ message: 'Wastage deleted successfully' });

  } catch (error) {
    console.error('Error deleting wastage:', error.stack);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  createWastage,
  getAllWastages,
  getWastageById,
  updateWastage,
  deleteWastage
};