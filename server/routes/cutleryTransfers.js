const express = require('express');
const router = express.Router();
const {
  getTransfers,
  getTransferById,
  createTransfer,
  updateTransfer,
  deleteTransfer,
  getTransferFormData
} = require('../controllers/cutleryTransfersController');

// Routes
router.get('/', getTransfers);
router.get('/form-data', getTransferFormData);
router.get('/:id', getTransferById);
router.post('/', createTransfer);
router.put('/:id', updateTransfer);
router.delete('/:id', deleteTransfer);

module.exports = router;