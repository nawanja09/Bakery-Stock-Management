// server/routes/staffLoanRoutes.js
//
// Finance -> Staff Loans. Mounted at /api/staff-loans (see server.js).
//
// Access follows the Finance module:
//   * read  -> Admin, Super Admin, Accountant, View Only (same roles as the
//              Finance pages in the client)
//   * write -> Admin, Super Admin, Accountant (financeWriteAccess). View Only
//              users are additionally blocked from every write by the global
//              readOnly middleware.
const express = require('express');
const router = express.Router();
const staffLoanController = require('../controllers/staffLoanController');
const { staffLoanReadAccess, financeWriteAccess } = require('../middleware/moduleAccess');

// Specific paths must be declared BEFORE the parameterised '/:id' routes.
router.get('/form-options', ...financeWriteAccess, staffLoanController.getFormOptions);

router.get('/', ...staffLoanReadAccess, staffLoanController.getStaffLoans);
router.post('/', ...financeWriteAccess, staffLoanController.createStaffLoan);

router.get('/:id', ...staffLoanReadAccess, staffLoanController.getStaffLoanById);
router.get('/:id/repayments', ...staffLoanReadAccess, staffLoanController.getRepaymentHistory);
router.post('/:id/repayments', ...financeWriteAccess, staffLoanController.receiveCash);

module.exports = router;
