// routes/purchaseReturnRoutes.js
const express = require('express');
const router = express.Router();
const purchaseReturnController = require('../controllers/purchaseReturnController');

// =============================================
// STOCK ROUTES (MUST COME BEFORE PARAMETER ROUTES)
// =============================================
router.get('/stock/current', purchaseReturnController.getCurrentStock);
router.get('/stock/item/:itemId', purchaseReturnController.getItemStock);

// =============================================
// VAT ROUTES
// =============================================
router.get('/vat/returns', purchaseReturnController.getVATReturns);
router.get('/vat/summary', purchaseReturnController.getVATSummary);

// =============================================
// PURCHASE RETURNS ROUTES
// =============================================
// Get all purchase returns
router.get('/', purchaseReturnController.getAllPurchaseReturns);

// Get purchases for return selection
router.get('/purchases', purchaseReturnController.getPurchasesForReturn);

// Get purchase items for return by purchase ID
router.get('/purchases/:purchaseId/items', purchaseReturnController.getPurchaseItemsForReturn);

// Get supplier bills with balance
router.get('/supplier/:supplierId/bills', purchaseReturnController.getSupplierBillsWithBalance);

// Get purchase returns for a specific bill
router.get('/bill/:id', purchaseReturnController.getPurchaseReturnsForBill);

// Get purchase return by return number (MUST come before /:id)
router.get('/number/:returnNumber', purchaseReturnController.getPurchaseReturnByNumber);

// Get purchase return by ID (MUST come LAST)
router.get('/:id', purchaseReturnController.getPurchaseReturnById);

// Create new purchase return
router.post('/', purchaseReturnController.createPurchaseReturn);

module.exports = router;