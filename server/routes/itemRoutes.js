const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');
const { rawMaterialAccess } = require('../middleware/moduleAccess');

router.use(...rawMaterialAccess);

// Corrected route order - fixed routes before parameterized routes
router.get('/', itemController.getAllItems);
router.get('/without-opening', itemController.getItemsWithoutOpeningBalance);
router.post('/', itemController.createItem);
router.get('/:id', itemController.getItemById);
router.put('/:id', itemController.updateItem);
router.patch('/:id/status', itemController.updateItemStatus);
router.delete('/:id', itemController.deleteItem);

module.exports = router;