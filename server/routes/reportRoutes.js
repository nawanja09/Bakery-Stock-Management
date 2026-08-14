// routes/reportRoutes.js
const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

router.get('/stock', reportController.getStockReport);
router.get('/latest-price', reportController.getLatestUnitPrice);
router.get('/department', reportController.getDepartmentIssuesReport);
router.get('/purchasing', reportController.getPurchasingReport);
router.get('/wastage', reportController.getWastageReport);
router.get('/department/items', reportController.getDepartmentItemsSummary);
router.get('/stock-range-item', reportController.getStockReportByRangeAndItem);
router.get('/daily-transactions/purchases', reportController.getDailyPurchaseTransactions);
router.get('/daily-transactions/issuances', reportController.getDailyIssuanceTransactions);
router.get('/daily-transactions/wastages', reportController.getDailyWastageTransactions);
router.get('/daily-transactions/returns', reportController.getDailyReturnTransactions);
router.get('/daily-transactions/purchase-returns', reportController.getDailyPurchaseReturnTransactions);  // ← ADD THIS LINE
router.get('/purchasing-item-wise', reportController.getPurchasingItemWiseReport);

router.get('/department-return-item-wise', reportController.getDepartmentReturnItemWiseReport);

router.get('/last-issue-date', reportController.getLastIssueDateReport);

// Purchase Report: invoice-level listing with date range / company / supplier filters
router.get('/purchase-report', reportController.getPurchaseReport);

// Expenses Report: unified Petty Cash + Other expenses with company / date range / payee / type filters
router.get('/expenses-report', reportController.getExpensesReport);

module.exports = router;