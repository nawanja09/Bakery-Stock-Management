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

    // Determine payment status
    let payment_status = 'Non-Paid';
    if (paid_amount >= total_with_vat) {
      payment_status = 'Paid';
    } else if (paid_amount > 0) {
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

    // Insert purchase items and update stock for auto-add items
    for (const item of items) {
      await connection.query(
        `INSERT INTO purchase_items 
        (purchase_id, item_name, quantity, unit_price, item_id) 
        VALUES (?, ?, ?, ?, ?)`,
        [purchaseId, item.item_name, item.quantity, item.unit_price, item.item_id]
      );

      // Check if item has auto_add_to_stock enabled
      const [itemData] = await connection.query(
        'SELECT auto_add_to_stock FROM items WHERE id = ?',
        [item.item_id]
      );

      if (itemData[0]?.auto_add_to_stock) {
        // Update opening_balances
        await connection.query(
          `INSERT INTO opening_balances (date, item_id, quantity, created_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON DUPLICATE KEY UPDATE 
           quantity = quantity + VALUES(quantity)`,
          [purchase_date, item.item_id, item.quantity]
        );
      }
    }

    await connection.commit();
    
    res.status(201).json({ 
      message: 'Purchase created successfully!', 
      invoice_no,
      purchase_id: purchaseId,
      payment_status
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
        p.*, 
        s.name AS supplier_name,
        s.vat_number AS supplier_vat_number,
        c.name AS company_name
      FROM purchases p
      JOIN supplier s ON p.supplier_id = s.id
      JOIN company c ON p.company_id = c.id
      ORDER BY p.purchase_date DESC
    `);

    const purchasesWithItems = await Promise.all(
      purchases.map(async (purchase) => {
        const [items] = await pool.query(
          `SELECT * FROM purchase_items WHERE purchase_id = ?`,
          [purchase.id]
        );
        
        return {
          ...purchase,
          items
        };
      })
    );

    res.json(purchasesWithItems);
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ error: 'Server error' });
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
        i.auto_add_to_stock,  -- Include auto-add status
        i.name as item_master_name
      FROM purchase_items pi
      LEFT JOIN items i ON pi.item_id = i.id
      WHERE pi.purchase_id = ?
    `, [id]);
    
    const purchaseData = {
      ...purchase[0],
      items: items || []
    };
    
    res.json(purchaseData);
    
  } catch (error) {
    console.error('Error fetching purchase:', error);
    res.status(500).json({ error: 'Server error' });
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

  if (!invoice_no || invoice_no.trim() === '') {
    return res.status(400).json({ error: 'Invoice number is required' });
  }

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' });
  }

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

    await connection.query(
      `UPDATE purchases 
       SET invoice_no = ?, purchase_date = ?, supplier_id = ?, bill_amount = ?, subtotal = ?, 
           vat_amount = ?, total_with_vat = ?, vat_rate = ?, paid_amount = ?, 
           balance_amount = ?, balance_status = ?, payment_method = ?, check_number = ?, 
           remarks = ?, prepared_by = ?, company_id = ?
       WHERE id = ?`,
      [invoice_no, purchase_date, supplier_id, total_with_vat, subtotal, vat_amount, 
       total_with_vat, vat_rate, paid_amount, balance_amount, balance_status, 
       payment_method, check_number, remarks, prepared_by, company_id, id]
    );

    await connection.query(
      `DELETE FROM purchase_items WHERE purchase_id = ?`,
      [id]
    );

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
      invoice_no
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

//Get Non-Paid Purchases
const getNonPaidPurchases = async (req, res) => {
  try {
    const [purchases] = await pool.query(`
      SELECT 
        p.*, 
        s.name AS supplier_name,
        s.vat_number AS supplier_vat_number,
        c.name AS company_name,
        DATEDIFF(CURDATE(), p.purchase_date) AS days_overdue
      FROM purchases p
      JOIN supplier s ON p.supplier_id = s.id
      JOIN company c ON p.company_id = c.id
      WHERE p.payment_status IN ('Non-Paid', 'Partially Paid')
        AND p.balance_amount > 0
      ORDER BY 
        CASE p.payment_status 
          WHEN 'Non-Paid' THEN 1 
          WHEN 'Partially Paid' THEN 2 
        END,
        p.purchase_date ASC
    `);

    // Get payment history summary for each purchase
    for (let purchase of purchases) {
      const [payments] = await pool.query(
        `SELECT COUNT(*) as payment_count, SUM(amount) as total_paid
         FROM payment_history 
         WHERE purchase_id = ?`,
        [purchase.id]
      );
      
      purchase.payment_count = payments[0].payment_count || 0;
      purchase.total_paid_history = payments[0].total_paid || 0;
    }

    res.json(purchases);
  } catch (error) {
    console.error('Error fetching non-paid purchases:', error);
    res.status(500).json({ error: 'Server error' });
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
    const newPaidAmount = parseFloat(currentPurchase.paid_amount) + parseFloat(amount);
    const newBalanceAmount = parseFloat(currentPurchase.total_with_vat) - newPaidAmount;
    
    // Determine new payment status
    let newPaymentStatus = currentPurchase.payment_status;
    if (newBalanceAmount <= 0) {
      newPaymentStatus = 'Paid';
    } else if (newPaidAmount > 0) {
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
      payment_status: newPaymentStatus
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
  updatePaymentStatuses
};