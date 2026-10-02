// server/routes/cardLedgerRoutes.js
//
// Finance -> Card Ledger. Mounted at /api/finance/card-ledger (see server.js),
// so the central RBAC prefix '/finance' (config/rolePermissions.js) applies:
//   * read  -> the roles that can use the Finance module
//   * write -> Admin, Super Admin, Accountant (financeWriteAccess); View Only is
//              also blocked from every write by the global readOnly middleware.
const express = require('express');
const router = express.Router();
const cardLedgerController = require('../controllers/cardLedgerController');
const { financeReadAccess, financeWriteAccess } = require('../middleware/moduleAccess');

router.get('/', ...financeReadAccess, cardLedgerController.getCardTransactions);
// Batch realise: one request realises every selected card transaction in ONE DB transaction.
router.post('/realise', ...financeWriteAccess, cardLedgerController.realiseTransactions);

module.exports = router;
