const express = require('express');
const router = express.Router();
const openingBalanceController = require('../controllers/openingBalanceController');

router.post('/', openingBalanceController.createOpeningBalance);
router.get('/', openingBalanceController.getAllOpeningBalances);
router.get('/items/without-opening', openingBalanceController.getItemsWithoutOpeningBalance);
router.put('/:id', openingBalanceController.updateOpeningBalance);

module.exports = router;
