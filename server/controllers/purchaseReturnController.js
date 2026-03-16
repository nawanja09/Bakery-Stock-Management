// controllers/purchaseReturnController.js
const pool = require('../config/db');

// Get all purchases for return selection
const getPurchasesForReturn = async (req, res) => {
  try {
    const [purchases] = await pool.query(`
      SELECT 
        p.id,
        p.invoice_no,
        p.purchase_date,
        p.total_with_vat AS total_amount,
        s.id AS supplier_id,
        s.name AS supplier_name,
        s.vat_registered
      FROM purchases p
      JOIN supplier s ON p.supplier_id = s.id
      ORDER BY p.purchase_date DESC
    `);

    res.json(purchases);
  } catch (error) {
    console.error('Error fetching purchases for return:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get purchase items for return with available quantities
const getPurchaseItemsForReturn = async (req, res) => {
  const { purchaseId } = req.params;

  try {
    // Get purchase details
    const [purchase] = await pool.query(`
      SELECT 
        p.*,
        s.vat_registered AS supplier_vat_registered,
        s.name AS supplier_name
      FROM purchases p
      JOIN supplier s ON p.supplier_id = s.id
      WHERE p.id = ?
    `, [purchaseId]);

    if (purchase.length === 0) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    // Get purchase items with already returned quantities
    const [items] = await pool.query(`
      SELECT 
        pi.id AS purchase_item_id,
        pi.item_id,
        pi.item_name,
        pi.quantity AS purchased_quantity,
        pi.unit_price,
        i.unit,
        i.vat_applicable,
        COALESCE((
          SELECT SUM(pri.quantity)
          FROM purchase_return_items pri
          JOIN purchase_returns pr ON pri.return_id = pr.id
          WHERE pri.purchase_item_id = pi.id
        ), 0) AS returned_quantity
      FROM purchase_items pi
      JOIN items i ON pi.item_id = i.id
      WHERE pi.purchase_id = ?
    `, [purchaseId]);

    // Calculate available quantity for return
    const itemsWithAvailability = items.map(item => ({
      ...item,
      available_quantity: parseFloat(item.purchased_quantity) - parseFloat(item.returned_quantity || 0),
      unit_price: parseFloat(item.unit_price)
    }));

    res.json({
      purchase: purchase[0],
      items: itemsWithAvailability
    });
  } catch (error) {
    console.error('Error fetching purchase items for return:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get supplier bills with available balance for settlement
const getSupplierBillsWithBalance = async (req, res) => {
  const { supplierId } = req.params;

  try {
    const [bills] = await pool.query(`
      SELECT 
        p.id,
        p.invoice_no,
        p.purchase_date,
        p.total_with_vat,
        p.paid_amount,
        p.balance_amount,
        p.balance_status
      FROM purchases p
      WHERE p.supplier_id = ? 
        AND p.balance_status = 1 
        AND p.balance_amount > 0
      ORDER BY p.purchase_date ASC
    `, [supplierId]);

    res.json(bills);
  } catch (error) {
    console.error('Error fetching supplier bills:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Create new purchase return with settlement
const createPurchaseReturn = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      return_number,
      purchase_id,
      supplier_id,
      return_date,
      items,
      remarks,
      returned_by,
      settlements
    } = req.body;

    // Calculate totals
    let subtotal = 0;
    let totalVat = 0;
    let totalAmount = 0;

    items.forEach(item => {
      const amount = item.return_quantity * item.unit_price;
      subtotal += amount;
      
      if (item.vat_applicable) {
        const vat = amount * 0.18; // 18% VAT
        totalVat += vat;
        totalAmount += amount + vat;
      } else {
        totalAmount += amount;
      }
    });

    // Calculate settlement amounts
    let settledAmount = 0;
    if (settlements && settlements.length > 0) {
      settledAmount = settlements.reduce((sum, s) => sum + s.amount, 0);
    }

    const balanceAmount = totalAmount - settledAmount;

    // Insert purchase return
    const [returnResult] = await connection.query(
      `INSERT INTO purchase_returns 
      (return_number, return_date, purchase_id, supplier_id, subtotal, vat_amount, 
       total_amount, settled_amount, balance_amount, settlement_details, remarks, returned_by) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        return_number, return_date, purchase_id, supplier_id, 
        subtotal, totalVat, totalAmount, 
        settledAmount, balanceAmount,
        JSON.stringify(settlements || []), remarks, returned_by
      ]
    );

    const returnId = returnResult.insertId;

    // Insert return items
    for (const item of items) {
      await connection.query(
        `INSERT INTO purchase_return_items 
        (return_id, purchase_item_id, item_id, item_name, quantity, unit_price, 
         vat_applicable, vat_amount, total_amount) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          returnId, item.purchase_item_id, item.item_id, item.item_name,
          item.return_quantity, item.unit_price, item.vat_applicable,
          item.vat_applicable ? (item.return_quantity * item.unit_price * 0.18) : 0,
          item.vat_applicable ? 
            (item.return_quantity * item.unit_price * 1.18) : 
            (item.return_quantity * item.unit_price)
        ]
      );
    }

    // Update purchase balances if settlements were made
    if (settlements && settlements.length > 0) {
      for (const settlement of settlements) {
        const [purchase] = await connection.query(
          `SELECT balance_amount, paid_amount, total_with_vat 
           FROM purchases WHERE id = ?`,
          [settlement.purchase_id]
        );

        if (purchase.length > 0) {
          const currentBalance = parseFloat(purchase[0].balance_amount);
          const currentPaid = parseFloat(purchase[0].paid_amount);
          
          const newBalance = currentBalance - settlement.amount;
          const newPaid = currentPaid + settlement.amount;
          const newBalanceStatus = newBalance > 0 ? 1 : 0;

          await connection.query(
            `UPDATE purchases 
             SET balance_amount = ?, 
                 paid_amount = ?,
                 balance_status = ?,
                 remarks = CONCAT(IFNULL(remarks, ''), ' | Return settlement: ', ?)
             WHERE id = ?`,
            [
              newBalance, 
              newPaid,
              newBalanceStatus,
              `Return #${return_number} settled Rs. ${settlement.amount}`,
              settlement.purchase_id
            ]
          );
        }
      }
    }

    await connection.commit();
    
    res.status(201).json({
      message: 'Purchase return created successfully!',
      return_number,
      return_id: returnId,
      summary: {
        subtotal,
        vat_amount: totalVat,
        total_amount: totalAmount,
        settled_amount: settledAmount,
        balance_amount: balanceAmount
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error creating purchase return:', error);
    
    // Handle duplicate return number
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ 
        error: 'Return number already exists. Please use a unique return number.' 
      });
    }
    
    res.status(500).json({ error: 'Server error: ' + error.message });
  } finally {
    connection.release();
  }
};

// Get all purchase returns
const getAllPurchaseReturns = async (req, res) => {
  try {
    const [returns] = await pool.query(`
      SELECT 
        pr.*,
        s.name AS supplier_name,
        p.invoice_no AS purchase_invoice
      FROM purchase_returns pr
      JOIN supplier s ON pr.supplier_id = s.id
      JOIN purchases p ON pr.purchase_id = p.id
      ORDER BY pr.return_date DESC, pr.id DESC
    `);

    // Ensure numeric fields are proper numbers
    const formattedReturns = returns.map(ret => ({
      ...ret,
      total_amount: parseFloat(ret.total_amount) || 0,
      settled_amount: parseFloat(ret.settled_amount) || 0,
      balance_amount: parseFloat(ret.balance_amount) || 0,
      subtotal: parseFloat(ret.subtotal) || 0,
      vat_amount: parseFloat(ret.vat_amount) || 0
    }));

    res.json(formattedReturns);
  } catch (error) {
    console.error('Error fetching purchase returns:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get VAT returns data for reporting
const getVATReturns = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const [returns] = await pool.query(`
      SELECT 
        pr.id,
        pr.return_number AS tax_credit_no,
        DATE_FORMAT(pr.return_date, '%Y-%m-%d') AS return_date,
        pr.subtotal AS value_of_return,
        pr.vat_amount,
        pr.total_amount,
        s.name AS supplier_name,
        s.vat_number AS tin_no,
        p.invoice_no AS invoice_no,
        DATE_FORMAT(p.purchase_date, '%Y-%m-%d') AS invoice_date,
        ROW_NUMBER() OVER (ORDER BY pr.return_date, pr.id) AS serial_no
      FROM purchase_returns pr
      JOIN supplier s ON pr.supplier_id = s.id
      JOIN purchases p ON pr.purchase_id = p.id
      WHERE s.vat_registered = 1 
        AND s.vat_number IS NOT NULL 
        AND pr.vat_amount > 0
        AND DATE(pr.return_date) BETWEEN ? AND ?
      ORDER BY pr.return_date ASC, pr.id ASC
    `, [startDate, endDate]);

    // Format the data for VAT report
    const formattedReturns = returns.map((ret, index) => ({
      serial_no: index + 1,
      tin_no: ret.tin_no,
      invoice_date: ret.invoice_date,
      invoice_no: ret.invoice_no,
      tax_credit: 'Credit',
      return_date: ret.return_date,
      tax_credit_no: ret.tax_credit_no,
      value_of_return: parseFloat(ret.value_of_return),
      vat_amount: parseFloat(ret.vat_amount),
      supplier_name: ret.supplier_name,
      total_amount: parseFloat(ret.total_amount)
    }));

    res.json(formattedReturns);
  } catch (error) {
    console.error('Error fetching VAT returns:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get VAT summary
const getVATSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const [summary] = await pool.query(`
      SELECT 
        COUNT(*) AS total_returns,
        COALESCE(SUM(pr.subtotal), 0) AS total_return_value,
        COALESCE(SUM(pr.vat_amount), 0) AS total_vat_credit
      FROM purchase_returns pr
      JOIN supplier s ON pr.supplier_id = s.id
      WHERE s.vat_registered = 1 
        AND s.vat_number IS NOT NULL 
        AND pr.vat_amount > 0
        AND DATE(pr.return_date) BETWEEN ? AND ?
    `, [startDate, endDate]);

    res.json({
      total_returns: summary[0].total_returns || 0,
      total_return_value: parseFloat(summary[0].total_return_value || 0),
      total_vat_credit: parseFloat(summary[0].total_vat_credit || 0)
    });
  } catch (error) {
    console.error('Error fetching VAT summary:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get purchase return by ID with full details
const getPurchaseReturnById = async (req, res) => {
  const { id } = req.params;

  try {
    // First, get the purchase return details
    const [returns] = await pool.query(`
      SELECT 
        pr.*,
        s.name AS supplier_name,
        s.vat_registered AS supplier_vat_registered,
        s.vat_number AS supplier_vat_number,
        p.invoice_no AS purchase_invoice,
        p.purchase_date AS original_purchase_date,
        u.name AS returned_by_name
      FROM purchase_returns pr
      LEFT JOIN supplier s ON pr.supplier_id = s.id
      LEFT JOIN purchases p ON pr.purchase_id = p.id
      LEFT JOIN users u ON pr.returned_by = u.id
      WHERE pr.id = ?
    `, [id]);

    if (returns.length === 0) {
      return res.status(404).json({ error: 'Purchase return not found' });
    }

    const purchaseReturn = returns[0];

    // Handle settlement_details - check if it's already an object or needs parsing
    if (purchaseReturn.settlement_details) {
      // Check if it's already an object (from mysql2's JSON type)
      if (typeof purchaseReturn.settlement_details === 'object') {
        // It's already parsed, use as is
        purchaseReturn.settlement_details = purchaseReturn.settlement_details;
      } else {
        // Try to parse it if it's a string
        try {
          purchaseReturn.settlement_details = JSON.parse(purchaseReturn.settlement_details);
        } catch (e) {
          console.error('Error parsing settlement_details:', e);
          purchaseReturn.settlement_details = [];
        }
      }
    } else {
      purchaseReturn.settlement_details = [];
    }

    // Get return items
    const [items] = await pool.query(`
      SELECT 
        pri.*,
        i.item_code,
        i.unit
      FROM purchase_return_items pri
      LEFT JOIN items i ON pri.item_id = i.id
      WHERE pri.return_id = ?
    `, [id]);

    purchaseReturn.items = items || [];

    res.json(purchaseReturn);
  } catch (error) {
    console.error('Error fetching purchase return:', error);
    res.status(500).json({ 
      error: 'Server error', 
      details: error.message,
      sqlMessage: error.sqlMessage 
    });
  }
};

module.exports = {
  getPurchasesForReturn,
  getPurchaseItemsForReturn,
  getSupplierBillsWithBalance,
  getVATReturns,
  getVATSummary,
  createPurchaseReturn,
  getAllPurchaseReturns,
  getPurchaseReturnById
};