const express = require('express');
const router = express.Router();
const adjustmentController = require('../controllers/adjustmentController');

// Get all adjustments
router.get('/', adjustmentController.getAdjustments);

// Create a new adjustment
router.post('/', adjustmentController.createAdjustment);

// Get system quantity for an item
router.get('/system-stock/:itemId', adjustmentController.getSystemQuantity);

module.exports = router;
