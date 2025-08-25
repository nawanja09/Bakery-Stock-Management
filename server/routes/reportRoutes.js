const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

router.get('/stock', reportController.getStockReport);
router.get('/department', reportController.getDepartmentIssuesReport);
router.get('/purchasing', reportController.getPurchasingReport);
router.get('/wastage', reportController.getWastageReport);
router.get('/department/items', reportController.getDepartmentItemsSummary);

module.exports = router;