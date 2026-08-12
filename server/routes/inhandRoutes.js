// server/routes/inhandRoutes.js

const express       = require('express');
const router        = express.Router();
const ctrl          = require('../controllers/inhandController');
const authenticate  = require('../middleware/authenticate');
const restrictRoles = require('../middleware/restrictRoles');

// All Inhand routes require authentication and block Store Keepers
// (same access rule as the existing Adjustments module).
router.use(authenticate, restrictRoles('Store Keeper', 'Stores'));

// ── CRUD ────────────────────────────────────────────────────────────────────
router.get  ('/',     ctrl.getInhandList);   // paginated list + filters
router.post ('/',     ctrl.createInhand);    // create Draft
router.get  ('/:id',  ctrl.getInhandById);   // single entry detail
router.put  ('/:id',  ctrl.updateInhand);    // edit Draft/Pending

// ── Workflow transitions ─────────────────────────────────────────────────────
router.patch('/:id/submit',  ctrl.submitInhand);   // Draft  → Pending
router.patch('/:id/approve', ctrl.approveInhand);  // Pending → Approved + Finance post
router.patch('/:id/cancel',  ctrl.cancelInhand);   // any → Cancelled (+ reversal if Approved)

// ── Audit log ────────────────────────────────────────────────────────────────
router.get  ('/:id/audit', ctrl.getAuditLog);

module.exports = router;
