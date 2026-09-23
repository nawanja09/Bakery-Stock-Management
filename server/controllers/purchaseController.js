// controllers/purchaseController.js
const pool = require('../config/db');
const { normalizePaymentMethodValue } = require('../utils/paymentMethodUtils');
const { recordCashTransaction, recordBankTransaction } = require('../utils/financeLedger');
const { checkDuplicateReference, DuplicateReferenceError } = require('../services/referenceValidationService');
const { isRmAdjustmentRequest, recordRmAdjustment, sameItems, sameValue } = require('../utils/rmAdjustmentAudit');

const resolveUserId = async (connection, ...candidateIds) => {
  for (const candidateId of candidateIds) {
    const numericId = Number(candidateId);
    if (Number.isInteger(numericId) && numericId > 0) {
      const [rows] = await connection.query('SELECT id FROM users WHERE id = ? LIMIT 1', [numericId]);
      if (rows.length > 0) {
        return numericId;
      }
    }
  }

  const [rows] = await connection.query('SELECT id FROM users ORDER BY id LIMIT 1');
  return rows[0]?.id || null;
};

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
    prepared_by,
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
    const resolvedPreparedBy = await resolveUserId(connection, prepared_by, req.user?.id);

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
    prepared_by,
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

    const resolvedPreparedBy = await resolveUserId(connection, prepared_by, req.user?.id);

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
const makePayment = async (req, res) => {
  const { id } = req.params;
  const {
    payment_date,
    amount,
    payment_method,
    check_number,
    voucher_number,
    notes,
    created_by,
    invoice_allocations,
    supplier_id,
    bank_id
  } = req.body;

  const normalizedPaymentMethod = normalizePaymentMethodValue(payment_method);
  const validMethods = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT'];
  
  // Handle allocations properly
  let normalizedAllocations = [];
  
  if (Array.isArray(invoice_allocations) && invoice_allocations.length > 0) {
    normalizedAllocations = invoice_allocations
      .map((allocation) => ({
        purchase_id: allocation.purchase_id || allocation.id,
        amount: parseFloat(allocation.amount) || 0
      }))
      .filter((allocation) => allocation.purchase_id && allocation.amount > 0);
  } else if (id) {
    // Single invoice payment (backward compatibility)
    normalizedAllocations = [{
      purchase_id: parseInt(id),
      amount: parseFloat(amount) || 0
    }];
  }

  if (!payment_date) {
    return res.status(400).json({ error: 'Payment date is required' });
  }
  if (!normalizedPaymentMethod || !validMethods.includes(normalizedPaymentMethod)) {
    return res.status(400).json({ error: 'Payment method is invalid' });
  }
  if (normalizedAllocations.length === 0) {
    return res.status(400).json({ error: 'At least one invoice allocation is required' });
  }
  if (normalizedPaymentMethod === 'BANK_TRANSFER' && !bank_id) {
    return res.status(400).json({ error: 'Bank account is required for bank payments' });
  }
  if (normalizedPaymentMethod === 'CHEQUE' && (!check_number || !String(check_number).trim())) {
    return res.status(400).json({ error: 'Cheque number is required for cheque payments' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Supplier + Company restriction: every invoice in this payment must
    // belong to the same supplier AND the same company - a supplier can
    // have invoices spread across multiple companies, so these are two
    // separate checks, not one. This must be enforced here, not just in
    // the UI, since a direct API call could otherwise bypass the
    // frontend's selection lock.
    const purchaseIds = normalizedAllocations.map((a) => a.purchase_id);
    const [invoiceCheckRows] = await connection.query(
      `SELECT id, invoice_no, supplier_id, company_id, balance_amount, payment_status
       FROM purchases WHERE id IN (${purchaseIds.map(() => '?').join(',')})`,
      purchaseIds
    );

    if (invoiceCheckRows.length !== purchaseIds.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'One or more selected invoices could not be found' });
    }

    const uniqueSupplierIds = [...new Set(invoiceCheckRows.map((r) => r.supplier_id))];
    if (uniqueSupplierIds.length > 1) {
      await connection.rollback();
      return res.status(400).json({
        error: 'You cannot make one payment for invoices belonging to different suppliers or companies. Please select invoices from the same supplier/company.'
      });
    }

    const uniqueCompanyIds = [...new Set(invoiceCheckRows.map((r) => String(r.company_id || '')))];
    if (uniqueCompanyIds.length > 1) {
      await connection.rollback();
      return res.status(400).json({
        error: 'You can only make a payment for one company at a time. Please deselect the current company invoices before selecting invoices from another company.'
      });
    }

    const alreadyPaidInvoice = invoiceCheckRows.find(
      (r) => r.payment_status === 'Paid' || parseFloat(r.balance_amount) <= 0
    );
    if (alreadyPaidInvoice) {
      await connection.rollback();
      return res.status(400).json({
        error: `Invoice ${alreadyPaidInvoice.invoice_no} is already fully paid and cannot be selected for payment.`
      });
    }

    if (voucher_number) {
      await checkDuplicateReference(connection, voucher_number);
    }

    const normalizedPaymentAmount = parseFloat(amount) > 0
      ? parseFloat(amount)
      : normalizedAllocations.reduce((sum, allocation) => sum + (parseFloat(allocation.amount) || 0), 0);

    if (normalizedPaymentAmount <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Payment amount must be greater than 0' });
    }

    const paymentHistoryPurchaseId = normalizedAllocations[0]?.purchase_id || null;
    const resolvedCreatedBy = await resolveUserId(connection, created_by, req.user?.id);
    const normalizedPaymentMethodForHistory = normalizePaymentMethodForHistory(normalizedPaymentMethod);

    if (!resolvedCreatedBy) {
      await connection.rollback();
      return res.status(400).json({ error: 'No valid user found for payment audit' });
    }

    // Insert payment history with the actual payment amount entered by the user.
    let paymentResult;
    try {
      [paymentResult] = await connection.query(
        `INSERT INTO payment_history
           (purchase_id, payment_date, amount, payment_method, check_number, bank_id, voucher_number, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [paymentHistoryPurchaseId, payment_date, normalizedPaymentAmount, normalizedPaymentMethodForHistory,
         check_number || null, bank_id || null, voucher_number || null, notes || null, resolvedCreatedBy]
      );
    } catch (colErr) {
      console.warn('voucher_number/bank_id column not found, using fallback:', colErr.message);
      [paymentResult] = await connection.query(
        `INSERT INTO payment_history
           (purchase_id, payment_date, amount, payment_method, check_number, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [paymentHistoryPurchaseId, payment_date, normalizedPaymentAmount, normalizedPaymentMethodForHistory,
         check_number || null, notes || null, resolvedCreatedBy]
      );
    }

    const paymentHistoryId = paymentResult.insertId;
    console.log('✅ Payment history inserted with ID:', paymentHistoryId);

    let remainingPaymentAmount = normalizedPaymentAmount;
    let totalApplied = 0;
    const updatedInvoices = [];
    let supplierIdForCredit = null;
    let companyIdForLedger = null;
    const invoiceNumbersForLedger = [];

    for (const allocation of normalizedAllocations) {
      const purchaseId = allocation.purchase_id;
      const requestedAmount = Math.max(0, parseFloat(allocation.amount) || 0);

      const [purchaseRows] = await connection.query(
        'SELECT * FROM purchases WHERE id = ? FOR UPDATE',
        [purchaseId]
      );

      if (purchaseRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: `Purchase ${purchaseId} not found` });
      }

      const currentPurchase = purchaseRows[0];
      if (!supplierIdForCredit && currentPurchase.supplier_id) {
        supplierIdForCredit = currentPurchase.supplier_id;
      }
      if (!companyIdForLedger && currentPurchase.company_id) {
        companyIdForLedger = currentPurchase.company_id;
      }
      invoiceNumbersForLedger.push(currentPurchase.invoice_no);

      const invoiceTotal = resolveInvoiceTotalAmount(currentPurchase);

      // Never trust the stored paid_amount/balance_amount blindly - reconcile against
      // the real allocated payment records first. Otherwise a stale/corrupted stored
      // total (e.g. leftover from old data) can make currentOutstanding compute to 0,
      // silently redirecting an entire legitimate payment into supplier credit instead
      // of applying it to the invoice.
      const reconciledBeforePayment = await reconcilePurchasePaymentState(
        connection, purchaseId, invoiceTotal, currentPurchase.paid_amount, paymentHistoryId
      );
      const currentBalance = reconciledBeforePayment.balance_amount;
      const currentPaid = reconciledBeforePayment.paid_amount;
      const currentOutstanding = currentBalance;

      const amountToApply = Math.min(requestedAmount, remainingPaymentAmount);
      if (amountToApply <= 0.001) {
        continue;
      }

      remainingPaymentAmount = Math.max(0, remainingPaymentAmount - amountToApply);

      console.log(`📊 Purchase ${currentPurchase.invoice_no}:`, {
        currentBalance,
        currentPaid,
        invoiceTotal,
        currentOutstanding,
        requestedAmount,
        amountToApply
      });

      const newPaidAmount = currentPaid + amountToApply;
      const newBalanceAmount = currentOutstanding - amountToApply;

      let newPaymentStatus = 'Non-Paid';
      if (newBalanceAmount <= 0.001) {
        newPaymentStatus = 'Paid';
      } else if (newPaidAmount > 0) {
        newPaymentStatus = 'Partially Paid';
      }

      console.log(`📊 Updated ${currentPurchase.invoice_no}:`, {
        newPaidAmount,
        newBalanceAmount,
        newPaymentStatus
      });

      await connection.query(
        `UPDATE purchases
           SET paid_amount = ?,
               balance_amount = ?,
               balance_status = ?,
               payment_status = ?
         WHERE id = ?`,
        [newPaidAmount, newBalanceAmount, newBalanceAmount > 0 ? 1 : 0, newPaymentStatus, purchaseId]
      );

      await connection.query(
        `INSERT INTO purchase_payment_allocations (payment_history_id, purchase_id, allocated_amount)
         VALUES (?, ?, ?)`,
        [paymentHistoryId, purchaseId, amountToApply]
      );

      totalApplied += amountToApply;

      updatedInvoices.push({
        purchase_id: purchaseId,
        invoice_no: currentPurchase.invoice_no,
        old_balance: currentOutstanding,
        new_balance: newBalanceAmount,
        payment_status: newPaymentStatus,
        applied_amount: amountToApply
      });
    }

    // Advance Payments are now handled via a dedicated flow.

    const [verifyPurchase] = await connection.query(
      `SELECT id, invoice_no, total_with_vat, paid_amount, balance_amount, payment_status
       FROM purchases WHERE id = ?`,
      [normalizedAllocations[0]?.purchase_id]
    );

    console.log('✅ Verification after update:', verifyPurchase[0]);

    // Post the actual money movement (the full amount paid out, including any
    // portion that became supplier credit) to the relevant Cash/Bank ledger.
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

    if (normalizedPaymentMethod === 'CASH' && companyIdForLedger) {
      ledgerBalance = await recordCashTransaction(connection, {
        companyId: companyIdForLedger,
        date: payment_date,
        remark: ledgerRemark,
        credit: normalizedPaymentAmount,
        transactionType: 'RM Purchase Payment',
        referenceNumber: voucher_number || check_number || null,
        invoiceNumber: invoiceNumberForLedger,
        partyName: supplierNameForLedger,
        referenceType: 'PURCHASE_PAYMENT',
        referenceId: paymentHistoryId,
        createdBy: resolvedCreatedBy
      });
    } else if (normalizedPaymentMethod === 'BANK_TRANSFER' && bank_id) {
      ledgerBalance = await recordBankTransaction(connection, {
        bankId: bank_id,
        date: payment_date,
        remark: ledgerRemark,
        credit: normalizedPaymentAmount,
        transactionType: 'RM Purchase Payment',
        referenceNumber: voucher_number || check_number || null,
        invoiceNumber: invoiceNumberForLedger,
        partyName: supplierNameForLedger,
        referenceType: 'PURCHASE_PAYMENT',
        referenceId: paymentHistoryId,
        createdBy: resolvedCreatedBy
      });
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
            normalizedPaymentAmount,
            bankName,
            bank_id || null
          ]
        );
      } catch (registryErr) {
        console.error('Expenses cheque registry upsert error (RM Purchasing):', registryErr.message);
      }
    }

    res.json({
      message: 'Payment recorded successfully!',
      payment_id: paymentHistoryId,
      amount: normalizedPaymentAmount,
      applied_amount: totalApplied,
      invoice_count: normalizedAllocations.length,
      updated_invoices: updatedInvoices,
      verification: verifyPurchase[0],
      ledger_balance: ledgerBalance
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error adding payment:', error);
    
    if (error.code === 'ER_DUP_ENTRY' || error.name === 'DuplicateReferenceError') {
      return res.status(400).json({ 
        error: error.name === 'DuplicateReferenceError' ? error.message : 'Voucher number already exists. Please use a unique voucher number.' 
      });
    }

    if (error.name === 'InsufficientBalanceError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Server error: ' + error.message });
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
      payment_method, 
      settlement_date,
      notes,
      settled_by 
    } = req.body;

    if (!id || !settlements || settlements.length === 0) {
      throw new Error('Return ID and settlements are required');
    }

    if (!settled_by) {
      throw new Error('User ID is required');
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

        const [settlementPaymentResult] = await connection.query(
          `INSERT INTO payment_history 
           (purchase_id, payment_date, amount, payment_method, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            settlement.purchase_id,
            settlementDate,
            settlementAmount,
            payment_method || 'CASH',
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
// invoice. Only Payment Date and Payment Amount can change; everything
// else about the payment (supplier, company, method, voucher, bank
// account, invoice) is fixed and read-only. Reuses the same reconciliation
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
      ORDER BY ph.payment_date DESC, ph.created_at DESC
      LIMIT 500
    `);
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
      `SELECT ph.id AS payment_id, ph.payment_date, ph.amount AS transaction_amount,
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
      payment_date: payment.payment_date,
      payment_method: payment.payment_method,
      voucher_number: payment.voucher_number,
      reference_number: payment.check_number,
      amount: allocatedAmount,
      bank_id: bankInfo.bank_id || null,
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

// PUT Save / Confirm Adjustment - only Payment Date and Payment Amount change.
const adjustPurchasePayment = async (req, res) => {
  const [paymentId, purchaseId] = String(req.params.id).split('-').map(Number);
  const { payment_date, amount } = req.body;

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

    const [purchaseRows] = await connection.query(
      'SELECT * FROM purchases WHERE id = ? FOR UPDATE', [purchaseId]
    );
    if (purchaseRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const purchase = purchaseRows[0];
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
      'UPDATE payment_history SET payment_date = ?, amount = ? WHERE id = ?',
      [payment_date, newTransactionAmount, paymentId]
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
    if (finRows.length > 0) {
      const fin = finRows[0];
      const newCredit = Number((parseFloat(fin.credit) + totalDelta).toFixed(2));
      await connection.query(
        'UPDATE finance_transactions SET credit = ?, transaction_date = ? WHERE id = ?',
        [newCredit, payment_date, fin.id]
      );
      if (fin.account_type === 'CASH' && fin.company_id) {
        await connection.query(
          'UPDATE cash_accounts SET current_balance = current_balance - ? WHERE company_id = ?',
          [totalDelta, fin.company_id]
        );
      } else if (fin.account_type === 'BANK' && fin.bank_id) {
        await connection.query(
          'UPDATE bank_details SET current_balance = current_balance - ? WHERE id = ?',
          [totalDelta, fin.bank_id]
        );
      }
      ledgerUpdated = true;
    }

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
      const overpaymentMethod = payment.payment_method === 'BANK_TRANSFER' ? 'BANK_TRANSFER' : 'CASH';

      const [overpayResult] = await connection.query(
        `INSERT INTO supplier_overpayments
           (overpayment_number, supplier_id, company_id, payment_date, payment_method,
            voucher_number, reference_number, original_amount, remaining_credit, status, notes, created_by)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, 'Active', ?, ?)`,
        [
          overpaymentNumber, purchase.supplier_id, purchase.company_id || null, payment_date, overpaymentMethod,
          payment.voucher_number || null, excessAmount, excessAmount,
          `Supplier credit from Purchasing Payment Adjustment on invoice ${purchase.invoice_no} (Payment #${paymentId})`,
          await resolveUserId(connection, req.user?.id)
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
        paymentId, purchaseId, purchase.invoice_no, purchase.supplier_id, supplierName, payment.voucher_number || null,
        payment.payment_date, payment_date, oldAllocatedAmount, newAmount,
        Number((newAmount - oldAllocatedAmount).toFixed(2)),
        excessAmount > 0 ? `Rs. ${excessAmount.toFixed(2)} recorded as supplier credit${overpaymentRecord ? ` (${overpaymentRecord.overpayment_number})` : ''}` : null,
        await resolveUserId(connection, req.user?.id)
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