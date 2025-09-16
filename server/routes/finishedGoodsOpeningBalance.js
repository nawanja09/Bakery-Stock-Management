const express = require('express');
const router = express.Router();
const finishedGoodsOpeningBalanceController = require('../controllers/finishedGoodsOpeningBalanceController');

router.get('/', finishedGoodsOpeningBalanceController.getAllFinishedGoodsOpeningBalances);
router.post('/', finishedGoodsOpeningBalanceController.createFinishedGoodsOpeningBalance);
router.get('/:id', finishedGoodsOpeningBalanceController.getFinishedGoodsOpeningBalanceById);
router.put('/:id', finishedGoodsOpeningBalanceController.updateFinishedGoodsOpeningBalance);
router.delete('/:id', finishedGoodsOpeningBalanceController.deleteFinishedGoodsOpeningBalance);
router.get('/items/without-opening', finishedGoodsOpeningBalanceController.getFinishedGoodsItemsWithoutOpeningBalance);

module.exports = router;