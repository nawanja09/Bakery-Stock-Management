const express = require('express');
const router = express.Router();
const issuanceController = require('../controllers/issuanceController');
const { rawMaterialAccess } = require('../middleware/moduleAccess');

router.use(...rawMaterialAccess);

router.post('/', issuanceController.createIssuance);
router.get('/', issuanceController.getAllIssuances);
router.get('/:id', issuanceController.getIssuanceById);
router.put('/:id', issuanceController.updateIssuance);
router.get('/items/with-stock', issuanceController.getItemsWithStock);

module.exports = router;