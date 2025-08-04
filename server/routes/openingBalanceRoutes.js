const express = require('express');
const router = express.Router();
const openingBalanceController = require('../controllers/openingBalanceController');

router.post('/', openingBalanceController.createOpeningBalance);
router.get('/', openingBalanceController.getAllOpeningBalances);

module.exports = router;