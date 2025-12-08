const express = require('express');
const router = express.Router();
const {
  getPurchases,
  getPurchaseById,
  createPurchase,
  updatePurchase,
  deletePurchase,
  getPurchaseFormData
} = require('../controllers/cutleryPurchasesController');

// Routes
router.get('/', getPurchases);
router.get('/form-data', getPurchaseFormData);
router.get('/:id', getPurchaseById);
router.post('/', createPurchase);
router.put('/:id', updatePurchase);
router.delete('/:id', deletePurchase);

module.exports = router;