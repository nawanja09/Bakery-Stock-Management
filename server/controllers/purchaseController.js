// controllers/purchaseController.js
const pool = require('../config/db');
const { actorId } = require('../utils/actor');
const { archiveLines } = require('../services/lineHistory');
const { normalizePaymentMethodValue } = require('../utils/paymentMethodUtils');
const { recordCashTransaction, recordBankTransaction, refreshBalancesOfReference } = require('../utils/financeLedger');
const { checkDuplicateReference, DuplicateReferenceError } = require('../services/referenceValidationService');
const { isRmAdjustmentRequest, recordRmAdjustment, sameItems, sameValue } = require('../utils/rmAdjustmentAudit');
const { SETTLEMENT_PAYMENT_METHODS, isSettlementPaymentMethod } = require('../services/settlementPaymentMethods');

// Advance / purchase-return settlements moved no money from Cash or Bank, so
// Purchasing Payment adjustments (which re-post the ledger) must not touch them.
const SETTLEMENT_NOT_ADJUSTABLE =
  'This row is an Advance Payment / Purchase Return settlement, not money paid from Cash or Bank, '
  + 'so it cannot be changed in Purchasing Payment adjustments.';

const calculatePaymentState = (paidAmount, totalAmount) => {
  const parsedPaidAmount = parseFloat(paidAmount) || 0;
  const parsedTotalAmount = parseFloat(totalAmount) || 0;
  const balanceAmount = parsedTotalAmount - parsedPaidAmount;
  const balanceStatus = balanceAmount > 0 ? 1 : 0;

  let paymentStatus = 'Non-Paid';
  if (parsedTotalAmount > 0 && parsedPaidAmount >= parsedTotalAmount) {
    paymentStatus = 'Paid';
  } else if (parsedPaidAmount > 0 && parsedPaidAmount < parsedTotalAmount) {
    paymentStatus = 'Partially Paid';
  }

  return {
    paid_amount: parsedPaidAmount,
    balance_amount: balanceAmount,
    balance_status: balanceStatus,
    payment_status: paymentStatus
  };
};

const resolveInvoiceTotalAmount = (purchaseRow = {}) => {
  const parsedTotalWithVat = parseFloat(purchaseRow.total_with_vat) || 0;
  const parsedBillAmount = parseFloat(purchaseRow.bill_amount) || 0;
  const parsedSubtotal = parseFloat(purchaseRow.subtotal) || 0;
  const parsedVatAmount = parseFloat(purchaseRow.vat_amount) || 0;

  if (parsedTotalWithVat > 0) return parsedTotalWithVat;
  if (parsedBillAmount > 0) return parsedBillAmount;
  return parsedSubtotal + parsedVatAmount;
};

// The true amount paid toward a specific invoice is the SUM of what was actually
// allocated to it (purchase_payment_allocations.allocated_amount), never the raw
// payment_history.amount, since one payment transaction can be split across several
// invoices. Legacy rows that predate the allocations table (no allocation rows at
// all for that payment) fall back to payment_history.amount, since those were
// always single-invoice, unsplit payments.
const getActualAllocatedPaidAmount = async (queryable, purchaseId, excludePaymentId = null) => {
  const params = [purchaseId, purchaseId, purchaseId];
  let extraCondition = '';
  if (excludePaymentId) {
    extraCondition = ' AND ph.id != ?';
    params.push(excludePaymentId);
  }
  const [rows] = await queryable.query(`
    SELECT COALESCE(SUM(COALESCE(ppa.allocated_amount, ph.amount)), 0) AS actual_paid_amount
    FROM payment_history ph
    LEFT JOIN purchase_payment_allocations ppa
      ON ppa.payment_history_id = ph.id AND ppa.purchase_id = ?
    WHERE
      (ppa.purchase_id = ?
      OR (
        ph.purchase_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM purchase_payment_allocations ppa2 WHERE ppa2.payment_history_id = ph.id
        )
      ))
      ${extraCondition}
  `, params);

  return parseFloat(rows[0]?.actual_paid_amount) || 0;
};

// purchases.paid_amount/balance_amount/payment_status are running totals maintained
// separately from the underlying payment records, so they can drift out of sync
// (e.g. legacy data from before payments were properly capped/allocated, or a direct
// edit). This recomputes the correct state from the actual allocated payments and,
// if it differs from what's stored, heals the purchases row so every page - the
// Purchasing Summary Report list, the Invoice Details page, and payment calculations
// that read "current paid amount" - always works from the same correct, real value.
const reconcilePurchasePaymentState = async (queryable, purchaseId, invoiceTotal, storedPaidAmount, excludePaymentId = null) => {
  const actualAllocatedTotal = await getActualAllocatedPaidAmount(queryable, purchaseId, excludePaymentId);
  const reconciledPaidAmount = Math.max(0, actualAllocatedTotal);
  const reconciledState = calculatePaymentState(reconciledPaidAmount, invoiceTotal);

  const drifted = Math.abs((parseFloat(storedPaidAmount) || 0) - reconciledPaidAmount) > 0.01;
  if (drifted) {
    await queryable.query(
      `UPDATE purchases SET paid_amount = ?, balance_amount = ?, balance_status = ?, payment_status = ? WHERE id = ?`,
      [reconciledState.paid_amount, reconciledState.balance_amount, reconciledState.balance_status, reconciledState.payment_status, purchaseId]
    );
  }

  return { ...reconciledState, healed: drifted };
};

const normalizePaymentMethodForHistory = (paymentMethod) => {
  switch (paymentMethod) {
    case 'BANK_TRANSFER':
      return 'BANK_TRANSFER';
    case 'CREDIT':
      return 'CREDIT_CARD';
    case 'CHEQUE':
      // Preserve CHEQUE distinctly - the schema already supports this
      // value and the Expenses Cheque Registry depends on being able to
      // tell a real cheque payment apart from a Credit-method payment.
      return 'CHEQUE';
    case 'CREDIT_CARD':
      return 'CREDIT_CARD';
    case 'CASH':
    default:
      return 'CASH';
  }
};

