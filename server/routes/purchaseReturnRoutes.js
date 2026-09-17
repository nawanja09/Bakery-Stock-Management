// routes/purchaseReturnRoutes.js
const express = require('express');
const router = express.Router();
const purchaseReturnController = require('../controllers/purchaseReturnController');
const { rawMaterialAccess } = require('../middleware/moduleAccess');

router.use(...rawMaterialAccess);

// =============================================
// STOCK ROUTES (MUST COME BEFORE PARAMETER ROUTES)
// =============================================
router.get('/stock/current', purchaseReturnController.getCurrentStock);
router.get('/stock/item/:itemId', purchaseReturnController.getItemStock);

// =============================================
// VAT ROUTES
// =============================================
router.get('/reports/vat-returns', purchaseReturnController.getVATReturns);  // ← ADD THIS LINE
router.get('/reports/vat-summary', purchaseReturnController.getVATReturnsSummary);

// Return VAT Report (renamed from "VAT Effect") - unifies Purchase Returns
// and New Expenses Credit Notes behind a Return Type filter. The two
// routes above are kept working untouched.
router.get('/reports/return-vat', purchaseReturnController.getReturnVATReport);
router.get('/reports/return-vat-summary', purchaseReturnController.getReturnVATSummary);

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

// Add settlement to existing purchase return (MUST come before /:id)
router.post('/:id/settle', purchaseReturnController.addSettlementToPurchaseReturn);

module.exports = router;