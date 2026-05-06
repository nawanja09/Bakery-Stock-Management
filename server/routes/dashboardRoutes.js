const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

router.get('/dashboard/stats', dashboardController.getDashboardStats);
router.get('/stats', dashboardController.getGeneralStats);
router.get('/charts', dashboardController.getChartData);

module.exports = router;