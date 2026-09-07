const express = require('express');
const router = express.Router();
const wastageController = require('../controllers/wastageController');
const { rawMaterialAccess } = require('../middleware/moduleAccess');

router.use(...rawMaterialAccess);

router.post('/', wastageController.createWastage);
router.get('/', wastageController.getAllWastages);
router.get('/:id', wastageController.getWastageById);
router.put('/:id', wastageController.updateWastage);
router.delete('/:id', wastageController.deleteWastage);

module.exports = router;

