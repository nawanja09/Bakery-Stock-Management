const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Generate unique return number
const generateReturnNumber = () => {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `PR${year}${month}${day}-${random}`;
};

// GET purchases for dropdown (with items)
router.get('/purchases', async (req, res) => {
  try {
    const [purchases] = await pool.query(`
      SELECT 
        p.id,
        p.invoice_no,
        p.purchase_date,
        s.id as supplier_id,
        s.name as supplier_name,
        s.vat_registered,
        p.total_with_vat as total_amount
      FROM purchases p
      JOIN supplier s ON p.supplier_id = s.id
      ORDER BY p.purchase_date DESC
    `);
    res.json(purchases);
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET purchase items by purchase ID (for return form)
router.get('/purchases/:purchaseId/items', async (req, res) => {
  const { purchaseId } = req.params;
  
  try {
    // Get purchase details with supplier VAT info
    const [purchase] = await pool.query(`
      SELECT 
        p.id,
        p.invoice_no,
        s.vat_registered as supplier_vat_registered,
        s.vat_number as supplier_vat_number
      FROM purchases p
      JOIN supplier s ON p.supplier_id = s.id
      WHERE p.id = ?
    `, [purchaseId]);

    if (purchase.length === 0) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    // Get purchase items with their details
    const [items] = await pool.query(`
      SELECT 
        pi.id as purchase_item_id,
        pi.item_id,
        pi.item_name,
        pi.quantity as purchased_quantity,
        pi.unit_price,
        i.vat_applicable,
        i.unit,
        (SELECT COALESCE(SUM(quantity), 0) 
         FROM purchase_return_items 
         WHERE purchase_item_id = pi.id) as returned_quantity
      FROM purchase_items pi
      JOIN items i ON pi.item_id = i.id
      WHERE pi.purchase_id = ?
    `, [purchaseId]);

    // Calculate available quantity for return
    const itemsWithAvailable = items.map(item => ({
      ...item,
      purchased_quantity: parseFloat(item.purchased_quantity),
      returned_quantity: parseFloat(item.returned_quantity),
      available_quantity: parseFloat(item.purchased_quantity) - parseFloat(item.returned_quantity),
      return_quantity: 0
    }));

    res.json({
      purchase: purchase[0],
      items: itemsWithAvailable
    });
  } catch (error) {
    console.error('Error fetching purchase items:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST create new purchase return
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      return_number,  // Now coming from user
      purchase_id,
      supplier_id,
      return_date,
      items,
      remarks,
      returned_by
    } = req.body;

    // Validate return number
    if (!return_number || return_number.trim() === '') {
      await connection.rollback();
      return res.status(400).json({ error: 'Return number is required' });
    }

    // Check if return number already exists
    const [existingReturn] = await connection.query(
      'SELECT id FROM purchase_returns WHERE return_number = ?',
      [return_number]
    );

    if (existingReturn.length > 0) {
      await connection.rollback();
      return res.status(400).json({ 
        error: 'Return number already exists. Please use a unique return number.' 
      });
    }

    // Validate items
    if (!items || items.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'At least one item is required' });
    }

    // Check if any item has invalid return quantity
    for (const item of items) {
      if (item.return_quantity <= 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'Return quantity must be greater than 0' });
      }

      // Get available quantity
      const [purchaseItem] = await connection.query(`
        SELECT quantity, 
          (SELECT COALESCE(SUM(quantity), 0) 
           FROM purchase_return_items 
           WHERE purchase_item_id = ?) as returned_qty
        FROM purchase_items 
        WHERE id = ?
      `, [item.purchase_item_id, item.purchase_item_id]);

      const purchasedQty = parseFloat(purchaseItem[0].quantity);
      const returnedQty = parseFloat(purchaseItem[0].returned_qty);
      const availableQty = purchasedQty - returnedQty;

      if (item.return_quantity > availableQty) {
        await connection.rollback();
        return res.status(400).json({ 
          error: `Return quantity for ${item.item_name} cannot exceed ${availableQty} (Available for return)` 
        });
      }
    }

    // Get supplier VAT status
    const [supplier] = await connection.query(
      'SELECT vat_registered FROM supplier WHERE id = ?',
      [supplier_id]
    );
    const supplierVatRegistered = supplier[0]?.vat_registered || false;
    const VAT_RATE = 18; // 18%

    // Calculate totals
    let subtotal = 0;
    let totalVat = 0;

    items.forEach(item => {
      const amount = item.return_quantity * item.unit_price;
      subtotal += amount;
      
      if (supplierVatRegistered && item.vat_applicable) {
        totalVat += amount * (VAT_RATE / 100);
      }
    });

    const totalAmount = subtotal + totalVat;

    // Insert purchase return with user-provided return number
    const [returnResult] = await connection.query(
      `INSERT INTO purchase_returns 
       (return_number, return_date, purchase_id, supplier_id, subtotal, vat_amount, total_amount, remarks, returned_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [return_number, return_date, purchase_id, supplier_id, subtotal, totalVat, totalAmount, remarks, returned_by]
    );

    const returnId = returnResult.insertId;

    // Insert return items
    for (const item of items) {
      if (item.return_quantity <= 0) continue;

      const amount = item.return_quantity * item.unit_price;
      const vatAmount = (supplierVatRegistered && item.vat_applicable) ? 
        amount * (VAT_RATE / 100) : 0;
      const itemTotal = amount + vatAmount;

      await connection.query(
        `INSERT INTO purchase_return_items 
         (return_id, purchase_item_id, item_id, item_name, quantity, unit_price, vat_applicable, vat_amount, total_amount) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [returnId, item.purchase_item_id, item.item_id, item.item_name, 
         item.return_quantity, item.unit_price, item.vat_applicable, vatAmount, itemTotal]
      );
    }

    await connection.commit();

    res.status(201).json({
      message: 'Purchase return created successfully',
      return_number: return_number,
      return_id: returnId,
      summary: { subtotal, vat_amount: totalVat, total_amount: totalAmount }
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error creating purchase return:', error);
    
    // Handle duplicate entry error specifically
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ 
        error: 'Return number already exists. Please use a unique return number.' 
      });
    }
    
    res.status(500).json({ error: 'Server error: ' + error.message });
  } finally {
    connection.release();
  }
});

