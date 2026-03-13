const pool = require('../config/db');

// Create new purchase
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

  // Validate required fields
  if (!invoice_no || invoice_no.trim() === '') {
    return res.status(400).json({ error: 'Invoice number is required' });
  }

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' });
  }

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Check if invoice number already exists
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

    // Insert purchase
    const [purchaseResult] = await connection.query(
      `INSERT INTO purchases 
      (invoice_no, purchase_date, supplier_id, bill_amount, subtotal, vat_amount, 
       total_with_vat, vat_rate, paid_amount, balance_amount, balance_status, 
       payment_method, check_number, remarks, prepared_by, company_id) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoice_no, purchase_date, supplier_id, total_with_vat, subtotal, vat_amount, 
       total_with_vat, vat_rate, paid_amount, balance_amount, balance_status, 
       payment_method, check_number, remarks, prepared_by, company_id]
    );
    
    const purchaseId = purchaseResult.insertId;

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
      purchase_id: purchaseId
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Error creating purchase:', error);
    
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

module.exports = {
  createPurchase,
  getAllPurchases,
  getPurchaseById,
  updatePurchase,
  getAllSuppliers,
  getAllCompanies,
  getPreviousPurchasePrices
};