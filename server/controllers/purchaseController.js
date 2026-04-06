const pool = require('../config/db');

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

    // Determine payment status based on paid amount
    let payment_status = 'Non-Paid';
    if (paid_amount >= total_with_vat && total_with_vat > 0) {
      payment_status = 'Paid';
    } else if (paid_amount > 0 && paid_amount < total_with_vat) {
      payment_status = 'Partially Paid';
    }

    // Insert purchase
    const [purchaseResult] = await connection.query(
      `INSERT INTO purchases 
      (invoice_no, purchase_date, supplier_id, bill_amount, subtotal, vat_amount, 
       total_with_vat, vat_rate, paid_amount, balance_amount, balance_status, 
       payment_method, check_number, remarks, prepared_by, company_id, payment_status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoice_no, purchase_date, supplier_id, total_with_vat, subtotal, vat_amount, 
       total_with_vat, vat_rate, paid_amount, balance_amount, balance_status, 
       payment_method, check_number, remarks, prepared_by, company_id, payment_status]
    );
    
    const purchaseId = purchaseResult.insertId;

    // If payment was made, record in payment history
    if (paid_amount > 0) {
      await connection.query(
        `INSERT INTO payment_history 
        (purchase_id, payment_date, amount, payment_method, check_number, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [purchaseId, purchase_date, paid_amount, payment_method, check_number, 'Initial payment', prepared_by]
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
      payment_status,
      paid_amount,
      balance_amount
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
      ORDER BY p.purchase_date DESC, p.id DESC
    `);

    // Get payment counts and return counts for each purchase
    for (let purchase of purchases) {
      // Get payment count and total payments
      const [payments] = await pool.query(
        `SELECT COUNT(*) as payment_count, COALESCE(SUM(amount), 0) as total_payments
         FROM payment_history 
         WHERE purchase_id = ?`,
        [purchase.id]
      );
      purchase.payment_count = payments[0]?.payment_count || 0;
      purchase.total_payments = payments[0]?.total_payments || 0;

      // 🔥 FIXED: Get return total - specify table alias for total_amount
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
    
    const [payments] = await pool.query(`
      SELECT 
        ph.*,
        u.name AS created_by_name
      FROM payment_history ph
      JOIN users u ON ph.created_by = u.id
      WHERE ph.purchase_id = ?
      ORDER BY ph.payment_date DESC
    `, [id]);

    // 🔥 FIXED: Specify table alias for total_amount
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

    // Check duplicate invoice
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

    // Determine payment status
    let payment_status = 'Non-Paid';
    if (paid_amount >= total_with_vat && total_with_vat > 0) {
      payment_status = 'Paid';
    } else if (paid_amount > 0 && paid_amount < total_with_vat) {
      payment_status = 'Partially Paid';
    }

    // Update purchase
    await connection.query(
      `UPDATE purchases 
       SET invoice_no = ?, purchase_date = ?, supplier_id = ?, bill_amount = ?, subtotal = ?, 
           vat_amount = ?, total_with_vat = ?, vat_rate = ?, paid_amount = ?, 
           balance_amount = ?, balance_status = ?, payment_method = ?, check_number = ?, 
           remarks = ?, prepared_by = ?, company_id = ?, payment_status = ?
       WHERE id = ?`,
      [invoice_no, purchase_date, supplier_id, total_with_vat, subtotal, vat_amount, 
       total_with_vat, vat_rate, paid_amount, balance_amount, balance_status, 
       payment_method, check_number, remarks, prepared_by, company_id, payment_status, id]
    );

    // Delete existing items and re-insert
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
      payment_status
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

// =============================================
// GET NON-PAID PURCHASES (Balance > 0 only)
// =============================================
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
      WHERE p.balance_amount > 0  -- Only show bills with balance > 0
        AND p.deleted = FALSE
      ORDER BY 
        CASE 
          WHEN p.payment_status = 'Non-Paid' THEN 1 
          WHEN p.payment_status = 'Partially Paid' THEN 2 
        END,
        p.purchase_date ASC
    `);

    // Get payment history summary for each purchase
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

//Make Payment for a Purchase
const makePayment = async (req, res) => {
  const { id } = req.params;
  const { 
    payment_date, 
    amount, 
    payment_method, 
    check_number,
    notes,
    created_by 
  } = req.body;

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Get current purchase details
    const [purchase] = await connection.query(
      'SELECT * FROM purchases WHERE id = ?',
      [id]
    );

    if (purchase.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Purchase not found' });
    }

    const currentPurchase = purchase[0];
    
    // Validate payment amount
    if (amount <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Payment amount must be greater than 0' });
    }
    
    if (amount > currentPurchase.balance_amount) {
      await connection.rollback();
      return res.status(400).json({ 
        error: `Payment amount cannot exceed balance of ${currentPurchase.balance_amount}` 
      });
    }
    
    const newPaidAmount = parseFloat(currentPurchase.paid_amount) + parseFloat(amount);
    const newBalanceAmount = parseFloat(currentPurchase.total_with_vat) - newPaidAmount;
    
    // Determine new payment status
    let newPaymentStatus = currentPurchase.payment_status;
    if (newBalanceAmount <= 0) {
      newPaymentStatus = 'Paid';
    } else if (newPaidAmount > 0 && newPaidAmount < currentPurchase.total_with_vat) {
      newPaymentStatus = 'Partially Paid';
    }

    // Update purchase
    await connection.query(
      `UPDATE purchases 
       SET paid_amount = ?,
           balance_amount = ?,
           balance_status = ?,
           payment_status = ?
       WHERE id = ?`,
      [newPaidAmount, newBalanceAmount, newBalanceAmount > 0 ? 1 : 0, newPaymentStatus, id]
    );

    // Insert payment history
    const [paymentResult] = await connection.query(
      `INSERT INTO payment_history 
       (purchase_id, payment_date, amount, payment_method, check_number, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, payment_date, amount, payment_method, check_number || null, notes, created_by]
    );

    await connection.commit();
    
    res.json({ 
      message: 'Payment recorded successfully!',
      payment_id: paymentResult.insertId,
      new_balance: newBalanceAmount,
      payment_status: newPaymentStatus,
      amount: amount,
      paid_amount: newPaidAmount,
      balance_amount: newBalanceAmount
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Error processing payment:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  } finally {
    connection.release();
  }
};

//Get Payment History for a Purchase
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

//Update existing purchase with payment status 
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

// =============================================
// GET PURCHASE RETURNS FOR A BILL
// =============================================
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
    
    // Format amounts as numbers
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
  getSupplierBills
};