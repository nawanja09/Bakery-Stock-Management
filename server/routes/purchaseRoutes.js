// server/routes/purchaseRoutes.js

const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchaseController');

router.post('/', purchaseController.createPurchase);
router.get('/', purchaseController.getAllPurchases);
router.get('/suppliers', purchaseController.getAllSuppliers);
router.get('/companies', purchaseController.getAllCompanies);
router.get('/previous-prices', purchaseController.getPreviousPurchasePrices); // Add this line
router.get('/:id', purchaseController.getPurchaseById);
router.put('/:id', purchaseController.updatePurchase);// server/routes/purchaseRoutes.js - Add this route

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


module.exports = router;