// server/routes/finishedGoodsTransfers.js

const express = require('express');
const router = express.Router();
const transferController = require('../controllers/finishedGoodsTransferController');

router.get('/', transferController.getAllTransfers);
router.post('/', transferController.createTransfer);
router.get('/destinations', transferController.getDestinations);
router.get('/:id', transferController.getTransferById);
router.put('/:id', transferController.updateTransfer);
router.delete('/:id', transferController.deleteTransfer);

module.exports = router;