const express = require('express');
const router = express.Router();
const {
  getStockReport,
  getStockReportByAsset
} = require('../controllers/cutleryStockReportController');

// Get stock report
router.get('/stock-report', getStockReport);
router.get('/stock-report/asset', getStockReportByAsset);

module.exports = router;