// Create new purchase with payment status handling
const createPurchase = async (req, res) => {
  const { 
    purchase_date, 
    invoice_date,
    invoice_no,
    supplier_id, 
    items, 
    subtotal,
    vat_amount,
    total_with_vat,
    vat_rate,
    paid_amount, 
    balance_amount,
    balance_status,
    payment_method, 
    check_number,
    remarks, 
    company_id,
    order_id
  } = req.body;

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Check duplicate invoice across all transactions
    await checkDuplicateReference(connection, invoice_no);

    // If this invoice is being created from an RM Order (spec: "Order Complete"
    // / "Go to Invoice" flow), validate the order and guard against creating a
    // second invoice for the same order (order_id stays NULL for every normal
    // invoice created without an Order - that flow is completely unaffected).
    let linkedOrder = null;
    if (order_id) {
      const [orderRows] = await connection.query(
        'SELECT * FROM orders WHERE id = ? FOR UPDATE', [order_id]
      );
      if (orderRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Referenced order was not found.' });
      }
      linkedOrder = orderRows[0];

      if (linkedOrder.status === 'CANCELLED') {
        await connection.rollback();
        return res.status(400).json({ error: 'This order has been cancelled and cannot be invoiced.' });
      }
      if (linkedOrder.status === 'COMPLETED' || linkedOrder.invoice_id) {
        await connection.rollback();
        return res.status(409).json({ error: 'This order has already been processed into a Purchase Invoice.' });
      }
    }

    const effectiveInvoiceTotal = parseFloat(total_with_vat) || (parseFloat(subtotal || 0) + parseFloat(vat_amount || 0));
    // The amount entered by the user can exceed this invoice's total (an overpayment).
    // The invoice's own paid_amount must never exceed its own total - any excess is
    // independent supplier credit, not part of this invoice's Paid Amount.
    const requestedPaidAmount = parseFloat(paid_amount) || 0;
    const appliedPaidAmount = requestedPaidAmount;
    const excessPaidAmount = 0;
    const paymentState = calculatePaymentState(appliedPaidAmount, effectiveInvoiceTotal);
    const normalizedPaidAmount = paymentState.paid_amount;
    const normalizedBalanceAmount = paymentState.balance_amount;
    const normalizedBalanceStatus = paymentState.balance_status;
    const normalizedPaymentStatus = paymentState.payment_status;
    const resolvedPreparedBy = actorId(req); // the signed-in user, never the client's prepared_by

    if (!resolvedPreparedBy) {
      await connection.rollback();
      return res.status(400).json({ error: 'No valid user found for purchase audit' });
    }

    // Insert purchase
    const [purchaseResult] = await connection.query(
      `INSERT INTO purchases 
      (invoice_no, purchase_date, invoice_date, supplier_id, bill_amount, subtotal, vat_amount, 
       total_with_vat, vat_rate, paid_amount, balance_amount, balance_status, 
       payment_method, check_number, remarks, prepared_by, company_id, order_id, payment_status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoice_no, purchase_date, invoice_date || null, supplier_id, total_with_vat, subtotal, vat_amount, 
       total_with_vat, vat_rate, normalizedPaidAmount, normalizedBalanceAmount, normalizedBalanceStatus, 
       payment_method, check_number, remarks, resolvedPreparedBy, company_id, order_id || null, normalizedPaymentStatus]
    );
    
    const purchaseId = purchaseResult.insertId;

    // If payment was made, record in payment history (amount is always clamped to
    // this invoice's own total - it is never mixed with the excess/credit amount)
    if (normalizedPaidAmount > 0) {
      const [initialPaymentResult] = await connection.query(
        `INSERT INTO payment_history 
        (purchase_id, payment_date, amount, payment_method, check_number, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [purchaseId, purchase_date, normalizedPaidAmount, payment_method, check_number, 'Initial payment', resolvedPreparedBy]
      );

      // Record the explicit allocation so the Payment History tab's Paid Amount
      // column always reads the allocated amount directly, rather than relying on
      // a fallback that could show the raw (possibly larger) entered amount.
      await connection.query(
        `INSERT INTO purchase_payment_allocations (payment_history_id, purchase_id, allocated_amount)
         VALUES (?, ?, ?)`,
        [initialPaymentResult.insertId, purchaseId, normalizedPaidAmount]
      );
    }

    // Advance Payments are now handled via a dedicated flow.

    // Insert purchase items
    for (const item of items) {
      await connection.query(
        `INSERT INTO purchase_items 
        (purchase_id, item_name, quantity, unit_price, item_id) 
        VALUES (?, ?, ?, ?, ?)`,
        [purchaseId, item.item_name, item.quantity, item.unit_price, item.item_id]
      );
    }

    // Only now that the invoice + its items are actually saved does the
    // originating Order become COMPLETED (spec section 28/54) - within the
    // same transaction, so a failure anywhere above leaves the Order exactly
    // as it was (PENDING), never partially completed.
    if (linkedOrder) {
      await connection.query(
        `UPDATE orders
         SET status = 'COMPLETED', completed_date = NOW(), completed_by = ?, invoice_id = ?
         WHERE id = ?`,
        [resolvedPreparedBy, purchaseId, linkedOrder.id]
      );
    }

    await connection.commit();
    
    res.status(201).json({ 
      message: 'Purchase created successfully!', 
      invoice_no,
      purchase_id: purchaseId,
      payment_status: normalizedPaymentStatus,
      paid_amount: normalizedPaidAmount,
      balance_amount: normalizedBalanceAmount,
      order_id: linkedOrder ? linkedOrder.id : null
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Error creating purchase:', error);
    
    if (error.code === 'ER_DUP_ENTRY' || error.name === 'DuplicateReferenceError') {
      return res.status(400).json({ 
        error: 'Invoice number already exists. Please use a unique invoice number.'
      });
    }
    
    res.status(500).json({ error: 'Server error: ' + error.message });
  } finally {
    connection.release();
  }
};

// Get all purchases
// Supports optional filters (all backward compatible - omit any/all to get original behavior):
//   supplier_id       - filter to a single supplier
//   invoice_no        - partial match on invoice number
//   startDate/endDate - inclusive date range (YYYY-MM-DD) on purchase_date
//   payment_status    - exact match on payment_status enum ('Paid' | 'Partially Paid' | 'Non-Paid')
const getAllPurchases = async (req, res) => {
  try {
    const { supplier_id, invoice_no, startDate, endDate, payment_status } = req.query;

    let query = `
      SELECT 
        p.id,
        p.invoice_no,
        p.purchase_date,
        p.invoice_date,
        p.subtotal,
        p.vat_amount,
        p.total_with_vat,
        p.paid_amount,
        p.balance_amount,
        p.payment_status,
        p.payment_method,
        p.check_number,
        p.supplier_id,
        s.name AS supplier_name,
        s.vat_number AS supplier_vat_number,
        c.name AS company_name,
        DATEDIFF(CURDATE(), p.purchase_date) AS days_ago
      FROM purchases p
      JOIN supplier s ON p.supplier_id = s.id
      JOIN company c ON p.company_id = c.id
      WHERE (p.deleted = FALSE OR p.deleted IS NULL)
    `;
    const params = [];

    if (supplier_id) {
      query += ` AND p.supplier_id = ?`;
      params.push(supplier_id);
    }

    if (invoice_no) {
      query += ` AND p.invoice_no LIKE ?`;
      params.push(`%${invoice_no}%`);
    }

    if (startDate && endDate) {
      query += ` AND DATE(p.purchase_date) BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    }

    if (payment_status && payment_status !== 'all') {
      query += ` AND p.payment_status = ?`;
      params.push(payment_status);
    }

    query += ` ORDER BY p.purchase_date DESC, p.id DESC`;

    const [purchases] = await pool.query(query, params);

    for (let purchase of purchases) {
      purchase.invoice_no = purchase.invoice_no ? String(purchase.invoice_no) : 'N/A';

      purchase.subtotal = parseFloat(purchase.subtotal) || 0;
      purchase.vat_amount = parseFloat(purchase.vat_amount) || 0;
      purchase.total_with_vat = parseFloat(purchase.total_with_vat) || 0;

      // Paid Amount must always reflect what was actually allocated to this invoice
      // from real payment records - never a stale/drifted stored total - so reconcile
      // it here the same way the Invoice Details page does.
      const reconciled = await reconcilePurchasePaymentState(
        pool,
        purchase.id,
        purchase.total_with_vat,
        purchase.paid_amount
      );
      purchase.paid_amount = reconciled.paid_amount;
      purchase.balance_amount = reconciled.balance_amount;
      purchase.payment_status = reconciled.payment_status;

      const [payments] = await pool.query(
        `SELECT COUNT(*) as payment_count
         FROM payment_history ph
         LEFT JOIN purchase_payment_allocations ppa
           ON ppa.payment_history_id = ph.id AND ppa.purchase_id = ?
         WHERE
           ppa.purchase_id = ?
           OR (
             ph.purchase_id = ?
             AND NOT EXISTS (
               SELECT 1 FROM purchase_payment_allocations ppa2 WHERE ppa2.payment_history_id = ph.id
             )
           )`,
        [purchase.id, purchase.id, purchase.id]
      );
      purchase.payment_count = payments[0]?.payment_count || 0;
      purchase.total_payments = purchase.paid_amount;

      const [returns] = await pool.query(
        `SELECT COALESCE(SUM(pri.total_amount), 0) as total_returns
         FROM purchase_returns pr
         JOIN purchase_return_items pri ON pr.id = pri.return_id
         WHERE pr.purchase_id = ?`,
        [purchase.id]
      );
      purchase.total_returns = returns[0]?.total_returns || 0;
    }

    res.json(purchases);
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

// Get purchase by ID
const getPurchaseById = async (req, res) => {
  const { id } = req.params;
  
  try {
    const [purchase] = await pool.query(`
      SELECT 
        p.*,
        s.name AS supplier_name,
        s.vat_number AS supplier_vat_number,
        s.vat_registered AS supplier_vat_registered,
        s.contact_name,
        s.contact_phone,
        s.contact_email,
        s.address AS supplier_address,
        s.city AS supplier_city,
        c.name AS company_name,
        u.name AS prepared_by_name
      FROM purchases p
      LEFT JOIN supplier s ON p.supplier_id = s.id
      LEFT JOIN company c ON p.company_id = c.id
      LEFT JOIN users u ON p.prepared_by = u.id
      WHERE p.id = ?
    `, [id]);
    
    if (purchase.length === 0) {
      return res.status(404).json({ error: 'Purchase not found' });
    }
    
    const [items] = await pool.query(`
      SELECT 
        pi.*,
        i.item_code,
        i.unit,
        i.vat_applicable,
        i.auto_add_to_stock,
        i.name as item_master_name
      FROM purchase_items pi
      LEFT JOIN items i ON pi.item_id = i.id
      WHERE pi.purchase_id = ?
    `, [id]);
    
    // A single payment transaction can be split across multiple invoices
    // (see purchase_payment_allocations), so the amount that belongs to THIS
    // invoice must come from the allocation row for this purchase_id, not from
    // payment_history.amount (which is the full transaction amount). Rows that
    // predate the allocations table, or single-invoice direct payments/credit
    // settlements that never got an allocation row, fall back to payment_history.amount.
    const [payments] = await pool.query(`
      SELECT 
        ph.*,
        u.name AS created_by_name,
        COALESCE(ppa.allocated_amount, ph.amount) AS paid_amount
      FROM payment_history ph
      JOIN users u ON ph.created_by = u.id
      LEFT JOIN purchase_payment_allocations ppa
        ON ppa.payment_history_id = ph.id AND ppa.purchase_id = ?
      WHERE
        ppa.purchase_id = ?
        OR (
          ph.purchase_id = ?
          AND NOT EXISTS (
            SELECT 1 FROM purchase_payment_allocations ppa2 WHERE ppa2.payment_history_id = ph.id
          )
        )
      ORDER BY ph.payment_date DESC, ph.created_at DESC
    `, [id, id, id]);

    const [returns] = await pool.query(`
      SELECT 
        pr.id,
        pr.return_number,
        pr.return_date,
        pr.subtotal,
        pr.vat_amount,
        pr.total_amount AS return_total,
        pr.settled_amount,
        pr.balance_amount
      FROM purchase_returns pr
      WHERE pr.purchase_id = ?
      ORDER BY pr.return_date DESC
    `, [id]);

    // Self-heal: purchases.paid_amount is a running total maintained separately from
    // the payment_history/purchase_payment_allocations records. If it has drifted out
    // of sync with what the actual payment records show it should be - e.g. legacy data
    // from before payments were properly capped/allocated, or a direct DB edit - correct
    // it here so this page (and every other page that reads purchases.paid_amount, like
    // the Purchasing Summary Report) always reflects real, allocation-backed payments.
    const invoiceTotal = parseFloat(purchase[0].total_with_vat) || 0;
    const reconciled = await reconcilePurchasePaymentState(pool, id, invoiceTotal, purchase[0].paid_amount);
    purchase[0].paid_amount = reconciled.paid_amount;
    purchase[0].balance_amount = reconciled.balance_amount;
    purchase[0].balance_status = reconciled.balance_status;
    purchase[0].payment_status = reconciled.payment_status;
    
    const purchaseData = {
      ...purchase[0],
      items: items || [],
      payments: payments || [],
      returns: returns || [],
      summary: {
        total_paid: payments.reduce((sum, p) => sum + parseFloat(p.paid_amount ?? p.amount), 0),
        total_returns: returns.reduce((sum, r) => sum + parseFloat(r.return_total), 0),
        net_paid: parseFloat(purchase[0].paid_amount),
        net_balance: parseFloat(purchase[0].balance_amount)
      }
    };
    
    res.json(purchaseData);
    
  } catch (error) {
    console.error('Error fetching purchase:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

// Update purchase
const updatePurchase = async (req, res) => {
  const { id } = req.params;
  const { 
    purchase_date, 
    invoice_date,
    invoice_no,
    supplier_id, 
    items, 
    subtotal,
    vat_amount,
    total_with_vat,
    vat_rate,
    paid_amount, 
    balance_amount,
    balance_status,
    payment_method, 
    check_number,
    remarks, 
    company_id
  } = req.body;

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const trackRmAdjustment = isRmAdjustmentRequest(req);
    let originalPurchase = null;
    let originalItems = [];
    if (trackRmAdjustment) {
      const [purchaseRows] = await connection.query('SELECT * FROM purchases WHERE id = ? FOR UPDATE', [id]);
      originalPurchase = purchaseRows[0] || null;
      const [itemRows] = await connection.query(
        'SELECT item_id, item_name, quantity, unit_price FROM purchase_items WHERE purchase_id = ?', [id]
      );
      originalItems = itemRows;
    }

    await checkDuplicateReference(connection, invoice_no, { table: 'purchases', id });

    const resolvedPreparedBy = actorId(req); // the signed-in user, never the client's prepared_by

    if (!resolvedPreparedBy) {
      await connection.rollback();
      return res.status(400).json({ error: 'No valid user found for purchase audit' });
    }

    const effectiveInvoiceTotal = parseFloat(total_with_vat) || (parseFloat(subtotal || 0) + parseFloat(vat_amount || 0));
    // Editing an invoice must never let its paid_amount exceed its own total -
    // any overpayment has to go through the payment/credit flow instead, which
    // records the excess separately as supplier credit.
    const clampedPaidAmount = Math.max(0, Math.min(parseFloat(paid_amount) || 0, effectiveInvoiceTotal));
    const paymentState = calculatePaymentState(clampedPaidAmount, effectiveInvoiceTotal);
    const normalizedPaidAmount = paymentState.paid_amount;
    const normalizedBalanceAmount = paymentState.balance_amount;
    const normalizedBalanceStatus = paymentState.balance_status;
    const normalizedPaymentStatus = paymentState.payment_status;

    await connection.query(
      `UPDATE purchases 
       SET invoice_no = ?, purchase_date = ?, invoice_date = ?, supplier_id = ?, bill_amount = ?, subtotal = ?, 
           vat_amount = ?, total_with_vat = ?, vat_rate = ?, paid_amount = ?, 
           balance_amount = ?, balance_status = ?, payment_method = ?, check_number = ?, 
           remarks = ?, prepared_by = ?, company_id = ?, payment_status = ?
       WHERE id = ?`,
      [invoice_no, purchase_date, invoice_date || null, supplier_id, total_with_vat, subtotal, vat_amount, 
       total_with_vat, vat_rate, normalizedPaidAmount, normalizedBalanceAmount, normalizedBalanceStatus, 
       payment_method, check_number, remarks, resolvedPreparedBy, company_id, normalizedPaymentStatus, id]
    );

    // Replace the lines: the old ones are kept in record_line_history first
    await archiveLines(connection, 'purchase_items', id, { userId: resolvedPreparedBy });
    await connection.query(`DELETE FROM purchase_items WHERE purchase_id = ?`, [id]);

    for (const item of items) {
      await connection.query(
        `INSERT INTO purchase_items 
        (purchase_id, item_name, quantity, unit_price, item_id) 
        VALUES (?, ?, ?, ?, ?)`,
        [id, item.item_name, item.quantity, item.unit_price, item.item_id]
      );
    }

    const purchaseChanged = trackRmAdjustment && originalPurchase && (
      !sameValue(originalPurchase.invoice_no, invoice_no) ||
      !sameValue(originalPurchase.purchase_date, purchase_date) ||
      !sameValue(originalPurchase.supplier_id, supplier_id) ||
      !sameValue(originalPurchase.subtotal, subtotal) ||
      !sameValue(originalPurchase.vat_amount, vat_amount) ||
      !sameValue(originalPurchase.total_with_vat, total_with_vat) ||
      !sameValue(originalPurchase.vat_rate, vat_rate) ||
      !sameValue(originalPurchase.paid_amount, normalizedPaidAmount) ||
      !sameValue(originalPurchase.payment_method, payment_method) ||
      !sameValue(originalPurchase.check_number, check_number) ||
      !sameValue(originalPurchase.remarks, remarks) ||
      !sameValue(originalPurchase.company_id, company_id) ||
      !sameItems(originalItems, items, ['item_id', 'item_name', 'quantity', 'unit_price'])
    );
    if (purchaseChanged) {
      await recordRmAdjustment(connection, {
        category: 'Invoice', sourceRecordId: id, referenceId: invoice_no, updatedBy: resolvedPreparedBy
      });
    }

    await connection.commit();
    res.json({ 
      message: 'Purchase updated successfully!',
      invoice_no,
      payment_status: normalizedPaymentStatus
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Error updating purchase:', error);
    
    if (error.code === 'ER_DUP_ENTRY' || error.name === 'DuplicateReferenceError') {
      return res.status(400).json({ 
        error: error.name === 'DuplicateReferenceError' ? error.message : 'Invoice number already exists. Please use a unique invoice number.' 
      });
    }
    
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

// Get all companies
const getAllCompanies = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name FROM company');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get all suppliers
const getAllSuppliers = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, vat_registered, vat_number FROM supplier');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get previous purchase prices
const getPreviousPurchasePrices = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        i.id AS item_id,
        (
          SELECT pi.unit_price 
          FROM purchase_items pi
          JOIN purchases p ON pi.purchase_id = p.id
          WHERE pi.item_id = i.id
          ORDER BY p.purchase_date DESC, pi.id DESC 
          LIMIT 1
        ) AS previous_unit_price
      FROM items i
    `);

    const priceMap = {};
    rows.forEach(row => {
      priceMap[row.item_id] = row.previous_unit_price ? parseFloat(row.previous_unit_price) : 0;
    });

    res.json(priceMap);
  } catch (error) {
    console.error('Error fetching previous purchase prices:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET NON-PAID PURCHASES (Balance > 0 only)
const getNonPaidPurchases = async (req, res) => {
  try {
    const [purchases] = await pool.query(`
      SELECT 
        p.id,
        p.invoice_no,
        p.purchase_date,
        p.subtotal,
        p.vat_amount,
        p.total_with_vat,
        p.paid_amount,
        p.balance_amount,
        p.payment_status,
        p.payment_method,
        p.check_number,
        s.name AS supplier_name,
        s.vat_number AS supplier_vat_number,
        c.name AS company_name,
        DATEDIFF(CURDATE(), p.purchase_date) AS days_overdue,
        COALESCE(pr.total_returns, 0) AS total_returns
      FROM purchases p
      JOIN supplier s ON p.supplier_id = s.id
      JOIN company c ON p.company_id = c.id
      LEFT JOIN (
        SELECT purchase_id, COALESCE(SUM(pri.total_amount), 0) as total_returns
        FROM purchase_returns pr
        JOIN purchase_return_items pri ON pr.id = pri.return_id
        GROUP BY purchase_id
      ) pr ON p.id = pr.purchase_id
      WHERE p.balance_amount > 0.001
        AND p.payment_status != 'Paid'
        AND p.deleted = FALSE
      ORDER BY 
        CASE 
          WHEN p.payment_status = 'Non-Paid' THEN 1 
          WHEN p.payment_status = 'Partially Paid' THEN 2 
        END,
        p.purchase_date ASC
    `);

    for (let purchase of purchases) {
      const [payments] = await pool.query(
        `SELECT COUNT(*) as payment_count, COALESCE(SUM(amount), 0) as total_paid
         FROM payment_history 
         WHERE purchase_id = ?`,
        [purchase.id]
      );
      
      purchase.payment_count = payments[0]?.payment_count || 0;
      purchase.total_paid_history = payments[0]?.total_paid || 0;
    }

    res.json(purchases);
  } catch (error) {
    console.error('Error fetching non-paid purchases:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

// GET PENDING INVOICES FOR A SUPPLIER
const getPendingInvoicesBySupplier = async (req, res) => {
  const { supplierId } = req.params;
  try {
    const [invoices] = await pool.query(`
      SELECT
        p.id,
        p.invoice_no,
        p.purchase_date,
        p.total_with_vat,
        p.paid_amount,
        p.balance_amount,
        p.payment_status,
        p.payment_method,
        p.check_number,
        p.company_id,
        c.name AS company_name,
        DATEDIFF(CURDATE(), p.purchase_date) AS days_overdue
      FROM purchases p
      LEFT JOIN company c ON p.company_id = c.id
      WHERE p.supplier_id = ?
        AND p.balance_amount > 0.001
        AND p.payment_status != 'Paid'
        AND (p.deleted = FALSE OR p.deleted IS NULL)
      ORDER BY p.purchase_date ASC
    `, [supplierId]);

    res.json(invoices.map(inv => ({
      ...inv,
      total_with_vat:  parseFloat(inv.total_with_vat)  || 0,
      paid_amount:     parseFloat(inv.paid_amount)      || 0,
      balance_amount:  parseFloat(inv.balance_amount)   || 0
    })));
  } catch (error) {
    console.error('Error fetching pending invoices:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

// MAKE PAYMENT (supports multi-invoice allocation)
// Money in 1/10000 units: purchases and allocations are DECIMAL(…,4), so amounts
// compare exactly instead of drifting as JS floats.
const toUnits = (value) => Math.round((parseFloat(value) || 0) * 10000);
const fromUnits = (units) => units / 10000;
// A sub-cent difference between a 2-decimal amount typed by the user and a
// 4-decimal balance (1234.57 against 1234.5678) is rounding, not an overpayment.
const UNIT_TOLERANCE = 50; // Rs. 0.005

// Paying more than the selected invoices owe keeps the excess as supplier credit
// (supplier_overpayments). Only for money that leaves now and that
// supplier_overpayments can record: a cheque is posted when it is released, and
// a card payment never reaches the cash or bank book.
const EXCESS_CREDIT_METHODS = ['CASH', 'BANK_TRANSFER'];

class PaymentRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'PaymentRequestError';
    this.status = status;
  }
}

// Idempotency-Key (header) or request_id (body): the same key sent twice -
// a double-click, a retried request - records the payment only once.
const readRequestId = (req) => {
  const raw = req.get('Idempotency-Key') || req.body?.request_id;
  if (raw === undefined || raw === null || raw === '') return null;
  const value = String(raw).trim();
  if (!value || value.length > 64) throw new PaymentRequestError(400, 'Invalid Idempotency-Key');
  return value;
};

const duplicatePaymentResponse = (paymentId) => ({
  message: 'This payment was already recorded.',
  payment_id: paymentId,
  duplicate: true
});

const makePayment = async (req, res) => {
  const { id } = req.params;
  const {
    payment_date,
    amount,
    payment_method,
    check_number,
    voucher_number,
    notes,
    invoice_allocations,
    supplier_id,
    bank_id
  } = req.body;

  const normalizedPaymentMethod = normalizePaymentMethodValue(payment_method);
  const validMethods = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT'];

  let requestId;
  try {
    requestId = readRequestId(req);
  } catch (error) {
    return res.status(error.status).json({ error: error.message });
  }

  // One entry per invoice, amounts in 1/10000 units.
  const allocations = (Array.isArray(invoice_allocations) && invoice_allocations.length > 0
    ? invoice_allocations.map((allocation) => ({
      purchase_id: Number(allocation?.purchase_id || allocation?.id),
      units: toUnits(allocation?.amount)
    }))
    : id ? [{ purchase_id: Number(id), units: toUnits(amount) }] : []
  ).filter((allocation) => allocation.units > 0);

  if (!payment_date) {
    return res.status(400).json({ error: 'Payment date is required' });
  }
  if (!normalizedPaymentMethod || !validMethods.includes(normalizedPaymentMethod)) {
    return res.status(400).json({ error: 'Payment method is invalid' });
  }
  if (allocations.length === 0) {
    return res.status(400).json({ error: 'At least one invoice allocation is required' });
  }
  if (allocations.some((allocation) => !Number.isInteger(allocation.purchase_id) || allocation.purchase_id <= 0)) {
    return res.status(400).json({ error: 'Invalid invoice in the payment' });
  }
  if (new Set(allocations.map((allocation) => allocation.purchase_id)).size !== allocations.length) {
    return res.status(400).json({ error: 'The same invoice is selected twice in this payment' });
  }
  if (normalizedPaymentMethod === 'BANK_TRANSFER' && !bank_id) {
    return res.status(400).json({ error: 'Bank account is required for bank payments' });
  }
  if (normalizedPaymentMethod === 'CHEQUE' && (!check_number || !String(check_number).trim())) {
    return res.status(400).json({ error: 'Cheque number is required for cheque payments' });
  }

  // The payment amount covers the allocations; anything above them is excess.
  const allocatedUnits = allocations.reduce((sum, allocation) => sum + allocation.units, 0);
  const paymentUnits = parseFloat(amount) > 0 ? toUnits(amount) : allocatedUnits;
  if (paymentUnits + 1 < allocatedUnits) {
    return res.status(400).json({ error: 'The payment amount is less than the amount allocated to the invoices' });
  }
  const excessUnits = paymentUnits - allocatedUnits > UNIT_TOLERANCE ? paymentUnits - allocatedUnits : 0;
  if (excessUnits > 0 && !EXCESS_CREDIT_METHODS.includes(normalizedPaymentMethod)) {
    return res.status(400).json({
      error: 'Paying more than the invoices owe is only possible by Cash or Bank transfer. '
        + 'Pay the invoice balance, and record the rest as an Advance Payment.'
    });
  }

  const resolvedCreatedBy = actorId(req); // the signed-in user, never the client's created_by
  if (!resolvedCreatedBy) {
    return res.status(400).json({ error: 'No valid user found for payment audit' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Lock every selected invoice FIRST, in id order, before any other read in
    // this transaction. A second payment of the same invoice (a double-click,
    // another user) waits here until this one commits, and then reads the
    // invoice as already paid. Reading anything earlier would fix the
    // transaction's REPEATABLE READ snapshot before the other payment committed,
    // and both payments would go through.
    const purchaseIds = allocations.map((allocation) => allocation.purchase_id).sort((a, b) => a - b);
    const [lockedRows] = await connection.query(
      'SELECT * FROM purchases WHERE id IN (?) ORDER BY id FOR UPDATE',
      [purchaseIds]
    );

    if (requestId) {
      const [existing] = await connection.query('SELECT id FROM payment_history WHERE request_id = ?', [requestId]);
      if (existing.length > 0) {
        await connection.commit();
        return res.json(duplicatePaymentResponse(existing[0].id));
      }
    }

    if (lockedRows.length !== purchaseIds.length) {
      throw new PaymentRequestError(404, 'One or more selected invoices could not be found');
    }

    // Supplier + Company restriction: every invoice in this payment must
    // belong to the same supplier AND the same company - a supplier can
    // have invoices spread across multiple companies, so these are two
    // separate checks, not one. This must be enforced here, not just in
    // the UI, since a direct API call could otherwise bypass the
    // frontend's selection lock.
    if (new Set(lockedRows.map((r) => r.supplier_id)).size > 1) {
      throw new PaymentRequestError(400,
        'You cannot make one payment for invoices belonging to different suppliers or companies. Please select invoices from the same supplier/company.');
    }
    if (new Set(lockedRows.map((r) => String(r.company_id || ''))).size > 1) {
      throw new PaymentRequestError(400,
        'You can only make a payment for one company at a time. Please deselect the current company invoices before selecting invoices from another company.');
    }

    const purchaseById = new Map(lockedRows.map((row) => [Number(row.id), row]));
    const alreadyPaid = lockedRows.find((r) => r.payment_status === 'Paid' || parseFloat(r.balance_amount) <= 0);
    if (alreadyPaid) {
      throw new PaymentRequestError(409,
        `Invoice ${alreadyPaid.invoice_no} is already fully paid - someone may have just paid it. Refresh the invoices and try again.`);
    }

    if (voucher_number) {
      await checkDuplicateReference(connection, voucher_number);
    }

    // Work out every invoice's new position BEFORE the first write. Never trust
    // the stored paid_amount/balance_amount blindly - reconcile against the real
    // allocated payment records first (a stale stored total could otherwise
    // redirect a legitimate payment).
    const plans = [];
    for (const allocation of allocations) {
      const currentPurchase = purchaseById.get(allocation.purchase_id);
      const invoiceTotal = resolveInvoiceTotalAmount(currentPurchase);
      const reconciled = await reconcilePurchasePaymentState(
        connection, currentPurchase.id, invoiceTotal, currentPurchase.paid_amount
      );
      const outstandingUnits = toUnits(reconciled.balance_amount);
      if (allocation.units > outstandingUnits + UNIT_TOLERANCE) {
        throw new PaymentRequestError(409,
          `Invoice ${currentPurchase.invoice_no} owes Rs. ${fromUnits(Math.max(outstandingUnits, 0)).toFixed(2)}, `
          + `less than the Rs. ${fromUnits(allocation.units).toFixed(2)} allocated to it - someone may have just paid it. `
          + 'Refresh the invoices and try again.');
      }
      const applyUnits = Math.min(allocation.units, outstandingUnits);
      if (applyUnits <= 0) continue;
      plans.push({ purchase: currentPurchase, outstandingUnits, paidUnits: toUnits(reconciled.paid_amount), applyUnits });
    }

    const appliedUnits = plans.reduce((sum, plan) => sum + plan.applyUnits, 0);
    if (appliedUnits <= 0) {
      throw new PaymentRequestError(400, 'Payment amount must be greater than 0');
    }
    const appliedAmount = fromUnits(appliedUnits);
    const excessAmount = fromUnits(excessUnits);

    const supplierIdForCredit = plans[0].purchase.supplier_id || null;
    const companyIdForLedger = plans.find((plan) => plan.purchase.company_id)?.purchase.company_id || null;
    const paymentHistoryPurchaseId = allocations[0].purchase_id;
    const normalizedPaymentMethodForHistory = normalizePaymentMethodForHistory(normalizedPaymentMethod);

    // payment_history.amount = what reached the invoices. Any excess is its own
    // supplier-credit record below, so the Supplier Ledger never counts it twice.
    let paymentResult;
    try {
      [paymentResult] = await connection.query(
        `INSERT INTO payment_history
           (purchase_id, payment_date, amount, payment_method, check_number, bank_id, voucher_number, notes, created_by, request_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [paymentHistoryPurchaseId, payment_date, appliedAmount, normalizedPaymentMethodForHistory,
         check_number || null, bank_id || null, voucher_number || null, notes || null, resolvedCreatedBy, requestId]
      );
    } catch (colErr) {
      if (colErr.code !== 'ER_BAD_FIELD_ERROR') throw colErr;
      console.warn('payment_history column not found, using fallback:', colErr.message);
      [paymentResult] = await connection.query(
        `INSERT INTO payment_history
           (purchase_id, payment_date, amount, payment_method, check_number, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [paymentHistoryPurchaseId, payment_date, appliedAmount, normalizedPaymentMethodForHistory,
         check_number || null, notes || null, resolvedCreatedBy]
      );
    }

    const paymentHistoryId = paymentResult.insertId;
    const updatedInvoices = [];
    const invoiceNumbersForLedger = [];

    for (const { purchase, outstandingUnits, paidUnits, applyUnits } of plans) {
      const newBalanceUnits = outstandingUnits - applyUnits;
      const newPaidUnits = paidUnits + applyUnits;
      let newPaymentStatus = 'Non-Paid';
      if (newBalanceUnits <= 10) {
        newPaymentStatus = 'Paid';
      } else if (newPaidUnits > 0) {
        newPaymentStatus = 'Partially Paid';
      }

      await connection.query(
        `UPDATE purchases
           SET paid_amount = ?,
               balance_amount = ?,
               balance_status = ?,
               payment_status = ?
         WHERE id = ?`,
        [fromUnits(newPaidUnits), fromUnits(newBalanceUnits), newBalanceUnits > 0 ? 1 : 0, newPaymentStatus, purchase.id]
      );

      await connection.query(
        `INSERT INTO purchase_payment_allocations (payment_history_id, purchase_id, allocated_amount)
         VALUES (?, ?, ?)`,
        [paymentHistoryId, purchase.id, fromUnits(applyUnits)]
      );

      invoiceNumbersForLedger.push(purchase.invoice_no);
      updatedInvoices.push({
        purchase_id: purchase.id,
        invoice_no: purchase.invoice_no,
        old_balance: fromUnits(outstandingUnits),
        new_balance: fromUnits(newBalanceUnits),
        payment_status: newPaymentStatus,
        applied_amount: fromUnits(applyUnits)
      });
    }

    const [verifyPurchase] = await connection.query(
      `SELECT id, invoice_no, total_with_vat, paid_amount, balance_amount, payment_status
       FROM purchases WHERE id = ?`,
      [paymentHistoryPurchaseId]
    );

    // Post the money that reached the invoices to the Cash/Bank ledger.
    // Money going OUT is a Credit under this ledger's convention.
    let ledgerBalance = null;
    const invoiceNumberForLedger = invoiceNumbersForLedger.filter(Boolean).join(', ') || null;
    const ledgerRemark = `Supplier payment${invoiceNumberForLedger ? ` - Invoice ${invoiceNumberForLedger}` : ''}`;

    let supplierNameForLedger = null;
    const supplierIdForLedger = supplier_id || supplierIdForCredit;
    if (supplierIdForLedger) {
      const [supplierRowsForLedger] = await connection.query(
        'SELECT name FROM supplier WHERE id = ?',
        [supplierIdForLedger]
      );
      supplierNameForLedger = supplierRowsForLedger[0]?.name || null;
    }

    const postLedger = (entry) => {
      if (normalizedPaymentMethod === 'CASH' && companyIdForLedger) {
        return recordCashTransaction(connection, { companyId: companyIdForLedger, ...entry });
      }
      if (normalizedPaymentMethod === 'BANK_TRANSFER' && bank_id) {
        return recordBankTransaction(connection, { bankId: bank_id, ...entry });
      }
      return null;
    };

    ledgerBalance = await postLedger({
      date: payment_date,
      remark: ledgerRemark,
      credit: appliedAmount,
      transactionType: 'RM Purchase Payment',
      referenceNumber: voucher_number || check_number || null,
      invoiceNumber: invoiceNumberForLedger,
      partyName: supplierNameForLedger,
      referenceType: 'PURCHASE_PAYMENT',
      referenceId: paymentHistoryId,
      createdBy: resolvedCreatedBy
    });

    // Excess above what the invoices owe: kept as supplier credit (the payment
    // screen says so), recorded and posted exactly like an Advance Payment so
    // it can be settled against the supplier's next invoices.
    let supplierCredit = null;
    if (excessUnits > 0) {
      if (!supplierIdForCredit) {
        throw new PaymentRequestError(400, 'Supplier credit needs a supplier on the invoice');
      }
      const overpaymentNumber = `ADV-${String(payment_date).replace(/-/g, '')}-P${paymentHistoryId}`;
      const [overpayResult] = await connection.query(
        `INSERT INTO supplier_overpayments
           (overpayment_number, supplier_id, company_id, payment_date, payment_method,
            voucher_number, reference_number, original_amount, remaining_credit, status, notes, created_by)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, 'Active', ?, ?)`,
        [
          overpaymentNumber, supplierIdForCredit, companyIdForLedger, payment_date, normalizedPaymentMethod,
          excessAmount, excessAmount,
          `Excess of supplier payment #${paymentHistoryId}${invoiceNumberForLedger ? ` (Invoice ${invoiceNumberForLedger})` : ''}`,
          resolvedCreatedBy
        ]
      );
      ledgerBalance = await postLedger({
        date: payment_date,
        remark: `Advance payment to supplier "${supplierNameForLedger || 'Supplier'}" (${overpaymentNumber}) - excess of payment #${paymentHistoryId}`,
        credit: excessAmount,
        transactionType: 'Supplier Advance Payment',
        referenceNumber: voucher_number || null,
        partyName: supplierNameForLedger,
        referenceType: 'SUPPLIER_ADVANCE',
        referenceId: overpayResult.insertId,
        createdBy: resolvedCreatedBy
      }) ?? ledgerBalance;
      supplierCredit = { id: overpayResult.insertId, overpayment_number: overpaymentNumber, amount: excessAmount };
    }

    await connection.commit();

    // ── Auto-register in Expenses Cheque Registry (Purchasing Payment + Cheque) ──
    if (normalizedPaymentMethod === 'CHEQUE' && check_number && String(check_number).trim()) {
      try {
        let bankName = null;
        if (bank_id) {
          const [bankRows] = await pool.query(
            'SELECT bank_name, account_number FROM bank_details WHERE id = ? LIMIT 1',
            [bank_id]
          );
          if (bankRows.length) {
            bankName = `${bankRows[0].bank_name}${bankRows[0].account_number ? ` (${bankRows[0].account_number})` : ''}`;
          }
        }
        await pool.query(
          `INSERT INTO expenses_cheque_registry
             (source_type, type, source_id, date, name, cheque_number, amount, bank, bank_id, status)
           VALUES ('PURCHASING_PAYMENT', 'Expense', ?, ?, ?, ?, ?, ?, ?, 'Pending')
           ON DUPLICATE KEY UPDATE
             date          = VALUES(date),
             name          = VALUES(name),
             cheque_number = VALUES(cheque_number),
             amount        = VALUES(amount),
             bank          = VALUES(bank),
             bank_id       = VALUES(bank_id),
             status        = 'Pending',
             type          = 'Expense'`,
          [
            paymentHistoryId,
            payment_date,
            supplierNameForLedger || 'Supplier',
            String(check_number).trim(),
            appliedAmount,
            bankName,
            bank_id || null
          ]
        );
      } catch (registryErr) {
        console.error('Expenses cheque registry upsert error (RM Purchasing):', registryErr.message);
      }
    }

    res.json({
      message: supplierCredit
        ? `Payment recorded successfully! Rs. ${excessAmount.toFixed(2)} above the invoice balance was kept as supplier credit (${supplierCredit.overpayment_number}).`
        : 'Payment recorded successfully!',
      payment_id: paymentHistoryId,
      amount: fromUnits(paymentUnits),
      applied_amount: appliedAmount,
      supplier_credit_amount: supplierCredit ? excessAmount : 0,
      supplier_credit: supplierCredit,
      invoice_count: plans.length,
      updated_invoices: updatedInvoices,
      verification: verifyPurchase[0],
      ledger_balance: ledgerBalance
    });

  } catch (error) {
    await connection.rollback();

    if (error instanceof PaymentRequestError) {
      return res.status(error.status).json({ error: error.message });
    }

    // The same Idempotency-Key committed by a concurrent request.
    if (error.code === 'ER_DUP_ENTRY' && requestId && /request/i.test(error.message)) {
      const [existing] = await pool.query('SELECT id FROM payment_history WHERE request_id = ?', [requestId]);
      if (existing.length > 0) return res.json(duplicatePaymentResponse(existing[0].id));
    }

    console.error('Error adding payment:', error);

    if (error.code === 'ER_DUP_ENTRY' || error.name === 'DuplicateReferenceError') {
      return res.status(400).json({
        error: error.name === 'DuplicateReferenceError' ? error.message : 'Voucher number already exists. Please use a unique voucher number.'
      });
    }

    if (error.name === 'InsufficientBalanceError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

// Get Payment History for a Purchase
const getPaymentHistory = async (req, res) => {
  const { id } = req.params;

  try {
    const [payments] = await pool.query(`
      SELECT 
        ph.*,
        u.name AS created_by_name,
        COALESCE(ppa.allocated_amount, ph.amount) AS paid_amount
      FROM payment_history ph
      JOIN users u ON ph.created_by = u.id
      LEFT JOIN purchase_payment_allocations ppa
        ON ppa.payment_history_id = ph.id AND ppa.purchase_id = ?
      WHERE
        ppa.purchase_id = ?
        OR (
          ph.purchase_id = ?
          AND NOT EXISTS (
            SELECT 1 FROM purchase_payment_allocations ppa2 WHERE ppa2.payment_history_id = ph.id
          )
        )
      ORDER BY ph.payment_date DESC, ph.created_at DESC
    `, [id, id, id]);

    res.json(payments);
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Update existing purchase with payment status
const updatePaymentStatuses = async (req, res) => {
  try {
    const [result] = await pool.query(`
      UPDATE purchases 
      SET payment_status = CASE 
        WHEN paid_amount >= total_with_vat THEN 'Paid'
        WHEN paid_amount > 0 THEN 'Partially Paid'
        ELSE 'Non-Paid'
      END
      WHERE payment_status IS NULL OR payment_status = ''
    `);

    res.json({ 
      message: 'Payment statuses updated successfully',
      updated_count: result.affectedRows 
    });
  } catch (error) {
    console.error('Error updating payment statuses:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET PURCHASE RETURNS FOR A BILL
const getPurchaseReturnsForBill = async (req, res) => {
  const { id } = req.params;

  try {
    const [returns] = await pool.query(`
      SELECT 
        pr.id,
        pr.return_number,
        pr.return_date,
        pr.total_amount,
        pri.item_name,
        pri.quantity,
        pri.unit_price,
        pri.total_amount as line_total
      FROM purchase_returns pr
      JOIN purchase_return_items pri ON pr.id = pri.return_id
      WHERE pr.purchase_id = ?
      ORDER BY pr.return_date DESC
    `, [id]);

    res.json(returns);
  } catch (error) {
    console.error('Error fetching purchase returns:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

// Get supplier bills from last 3 months with balance > 0
const getSupplierBills = async (req, res) => {
  const { supplierId } = req.params;
  const { fromDate } = req.query;

  try {
    let query = `
      SELECT 
        p.id,
        p.invoice_no,
        p.purchase_date,
        p.total_with_vat,
        p.paid_amount,
        p.balance_amount,
        p.balance_status,
        p.payment_status
      FROM purchases p
      WHERE p.supplier_id = ? 
        AND p.balance_status = 1 
        AND p.balance_amount > 0
        AND (p.deleted = FALSE OR p.deleted IS NULL)
    `;
    
    const params = [supplierId];
    
    if (fromDate) {
      query += ` AND p.purchase_date >= ?`;
      params.push(fromDate);
    }
    
    query += ` ORDER BY p.purchase_date ASC`;
    
    const [bills] = await pool.query(query, params);
    
    const formattedBills = bills.map(bill => ({
      ...bill,
      total_with_vat: parseFloat(bill.total_with_vat) || 0,
      paid_amount: parseFloat(bill.paid_amount) || 0,
      balance_amount: parseFloat(bill.balance_amount) || 0
    }));
    
    res.json(formattedBills);
  } catch (error) {
    console.error('Error fetching supplier bills:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

// Add settlement to return
const addSettlementToReturn = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      settlements,
      settlement_date,
      notes
    } = req.body;
    // Settled By = the signed-in user, never a value from the form.
    const settled_by = actorId(req);

    if (!id || !settlements || settlements.length === 0) {
      throw new Error('Return ID and settlements are required');
    }

    if (!settled_by) {
      throw new Error('Please log in again');
    }

    const [returns] = await connection.query(
      `SELECT * FROM purchase_returns WHERE id = ?`,
      [id]
    );

    if (returns.length === 0) {
      throw new Error('Purchase return not found');
    }

    const purchaseReturn = returns[0];
    const currentSettledAmount = parseFloat(purchaseReturn.settled_amount) || 0;
    const totalAmount = parseFloat(purchaseReturn.total_amount) || 0;
    
    let existingSettlements = [];
    if (purchaseReturn.settlement_details) {
      try {
        existingSettlements = typeof purchaseReturn.settlement_details === 'string' 
          ? JSON.parse(purchaseReturn.settlement_details) 
          : purchaseReturn.settlement_details;
      } catch (e) {
        existingSettlements = [];
      }
    }

    let newSettledAmount = 0;
    const enhancedSettlements = [...existingSettlements];
    
    for (const settlement of settlements) {
      const settlementAmount = parseFloat(settlement.amount) || 0;
      if (settlementAmount <= 0) continue;
      
      newSettledAmount += settlementAmount;
      
      const existingIndex = existingSettlements.findIndex(s => s.purchase_id === settlement.purchase_id);
      
      if (existingIndex >= 0) {
        enhancedSettlements[existingIndex].amount = 
          (enhancedSettlements[existingIndex].amount || 0) + settlementAmount;
      } else {
        const [purchaseDetails] = await connection.query(
          `SELECT id, invoice_no, DATE(purchase_date) as purchase_date FROM purchases WHERE id = ?`,
          [settlement.purchase_id]
        );
        
        enhancedSettlements.push({
          purchase_id: settlement.purchase_id,
          invoice_no: purchaseDetails.length > 0 ? purchaseDetails[0].invoice_no : 'Unknown',
          purchase_date: purchaseDetails.length > 0 ? purchaseDetails[0].purchase_date : null,
          amount: settlementAmount
        });
      }
    }

    const totalSettledAmount = currentSettledAmount + newSettledAmount;
    const newBalanceAmount = totalAmount - totalSettledAmount;

    await connection.query(
      `UPDATE purchase_returns 
       SET settled_amount = ?, 
           balance_amount = ?,
           settlement_details = ?
       WHERE id = ?`,
      [totalSettledAmount, newBalanceAmount, JSON.stringify(enhancedSettlements), id]
    );

    const settlementDate = settlement_date || purchaseReturn.return_date;
    
    for (const settlement of settlements) {
      const requestedSettlementAmount = parseFloat(settlement.amount) || 0;
      if (requestedSettlementAmount <= 0) continue;

      const [purchase] = await connection.query(
        `SELECT balance_amount, paid_amount, total_with_vat FROM purchases WHERE id = ? FOR UPDATE`,
        [settlement.purchase_id]
      );

      if (purchase.length > 0) {
        const currentBalance = parseFloat(purchase[0].balance_amount) || 0;
        const currentPaid = parseFloat(purchase[0].paid_amount) || 0;
        const invoiceTotal = parseFloat(purchase[0].total_with_vat) || 0;

        // This invoice's own paid_amount must never exceed its own total - clamp the
        // amount actually applied to whatever is genuinely still outstanding, exactly
        // like the regular payment and credit-settlement flows do.
        const currentOutstanding = currentBalance > 0 ? currentBalance : Math.max(0, invoiceTotal - currentPaid);
        const settlementAmount = Math.min(requestedSettlementAmount, currentOutstanding);

        if (settlementAmount <= 0.001) {
          continue;
        }

        const newBalance = Math.max(0, currentBalance - settlementAmount);
        const newPaid = Math.min(currentPaid + settlementAmount, invoiceTotal);
        const newBalanceStatus = newBalance > 0 ? 1 : 0;

        let paymentStatus = 'Non-Paid';
        if (newPaid >= invoiceTotal && invoiceTotal > 0) {
          paymentStatus = 'Paid';
        } else if (newPaid > 0) {
          paymentStatus = 'Partially Paid';
        }

        await connection.query(
          `UPDATE purchases 
           SET balance_amount = ?, 
               paid_amount = ?,
               balance_status = ?,
               payment_status = ?
           WHERE id = ?`,
          [newBalance, newPaid, newBalanceStatus, paymentStatus, settlement.purchase_id]
        );

        // PURCHASE_RETURN, never the form's payment method: a return moves no
        // cash (services/settlementPaymentMethods.js).
        const [settlementPaymentResult] = await connection.query(
          `INSERT INTO payment_history
           (purchase_id, payment_date, amount, payment_method, check_number, notes, created_by)
           VALUES (?, ?, ?, 'PURCHASE_RETURN', ?, ?, ?)`,
          [
            settlement.purchase_id,
            settlementDate,
            settlementAmount,
            purchaseReturn.return_number,
            notes || `Additional settlement for return #${purchaseReturn.return_number}`,
            settled_by
          ]
        );

        // Record the explicit allocation so the invoice's Payment History tab shows
        // only the amount actually allocated to it - never the raw, unclamped figure.
        await connection.query(
          `INSERT INTO purchase_payment_allocations (payment_history_id, purchase_id, allocated_amount)
           VALUES (?, ?, ?)`,
          [settlementPaymentResult.insertId, settlement.purchase_id, settlementAmount]
        );
      }
    }

    await connection.commit();
    
    res.json({
      message: 'Settlement added successfully!',
      return_id: parseInt(id),
      summary: {
        previous_settled: currentSettledAmount,
        new_settlement: newSettledAmount,
        total_settled: totalSettledAmount,
        balance_amount: newBalanceAmount,
        is_fully_settled: newBalanceAmount === 0
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error adding settlement to return:', error);
    res.status(500).json({ 
      error: 'Server error: ' + error.message 
    });
  } finally {
    connection.release();
  }
};

// =============================================
// PURCHASING PAYMENT ADJUSTMENT
// (RM Adjustment -> "Purchasing Payment Adjustment" tab)
//
// Adjusts a payment that was already recorded against a purchasing
// invoice. Payment identity fields (supplier, company, invoice, check number)
// remain fixed; transaction details such as date, amount, method, voucher,
// bank account, and notes can be corrected. Reuses the same reconciliation
// helpers and ledger functions as a normal payment so the invoice balance
// and Cash/Bank ledger stay correct, and preserves the existing behavior
// of treating any amount above the invoice's balance as supplier credit.
// =============================================

// A pickable "record" for the adjustment list is one (payment x invoice)
// pair - the same unit getActualAllocatedPaidAmount/getPaymentHistory
// already reconcile against. Its composite id is "<paymentId>-<purchaseId>".
const getAdjustablePayments = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        CONCAT(ph.id, '-', COALESCE(ppa.purchase_id, ph.purchase_id)) AS id,
        ph.id AS payment_id,
        COALESCE(ppa.purchase_id, ph.purchase_id) AS purchase_id,
        p.invoice_no,
        s.id AS supplier_id,
        s.name AS supplier_name,
        DATE_FORMAT(ph.payment_date, '%Y-%m-%d') AS payment_date,
        COALESCE(ppa.allocated_amount, ph.amount) AS amount,
        ph.payment_method,
        ph.voucher_number,
        p.payment_status
      FROM payment_history ph
      LEFT JOIN purchase_payment_allocations ppa ON ppa.payment_history_id = ph.id
      JOIN purchases p ON p.id = COALESCE(ppa.purchase_id, ph.purchase_id)
      LEFT JOIN supplier s ON s.id = p.supplier_id
      WHERE ph.payment_method <> '' AND ph.payment_method NOT IN (?)
      ORDER BY ph.payment_date DESC, ph.created_at DESC
      LIMIT 500
    `, [SETTLEMENT_PAYMENT_METHODS]);
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching adjustable payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments for adjustment' });
  }
};

// GET Record Payment Details for the picked payment x invoice pair.
const getPaymentAdjustmentDetail = async (req, res) => {
  const [paymentId, purchaseId] = String(req.params.id).split('-').map(Number);
  if (!paymentId || !purchaseId) {
    return res.status(400).json({ error: 'Invalid payment adjustment reference' });
  }

  try {
    const [paymentRows] = await pool.query(
      `SELECT ph.id AS payment_id, ph.payment_date, ph.amount AS transaction_amount, ph.bank_id,
              ph.payment_method, ph.voucher_number, ph.check_number, ph.notes,
              ph.created_at, u.name AS created_by_name
       FROM payment_history ph
       LEFT JOIN users u ON u.id = ph.created_by
       WHERE ph.id = ?`,
      [paymentId]
    );
    if (paymentRows.length === 0) {
      return res.status(404).json({ error: 'Payment record not found' });
    }
    const payment = paymentRows[0];
    if (isSettlementPaymentMethod(payment.payment_method)) {
      return res.status(409).json({ error: SETTLEMENT_NOT_ADJUSTABLE });
    }

    const [purchaseRows] = await pool.query(
      `SELECT p.id, p.invoice_no, p.total_with_vat, p.balance_amount, p.paid_amount,
              p.payment_status, p.company_id, s.name AS supplier_name, c.name AS company_name
       FROM purchases p
       LEFT JOIN supplier s ON s.id = p.supplier_id
       LEFT JOIN company c ON c.id = p.company_id
       WHERE p.id = ?`,
      [purchaseId]
    );
    if (purchaseRows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const purchase = purchaseRows[0];

    const [allocRows] = await pool.query(
      'SELECT allocated_amount FROM purchase_payment_allocations WHERE payment_history_id = ? AND purchase_id = ?',
      [paymentId, purchaseId]
    );
    const allocatedAmount = allocRows.length > 0
      ? parseFloat(allocRows[0].allocated_amount)
      : parseFloat(payment.transaction_amount);

    // The Bank Account shown is whatever this payment actually posted
    // against in the ledger (read-only - resolved from finance_transactions,
    // since payment_history itself does not store a bank_id column).
    const [ledgerRows] = await pool.query(
      `SELECT ft.bank_id, bd.bank_name, bd.account_number
       FROM finance_transactions ft
       LEFT JOIN bank_details bd ON bd.id = ft.bank_id
       WHERE ft.reference_type = 'PURCHASE_PAYMENT' AND ft.reference_id = ? LIMIT 1`,
      [paymentId]
    );
    const bankInfo = ledgerRows[0] || {};

    const invoiceTotal = resolveInvoiceTotalAmount(purchase);
    const actualAllocatedExcludingThis = await getActualAllocatedPaidAmount(pool, purchaseId, paymentId);
    const availableBalance = Math.max(0, invoiceTotal - actualAllocatedExcludingThis);

    res.json({
      payment_id: payment.payment_id,
      purchase_id: purchase.id,
      invoice_no: purchase.invoice_no,
      supplier_name: purchase.supplier_name,
      company_name: purchase.company_name,
      company_id: purchase.company_id,
      payment_date: payment.payment_date,
      payment_method: payment.payment_method,
      voucher_number: payment.voucher_number,
      reference_number: payment.check_number,
      amount: allocatedAmount,
      bank_id: payment.bank_id || bankInfo.bank_id || null,
      bank_name: bankInfo.bank_name || null,
      account_number: bankInfo.account_number || null,
      notes: payment.notes,
      invoice_total: invoiceTotal,
      // The most this invoice can accept from this payment before any excess
      // becomes supplier credit (i.e. the invoice balance if this payment's
      // own current contribution is set aside).
      invoice_available_balance: availableBalance,
      created_by_name: payment.created_by_name,
      created_at: payment.created_at
    });
  } catch (error) {
    console.error('Error fetching payment adjustment detail:', error);
    res.status(500).json({ error: 'Failed to fetch payment details' });
  }
};

// PUT Save / Confirm Adjustment. Invoice identity, supplier/company, and
// check_number remain immutable; other payment details may be corrected.
const adjustPurchasePayment = async (req, res) => {
  const [paymentId, purchaseId] = String(req.params.id).split('-').map(Number);
  const { payment_date, amount, payment_method, voucher_number, bank_id, notes } = req.body;

  if (!paymentId || !purchaseId) {
    return res.status(400).json({ error: 'Invalid payment adjustment reference' });
  }
  if (!payment_date) {
    return res.status(400).json({ error: 'Payment Date is required' });
  }
  const newAmount = parseFloat(amount);
  if (!Number.isFinite(newAmount) || newAmount <= 0) {
    return res.status(400).json({ error: 'Payment Amount must be a valid amount greater than 0' });
  }
  const normalizedMethod = normalizePaymentMethodValue(payment_method);
  const validMethods = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT'];
  if (!normalizedMethod || !validMethods.includes(normalizedMethod)) {
    return res.status(400).json({ error: 'Payment Method is invalid' });
  }
  if (normalizedMethod === 'BANK_TRANSFER' && !bank_id) {
    return res.status(400).json({ error: 'Bank Account is required for bank payments' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [paymentRows] = await connection.query(
      'SELECT * FROM payment_history WHERE id = ? FOR UPDATE', [paymentId]
    );
    if (paymentRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Payment record not found' });
    }
    const payment = paymentRows[0];
    if (isSettlementPaymentMethod(payment.payment_method)) {
      await connection.rollback();
      return res.status(409).json({ error: SETTLEMENT_NOT_ADJUSTABLE });
    }

    const [purchaseRows] = await connection.query(
      'SELECT * FROM purchases WHERE id = ? FOR UPDATE', [purchaseId]
    );
    if (purchaseRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const purchase = purchaseRows[0];
    const methodForHistory = normalizePaymentMethodForHistory(normalizedMethod);
    if (voucher_number && voucher_number !== payment.voucher_number) {
      try { await checkDuplicateReference(connection, voucher_number, { table: 'payment_history', id: paymentId }); }
      catch (err) {
        if (err instanceof DuplicateReferenceError) {
          await connection.rollback();
          return res.status(400).json({ error: err.message });
        }
        throw err;
      }
    }
    if (normalizedMethod === 'BANK_TRANSFER') {
      const [bankRows] = await connection.query(
        "SELECT id FROM bank_details WHERE id = ? AND status = 'Active' AND COALESCE(record_status, 1) = 1 AND company = (SELECT name FROM company WHERE id = ?) LIMIT 1",
        [bank_id, purchase.company_id]
      );
      if (!bankRows.length) {
        await connection.rollback();
        return res.status(400).json({ error: 'Selected bank account is invalid for this company' });
      }
    }
    const invoiceTotal = resolveInvoiceTotalAmount(purchase);

    const [allocRows] = await connection.query(
      'SELECT id, allocated_amount FROM purchase_payment_allocations WHERE payment_history_id = ? AND purchase_id = ? FOR UPDATE',
      [paymentId, purchaseId]
    );
    const hasAllocationRow = allocRows.length > 0;
    const oldAllocatedAmount = hasAllocationRow
      ? parseFloat(allocRows[0].allocated_amount)
      : parseFloat(payment.amount);

    // Balance available to this invoice from every OTHER payment - i.e. what
    // the balance would be if this payment's old contribution didn't exist.
    const actualAllocatedExcludingThis = await getActualAllocatedPaidAmount(connection, purchaseId, paymentId);
    const availableBalance = Math.max(0, invoiceTotal - actualAllocatedExcludingThis);

    // Cap what actually applies to the invoice at its own balance - existing
    // behavior: any amount above that is preserved as supplier credit.
    const appliedAmount = Number(Math.min(newAmount, availableBalance).toFixed(2));
    const excessAmount = Number((newAmount - appliedAmount).toFixed(2));

    if (hasAllocationRow) {
      await connection.query(
        'UPDATE purchase_payment_allocations SET allocated_amount = ? WHERE id = ?',
        [appliedAmount, allocRows[0].id]
      );
    } else {
      await connection.query(
        'INSERT INTO purchase_payment_allocations (payment_history_id, purchase_id, allocated_amount) VALUES (?, ?, ?)',
        [paymentId, purchaseId, appliedAmount]
      );
    }

    // Keep the overall payment_history record (the full transaction amount)
    // in step with this invoice's change - it moves by the same amount the
    // user's entered figure moved by for this invoice. Other invoices in a
    // split payment, if any, are never touched by this adjustment.
    const oldTransactionAmount = parseFloat(payment.amount) || 0;
    const totalDelta = Number((newAmount - oldAllocatedAmount).toFixed(2));
    const newTransactionAmount = Number((oldTransactionAmount + totalDelta).toFixed(2));

    await connection.query(
      `UPDATE payment_history SET payment_date = ?, amount = ?, payment_method = ?,
       voucher_number = ?, bank_id = ?, notes = ? WHERE id = ?`,
      [payment_date, newTransactionAmount, methodForHistory, voucher_number || null,
       normalizedMethod === 'BANK_TRANSFER' ? bank_id : null, notes || null, paymentId]
    );

    // Recompute this invoice's paid/balance/status from the real allocations.
    const reconciled = await reconcilePurchasePaymentState(connection, purchaseId, invoiceTotal, purchase.paid_amount);

    // Sync the linked Cash/Bank ledger entry by the same delta, once, so the
    // account balance reflects the adjustment exactly - never double-posted.
    let ledgerUpdated = false;
    const [finRows] = await connection.query(
      `SELECT id, credit, account_type, company_id, bank_id FROM finance_transactions
       WHERE reference_type = 'PURCHASE_PAYMENT' AND reference_id = ? LIMIT 1`,
      [paymentId]
    );
    const targetAccountType = normalizedMethod === 'CASH' ? 'CASH'
      : normalizedMethod === 'BANK_TRANSFER' ? 'BANK' : null;
    if (finRows.length > 0 && targetAccountType) {
      const fin = finRows[0];
      const newCredit = Number((parseFloat(fin.credit) + totalDelta).toFixed(2));
      const targetBankId = targetAccountType === 'BANK' ? Number(bank_id) : null;
      await connection.query(
        `UPDATE finance_transactions SET credit = ?, transaction_date = ?, account_type = ?,
         company_id = ?, bank_id = ?, reference_number = ? WHERE id = ?`,
        [newCredit, payment_date, targetAccountType, purchase.company_id, targetBankId,
         voucher_number || payment.check_number || null, fin.id]
      );
      const sameCashAccount = fin.account_type === 'CASH' && targetAccountType === 'CASH'
        && Number(fin.company_id) === Number(purchase.company_id);
      const sameBankAccount = fin.account_type === 'BANK' && targetAccountType === 'BANK'
        && Number(fin.bank_id) === targetBankId;
      if (fin.account_type === 'CASH' && fin.company_id && !sameCashAccount) {
        await connection.query(
          'UPDATE cash_accounts SET current_balance = current_balance + ? WHERE company_id = ?',
          [parseFloat(fin.credit) || 0, fin.company_id]
        );
      } else if (sameCashAccount) {
        await connection.query('UPDATE cash_accounts SET current_balance = current_balance - ? WHERE company_id = ?', [totalDelta, fin.company_id]);
      }
      if (fin.account_type === 'BANK' && fin.bank_id && !sameBankAccount) {
        await connection.query(
          'UPDATE bank_details SET current_balance = current_balance + ? WHERE id = ?',
          [parseFloat(fin.credit) || 0, fin.bank_id]
        );
      } else if (sameBankAccount) {
        await connection.query('UPDATE bank_details SET current_balance = current_balance - ? WHERE id = ?', [totalDelta, fin.bank_id]);
      }
      if (targetAccountType === 'CASH' && !sameCashAccount) {
        await connection.query(
          'UPDATE cash_accounts SET current_balance = current_balance - ? WHERE company_id = ?',
          [newCredit, purchase.company_id]
        );
      } else if (targetAccountType === 'BANK' && !sameBankAccount) {
        await connection.query(
          'UPDATE bank_details SET current_balance = current_balance - ? WHERE id = ?',
          [newCredit, targetBankId]
        );
      }
      ledgerUpdated = true;
    } else if (finRows.length > 0 && !targetAccountType) {
      const fin = finRows[0];
      await connection.query("UPDATE finance_transactions SET status = 0 WHERE id = ?", [fin.id]);
      if (fin.account_type === 'CASH' && fin.company_id) {
        await connection.query('UPDATE cash_accounts SET current_balance = current_balance + ? WHERE company_id = ?', [parseFloat(fin.credit) || 0, fin.company_id]);
      } else if (fin.account_type === 'BANK' && fin.bank_id) {
        await connection.query('UPDATE bank_details SET current_balance = current_balance + ? WHERE id = ?', [parseFloat(fin.credit) || 0, fin.bank_id]);
      }
      ledgerUpdated = true;
    } else if (finRows.length === 0 && targetAccountType === 'CASH' && purchase.company_id) {
      await recordCashTransaction(connection, {
        companyId: purchase.company_id, date: payment_date,
        remark: `Supplier payment - Invoice ${purchase.invoice_no}`, credit: newTransactionAmount,
        transactionType: 'RM Purchase Payment', referenceNumber: voucher_number || payment.check_number || null,
        invoiceNumber: purchase.invoice_no, partyName: null, referenceType: 'PURCHASE_PAYMENT',
        referenceId: paymentId, createdBy: payment.created_by, periodActor: actorId(req)
      });
      ledgerUpdated = true;
    } else if (finRows.length === 0 && targetAccountType === 'BANK') {
      await recordBankTransaction(connection, {
        bankId: Number(bank_id), date: payment_date,
        remark: `Supplier payment - Invoice ${purchase.invoice_no}`, credit: newTransactionAmount,
        transactionType: 'RM Purchase Payment', referenceNumber: voucher_number || payment.check_number || null,
        invoiceNumber: purchase.invoice_no, partyName: null, referenceType: 'PURCHASE_PAYMENT',
        referenceId: paymentId, createdBy: payment.created_by, periodActor: actorId(req)
      });
      ledgerUpdated = true;
    }

    // The row above was edited in place (date / amount / account / void): refresh the
    // stored running balances of the account it was in and the one it is in now.
    await refreshBalancesOfReference(connection, 'PURCHASE_PAYMENT', paymentId, finRows);

    // Excess above the invoice balance is preserved as supplier credit,
    // using the same supplier_overpayments mechanism the system already
    // relies on for supplier credit elsewhere.
    let overpaymentRecord = null;
    const [supplierNameRows] = await connection.query('SELECT name FROM supplier WHERE id = ?', [purchase.supplier_id]);
    const supplierName = supplierNameRows[0]?.name || null;

    if (excessAmount > 0 && purchase.supplier_id) {
      const datePart = String(payment_date).replace(/-/g, '');
      const rand = Math.floor(Math.random() * 9000) + 1000;
      const overpaymentNumber = `ADJ-${datePart}-${rand}`;
      const overpaymentMethod = normalizedMethod === 'BANK_TRANSFER' ? 'BANK_TRANSFER' : 'CASH';

      const [overpayResult] = await connection.query(
        `INSERT INTO supplier_overpayments
           (overpayment_number, supplier_id, company_id, payment_date, payment_method,
            voucher_number, reference_number, original_amount, remaining_credit, status, notes, created_by)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, 'Active', ?, ?)`,
        [
          overpaymentNumber, purchase.supplier_id, purchase.company_id || null, payment_date, overpaymentMethod,
          voucher_number || null, excessAmount, excessAmount,
          `Supplier credit from Purchasing Payment Adjustment on invoice ${purchase.invoice_no} (Payment #${paymentId})`,
          actorId(req)
        ]
      );
      overpaymentRecord = { id: overpayResult.insertId, overpayment_number: overpaymentNumber, amount: excessAmount };
    }

    // Audit trail entry backing the RM Adjustment Summary / Stores
    // Adjustment Summary "Purchasing Payment" view.
    await connection.query(
      `INSERT INTO purchase_payment_adjustments
         (payment_history_id, purchase_id, invoice_no, supplier_id, supplier_name, voucher_number,
          original_payment_date, updated_payment_date, original_amount, adjusted_amount,
          adjustment_difference, status, notes, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Adjusted', ?, ?)`,
      [
        paymentId, purchaseId, purchase.invoice_no, purchase.supplier_id, supplierName, voucher_number || null,
        payment.payment_date, payment_date, oldAllocatedAmount, newAmount,
        Number((newAmount - oldAllocatedAmount).toFixed(2)),
        excessAmount > 0 ? `Rs. ${excessAmount.toFixed(2)} recorded as supplier credit${overpaymentRecord ? ` (${overpaymentRecord.overpayment_number})` : ''}` : null,
        actorId(req)
      ]
    );

    await connection.commit();

    res.json({
      message: 'Payment adjustment saved successfully',
      payment_id: paymentId,
      purchase_id: purchaseId,
      applied_amount: appliedAmount,
      excess_amount: excessAmount,
      overpayment: overpaymentRecord,
      invoice_state: reconciled,
      ledger_updated: ledgerUpdated
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error adjusting payment:', error);
    res.status(500).json({ error: 'Failed to save payment adjustment: ' + error.message });
  } finally {
    connection.release();
  }
};

// GET the Purchasing Payment adjustment audit trail (RM Adjustment Summary
// / Stores Adjustment Summary "Purchasing Payment" tab).
const getPurchasePaymentAdjustmentsSummary = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT pa.id, pa.payment_history_id, pa.purchase_id, pa.supplier_id,
             pa.invoice_no, pa.supplier_name, pa.voucher_number,
             DATE_FORMAT(pa.original_payment_date, '%Y-%m-%d') AS original_payment_date,
             DATE_FORMAT(pa.updated_payment_date, '%Y-%m-%d') AS updated_payment_date,
             pa.original_amount, pa.adjusted_amount, pa.adjustment_difference,
             pa.status, pa.notes, u.name AS updated_by_name,
             DATE_FORMAT(pa.created_at, '%Y-%m-%d %H:%i:%s') AS updated_at
      FROM purchase_payment_adjustments pa
      LEFT JOIN users u ON u.id = pa.updated_by
      ORDER BY pa.created_at DESC
      LIMIT 500
    `);
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching purchasing payment adjustments summary:', error);
    res.status(500).json({ error: 'Failed to fetch purchasing payment adjustments' });
  }
};

module.exports = {
  calculatePaymentState,
  resolveInvoiceTotalAmount,
  normalizePaymentMethodForHistory,
  createPurchase,
  getAllPurchases,
  getPurchaseById,
  updatePurchase,
  getAllSuppliers,
  getAllCompanies,
  getPreviousPurchasePrices,
  getNonPaidPurchases,
  makePayment,
  getPaymentHistory,
  updatePaymentStatuses,
  getPurchaseReturnsForBill,
  getSupplierBills,
  addSettlementToReturn,
  getPendingInvoicesBySupplier,
  getAdjustablePayments,
  getPaymentAdjustmentDetail,
  adjustPurchasePayment,
  getPurchasePaymentAdjustmentsSummary
};
