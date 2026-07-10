// routes/supplierCreditRoutes.js
const express = require('express');
const router = express.Router();
const supplierCreditController = require('../controllers/supplierCreditController');

// GET credits for a supplier
router.get('/:id/credits', supplierCreditController.getSupplierCredits);

// GET outstanding summary for a supplier
router.get('/:id/outstanding', supplierCreditController.getSupplierOutstanding);

// GET credit allocation history for a supplier
router.get('/:id/credit-history', supplierCreditController.getSupplierCreditHistory);

// POST Pay Now (advance payment → overpayment)
router.post('/pay-now', supplierCreditController.createOverpayment);

// POST Settle credit against an invoice
router.post('/settle-credit', supplierCreditController.settleCreditToInvoice);

module.exports = router;
