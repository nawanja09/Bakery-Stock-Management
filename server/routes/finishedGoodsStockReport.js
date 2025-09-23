const express = require('express');
const router = express.Router();
const stockController = require('../controllers/finishedGoodsStockController');

router.get('/stock-report', stockController.getFinishedGoodsStockReport);

module.exports = router;