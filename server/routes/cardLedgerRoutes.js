// server/routes/cardLedgerRoutes.js
//
// Finance -> Card Ledger. Mounted at /api/finance/card-ledger (see server.js),
// so the central RBAC prefix '/finance' (config/rolePermissions.js) applies:
//   * read  -> the roles that can use the Finance module
//   * write -> Admin, Super Admin, Accountant (financeWriteAccess); View Only is
//              also blocked from every write by the global readOnly middleware.
// Reversing / editing a Completed realisation is narrower than ordinary finance
// write access, so requireRoles further restricts those two routes on top of
// financeWriteAccess (see middleware/requireRoles.js).
const express = require('express');
const router = express.Router();
const cardLedgerController = require('../controllers/cardLedgerController');
const { financeReadAccess, financeWriteAccess } = require('../middleware/moduleAccess');
const requireRoles = require('../middleware/requireRoles');

router.get('/', ...financeReadAccess, cardLedgerController.getCardTransactions);
// Realise dialog preview (Branch / Department, Credit Card Rate, Expected Commission).
router.get('/commission', ...financeWriteAccess, cardLedgerController.getCommissionPreview);
// Batch realise: one request realises every selected card transaction in ONE DB transaction.
router.post('/realise', ...financeWriteAccess, cardLedgerController.realiseTransactions);
// Completed -> Pending (Admin / Super Admin only).
router.delete('/realisations/:id', ...financeWriteAccess, requireRoles('Admin', 'Super Admin'), cardLedgerController.reverseRealisation);
// Edit a Completed realisation's figures (Super Admin only).
router.put('/realisations/:id', ...financeWriteAccess, requireRoles('Super Admin'), cardLedgerController.updateRealisation);

module.exports = router;
