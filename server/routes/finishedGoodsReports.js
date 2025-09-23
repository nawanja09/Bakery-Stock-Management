const express = require('express');
const router = express.Router();
const reportController = require('../controllers/finishedGoodsReportController');

router.get('/production', reportController.getProductionReport);
router.get('/wastage', reportController.getWastageReport);
router.get('/transfer', reportController.getTransferReport);

module.exports = router;