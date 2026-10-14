// server/controllers/orderController.js
//
// RM -> Orders module.
//
// IMPORTANT: this module never writes to RM stock. Low Stock is calculated
// live from the existing stock tables (see services/rmStockService.js), and
// Orders themselves only ever move PENDING -> COMPLETED / CANCELLED. Stock
// only changes when the linked Purchasing Invoice is saved
// (controllers/purchaseController.js:createPurchase), exactly as before.

const pool = require('../config/db');
const { actorId } = require('../utils/actor');
const { getAllItemsWithStock, getItemStock } = require('../services/rmStockService');

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

// The authenticated user only - a created_by in the body is ignored.
const resolveUserId = (req) => actorId(req);

// ORD-YYYY-XXXXX, unique. Retries on the rare collision (unique key on
// order_no) instead of trusting the count alone.
const generateOrderNo = async (connection) => {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 5; attempt++) {
    const [[{ cnt }]] = await connection.query(
      "SELECT COUNT(*) AS cnt FROM orders WHERE order_no LIKE ?",
      [`ORD-${year}-%`]
    );
    const next = cnt + 1 + attempt;
    const orderNo = `ORD-${year}-${String(next).padStart(5, '0')}`;
    const [existing] = await connection.query('SELECT id FROM orders WHERE order_no = ?', [orderNo]);
    if (existing.length === 0) return orderNo;
  }
  // Extremely unlikely fallback - still guaranteed unique.
  return `ORD-${year}-${Date.now()}`;
};

