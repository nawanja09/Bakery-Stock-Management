// server/routes/otherLedgerRoutes.js
//
// Management / Finance -> Other Ledgers. Mounted at /api/other-ledgers.
// Access follows the Finance module (see config/rolePermissions.js):
//   read  -> Finance roles incl. View Only
//   write -> Admin, Super Admin, Accountant (financeWriteAccess)
// Ledgers are never hard-deleted; use PATCH /:id/status to make one inactive.
const express = require('express');
const router = express.Router();
const controller = require('../controllers/otherLedgerController');
const { financeReadAccess, financeWriteAccess } = require('../middleware/moduleAccess');

// Specific paths BEFORE the parameterised '/:id' routes.
router.get('/active', ...financeReadAccess, controller.getActiveOtherLedgers);

router.get('/', ...financeReadAccess, controller.getOtherLedgers);
router.post('/', ...financeWriteAccess, controller.createOtherLedger);

router.get('/:id/balance', ...financeReadAccess, controller.getOtherLedgerBalance);
router.get('/:id/transactions', ...financeReadAccess, controller.getOtherLedgerTransactions);
router.put('/:id', ...financeWriteAccess, controller.updateOtherLedger);
router.patch('/:id/status', ...financeWriteAccess, controller.setOtherLedgerStatus);

module.exports = router;
