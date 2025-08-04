//server/controllers/purchaseController.js

const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Create new purchase
const createPurchase = async (req, res) => {
  const { 
    purchase_date, 
    supplier_id, 
    items, 
    bill_amount, 
    paid_amount, 
    payment_method, 
    remarks, 
    prepared_by 
  } = req.body;

  const invoice_no = `PUR-${uuidv4().substr(0, 8).toUpperCase()}`;
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Insert purchase
    const [purchaseResult] = await connection.query(
      `INSERT INTO purchases 
      (invoice_no, purchase_date, supplier_id, bill_amount, paid_amount, payment_method, remarks, prepared_by) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoice_no, purchase_date, supplier_id, bill_amount, paid_amount, payment_method, remarks, prepared_by]
    );
    
    const purchaseId = purchaseResult.insertId;

    // Insert purchase items
    for (const item of items) {
      await connection.query(
        `INSERT INTO purchase_items 
        (purchase_id, item_name, quantity, unit_price) 
        VALUES (?, ?, ?, ?)`,
        [purchaseId, item.item_name, item.quantity, item.unit_price]
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
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

// Get all purchases
const getAllPurchases = async (req, res) => {
  try {
    const [purchases] = await pool.query(`
      SELECT p.*, s.name AS supplier_name 
      FROM purchases p
      JOIN supplier s ON p.supplier_id = s.id
      ORDER BY p.purchase_date DESC
    `);
    res.json(purchases);
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
        s.contact_name,
        s.contact_phone
      FROM purchases p
      JOIN supplier s ON p.supplier_id = s.id
      WHERE p.id = ?
    `, [id]);
    
    if (purchase.length === 0) {
      return res.status(404).json({ error: 'Purchase not found' });
    }
    
    const [items] = await pool.query(
      `SELECT * FROM purchase_items WHERE purchase_id = ?`,
      [id]
    );
    
    res.json({
      ...purchase[0],
      items,
      contact_info: [
        purchase[0].contact_name, 
        purchase[0].contact_phone
      ].filter(Boolean).join(' | ')
    });
    
  } catch (error) {
    console.error('Error fetching purchase:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Add Supplier List 
const getAllSuppliers = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name FROM supplier');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  createPurchase,
  getAllPurchases,
  getPurchaseById,
  getAllSuppliers,
};