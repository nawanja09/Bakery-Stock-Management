const pool = require('../config/db');
const { recordRmAdjustment } = require('../utils/rmAdjustmentAudit');

const getAdjustmentValues = ({ system_qty, actual_qty, unit_price }) => {
  const systemQuantity = Number(system_qty);
  const actualQuantity = Number(actual_qty);
  const unitPrice = Number(unit_price);

  if (![systemQuantity, actualQuantity, unitPrice].every(Number.isFinite)) {
    throw new Error('system_qty, actual_qty, and unit_price must be valid numbers');
  }

  const variance = Number((actualQuantity - systemQuantity).toFixed(3));
  const amount = Number((variance * unitPrice).toFixed(2));

  return { systemQuantity, actualQuantity, unitPrice, variance, amount };
};

// Create a new stock adjustment
const createAdjustment = async (req, res) => {
  const { date, user_name, reference_note, item_id, system_qty, actual_qty, variance, unit_price, amount, reason } = req.body;
  const requestId = req.get('Idempotency-Key') || req.body.request_id || null;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (requestId) {
      const [existing] = await connection.query(
        'SELECT id FROM stock_adjustments WHERE request_id = ? FOR UPDATE',
        [requestId]
      );
      if (existing.length > 0) {
        await connection.commit();
        return res.status(200).json({
          message: 'Adjustment already saved.',
          adjustment_id: existing[0].id,
          duplicate: true
        });
      }
    }

    const values = getAdjustmentValues({ system_qty, actual_qty, unit_price });

    // 1. Insert into stock_adjustments table for history
    const [result] = await connection.query(
      `INSERT INTO stock_adjustments 
      (date, user_name, reference_note, item_id, system_qty, actual_qty, variance, unit_price, amount, reason, request_id) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [date, user_name, reference_note, item_id, values.systemQuantity, values.actualQuantity, values.variance, values.unitPrice, values.amount, reason, requestId]
    );

    // 2. Log the adjustment as a stock movement. Opening balances remain one-time item balances.
    await connection.query(
      `INSERT INTO stock_movements 
       (item_id, quantity, movement_type, reference_id, reference_type, movement_date, notes)
       VALUES (?, ?, 'ADJUSTMENT', ?, 'stock_adjustments', ?, ?)`,
      [item_id, values.variance, result.insertId, date, reason]
    );

    await recordRmAdjustment(connection, {
      category: 'Department', sourceRecordId: result.insertId, referenceId: requestId, updatedBy: null
    });

    await connection.commit();

    res.status(201).json({
      message: 'Adjustment saved successfully.',
      adjustment_id: result.insertId
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error creating adjustment:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  } finally {
    connection.release();
  }
};

// Get all adjustments
const getAdjustments = async (req, res) => {
  try {
    const { startDate, endDate, item_id, reference_note, search } = req.query;
    const normalizedSearch = search?.trim();

    let query = `
      SELECT 
        sa.id,
        sa.date,
        sa.user_name,
        sa.reference_note,
        sa.item_id,
        sa.system_qty,
        sa.actual_qty,
        sa.variance,
        sa.unit_price,
        sa.amount,
        sa.reason,
        i.name AS item_name,
        i.item_code AS item_code,
        i.unit
      FROM stock_adjustments sa
      JOIN items i ON sa.item_id = i.id
      WHERE 1=1
    `;

    const params = [];

    if (startDate && endDate) {
      query += ` AND DATE(sa.date) BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    }

    if (item_id && item_id !== 'all') {
      query += ` AND sa.item_id = ?`;
      params.push(item_id);
    }

    if (reference_note) {
      query += ` AND sa.reference_note LIKE ?`;
      params.push(`%${reference_note}%`);
    }

    if (normalizedSearch) {
      const searchTerm = `%${normalizedSearch.toLowerCase()}%`;
      query += ` AND (
        LOWER(i.name) LIKE ? OR
        LOWER(i.item_code) LIKE ? OR
        LOWER(COALESCE(sa.reason, '')) LIKE ? OR
        LOWER(COALESCE(sa.reference_note, '')) LIKE ?
      )`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    query += ` ORDER BY sa.date DESC, sa.id DESC`;

    const [rows] = await pool.query(query, params);
    res.json(rows);

  } catch (error) {
    console.error('Error fetching adjustments:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// RM Adjustment Summary data. Unlike the transaction history endpoints, this
// returns only source records that were actually changed and saved from the
// RM Adjustment page (tracked by rm_adjustment_records).
const getRmAdjustmentSummary = async (req, res) => {
  const { category } = req.params;
  const { startDate, endDate, item_id, department_id, supplier_id, invoice_no, payment_status, reason } = req.query;

  try {
    let rows;
    if (category === 'Department') {
      let query = `SELECT sa.id, sa.date, sa.user_name, sa.reference_note, sa.item_id,
          sa.system_qty, sa.actual_qty, sa.variance, sa.unit_price, sa.amount, sa.reason,
          i.name AS item_name, i.item_code, i.unit, rar.updated_at AS rm_adjusted_at
        FROM rm_adjustment_records rar
        JOIN stock_adjustments sa ON sa.id = rar.source_record_id
        JOIN items i ON i.id = sa.item_id
        WHERE rar.category = 'Department'`;
      const params = [];
      if (startDate) { query += ' AND DATE(rar.updated_at) >= ?'; params.push(startDate); }
      if (endDate) { query += ' AND DATE(rar.updated_at) <= ?'; params.push(endDate); }
      if (item_id && item_id !== 'all') { query += ' AND sa.item_id = ?'; params.push(item_id); }
      query += ' ORDER BY rar.updated_at DESC';
      [rows] = await pool.query(query, params);
    } else if (category === 'Invoice') {
      let query = `SELECT p.id, p.invoice_no, p.purchase_date, p.subtotal, p.vat_amount,
          p.total_with_vat, p.paid_amount, p.balance_amount, p.payment_status, p.supplier_id,
          s.name AS supplier_name, rar.updated_at AS rm_adjusted_at
        FROM rm_adjustment_records rar
        JOIN purchases p ON p.id = rar.source_record_id
        JOIN supplier s ON s.id = p.supplier_id
        WHERE rar.category = 'Invoice' AND (p.deleted = FALSE OR p.deleted IS NULL)`;
      const params = [];
      if (supplier_id && supplier_id !== 'all') { query += ' AND p.supplier_id = ?'; params.push(supplier_id); }
      if (invoice_no) { query += ' AND p.invoice_no LIKE ?'; params.push(`%${invoice_no}%`); }
      if (startDate) { query += ' AND DATE(rar.updated_at) >= ?'; params.push(startDate); }
      if (endDate) { query += ' AND DATE(rar.updated_at) <= ?'; params.push(endDate); }
      if (payment_status && payment_status !== 'all') { query += ' AND p.payment_status = ?'; params.push(payment_status); }
      query += ' ORDER BY rar.updated_at DESC';
      [rows] = await pool.query(query, params);
    } else if (category === 'Issuance') {
      let query = `SELECT iss.id, iss.issuance_date, iss.department_id, d.name AS department_name,
          iss.received_by, iss.remarks, iss.approved_by, iss.check_number,
          COUNT(ii.item_id) AS item_count, rar.updated_at AS rm_adjusted_at
        FROM rm_adjustment_records rar
        JOIN issuances iss ON iss.id = rar.source_record_id
        JOIN departments d ON d.id = iss.department_id
        LEFT JOIN issuance_items ii ON ii.issuance_id = iss.id
        WHERE rar.category = 'Issuance'`;
      const params = [];
      if (department_id && department_id !== 'all') { query += ' AND iss.department_id = ?'; params.push(department_id); }
      if (startDate) { query += ' AND DATE(rar.updated_at) >= ?'; params.push(startDate); }
      if (endDate) { query += ' AND DATE(rar.updated_at) <= ?'; params.push(endDate); }
      if (item_id && item_id !== 'all') { query += ' AND EXISTS (SELECT 1 FROM issuance_items ii2 WHERE ii2.issuance_id = iss.id AND ii2.item_id = ?)'; params.push(item_id); }
      query += ' GROUP BY iss.id ORDER BY rar.updated_at DESC';
      [rows] = await pool.query(query, params);
    } else if (category === 'Wastage') {
      let query = `SELECT w.id, w.wastage_note_number, w.date, w.approved_by, w.reason, w.remarks,
          COALESCE(SUM(wi.estimated_loss), 0) AS total_loss, rar.updated_at AS rm_adjusted_at
        FROM rm_adjustment_records rar
        JOIN wastages w ON w.id = rar.source_record_id
        LEFT JOIN wastage_items wi ON wi.wastage_id = w.id
        WHERE rar.category = 'Wastage' AND COALESCE(w.status, 1) = 1`;
      const params = [];
      if (reason && reason !== 'all') { query += ' AND w.reason = ?'; params.push(reason); }
      if (startDate) { query += ' AND DATE(rar.updated_at) >= ?'; params.push(startDate); }
      if (endDate) { query += ' AND DATE(rar.updated_at) <= ?'; params.push(endDate); }
      if (item_id && item_id !== 'all') { query += ' AND EXISTS (SELECT 1 FROM wastage_items wi2 WHERE wi2.wastage_id = w.id AND wi2.item_id = ?)'; params.push(item_id); }
      query += ' GROUP BY w.id ORDER BY rar.updated_at DESC';
      [rows] = await pool.query(query, params);
    } else if (category === 'Petty Cash Voucher') {
      let query = `SELECT rar.id AS adjustment_id, rar.created_at AS adjustment_date,
          rar.reference_id, rar.original_values, rar.updated_values, rar.updated_by, au.name AS adjusted_by,
          v.id, v.voucher_number, v.voucher_date, v.payee_name, v.expense_type, v.amount,
          c.name AS company_name
        FROM rm_adjustment_records rar
        JOIN petty_cash_vouchers v ON v.id = rar.source_record_id
        LEFT JOIN company c ON c.id = v.company_id
        LEFT JOIN users au ON au.id = rar.updated_by
        WHERE rar.category = 'Petty Cash Voucher'`;
      const params = [];
      if (startDate) { query += ' AND DATE(rar.created_at) >= ?'; params.push(startDate); }
      if (endDate) { query += ' AND DATE(rar.created_at) <= ?'; params.push(endDate); }
      query += ' ORDER BY rar.created_at DESC';
      [rows] = await pool.query(query, params);
    } else if (category === 'Expense Bill') {
      let query = `SELECT rar.id AS adjustment_id, rar.created_at AS adjustment_date,
          rar.reference_id, rar.original_values, rar.updated_values, rar.updated_by, au.name AS adjusted_by,
          e.id AS expense_id, e.bill_number, e.bill_date, e.payee_name, e.expense_type, e.sub_expense_type,
          e.total_bill_amount, e.paid_amount, e.payment_status, c.name AS company_name
        FROM rm_adjustment_records rar
        JOIN expenses e ON e.id = rar.source_record_id
        LEFT JOIN company c ON c.id = e.company_id
        LEFT JOIN users au ON au.id = rar.updated_by
        WHERE rar.category = 'Expense Bill' AND e.is_deleted = 0`;
      const params = [];
      if (startDate) { query += ' AND DATE(rar.created_at) >= ?'; params.push(startDate); }
      if (endDate) { query += ' AND DATE(rar.created_at) <= ?'; params.push(endDate); }
      query += ' ORDER BY rar.created_at DESC';
      [rows] = await pool.query(query, params);
    } else {
      return res.status(400).json({ error: 'Invalid RM adjustment category' });
    }
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching RM adjustment summary:', error);
    res.status(500).json({ error: 'Unable to fetch RM adjustment summary' });
  }
};

// Get System Quantity and Unit Price for an Item
const getSystemQuantity = async (req, res) => {
  const { itemId } = req.params;

  try {
    // We re-use the exact dynamic aggregation logic that the Stock Report uses.
    // Calculate opening balance, purchases, issues, wastages, returns, etc up to today.
    const query = `
      SELECT 
        i.id,
        i.name,
        i.unit,
        (
          COALESCE(ob.total_opening, 0) +
          COALESCE(purchases.total_purchased, 0) -
          COALESCE(issues.total_issued, 0) -
          COALESCE(wastage.total_wasted, 0) +
          COALESCE(returns.total_returned, 0) -
          COALESCE(purchase_returns.total_purchase_returned, 0) +
          COALESCE(adjustments.total_adjusted, 0)
        ) AS current_stock,
        (
          SELECT pi.unit_price 
          FROM purchase_items pi
          JOIN purchases p ON pi.purchase_id = p.id
          WHERE pi.item_id = i.id 
          ORDER BY p.purchase_date DESC, pi.id DESC 
          LIMIT 1
        ) AS unit_price
      FROM items i
      LEFT JOIN (
        SELECT item_id, SUM(quantity) AS total_opening
        FROM opening_balances
        WHERE item_id = ?
        GROUP BY item_id
      ) ob ON i.id = ob.item_id
      LEFT JOIN (
        SELECT pi.item_id, SUM(pi.quantity) AS total_purchased
        FROM purchase_items pi
        JOIN purchases p ON pi.purchase_id = p.id
        WHERE pi.item_id = ?
        GROUP BY pi.item_id
      ) purchases ON i.id = purchases.item_id
      LEFT JOIN (
        SELECT ii.item_id, SUM(ii.quantity) AS total_issued
        FROM issuance_items ii
        JOIN issuances iss ON ii.issuance_id = iss.id
        WHERE ii.item_id = ?
        GROUP BY ii.item_id
      ) issues ON i.id = issues.item_id
      LEFT JOIN (
        SELECT wi.item_id, SUM(wi.quantity) AS total_wasted
        FROM wastage_items wi
        JOIN wastages w ON wi.wastage_id = w.id
        WHERE wi.item_id = ?
        GROUP BY wi.item_id
      ) wastage ON i.id = wastage.item_id
      LEFT JOIN (
        SELECT ri.item_id, SUM(ri.quantity) AS total_returned
        FROM return_items ri
        JOIN returns r ON ri.return_id = r.id
        WHERE ri.item_id = ?
        GROUP BY ri.item_id
      ) returns ON i.id = returns.item_id
      LEFT JOIN (
        SELECT pri.item_id, SUM(pri.quantity) AS total_purchase_returned
        FROM purchase_return_items pri
        JOIN purchase_returns pr ON pri.return_id = pr.id
        WHERE pri.item_id = ?
        GROUP BY pri.item_id
      ) purchase_returns ON i.id = purchase_returns.item_id
      LEFT JOIN (
        SELECT item_id, SUM(variance) AS total_adjusted
        FROM stock_adjustments
        WHERE item_id = ?
        GROUP BY item_id
      ) adjustments ON i.id = adjustments.item_id
      WHERE i.id = ? AND i.deleted = FALSE
    `;

    const [rows] = await pool.query(query, [itemId, itemId, itemId, itemId, itemId, itemId, itemId, itemId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({
      system_qty: rows[0].current_stock || 0,
      unit_price: rows[0].unit_price || 0,
      unit: rows[0].unit
    });

  } catch (error) {
    console.error('Error fetching system quantity:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get single adjustment by ID
const getAdjustmentById = async (req, res) => {
  const { id } = req.params;
  
  try {
    const [rows] = await pool.query(
      `SELECT 
        sa.id,
        sa.date,
        sa.user_name,
        sa.reference_note,
        sa.item_id,
        sa.system_qty,
        sa.actual_qty,
        sa.variance,
        sa.unit_price,
        sa.amount,
        sa.reason,
        i.name AS item_name,
        i.item_code AS item_code,
        i.unit
      FROM stock_adjustments sa
      JOIN items i ON sa.item_id = i.id
      WHERE sa.id = ?`,
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Adjustment not found' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching adjustment:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateAdjustment = async (req, res) => {
  const { id } = req.params;
  const {
    date,
    user_name,
    reference_note,
    item_id,
    system_qty,
    actual_qty,
    variance,
    unit_price,
    amount,
    reason
  } = req.body;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existingRows] = await connection.query(
      `SELECT item_id, request_id FROM stock_adjustments WHERE id = ? FOR UPDATE`,
      [id]
    );

    if (existingRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Adjustment not found' });
    }

    const values = getAdjustmentValues({ system_qty, actual_qty, unit_price });
    const adjustmentItemId = item_id || existingRows[0].item_id;

    const [result] = await connection.query(
      `UPDATE stock_adjustments
       SET date = ?, user_name = ?, reference_note = ?, item_id = ?, system_qty = ?, actual_qty = ?, variance = ?, unit_price = ?, amount = ?, reason = ?
       WHERE id = ?`,
      [date, user_name, reference_note, adjustmentItemId, values.systemQuantity, values.actualQuantity, values.variance, values.unitPrice, values.amount, reason, id]
    );

    const [movementResult] = await connection.query(
      `UPDATE stock_movements
       SET item_id = ?, quantity = ?, notes = ?, movement_date = ?
       WHERE reference_type = 'stock_adjustments' AND reference_id = ?`,
      [adjustmentItemId, values.variance, reason, date, id]
    );

    if (movementResult.affectedRows === 0) {
      await connection.query(
        `INSERT INTO stock_movements
         (item_id, quantity, movement_type, reference_id, reference_type, movement_date, notes)
         VALUES (?, ?, 'ADJUSTMENT', ?, 'stock_adjustments', ?, ?)`,
        [adjustmentItemId, values.variance, id, date, reason]
      );
    }

    await connection.commit();
    res.json({ message: 'Adjustment updated successfully.' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating adjustment:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  } finally {
    connection.release();
  }
};

const deleteAdjustment = async (req, res) => {
  const { id } = req.params;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.query('DELETE FROM stock_adjustments WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Adjustment not found' });
    }

    await connection.query(
      `DELETE FROM stock_movements WHERE reference_type = 'stock_adjustments' AND reference_id = ?`,
      [id]
    );

    await connection.commit();
    res.json({ message: 'Adjustment deleted successfully.' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting adjustment:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  } finally {
    connection.release();
  }
};

module.exports = {
  createAdjustment,
  getAdjustments,
  getRmAdjustmentSummary,
  getSystemQuantity,
  getAdjustmentById,
  updateAdjustment,
  deleteAdjustment,
  getAdjustmentValues
};
