// server/routes/vatSettingsRoutes.js - system-wide VAT rate.
// Read: Raw Material / Expenses / VAT modules. Update: Admin / Super Admin only
// (config/rolePermissions.js, '/settings/vat-rate' writeRoles).
const express = require('express');
const router = express.Router();
const controller = require('../controllers/vatSettingsController');

router.get('/vat-rate', controller.getVatRate);
router.put('/vat-rate', controller.updateVatRate);

module.exports = router;
