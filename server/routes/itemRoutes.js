const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');

// Corrected route order - fixed routes before parameterized routes
router.get('/', itemController.getAllItems);
router.get('/without-opening', itemController.getItemsWithoutOpeningBalance); // Moved up
router.post('/', itemController.createItem);
router.get('/:id', itemController.getItemById);
router.put('/:id', itemController.updateItem);
router.delete('/:id', itemController.deleteItem);

module.exports = router;