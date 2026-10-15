const express = require('express');
const router = express.Router();
const wastageController = require('../controllers/wastageController');
const { rawMaterialAccess } = require('../middleware/moduleAccess');

router.use(...rawMaterialAccess);

router.post('/', wastageController.createWastage);
router.get('/', wastageController.getAllWastages);
router.get('/:id', wastageController.getWastageById);
router.put('/:id', wastageController.updateWastage);
// No DELETE: a wastage note is corrected through Edit (PUT), never deleted.
// A deleted note was hidden from every list while the stock formulas still
// subtracted its quantity, so the loss vanished without a trace.

module.exports = router;

