// server/routes/purchaseRoutes.js
const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchaseController');
const paymentHistoryController = require('../controllers/paymentHistoryController');
const pool = require('../config/db'); // Add this line to import the database pool

// Existing routes
router.post('/', purchaseController.createPurchase);
router.get('/', purchaseController.getAllPurchases);
router.get('/suppliers', purchaseController.getAllSuppliers);
router.get('/companies', purchaseController.getAllCompanies);
router.get('/previous-prices', purchaseController.getPreviousPurchasePrices);

// Specific routes must come BEFORE parameterized routes
router.get('/non-paid', purchaseController.getNonPaidPurchases);
router.get('/pending/:supplierId', purchaseController.getPendingInvoicesBySupplier);


// Add this route for getting purchase details by ID
router.get('/details/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get purchase details with supplier info
    const [purchases] = await pool.query(`
      SELECT 
        p.id,
        p.invoice_no,
        p.purchase_date,
        p.subtotal,
        p.vat_amount,
        p.total_with_vat,
        p.vat_rate,
        p.paid_amount,
        p.payment_method,
        p.check_number,
        p.remarks,
        p.company_id,
        s.id AS supplier_id,
        s.name AS supplier_name,
        s.vat_number AS supplier_vat_number,
        s.vat_registered,
        s.contact_name,
        s.contact_phone,
        s.contact_email,
        s.address AS supplier_address,
        c.name AS company_name
      FROM purchases p
      JOIN supplier s ON p.supplier_id = s.id
      LEFT JOIN company c ON p.company_id = c.id
      WHERE p.id = ?
    `, [id]);

    if (purchases.length === 0) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    // Get purchase items with item details
    const [items] = await pool.query(`
      SELECT 
        pi.id,
        pi.item_name,
        pi.quantity,
        pi.unit_price,
        i.item_code,
        i.unit,
        i.vat_applicable,
        (pi.quantity * pi.unit_price) AS amount
      FROM purchase_items pi
      LEFT JOIN items i ON pi.item_id = i.id
      WHERE pi.purchase_id = ?
    `, [id]);

    // Calculate line totals with VAT if applicable
    const itemsWithVAT = items.map(item => {
      const amount = parseFloat(item.amount) || 0;
      const vatAmount = item.vat_applicable ? amount * 0.18 : 0;
      return {
        ...item,
        amount,
        vatAmount,
        lineTotal: amount + vatAmount
      };
    });

    const response = {
      ...purchases[0],
      items: itemsWithVAT,
      summary: {
        subtotal: parseFloat(purchases[0].subtotal || 0),
        vatAmount: parseFloat(purchases[0].vat_amount || 0),
        totalWithVat: parseFloat(purchases[0].total_with_vat || 0),
        paidAmount: parseFloat(purchases[0].paid_amount || 0),
        dueAmount: parseFloat(purchases[0].total_with_vat || 0) - parseFloat(purchases[0].paid_amount || 0)
      }
    };

    res.json(response);
    
  } catch (error) {
    console.error('Error fetching purchase details:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get latest purchase prices for all items
router.get('/latest-prices', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        pi.item_id,
        i.name as item_name,
        i.item_code,
        pi.unit_price,
        p.purchase_date
      FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      JOIN items i ON pi.item_id = i.id
      WHERE (pi.item_id, p.purchase_date) IN (
        SELECT 
          item_id, 
          MAX(purchase_date) as latest_date
        FROM purchase_items pi2
        JOIN purchases p2 ON pi2.purchase_id = p2.id
        GROUP BY item_id
      )
      ORDER BY i.name
    `);

    // Convert to object format for easy lookup
    const priceMap = {};
    rows.forEach(row => {
      if (row.unit_price) {
        priceMap[row.item_id] = {
          unit_price: parseFloat(row.unit_price),
          item_name: row.item_name,
          item_code: row.item_code,
          purchase_date: row.purchase_date
        };
      }
    });

    res.json(priceMap);
  } catch (error) {
    console.error('Error fetching latest purchase prices:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get latest purchase prices for all items
router.get('/items/latest-prices', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        pi.item_id,
        i.name as item_name,
        i.item_code,
        pi.unit_price,
        p.purchase_date,
        p.invoice_no
      FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      JOIN items i ON pi.item_id = i.id
      WHERE (pi.item_id, p.purchase_date) IN (
        SELECT 
          item_id, 
          MAX(purchase_date) as latest_date
        FROM purchase_items pi2
        JOIN purchases p2 ON pi2.purchase_id = p2.id
        GROUP BY item_id
      )
      ORDER BY i.name
    `);

    const priceMap = {};
    rows.forEach(row => {
      if (row.unit_price) {
        priceMap[row.item_id] = {
          unit_price: parseFloat(row.unit_price),
          item_name: row.item_name,
          item_code: row.item_code,
          purchase_date: row.purchase_date,
          invoice_no: row.invoice_no
        };
      }
    });

    res.json(priceMap);
  } catch (error) {
    console.error('Error fetching latest purchase prices:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/pay-multiple', purchaseController.makePayment);
router.post('/:id/pay', purchaseController.makePayment);
router.get('/:id/payments', purchaseController.getPaymentHistory);
router.get('/summary', paymentHistoryController.getPaymentSummary);
router.get('/recent', paymentHistoryController.getRecentPayments);
router.post('/update-statuses', purchaseController.updatePaymentStatuses);

router.get('/:id/return', purchaseController.getPurchaseReturnsForBill);

// Parameterized routes must come LAST
router.get('/:id', purchaseController.getPurchaseById);
router.put('/:id', purchaseController.updatePurchase);

// Get supplier bills from last 3 months (MUST come before parameterized routes)
router.get('/supplier/:supplierId/bills', purchaseController.getSupplierBills);

// =============================================
// NEW: Add settlement to existing purchase return
// =============================================
router.post('/:id/settle', purchaseController.addSettlementToReturn);

module.exports = router;