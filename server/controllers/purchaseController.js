// controllers/purchaseController.js
const pool = require('../config/db');

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
  const balanceAmount = Math.max(0, parsedTotalAmount - parsedPaidAmount);
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

// Create new purchase with payment status handling
const createPurchase = async (req, res) => {
  const { 
    purchase_date, 
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

    // Check duplicate invoice
    const [existing] = await connection.query(
      'SELECT id FROM purchases WHERE invoice_no = ?',
      [invoice_no]
    );

    if (existing.length > 0) {
      await connection.rollback();
      return res.status(400).json({ 
        error: 'Invoice number already exists. Please use a unique invoice number.' 
      });
    }

    const paymentState = calculatePaymentState(paid_amount, total_with_vat);
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
      (invoice_no, purchase_date, supplier_id, bill_amount, subtotal, vat_amount, 
       total_with_vat, vat_rate, paid_amount, balance_amount, balance_status, 
       payment_method, check_number, remarks, prepared_by, company_id, payment_status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoice_no, purchase_date, supplier_id, total_with_vat, subtotal, vat_amount, 
       total_with_vat, vat_rate, normalizedPaidAmount, normalizedBalanceAmount, normalizedBalanceStatus, 
       payment_method, check_number, remarks, resolvedPreparedBy, company_id, normalizedPaymentStatus]
    );
    
    const purchaseId = purchaseResult.insertId;

    // If payment was made, record in payment history
    if (normalizedPaidAmount > 0) {
      await connection.query(
        `INSERT INTO payment_history 
        (purchase_id, payment_date, amount, payment_method, check_number, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [purchaseId, purchase_date, normalizedPaidAmount, payment_method, check_number, 'Initial payment', resolvedPreparedBy]
      );
    }

    // Insert purchase items
    for (const item of items) {
      await connection.query(
        `INSERT INTO purchase_items 
        (purchase_id, item_name, quantity, unit_price, item_id) 
        VALUES (?, ?, ?, ?, ?)`,
        [purchaseId, item.item_name, item.quantity, item.unit_price, item.item_id]
      );
    }

    await connection.commit();
    
    res.status(201).json({ 
      message: 'Purchase created successfully!', 
      invoice_no,
      purchase_id: purchaseId,
      payment_status: normalizedPaymentStatus,
      paid_amount: normalizedPaidAmount,
      balance_amount: normalizedBalanceAmount
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Error creating purchase:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
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
const getAllPurchases = async (req, res) => {
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
        DATEDIFF(CURDATE(), p.purchase_date) AS days_ago
      FROM purchases p
      JOIN supplier s ON p.supplier_id = s.id
      JOIN company c ON p.company_id = c.id
      WHERE p.deleted = FALSE OR p.deleted IS NULL
      ORDER BY p.purchase_date DESC, p.id DESC
    `);

    for (let purchase of purchases) {
      purchase.invoice_no = purchase.invoice_no ? String(purchase.invoice_no) : 'N/A';
      
      const [payments] = await pool.query(
        `SELECT COUNT(*) as payment_count, COALESCE(SUM(amount), 0) as total_payments
         FROM payment_history 
         WHERE purchase_id = ?`,
        [purchase.id]
      );
      purchase.payment_count = payments[0]?.payment_count || 0;
      purchase.total_payments = payments[0]?.total_payments || 0;

      const [returns] = await pool.query(
        `SELECT COALESCE(SUM(pri.total_amount), 0) as total_returns
         FROM purchase_returns pr
         JOIN purchase_return_items pri ON pr.id = pri.return_id
         WHERE pr.purchase_id = ?`,
        [purchase.id]
      );
      purchase.total_returns = returns[0]?.total_returns || 0;
      
      purchase.subtotal = parseFloat(purchase.subtotal) || 0;
      purchase.vat_amount = parseFloat(purchase.vat_amount) || 0;
      purchase.total_with_vat = parseFloat(purchase.total_with_vat) || 0;
      purchase.paid_amount = parseFloat(purchase.paid_amount) || 0;
      purchase.balance_amount = parseFloat(purchase.balance_amount) || 0;
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
    
    const [payments] = await pool.query(`
      SELECT 
        ph.*,
        u.name AS created_by_name
      FROM payment_history ph
      JOIN users u ON ph.created_by = u.id
      WHERE ph.purchase_id = ?
      ORDER BY ph.payment_date DESC
    `, [id]);

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
    
    const purchaseData = {
      ...purchase[0],
      items: items || [],
      payments: payments || [],
      returns: returns || [],
      summary: {
        total_paid: payments.reduce((sum, p) => sum + parseFloat(p.amount), 0),
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

    const [existing] = await connection.query(
      'SELECT id FROM purchases WHERE invoice_no = ? AND id != ?',
      [invoice_no, id]
    );

    if (existing.length > 0) {
      await connection.rollback();
      return res.status(400).json({ 
        error: 'Invoice number already exists. Please use a unique invoice number.' 
      });
    }

    const resolvedPreparedBy = await resolveUserId(connection, prepared_by, req.user?.id);

    if (!resolvedPreparedBy) {
      await connection.rollback();
      return res.status(400).json({ error: 'No valid user found for purchase audit' });
    }

    const paymentState = calculatePaymentState(paid_amount, total_with_vat);
    const normalizedPaidAmount = paymentState.paid_amount;
    const normalizedBalanceAmount = paymentState.balance_amount;
    const normalizedBalanceStatus = paymentState.balance_status;
    const normalizedPaymentStatus = paymentState.payment_status;

    await connection.query(
      `UPDATE purchases 
       SET invoice_no = ?, purchase_date = ?, supplier_id = ?, bill_amount = ?, subtotal = ?, 
           vat_amount = ?, total_with_vat = ?, vat_rate = ?, paid_amount = ?, 
           balance_amount = ?, balance_status = ?, payment_method = ?, check_number = ?, 
           remarks = ?, prepared_by = ?, company_id = ?, payment_status = ?
       WHERE id = ?`,
      [invoice_no, purchase_date, supplier_id, total_with_vat, subtotal, vat_amount, 
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

    await connection.commit();
    res.json({ 
      message: 'Purchase updated successfully!',
      invoice_no,
      payment_status: normalizedPaymentStatus
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Error updating purchase:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ 
        error: 'Invoice number already exists. Please use a unique invoice number.' 
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
      WHERE p.balance_amount > 0
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
        c.name AS company_name,
        DATEDIFF(CURDATE(), p.purchase_date) AS days_overdue
      FROM purchases p
      LEFT JOIN company c ON p.company_id = c.id
      WHERE p.supplier_id = ?
        AND p.balance_amount > 0
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
    invoice_allocations
  } = req.body;

  const validMethods = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT'];
  const normalizedAllocations = Array.isArray(invoice_allocations) && invoice_allocations.length > 0
    ? invoice_allocations
        .map((allocation) => ({
          purchase_id: allocation.purchase_id || allocation.id,
          amount: parseFloat(allocation.amount) || 0
        }))
        .filter((allocation) => allocation.purchase_id && allocation.amount > 0)
    : (id ? [{ purchase_id: id, amount: parseFloat(amount) || 0 }] : []);

  if (!payment_date) {
    return res.status(400).json({ error: 'Payment date is required' });
  }
  if (!payment_method || !validMethods.includes(payment_method)) {
    return res.status(400).json({ error: 'Payment method is invalid' });
  }
  if (normalizedAllocations.length === 0) {
    return res.status(400).json({ error: 'At least one invoice allocation is required' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const totalAllocatedAmount = normalizedAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    if (totalAllocatedAmount <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Payment amount must be greater than 0' });
    }

    const paymentHistoryPurchaseId = normalizedAllocations[0].purchase_id;
    const resolvedCreatedBy = await resolveUserId(connection, created_by, req.user?.id);

    if (!resolvedCreatedBy) {
      await connection.rollback();
      return res.status(400).json({ error: 'No valid user found for payment audit' });
    }

    let paymentResult;
    try {
      [paymentResult] = await connection.query(
        `INSERT INTO payment_history
           (purchase_id, payment_date, amount, payment_method, check_number, voucher_number, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [paymentHistoryPurchaseId, payment_date, totalAllocatedAmount, payment_method,
         check_number || null, voucher_number || null, notes || null, resolvedCreatedBy]
      );
    } catch (colErr) {
      [paymentResult] = await connection.query(
        `INSERT INTO payment_history
           (purchase_id, payment_date, amount, payment_method, check_number, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [paymentHistoryPurchaseId, payment_date, totalAllocatedAmount, payment_method,
         check_number || null, notes || null, resolvedCreatedBy]
      );
    }

    const paymentHistoryId = paymentResult.insertId;

    let totalApplied = 0;
    for (const allocation of normalizedAllocations) {
      const purchaseId = allocation.purchase_id;
      const amountToApply = allocation.amount;

      const [purchaseRows] = await connection.query(
        'SELECT * FROM purchases WHERE id = ? FOR UPDATE',
        [purchaseId]
      );

      if (purchaseRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: `Purchase ${purchaseId} not found` });
      }

      const currentPurchase = purchaseRows[0];
      if (amountToApply > parseFloat(currentPurchase.balance_amount) + 0.001) {
        await connection.rollback();
        return res.status(400).json({
          error: `Payment amount for invoice ${currentPurchase.invoice_no} cannot exceed balance of ${currentPurchase.balance_amount}`
        });
      }

      const newPaidAmount = parseFloat(currentPurchase.paid_amount || 0) + amountToApply;
      const newBalanceAmount = Math.max(0, parseFloat(currentPurchase.total_with_vat || 0) - newPaidAmount);
      let newPaymentStatus = 'Non-Paid';
      if (newBalanceAmount <= 0) newPaymentStatus = 'Paid';
      else if (newPaidAmount > 0) newPaymentStatus = 'Partially Paid';

      await connection.query(
        `UPDATE purchases
           SET paid_amount = ?, balance_amount = ?, balance_status = ?, payment_status = ?
         WHERE id = ?`,
        [newPaidAmount, newBalanceAmount, newBalanceAmount > 0 ? 1 : 0, newPaymentStatus, purchaseId]
      );

      await connection.query(
        `INSERT INTO purchase_payment_allocations (payment_history_id, purchase_id, allocated_amount)
         VALUES (?, ?, ?)`,
        [paymentHistoryId, purchaseId, amountToApply]
      );

      totalApplied += amountToApply;
    }

    await connection.commit();

    res.json({
      message: 'Payment recorded successfully!',
      payment_id: paymentHistoryId,
      amount: totalAllocatedAmount,
      applied_amount: totalApplied,
      invoice_count: normalizedAllocations.length
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error processing payment:', error);
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
        u.name AS created_by_name
      FROM payment_history ph
      JOIN users u ON ph.created_by = u.id
      WHERE ph.purchase_id = ?
      ORDER BY ph.payment_date DESC, ph.created_at DESC
    `, [id]);

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
      const settlementAmount = parseFloat(settlement.amount) || 0;
      if (settlementAmount <= 0) continue;
      
      const [purchase] = await connection.query(
        `SELECT balance_amount, paid_amount, total_with_vat FROM purchases WHERE id = ?`,
        [settlement.purchase_id]
      );

      if (purchase.length > 0) {
        const currentBalance = parseFloat(purchase[0].balance_amount) || 0;
        const currentPaid = parseFloat(purchase[0].paid_amount) || 0;
        
        const newBalance = currentBalance - settlementAmount;
        const newPaid = currentPaid + settlementAmount;
        const newBalanceStatus = newBalance > 0 ? 1 : 0;

        let paymentStatus = 'Non-Paid';
        if (newPaid >= purchase[0].total_with_vat) {
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

        await connection.query(
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

module.exports = {
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
  getPendingInvoicesBySupplier
};