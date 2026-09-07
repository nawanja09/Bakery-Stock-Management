// routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchaseController');
const paymentHistoryController = require('../controllers/paymentHistoryController');
const { rawMaterialAccess } = require('../middleware/moduleAccess');

router.use(...rawMaterialAccess);

// Get all non-paid purchases
router.get('/non-paid', purchaseController.getNonPaidPurchases);

// Make payment for a purchase
router.post('/purchase/:id/pay', purchaseController.makePayment);

// Get payment history for a purchase
router.get('/purchase/:id/history', purchaseController.getPaymentHistory);

// Get payment summary statistics
router.get('/summary', paymentHistoryController.getPaymentSummary);

// Get recent payments
router.get('/recent', paymentHistoryController.getRecentPayments);

// Update payment statuses (admin only - one-time use)
router.post('/update-statuses', purchaseController.updatePaymentStatuses);

module.exports = router;