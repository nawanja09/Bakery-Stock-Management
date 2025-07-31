// server/routes/itemRoutes.js
const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');

router.get('/', itemController.getAllItems);
router.post('/', itemController.createItem);
router.get('/:id', itemController.getItemById); // Get single item
router.put('/:id', itemController.updateItem);  // Update item
router.delete('/:id', itemController.deleteItem); // Delete item

module.exports = router;