const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

router.get('/dashboard/stats', dashboardController.getDashboardStats);
router.get('/dashboard/overview', dashboardController.getDashboardOverview);
router.get('/finance-overview', dashboardController.getFinanceDashboardOverview);
router.get('/top-items', dashboardController.getTopItems);
router.get('/stats', dashboardController.getGeneralStats);
router.get('/charts', dashboardController.getChartData);

module.exports = router;