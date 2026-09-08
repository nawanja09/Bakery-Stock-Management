// server/routes/incomeRoutes.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/incomeController');
const { financeReadAccess, financeWriteAccess } = require('../middleware/moduleAccess');

router.get('/', financeReadAccess, controller.getIncomes);
router.post('/', financeWriteAccess, controller.createIncome);
router.put('/:id', financeWriteAccess, controller.updateIncome);
router.delete('/:id', financeWriteAccess, controller.deleteIncome);

module.exports = router;