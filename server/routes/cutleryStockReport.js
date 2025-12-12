const express = require('express');
const router = express.Router();
const { getInventoryReport } = require('../controllers/cutleryStockReportController');

// Routes
router.get('/inventory', getInventoryReport);

module.exports = router;