// ─────────────────────────────────────────────────────────────────────────
// GET /api/orders/low-stock
// ─────────────────────────────────────────────────────────────────────────
const getLowStock = async (req, res) => {
  try {
    const items = await getAllItemsWithStock();

    // Query active/pending orders to determine if an order has already been placed
    const [pendingRows] = await pool.query(`
      SELECT DISTINCT oi.item_id, o.order_no
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status = 'PENDING'
      ORDER BY o.id DESC
    `);
    const pendingOrderMap = new Map();
    for (const row of pendingRows) {
      if (!pendingOrderMap.has(row.item_id)) {
        pendingOrderMap.set(row.item_id, row.order_no);
      }
    }

    const lowStock = items
      .map(item => {
        const currentStock = parseFloat(item.current_stock) || 0;
        const bufferStock = parseFloat(item.reorder_level) || 0;
        const requiredQty = bufferStock - currentStock;
        const isOrdered = pendingOrderMap.has(item.id);
        return {
          item_id: item.id,
          item_code: item.item_code,
          item_name: item.name,
          unit: item.unit,
          current_stock: currentStock,
          buffer_stock: bufferStock,
          required_qty: requiredQty,
          is_ordered: isOrdered,
          ordered: isOrdered ? 'Yes' : 'No',
          pending_order_no: pendingOrderMap.get(item.id) || null
        };
      })
      .filter(item => item.required_qty > 0)
      .sort((a, b) => a.item_name.localeCompare(b.item_name));

    res.json(lowStock);
  } catch (error) {
    console.error('Error fetching low stock items:', error);
    res.status(500).json({ error: 'Server error while calculating low stock.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// POST /api/orders  ->  Create a PENDING order (no stock change)
// ─────────────────────────────────────────────────────────────────────────
const createOrder = async (req, res) => {
  const { item_id, quantity, supplier_id, expected_receive_date } = req.body;
  const createdBy = resolveUserId(req);

  if (!item_id) return res.status(400).json({ error: 'RM item is required.' });

  const orderQty = parseFloat(quantity);
  if (!Number.isFinite(orderQty) || orderQty <= 0) {
    return res.status(400).json({ error: 'Order quantity must be a number greater than zero.' });
  }

  if (!expected_receive_date) {
    return res.status(400).json({ error: 'Expected Receive Date is required.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Snapshot stock at the moment the order is created (spec section 41 -
    // historical accuracy even if current stock later changes).
    const item = await getItemStock(connection, item_id);
    if (!item) {
      await connection.rollback();
      return res.status(404).json({ error: 'RM item not found.' });
    }

    if (supplier_id) {
      const [supplierRows] = await connection.query(
        'SELECT id FROM supplier WHERE id = ? AND is_deleted = 0', [supplier_id]
      );
      if (supplierRows.length === 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'Selected supplier was not found.' });
      }
    }

    const currentStock = parseFloat(item.current_stock) || 0;
    const bufferStock = parseFloat(item.reorder_level) || 0;
    const requiredQty = Math.max(0, bufferStock - currentStock);

    const orderNo = await generateOrderNo(connection);

    const [orderResult] = await connection.query(
      `INSERT INTO orders
        (order_no, status, supplier_id, expected_receive_date, ordered_date, created_by)
       VALUES (?, 'PENDING', ?, ?, NOW(), ?)`,
      [orderNo, supplier_id || null, expected_receive_date, createdBy]
    );

    const orderId = orderResult.insertId;

    await connection.query(
      `INSERT INTO order_items
        (order_id, item_id, quantity, unit, current_stock_at_order, buffer_stock_at_order, required_quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [orderId, item_id, orderQty, item.unit, currentStock, bufferStock, requiredQty]
    );

    await connection.commit();

    res.status(201).json({
      message: 'Order placed successfully.',
      id: orderId,
      order_no: orderNo,
      status: 'PENDING'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  } finally {
    connection.release();
  }
};

// Shared SELECT for order list/detail views.
const ORDER_SELECT = `
  SELECT
    o.id, o.order_no, o.status,
    o.supplier_id, s.name AS supplier_name,
    DATE_FORMAT(o.ordered_date, '%Y-%m-%d %H:%i') AS ordered_date,
    DATE_FORMAT(o.expected_receive_date, '%Y-%m-%d') AS expected_receive_date,
    DATE_FORMAT(o.completed_date, '%Y-%m-%d %H:%i') AS completed_date,
    DATE_FORMAT(o.cancelled_date, '%Y-%m-%d %H:%i') AS cancelled_date,
    o.invoice_id,
    p.invoice_no,
    o.created_by, cu.name AS created_by_name,
    o.completed_by, cbu.name AS completed_by_name,
    o.cancelled_by, xu.name AS cancelled_by_name
  FROM orders o
  LEFT JOIN supplier s ON o.supplier_id = s.id
  LEFT JOIN purchases p ON o.invoice_id = p.id
  LEFT JOIN users cu ON o.created_by = cu.id
  LEFT JOIN users cbu ON o.completed_by = cbu.id
  LEFT JOIN users xu ON o.cancelled_by = xu.id
`;

const attachItems = async (orders) => {
  if (orders.length === 0) return orders;
  const ids = orders.map(o => o.id);
  const [items] = await pool.query(
    `SELECT oi.order_id, oi.item_id, i.name AS item_name, oi.quantity, oi.unit,
            oi.current_stock_at_order, oi.buffer_stock_at_order, oi.required_quantity
     FROM order_items oi
     JOIN items i ON oi.item_id = i.id
     WHERE oi.order_id IN (?)`,
    [ids]
  );
  const byOrder = {};
  for (const it of items) {
    if (!byOrder[it.order_id]) byOrder[it.order_id] = [];
    byOrder[it.order_id].push(it);
  }
  return orders.map(o => ({ ...o, items: byOrder[o.id] || [] }));
};

// ─────────────────────────────────────────────────────────────────────────
// GET /api/orders/pending
// ─────────────────────────────────────────────────────────────────────────
const getPendingOrders = async (req, res) => {
  try {
    const [rows] = await pool.query(`${ORDER_SELECT} WHERE o.status = 'PENDING' ORDER BY o.id DESC`);
    res.json(await attachItems(rows));
  } catch (error) {
    console.error('Error fetching pending orders:', error);
    res.status(500).json({ error: 'Server error while loading pending orders.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// GET /api/orders/completed?startDate=&endDate=   (server-side date filter,
// required - the tab shows nothing until both dates are supplied)
// ─────────────────────────────────────────────────────────────────────────
const getCompletedOrders = async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required.' });
  }

  try {
    const [rows] = await pool.query(
      `${ORDER_SELECT}
       WHERE o.status = 'COMPLETED'
         AND DATE(o.completed_date) BETWEEN ? AND ?
       ORDER BY o.completed_date DESC`,
      [startDate, endDate]
    );
    res.json(await attachItems(rows));
  } catch (error) {
    console.error('Error fetching completed orders:', error);
    res.status(500).json({ error: 'Server error while loading completed orders.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// GET /api/orders/:id
// ─────────────────────────────────────────────────────────────────────────
const getOrderById = async (req, res) => {
  try {
    const [rows] = await pool.query(`${ORDER_SELECT} WHERE o.id = ?`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Order not found.' });
    const [withItems] = [await attachItems(rows)];
    res.json(withItems[0]);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Server error.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// GET /api/orders/:id/for-invoice
// Everything the existing RM Purchasing Invoice page needs to auto-populate
// itself from this Order. Does NOT change anything - read only.
// ─────────────────────────────────────────────────────────────────────────
const getOrderForInvoice = async (req, res) => {
  try {
    const [rows] = await pool.query(`${ORDER_SELECT} WHERE o.id = ?`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Order not found.' });

    const order = rows[0];

    if (order.status === 'CANCELLED') {
      return res.status(400).json({ error: 'This order has been cancelled and cannot be invoiced.' });
    }

    if (order.invoice_id) {
      // Prevent duplicate invoices (spec section 30).
      return res.status(409).json({
        error: 'This order has already been processed into a Purchase Invoice.',
        invoice_id: order.invoice_id
      });
    }

    const [items] = await pool.query(
      `SELECT oi.item_id, i.name AS item_name, i.unit, oi.quantity,
              (SELECT pi.unit_price FROM purchase_items pi
                 JOIN purchases p ON pi.purchase_id = p.id
                WHERE pi.item_id = oi.item_id
                ORDER BY p.purchase_date DESC, pi.id DESC LIMIT 1) AS unit_price
       FROM order_items oi
      JOIN items i ON oi.item_id = i.id
       WHERE oi.order_id = ?`,
      [order.id]
    );

    res.json({
      order_id: order.id,
      order_no: order.order_no,
      status: order.status,
      supplier_id: order.supplier_id,
      supplier_name: order.supplier_name,
      purchase_date: order.expected_receive_date, // editable by the user afterwards
      items: items.map(it => ({
        item_id: it.item_id,
        item_name: it.item_name,
        unit: it.unit,
        quantity: parseFloat(it.quantity),
        unit_price: parseFloat(it.unit_price) || 0
      }))
    });
  } catch (error) {
    console.error('Error preparing order for invoice:', error);
    res.status(500).json({ error: 'Server error.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// PATCH /api/orders/:id/cancel
// ─────────────────────────────────────────────────────────────────────────
const cancelOrder = async (req, res) => {
  const { id } = req.params;
  const cancelledBy = resolveUserId(req);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [id]);
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Order not found.' });
    }

    if (rows[0].status !== 'PENDING') {
      await connection.rollback();
      return res.status(400).json({ error: `Only Pending orders can be cancelled. Current status: ${rows[0].status}` });
    }

    await connection.query(
      "UPDATE orders SET status = 'CANCELLED', cancelled_date = NOW(), cancelled_by = ? WHERE id = ?",
      [cancelledBy, id]
    );

    await connection.commit();
    res.json({ message: 'Order cancelled successfully.' });
  } catch (error) {
    await connection.rollback();
    console.error('Error cancelling order:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  } finally {
    connection.release();
  }
};

module.exports = {
  getLowStock,
  createOrder,
  getPendingOrders,
  getCompletedOrders,
  getOrderById,
  getOrderForInvoice,
  cancelOrder
};
