// routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchaseController');
const paymentHistoryController = require('../controllers/paymentHistoryController');
const { rawMaterialAccess, adjustmentsAccess } = require('../middleware/moduleAccess');

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

// =============================================
// Purchasing Payment Adjustment (RM Adjustment -> "Purchasing Payment
// Adjustment" tab). Restricted the same way as the rest of the
// Adjustments module - Admin / Super Admin only - regardless of the
// broader read access the rest of this router grants.
// =============================================
router.get('/payments/adjustable', ...adjustmentsAccess, purchaseController.getAdjustablePayments);
router.get('/payments/:id/adjust-detail', ...adjustmentsAccess, purchaseController.getPaymentAdjustmentDetail);
router.put('/payments/:id/adjust', ...adjustmentsAccess, purchaseController.adjustPurchasePayment);
router.get('/payment-adjustments', ...adjustmentsAccess, purchaseController.getPurchasePaymentAdjustmentsSummary);

module.exports = router;