// GET all purchase returns (for history page)
router.get('/', async (req, res) => {
  try {
    const [returns] = await pool.query(`
      SELECT 
        pr.*,
        p.invoice_no as purchase_invoice,
        s.name as supplier_name
      FROM purchase_returns pr
      JOIN purchases p ON pr.purchase_id = p.id
      JOIN supplier s ON pr.supplier_id = s.id
      ORDER BY pr.return_date DESC
    `);
    res.json(returns);
  } catch (error) {
    console.error('Error fetching returns:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET single purchase return by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Get return header
    const [returnHeader] = await pool.query(`
      SELECT 
        pr.*,
        p.invoice_no as purchase_invoice,
        p.purchase_date as original_purchase_date,
        s.name as supplier_name,
        s.vat_registered as supplier_vat_registered,
        s.vat_number as supplier_vat_number,
        u.name as returned_by_name
      FROM purchase_returns pr
      JOIN purchases p ON pr.purchase_id = p.id
      JOIN supplier s ON pr.supplier_id = s.id
      JOIN users u ON pr.returned_by = u.id
      WHERE pr.id = ?
    `, [id]);

    if (returnHeader.length === 0) {
      return res.status(404).json({ error: 'Return not found' });
    }

    // Get return items
    const [items] = await pool.query(`
      SELECT 
        pri.*,
        i.unit,
        i.item_code
      FROM purchase_return_items pri
      JOIN items i ON pri.item_id = i.id
      WHERE pri.return_id = ?
    `, [id]);

    res.json({
      ...returnHeader[0],
      items
    });

  } catch (error) {
    console.error('Error fetching return:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET Purchase Returns for VAT Report
router.get('/reports/vat-returns', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let query = `
      SELECT 
        pr.return_number as return_bill_no,
        pr.return_date as return_date,
        pr.total_amount as total_amount,
        pr.vat_amount as vat_amount,
        pr.subtotal as subtotal,
        s.vat_number as supplier_vat_number,
        s.name as supplier_name,
        s.vat_registered,
        p.invoice_no as original_invoice_no,
        p.purchase_date as original_purchase_date,
        GROUP_CONCAT(
          CONCAT(pri.item_name, ' (', pri.quantity, ' ', i.unit, ')') 
          SEPARATOR ', '
        ) as items_returned
      FROM purchase_returns pr
      JOIN supplier s ON pr.supplier_id = s.id
      JOIN purchases p ON pr.purchase_id = p.id
      JOIN purchase_return_items pri ON pr.id = pri.return_id
      JOIN items i ON pri.item_id = i.id
      WHERE s.vat_registered = 1 
        AND pr.vat_amount > 0
    `;

    const queryParams = [];

    if (startDate && endDate) {
      query += ` AND DATE(pr.return_date) BETWEEN ? AND ?`;
      queryParams.push(startDate, endDate);
    }

    query += ` GROUP BY pr.id ORDER BY pr.return_date DESC`;

    const [returns] = await pool.query(query, queryParams);

    // Format the data for the report
    const formattedReturns = returns.map((ret, index) => ({
      serial_no: index + 1,
      tin_no: ret.supplier_vat_number || '',
      invoice_date: ret.original_purchase_date,
      invoice_no: ret.original_invoice_no,
      return_bill_no: ret.return_bill_no,
      return_date: ret.return_date,
      tax_credit_no: `R${ret.return_bill_no}`, // Generate credit note number
      value_of_return: parseFloat(ret.subtotal).toFixed(2),
      vat_amount: parseFloat(ret.vat_amount).toFixed(2),
      supplier_name: ret.supplier_name,
      items: ret.items_returned
    }));

    res.json(formattedReturns);
  } catch (error) {
    console.error('Error generating VAT returns report:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET Summary for VAT Report
router.get('/reports/vat-summary', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let query = `
      SELECT 
        COALESCE(SUM(pr.subtotal), 0) as total_return_value,
        COALESCE(SUM(pr.vat_amount), 0) as total_vat_credit,
        COUNT(DISTINCT pr.id) as total_returns
      FROM purchase_returns pr
      JOIN supplier s ON pr.supplier_id = s.id
      WHERE s.vat_registered = 1 
        AND pr.vat_amount > 0
    `;

    const queryParams = [];

    if (startDate && endDate) {
      query += ` AND DATE(pr.return_date) BETWEEN ? AND ?`;
      queryParams.push(startDate, endDate);
    }

    const [summary] = await pool.query(query, queryParams);

    res.json({
      total_return_value: parseFloat(summary[0].total_return_value).toFixed(2),
      total_vat_credit: parseFloat(summary[0].total_vat_credit).toFixed(2),
      total_returns: summary[0].total_returns
    });
  } catch (error) {
    console.error('Error generating VAT summary:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;