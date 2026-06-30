const express = require('express');
const router = express.Router();
const adjustmentController = require('../controllers/adjustmentController');

// Get all adjustments
router.get('/', adjustmentController.getAdjustments);

// Create a new adjustment
router.post('/', adjustmentController.createAdjustment);

// Get system quantity for an item
router.get('/system-stock/:itemId', adjustmentController.getSystemQuantity);

// Update and delete an adjustment
router.put('/:id', adjustmentController.updateAdjustment);
router.delete('/:id', adjustmentController.deleteAdjustment);

// Get single adjustment for editing
router.get('/:id', adjustmentController.getAdjustmentById);

module.exports = router;
