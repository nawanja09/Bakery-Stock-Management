const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

router.get('/stock', reportController.getStockReport);
router.get('/department', reportController.getDepartmentIssuesReport);
router.get('/purchasing', reportController.getPurchasingReport);
router.get('/wastage', reportController.getWastageReport);
router.get('/department/items', reportController.getDepartmentItemsSummary);
router.get('/stock-range-item', reportController.getStockReportByRangeAndItem);
router.get('/daily-transactions/purchases', reportController.getDailyPurchaseTransactions);
router.get('/daily-transactions/issuances', reportController.getDailyIssuanceTransactions);
router.get('/daily-transactions/wastages', reportController.getDailyWastageTransactions);
router.get('/purchasing-item-wise', reportController.getPurchasingItemWiseReport);

module.exports = router;