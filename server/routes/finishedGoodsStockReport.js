const express = require('express');
const router = express.Router();
const stockController = require('../controllers/finishedGoodsStockController');
const stockReportController = require('../controllers/finishedGoodsStockReportController');

router.get('/stock-report', stockController.getFinishedGoodsStockReport);
router.get('/stock', stockReportController.getStockReport);

module.exports = router;