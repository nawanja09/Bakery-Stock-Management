const express = require('express');
const router = express.Router();
const salesController = require('../controllers/finishedGoodsSalesController');

router.get('/', salesController.getAllFinishedGoodsSales);
router.post('/', salesController.createFinishedGoodsSale);
router.get('/:id', salesController.getFinishedGoodsSaleById);
router.delete('/:id', salesController.deleteFinishedGoodsSale);

module.exports = router;