const pool = require('../config/db');
const { isRmAdjustmentRequest, recordRmAdjustment, sameItems, sameValue } = require('../utils/rmAdjustmentAudit');
const { actorId, approverName } = require('../utils/actor');
const { archiveLines } = require('../services/lineHistory');
const { lockAndCheckAvailability, StockError } = require('../services/stockAvailability');

// Create new issuance
const createIssuance = async (req, res) => {
  const {
    issuance_date,  // "2026-07-02" (date only)
    issuance_time,  // "14:30" (time only)
    department_id,
    received_by,
    remarks,
    check_number,
    items
  } = req.body;

  // Issued By = the signed-in user, never a value from the form.
  const issued_by = actorId(req);
  if (!issued_by) return res.status(401).json({ error: 'Please log in again' });

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Stock availability (audit H4) is the FIRST query of the transaction, before
    // ANY other read on this connection - even one on an unrelated table (e.g.
    // looking up the signed-in user's name below). Under REPEATABLE READ, every
    // later non-locking read in a transaction shares the snapshot taken by the
    // FIRST one; if that read happened first, the stock check could see stock as
    // it was before this transaction even started, missing another issuance that
    // committed in the meantime. Locked here, it always sees the truth.
    const lines = await lockAndCheckAvailability(connection, items);

    // Approved By: the approver named on the form, otherwise the signed-in user.
    const approved_by = await approverName(connection, req, req.body.approved_by);

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
    for (const { itemId, quantity } of lines) {
      await connection.query(
        `INSERT INTO issuance_items
        (issuance_id, item_id, quantity)
        VALUES (?, ?, ?)`,
        [issuanceId, itemId, quantity]
      );
    }

    await connection.commit();
    res.status(201).json({
      message: 'Issuance created successfully!',
      issuance_id: issuanceId
    });

  } catch (error) {
    await connection.rollback();
    if (error instanceof StockError) return res.status(error.status).json({ error: error.message });
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
        u.username AS issued_by_email,
        u.name AS issued_by_name,
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
        u.username AS issued_by_email,
        u.name AS issued_by_name,
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
    department_id,
    received_by,
    remarks,
    check_number,
    items
  } = req.body;

  // The editor is the signed-in user; Issued By stays the user who made the note.
  const editorId = actorId(req);
  if (!editorId) return res.status(401).json({ error: 'Please log in again' });

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // The issuance's OWN current lines never count against it: they are being
    // replaced, not added on top of (audit H4 - see lockAndCheckAvailability).
    // Locked (FOR UPDATE), not just read: this is the FIRST query of the
    // transaction, and it - along with the stock check right after - must stay
    // the first ones. A plain (non-locking) read anywhere before them, even on an
    // unrelated table such as the approver lookup below, would anchor this
    // transaction's REPEATABLE READ snapshot too early and the stock check could
    // still see stock as it was before this transaction even started.
    const [itemRows] = await connection.query('SELECT item_id, quantity FROM issuance_items WHERE issuance_id = ? FOR UPDATE', [id]);
    const originalItems = itemRows;
    const creditBack = new Map();
    for (const row of originalItems) {
      const itemId = Number(row.item_id);
      creditBack.set(itemId, (creditBack.get(itemId) || 0) + Number(row.quantity));
    }

    // Stock availability (audit H4): locked and checked before anything changes.
    const lines = await lockAndCheckAvailability(connection, items, { creditBack });

    // Approved By: the approver named on the form, otherwise the signed-in user.
    const approved_by = await approverName(connection, req, req.body.approved_by);

    const trackRmAdjustment = isRmAdjustmentRequest(req);
    let originalIssuance = null;
    if (trackRmAdjustment) {
      const [issuanceRows] = await connection.query('SELECT * FROM issuances WHERE id = ? FOR UPDATE', [id]);
      originalIssuance = issuanceRows[0] || null;
    }

    // Combine date and time into one datetime
    const datetime = issuance_time
      ? `${issuance_date} ${issuance_time}:00`
      : `${issuance_date} 00:00:00`;

    // Update issuance
    await connection.query(
      `UPDATE issuances
       SET issuance_date = ?, department_id = ?, received_by = ?,
           remarks = ?, approved_by = ?, check_number = ?
       WHERE id = ?`,
      [datetime, department_id, received_by, remarks, approved_by, check_number, id]
    );

    // Replace the lines: the old ones are kept in record_line_history first
    await archiveLines(connection, 'issuance_items', id, { userId: editorId });
    await connection.query(
      `DELETE FROM issuance_items WHERE issuance_id = ?`,
      [id]
    );

    // Insert updated items
    for (const { itemId, quantity } of lines) {
      await connection.query(
        `INSERT INTO issuance_items
        (issuance_id, item_id, quantity)
        VALUES (?, ?, ?)`,
        [id, itemId, quantity]
      );
    }

    const issuanceChanged = trackRmAdjustment && originalIssuance && (
      !sameValue(originalIssuance.issuance_date, datetime) ||
      !sameValue(originalIssuance.department_id, department_id) ||
      !sameValue(originalIssuance.received_by, received_by) ||
      !sameValue(originalIssuance.remarks, remarks) ||
      !sameValue(originalIssuance.approved_by, approved_by) ||
      !sameValue(originalIssuance.check_number, check_number) ||
      !sameItems(originalItems, items, ['item_id', 'quantity'])
    );
    if (issuanceChanged) {
      await recordRmAdjustment(connection, {
        category: 'Issuance', sourceRecordId: id, referenceId: String(id), updatedBy: editorId
      });
    }

    await connection.commit();
    res.json({ message: 'Issuance updated successfully!' });

  } catch (error) {
    await connection.rollback();
    if (error instanceof StockError) return res.status(error.status).json({ error: error.message });
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
        ) +
        COALESCE(
          (SELECT SUM(sa.variance)
           FROM stock_adjustments sa
           WHERE sa.is_deleted = 0 AND sa.status = 'Approved' AND sa.item_id = i.id AND DATE(sa.date) <= CURDATE()
          ), 0
        ) -
        COALESCE(
          (SELECT SUM(wi.quantity) 
           FROM wastage_items wi 
           JOIN wastages w ON wi.wastage_id = w.id AND COALESCE(w.status, 1) = 1 
           WHERE wi.item_id = i.id AND w.date <= CURDATE()
          ), 0
        ) AS current_stock
      FROM items i
      WHERE i.deleted = FALSE
        AND i.is_active = TRUE
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
