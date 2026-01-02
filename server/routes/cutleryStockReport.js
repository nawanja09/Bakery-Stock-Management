const express = require('express');
const router = express.Router();
const {
  getStockReport,
  getStockReportByDateRange,
  getStockReportByAsset,
  testStockLogic
} = require('../controllers/cutleryStockReportController');

// Get stock report
router.get('/stock-report', getStockReport);
router.get('/stock-report/range', getStockReportByDateRange);
router.get('/stock-report/asset', getStockReportByAsset);
router.get('/stock-report/test', testStockLogic); // For testing stock logic

module.exports = router;