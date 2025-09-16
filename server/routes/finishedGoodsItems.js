const express = require('express');
const router = express.Router();
const finishedGoodsItemController = require('../controllers/finishedGoodsItemController');

router.get('/', finishedGoodsItemController.getAllFinishedGoodsItems);
router.post('/', finishedGoodsItemController.createFinishedGoodsItem);
router.get('/:id', finishedGoodsItemController.getFinishedGoodsItemById);
router.put('/:id', finishedGoodsItemController.updateFinishedGoodsItem);
router.delete('/:id', finishedGoodsItemController.deleteFinishedGoodsItem);

module.exports = router;