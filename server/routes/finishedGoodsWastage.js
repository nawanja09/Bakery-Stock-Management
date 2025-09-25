// server/routes/finishedGoodsWastage.js
const express = require('express');
const router = express.Router();
const wastageController = require('../controllers/finishedGoodsWastageController');

router.get('/', wastageController.getAllFinishedGoodsWastages);
router.get('/production', wastageController.getProductionWastages);
router.get('/productions/list', wastageController.getProductionsForWastage);
router.post('/', wastageController.createFinishedGoodsWastage);
router.get('/:id', wastageController.getFinishedGoodsWastageById);
router.put('/:id', wastageController.updateFinishedGoodsWastage);
router.delete('/:id', wastageController.deleteFinishedGoodsWastage);

module.exports = router;