// server/routes/bakeryStockReportRoutes.js
const express = require('express');
const router = express.Router();
const bakeryStockReportController = require('../controllers/bakeryStockReportController');

router.get('/bakery-stock', bakeryStockReportController.getBakeryStockReport);

module.exports = router;