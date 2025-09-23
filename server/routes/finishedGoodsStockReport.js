// server/routes/finishedGoodsStockReport.js
const express = require('express');
const router = express.Router();
const stockController = require('../controllers/finishedGoodsStockController');

router.get('/stock', stockController.getFinishedGoodsStockReport);

module.exports = router;