const express = require('express');
const router = express.Router();
const adjustmentController = require('../controllers/adjustmentController');
const authenticate = require('../middleware/authenticate');
const { adjustmentsAccess } = require('../middleware/moduleAccess');

// Adjustments module is off-limits to Store Keeper and View Only accounts - enforced here
// so direct API/URL access is blocked, not just the UI menu.
router.use(...adjustmentsAccess);

// Get all adjustments
router.get('/', adjustmentController.getAdjustments);

// Must be before /:id so "summary" is never treated as an adjustment ID.
router.get('/summary/:category', adjustmentController.getRmAdjustmentSummary);

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
