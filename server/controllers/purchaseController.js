const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Create new purchase with VAT
const createPurchase = async (req, res) => {
  const { 
    purchase_date, 
    supplier_id, 
    items, 
    subtotal,
    vat_amount,
    total_with_vat,
    vat_rate,
    paid_amount, 
    payment_method, 
    check_number,
    remarks, 
    prepared_by,
    company_id
  } = req.body;

  const invoice_no = `PUR-${uuidv4().substr(0, 8).toUpperCase()}`;
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Insert purchase with VAT fields
    const [purchaseResult] = await connection.query(
      `INSERT INTO purchases 
      (invoice_no, purchase_date, supplier_id, bill_amount, subtotal, vat_amount, 
       total_with_vat, vat_rate, paid_amount, payment_method, check_number, remarks, 
       prepared_by, company_id) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoice_no, purchase_date, supplier_id, total_with_vat, subtotal, vat_amount, 
       total_with_vat, vat_rate, paid_amount, payment_method, check_number, remarks, 
       prepared_by, company_id]
    );
    
    const purchaseId = purchaseResult.insertId;

    // Insert purchase items
    for (const item of items) {
      await connection.query(
        `INSERT INTO purchase_items 
        (purchase_id, item_name, quantity, unit_price, item_id) 
        VALUES (?, ?, ?, ?, ?)`,
        [purchaseId, item.item_name, item.quantity, item.unit_price, item.id]
      );
    }

    await connection.commit();
    res.status(201).json({ 
      message: 'Purchase created successfully!', 
      invoice_no,
      purchase_id: purchaseId,
      summary: {
        subtotal,
        vat_amount,
        total_with_vat
      }
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Error creating purchase:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

// Get all purchases (updated to include VAT fields)
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

    // Get items for each purchase
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

// Get purchase by ID with full details
const getPurchaseById = async (req, res) => {
  const { id } = req.params;
  
  try {
    // Get purchase details with supplier and company info
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
    
    // Get purchase items with item details
    const [items] = await pool.query(`
      SELECT 
        pi.*,
        i.item_code,
        i.unit,
        i.vat_applicable
      FROM purchase_items pi
      LEFT JOIN items i ON pi.item_id = i.id
      WHERE pi.purchase_id = ?
    `, [id]);
    
    // Combine data
    const purchaseData = {
      ...purchase[0],
      items: items
    };
    
    res.json(purchaseData);
    
  } catch (error) {
    console.error('Error fetching purchase:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Update purchase with VAT
const updatePurchase = async (req, res) => {
  const { id } = req.params;
  const { 
    purchase_date, 
    supplier_id, 
    items, 
    subtotal,
    vat_amount,
    total_with_vat,
    vat_rate,
    paid_amount, 
    payment_method, 
    check_number,
    remarks, 
    prepared_by,
    company_id
  } = req.body;

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Update purchase with VAT fields
    await connection.query(
      `UPDATE purchases 
       SET purchase_date = ?, supplier_id = ?, bill_amount = ?, subtotal = ?, 
           vat_amount = ?, total_with_vat = ?, vat_rate = ?, paid_amount = ?, 
           payment_method = ?, check_number = ?, remarks = ?, prepared_by = ?, 
           company_id = ?
       WHERE id = ?`,
      [purchase_date, supplier_id, total_with_vat, subtotal, vat_amount, 
       total_with_vat, vat_rate, paid_amount, payment_method, check_number, 
       remarks, prepared_by, company_id, id]
    );

    // Delete existing items
    await connection.query(
      `DELETE FROM purchase_items WHERE purchase_id = ?`,
      [id]
    );

    // Insert updated items
    for (const item of items) {
      await connection.query(
        `INSERT INTO purchase_items 
        (purchase_id, item_name, quantity, unit_price, item_id) 
        VALUES (?, ?, ?, ?, ?)`,
        [id, item.item_name, item.quantity, item.unit_price, item.id]
      );
    }

    await connection.commit();
    res.json({ 
      message: 'Purchase updated successfully!',
      summary: {
        subtotal,
        vat_amount,
        total_with_vat
      }
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Error updating purchase:', error);
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
    const [rows] = await pool.query('SELECT id, name FROM supplier');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get previous purchase prices for all items

/*
const getPreviousPurchasePrices = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        i.id AS item_id,
        i.name AS item_name,
        i.item_code,
        (
          SELECT pi.unit_price 
          FROM purchase_items pi
          JOIN purchases p ON pi.purchase_id = p.id
          WHERE pi.item_id = i.id
          ORDER BY p.purchase_date DESC, pi.id DESC 
          LIMIT 1
        ) AS previous_unit_price
      FROM items i
      WHERE EXISTS (
        SELECT 1 FROM purchase_items pi WHERE pi.item_id = i.id
      )
    `);

    // Convert to object format for easy lookup
    const priceMap = {};
    rows.forEach(row => {
      if (row.previous_unit_price) {
        priceMap[row.item_id] = parseFloat(row.previous_unit_price);
      }
    });

    res.json(priceMap);
  } catch (error) {
    console.error('Error fetching previous purchase prices:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
*/

const getPreviousPurchasePrices = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        i.id AS item_id,
        i.name AS item_name,
        i.item_code,
        (
          SELECT pi.unit_price 
          FROM purchase_items pi
          JOIN purchases p ON pi.purchase_id = p.id
          WHERE pi.item_id = i.id
          AND p.purchase_date >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)
          ORDER BY p.purchase_date DESC, pi.id DESC 
          LIMIT 1
        ) AS previous_unit_price
      FROM items i
    `);

    // Convert to object format for easy lookup
    const priceMap = {};
    rows.forEach(row => {
      if (row.previous_unit_price) {
        priceMap[row.item_id] = parseFloat(row.previous_unit_price);
      } else {
        priceMap[row.item_id] = 0; // Default value if no previous price
      }
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