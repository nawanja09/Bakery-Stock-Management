const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const requireRoles = require('../middleware/requireRoles');
const controller = require('../controllers/analystController');

router.use(authenticate, requireRoles('Super Admin'));
router.get('/income', controller.getIncomes);
router.get('/incomes', controller.getIncomes);
router.get('/expenses', controller.getExpenses);
router.get('/balance-sheet', controller.getBalanceSheet);

module.exports = router;