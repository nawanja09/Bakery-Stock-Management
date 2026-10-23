const express = require('express');
const router = express.Router();
const adjustmentController = require('../controllers/adjustmentController');
const authenticate = require('../middleware/authenticate');
const { adjustmentsAccess } = require('../middleware/moduleAccess');
const requireRoles = require('../middleware/requireRoles');

// Adjustments module is off-limits to Store Keeper and View Only accounts - enforced here
// so direct API/URL access is blocked, not just the UI menu.
router.use(...adjustmentsAccess);

// Get all adjustments
router.get('/', adjustmentController.getAdjustments);

// Must be before /:id so "summary" is never treated as an adjustment ID.
router.get('/summary/:category', adjustmentController.getRmAdjustmentSummary);

// Financial receive records remain in their original finance/card ledger tables.
// Editing a Cash Receive / Bank Receive entry - Pending or Completed - is Super
// Admin only, narrower than ordinary Adjustments access (every other route here).
router.get('/records/:category', adjustmentController.getFinancialAdjustmentRecords);
router.get('/records/:category/:source/:id', adjustmentController.getFinancialAdjustmentRecordDetail);
router.put('/records/:category/:source/:id', requireRoles('Super Admin'), adjustmentController.updateFinancialAdjustmentRecord);

// Create a new adjustment
router.post('/', adjustmentController.createAdjustment);

// Get system quantity for an item
router.get('/system-stock/:itemId', adjustmentController.getSystemQuantity);

// Update and delete an adjustment
router.put('/:id', adjustmentController.updateAdjustment);
router.delete('/:id', adjustmentController.deleteAdjustment);

// Maker-checker (audit H4): a different user approves it before it affects stock.
router.patch('/:id/approve', adjustmentController.approveAdjustment);

// Get single adjustment for editing
router.get('/:id', adjustmentController.getAdjustmentById);

module.exports = router;
