//server/routes/purchaseRoutes.js

const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchaseController');

router.post('/', purchaseController.createPurchase);
router.get('/', purchaseController.getAllPurchases);
router.get('/suppliers', purchaseController.getAllSuppliers);
router.get('/companies', purchaseController.getAllCompanies);
router.get('/:id', purchaseController.getPurchaseById);
router.put('/:id', purchaseController.updatePurchase);

module.exports = router;