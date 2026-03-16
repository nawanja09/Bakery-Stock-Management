// routes/purchaseReturnRoutes.js
const express = require('express');
const router = express.Router();
const purchaseReturnController = require('../controllers/purchaseReturnController');
const auth = require('../middleware/authenticate');

// VAT Report endpoints - Add these BEFORE the :id route
router.get('/reports/vat-returns', auth, purchaseReturnController.getVATReturns);
router.get('/reports/vat-summary', auth, purchaseReturnController.getVATSummary);

// Get all purchases for return selection
router.get('/purchases', auth, purchaseReturnController.getPurchasesForReturn);

// Get purchase items for a specific purchase
router.get('/purchases/:purchaseId/items', auth, purchaseReturnController.getPurchaseItemsForReturn);

// Get supplier bills with balance for settlement
router.get('/supplier/:supplierId/bills', auth, purchaseReturnController.getSupplierBillsWithBalance);

// Create new purchase return
router.post('/', auth, purchaseReturnController.createPurchaseReturn);

// Get all purchase returns
router.get('/', auth, purchaseReturnController.getAllPurchaseReturns);

// Get purchase return by ID - This must be last
router.get('/:id', auth, purchaseReturnController.getPurchaseReturnById);

module.exports = router;