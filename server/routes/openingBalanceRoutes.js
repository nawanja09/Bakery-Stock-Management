const express = require('express');
const router = express.Router();
const openingBalanceController = require('../controllers/openingBalanceController');
const { rawMaterialAccess } = require('../middleware/moduleAccess');

router.use(...rawMaterialAccess);

router.post('/', openingBalanceController.createOpeningBalance);
router.get('/', openingBalanceController.getAllOpeningBalances);
router.get('/items/without-opening', openingBalanceController.getItemsWithoutOpeningBalance);
router.put('/:id', openingBalanceController.updateOpeningBalance);

module.exports = router;
