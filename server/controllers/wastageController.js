const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { isRmAdjustmentRequest, recordRmAdjustment, sameItems, sameValue } = require('../utils/rmAdjustmentAudit');
const { actorId, approverName } = require('../utils/actor');

// Create wastage
const createWastage = async (req, res) => {
  const { date, reason, remarks, items } = req.body;
  // Entered By = the signed-in user, never a value from the form.
  const user_id = actorId(req);
  if (!user_id) return res.status(401).json({ error: 'Please log in again' });
  const wastage_note_number = `WN-${uuidv4().substr(0, 8).toUpperCase()}`;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Approved By: the approver named on the form, otherwise the signed-in user.
    const approved_by = await approverName(connection, req, req.body.approved_by);

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
        COALESCE(w.status, 1) AS status,
        COALESCE(u.name, u.username) AS entered_by,
        COALESCE((
          SELECT SUM(wi.estimated_loss) 
          FROM wastage_items wi 
          WHERE wi.wastage_id = w.id
        ), 0) AS total_loss
      FROM wastages w
      LEFT JOIN users u ON w.entered_by = u.id
      WHERE COALESCE(w.status, 1) = 1
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
        w.*, COALESCE(u.name, u.username) AS entered_by
      FROM wastages w
      LEFT JOIN users u ON w.entered_by = u.id
      WHERE w.id = ? AND COALESCE(w.status, 1) = 1
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
  const { date, reason, remarks, items } = req.body;
  if (!actorId(req)) return res.status(401).json({ error: 'Please log in again' });

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Approved By: the approver named on the form, otherwise the signed-in user.
    const approved_by = await approverName(connection, req, req.body.approved_by);

    const trackRmAdjustment = isRmAdjustmentRequest(req);

    // Check if wastage exists and is not deleted
    const [existing] = await connection.query(
      `SELECT id, wastage_note_number FROM wastages 
       WHERE id = ? AND COALESCE(status, 1) = 1`,
      [id]
    );

    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Wastage not found' });
    }

    const wastageNoteNumber = existing[0].wastage_note_number;
    let originalWastage = null;
    let originalItems = [];
    if (trackRmAdjustment) {
      const [wastageRows] = await connection.query('SELECT * FROM wastages WHERE id = ? FOR UPDATE', [id]);
      originalWastage = wastageRows[0] || null;
      const [itemRows] = await connection.query('SELECT item_id, quantity, estimated_loss FROM wastage_items WHERE wastage_id = ?', [id]);
      originalItems = itemRows;
    }

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

    const wastageChanged = trackRmAdjustment && originalWastage && (
      !sameValue(originalWastage.date, date) ||
      !sameValue(originalWastage.approved_by, approved_by) ||
      !sameValue(originalWastage.reason, reason) ||
      !sameValue(originalWastage.remarks, remarks) ||
      !sameItems(originalItems, items, ['item_id', 'quantity', 'estimated_loss'])
    );
    if (wastageChanged) {
      await recordRmAdjustment(connection, {
        category: 'Wastage', sourceRecordId: id, referenceId: wastageNoteNumber, updatedBy: actorId(req)
      });
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

module.exports = {
  createWastage,
  getAllWastages,
  getWastageById,
  updateWastage
};
