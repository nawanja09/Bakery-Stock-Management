// server/routes/financeRoutes.js
const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const authenticate = require('../middleware/authenticate');
const requireRoles = require('../middleware/requireRoles');

// Every route below requires a valid login.
router.use(authenticate);

// Restricted to Admin and Accountant: the Finance module's own pages
// (ledgers, receive forms, transfer, opening balance).
const financeOnly = requireRoles('Admin', 'Accountant');

// Shared with other modules - NOT restricted to Admin/Accountant, since
// PayNowModal and InvoicePaymentModal (on the RM Purchasing Invoice page)
// call these for any role that's allowed to make a payment. Restricting
// these would silently break bank-account selection and the cash-balance
// display for every non-Admin/Accountant role that can pay a supplier.
router.get('/cash/balance/:companyId', financeController.getCashBalanceForCompany);
router.get('/bank/balance/:bankId', financeController.getBankBalanceForAccount);
router.get('/bank/accounts', financeController.getBankAccounts); // ?companyId= filter, for payment forms

// Cash ledger (per company) - Finance module page
router.get('/cash/ledger/:companyId', financeOnly, financeController.getCashLedger); // ?dateFrom=&dateTo=&referenceNumber=&transactionType=
router.post('/cash/receive', financeOnly, financeController.receiveCash);
router.post('/cash/opening-balance', financeOnly, financeController.setCashOpeningBalance);

// Bank ledger (per bank account) - Finance module page
router.get('/bank/ledger/:bankId', financeOnly, financeController.getBankLedger); // ?dateFrom=&dateTo=&referenceNumber=&transactionType=
router.get('/bank/accounts/all', financeOnly, financeController.getAllBankAccounts); // Bank ledger page's account picker
router.post('/bank/receive', financeOnly, financeController.receiveBank);

// Cash <-> Bank transfer - Finance module page
router.post('/transfer', financeOnly, financeController.transferFunds);

// Bank-to-Bank transfer - Finance module page
router.post('/bank/transfer', financeOnly, financeController.bankToBankTransfer);

module.exports = router;