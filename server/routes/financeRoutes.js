// server/routes/financeRoutes.js
const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const chequeRegistryController = require('../controllers/chequeRegistryController');
const intercompanyController = require('../controllers/intercompanyController');
const cashOtherLedgerController = require('../controllers/cashOtherLedgerController');
const authenticate = require('../middleware/authenticate');
const { financeReadAccess, financeWriteAccess } = require('../middleware/moduleAccess');

// Every route below requires a valid login.
router.use(authenticate);

// Restricted to Admin and Accountant: the Finance module's own pages
// (ledgers, receive forms, transfer, opening balance).
const financeOnly = financeWriteAccess;
const financeReadOnly = financeReadAccess;

// Shared with other modules - NOT restricted to Admin/Accountant, since
// PayNowModal and InvoicePaymentModal (on the RM Purchasing Invoice page)
// call these for any role that's allowed to make a payment. Restricting
// these would silently break bank-account selection and the cash-balance
// display for every non-Admin/Accountant role that can pay a supplier.
router.get('/cash/balance/:companyId', ...financeReadOnly, financeController.getCashBalanceForCompany);
router.get('/bank/balance/:bankId', ...financeReadOnly, financeController.getBankBalanceForAccount);
router.get('/bank/accounts', ...financeReadOnly, financeController.getBankAccounts); // ?companyId= filter, for payment forms

// Cash ledger (per company) - Finance module page
router.get('/cash/ledger/:companyId', ...financeReadOnly, financeController.getCashLedger); // ?dateFrom=&dateTo=&referenceNumber=&transactionType=
router.post('/cash/receive', ...financeOnly, financeController.receiveCash);
// Other Ledger extensions: Cash Issued (cash out to an Other Ledger) and
// edit/void of Cash Receives classified as an Other Ledger. Plain Receive-Type
// receipts are untouched by these routes.
router.get('/cash/issued', ...financeReadOnly, cashOtherLedgerController.getCashIssuedList);
router.get('/cash/issued/:id', ...financeReadOnly, cashOtherLedgerController.getCashIssuedById);
router.post('/cash/issued', ...financeOnly, cashOtherLedgerController.createCashIssued);
router.put('/cash/issued/:id', ...financeOnly, cashOtherLedgerController.updateCashIssued);
router.delete('/cash/issued/:id', ...financeOnly, cashOtherLedgerController.voidCashIssued);
router.put('/cash/receive/:id', ...financeOnly, cashOtherLedgerController.updateOtherLedgerCashReceive);
router.delete('/cash/receive/:id', ...financeOnly, cashOtherLedgerController.voidOtherLedgerCashReceive);
router.post('/cash/opening-balance', ...financeOnly, financeController.setCashOpeningBalance);

// Bank ledger (per bank account) - Finance module page
router.get('/bank/ledger/:bankId', ...financeReadOnly, financeController.getBankLedger); // ?dateFrom=&dateTo=&referenceNumber=&transactionType=
router.get('/bank/accounts/all', ...financeReadOnly, financeController.getAllBankAccounts); // Bank ledger page's account picker
router.post('/bank/receive', ...financeOnly, financeController.receiveBank);
router.post('/bank/issued', ...financeOnly, financeController.issueBank);

// Cash <-> Bank transfer - Finance module page
router.post('/transfer', ...financeOnly, financeController.transferFunds);

// Bank-to-Bank transfer - Finance module page
router.post('/bank/transfer', ...financeOnly, financeController.bankToBankTransfer);

// Intercompany Transaction - Finance module page. Moves funds between two
// companies' Cash/Bank accounts; NOT an expense, excluded from the Expense Report.
router.get('/intercompany', ...financeReadOnly, intercompanyController.getIntercompanyTransactions);
router.post('/intercompany', ...financeOnly, intercompanyController.createIntercompanyTransaction);

// Expenses Cheque Registry - Finance module page
router.get('/cheque-registry', ...financeReadOnly, chequeRegistryController.getChequeRegistry);
router.patch('/cheque-registry/:id', ...financeOnly, chequeRegistryController.updateChequeRegistryRecord);

module.exports = router;