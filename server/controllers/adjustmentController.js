const pool = require('../config/db');

// Create a new stock adjustment
const createAdjustment = async (req, res) => {
  const { date, user_name, reference_note, item_id, system_qty, actual_qty, variance, unit_price, amount, reason } = req.body;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Insert into stock_adjustments table for history
    const [result] = await connection.query(
      `INSERT INTO stock_adjustments 
      (date, user_name, reference_note, item_id, system_qty, actual_qty, variance, unit_price, amount, reason) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [date, user_name, reference_note, item_id, system_qty, actual_qty, variance, unit_price, amount, reason]
    );

    // 2. Insert the variance into opening_balances to dynamically adjust the overall system stock
    // This allows the stock to instantly reflect the new 'Actual Quantity' in all dynamic calculations.
    await connection.query(
      `INSERT INTO opening_balances (date, item_id, quantity) VALUES (?, ?, ?)`,
      [date, item_id, variance]
    );

    // If there is an auto-add/stock movement logic, log it here.
    await connection.query(
      `INSERT INTO stock_movements 
       (item_id, quantity, movement_type, reference_id, reference_type, movement_date, notes)
       VALUES (?, ?, 'ADJUSTMENT', ?, 'stock_adjustments', ?, ?)`,
      [item_id, variance, result.insertId, date, reason]
    );

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
    const { startDate, endDate, item_id, reference_note } = req.query;

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

    query += ` ORDER BY sa.date DESC, sa.id DESC`;

    const [rows] = await pool.query(query, params);
    res.json(rows);

  } catch (error) {
    console.error('Error fetching adjustments:', error);
    res.status(500).json({ error: 'Server error' });
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
          COALESCE(purchase_returns.total_purchase_returned, 0)
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
      WHERE i.id = ? AND i.deleted = FALSE
    `;

    const [rows] = await pool.query(query, [itemId, itemId, itemId, itemId, itemId, itemId, itemId]);

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

module.exports = {
  createAdjustment,
  getAdjustments,
  getSystemQuantity
};
