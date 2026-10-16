require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { assertProductionSecrets } = require('./config/secrets');
const { serveSignedUploads } = require('./utils/signedUploads');
const { applyHttpSecurity } = require('./middleware/httpSecurity');
const { auditTrail } = require('./services/auditLog');

const authRoutes = require('./routes/authRoutes');
const purchaseRoutes = require('./routes/purchaseRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const itemRoutes = require('./routes/itemRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const openingBalanceRoutes = require('./routes/openingBalanceRoutes');
const issuanceRoutes = require('./routes/issuanceRoutes');
const wastageRoutes = require('./routes/wastageRoutes');
const reportRoutes = require('./routes/reportRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const dashboardController = require('./controllers/dashboardController');
const employeeRoutes = require('./routes/employeeRoutes');
const adjustmentRoutes = require('./routes/adjustmentRoutes');

const departmentUsageReportRoutes = require('./routes/departmentUsageReport');

const returnRoutes = require('./routes/returnRoutes');

const cutleryLocationsRoutes = require('./routes/cutleryLocations');
const cutleryAssetsRoutes = require('./routes/cutleryAssets');
const cutleryTransfersRoutes = require('./routes/cutleryTransfers');
const cutleryPurchasesRoutes = require('./routes/cutleryPurchases');
const cutleryDamagesRoutes = require('./routes/cutleryDamages');
const cutleryStockReportRoutes = require('./routes/cutleryStockReport');

const purchaseReturnRoutes = require('./routes/purchaseReturnRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const newExpenseRoutes = require('./routes/newExpenseRoutes');
const expenseTypeRoutes = require('./routes/expenseTypeRoutes');
const subExpenseTypeRoutes = require('./routes/subExpenseTypeRoutes');
const payeeRoutes = require('./routes/payeeRoutes');
const supplierCreditRoutes = require('./routes/supplierCreditRoutes');
const itemTypeRoutes = require('./routes/itemTypeRoutes');
const companyRoutes = require('./routes/companyRoutes');
const PaymentMethodManagement = require('./routes/paymentMethodRoutes');

const financeRoutes = require('./routes/financeRoutes');
const cardLedgerRoutes = require('./routes/cardLedgerRoutes');
const staffLoanRoutes = require('./routes/staffLoanRoutes');
const otherLedgerRoutes = require('./routes/otherLedgerRoutes');
const creditCardRateRoutes = require('./routes/creditCardRateRoutes');
const collectionRoutes = require('./routes/collectionRoutes');
const integrationRoutes = require('./routes/integrationRoutes');
const inhandRoutes  = require('./routes/inhandRoutes');
const orderRoutes = require('./routes/orderRoutes');
const receiveTypeRoutes = require('./routes/receiveTypeRoutes');
const analystRoutes = require('./routes/analystRoutes');
const incomeRoutes = require('./routes/incomeRoutes');
const readOnly = require('./middleware/readOnly');
const authenticate = require('./middleware/authenticate');
const authorizeApi = require('./middleware/authorizeApi');
const cashExpenseRoutes = require('./routes/cashExpenseRoutes');
const hiddenExpenseRoutes = require('./routes/hiddenExpenseRoutes');
const { ensureChequeReleaseSchema, startChequeReleaseProcessor } = require('./services/chequeReleaseService');


// FG (Finished Goods) Production - recipes / costing module.
const fgProductionRoutes = require('./routes/fgProductionRoutes');


const app = express();
const PORT = process.env.PORT || 5000;

// Create uploads directories
const uploadDirs = [
  './uploads',
  './uploads/cutlery-assets'
];

uploadDirs.forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`Created directory: ${fullPath}`);
  }
});

// CORS (CORS_ORIGINS in .env), security headers, JSON body limit.
applyHttpSecurity(app);

// Uploaded images: only through the short-lived signed links the API returns
// to signed-in users (utils/signedUploads.js) - never public.
app.use('/uploads', serveSignedUploads(path.join(__dirname, 'uploads')));

// Audit Trail: records every sign-in event, data change and refused request
// once its response is sent (services/auditLog.js). Must stay before the routes.
app.use('/api', auditTrail);
app.use('/api', authRoutes);
app.use('/api', readOnly);
// Central RBAC gate: every /api route below this line requires a valid token AND
// a role that is allowed to use that path/method (see config/rolePermissions.js).
// View-only roles (QB) are rejected on every POST/PUT/PATCH/DELETE.
app.use('/api', authenticate, authorizeApi);
// Payment adjustment routes must be mounted before purchaseRoutes: the latter
// has a generic GET /:id route, which would otherwise treat
// "/payment-adjustments" as a purchase ID and return 404.
app.use('/api/purchases', paymentRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/payees', payeeRoutes);
app.use('/api/items', itemRoutes);
app.use('/api', departmentRoutes);  
app.use('/api/opening-balance', openingBalanceRoutes);
app.use('/api/issuances', issuanceRoutes);
app.use('/api/wastages', wastageRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.get('/api/stats', dashboardController.getGeneralStats);
app.use('/api/employees', employeeRoutes);
app.use('/api/adjustments', adjustmentRoutes);
app.use('/api/orders', orderRoutes);

app.use('/api/department-usage-report', departmentUsageReportRoutes);

app.use('/api/returns', returnRoutes);

app.use('/api/cutlery-locations', cutleryLocationsRoutes);
app.use('/api/cutlery-assets', cutleryAssetsRoutes);
app.use('/api/cutlery-transfers', cutleryTransfersRoutes);
app.use('/api/cutlery-purchases', cutleryPurchasesRoutes);
app.use('/api/cutlery-damages', cutleryDamagesRoutes);
app.use('/api/cutlery-reports', cutleryStockReportRoutes);

const bankChargesTypeRoutes = require('./routes/bankChargesTypeRoutes');

app.use('/api/purchase-returns', purchaseReturnRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/new-expenses', newExpenseRoutes);
app.use('/api/expense-types', expenseTypeRoutes);
app.use('/api/sub-expense-types', subExpenseTypeRoutes);
app.use('/api/bank-charges-types', bankChargesTypeRoutes);
app.use('/api/suppliers', supplierCreditRoutes);
app.use('/api/item-types', itemTypeRoutes);
app.use('/api/companies', companyRoutes);

// FG (Finished Goods) Production - recipes / costing module.
app.use('/api/fg-production', fgProductionRoutes);
app.use('/api/payment-methods', PaymentMethodManagement);
// Card Ledger must be mounted before the generic /api/finance router.
app.use('/api/finance/card-ledger', cardLedgerRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/staff-loans', staffLoanRoutes);
app.use('/api/other-ledgers', otherLedgerRoutes);
app.use('/api/credit-card-rates', creditCardRateRoutes);
app.use('/api/collections', collectionRoutes);
// The user's own POS / Restaurant access (Collection + FG Production pages)
app.use('/api/integrations', integrationRoutes);
app.use('/api/inhand', inhandRoutes);
app.use('/api/receive-types', receiveTypeRoutes);
app.use('/api/analyst', analystRoutes);
app.use('/api/incomes', incomeRoutes);
app.use('/api/cash-expenses', cashExpenseRoutes);
app.use('/api/hidden-expenses', hiddenExpenseRoutes);
app.use('/api/audit-logs', require('./routes/auditLogRoutes'));


// Error handling middleware for file uploads
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
    }
  }
  
  if (err.message === 'Only image files are allowed!') {
    return res.status(400).json({ error: 'Only image files are allowed!' });
  }
  
  console.error('Error:', err);
  res.status(500).json({ error: 'Something went wrong!' });
});

const startServer = async () => {
  try {
    // Refuse to boot with missing / short / shared JWT and POS session secrets.
    // Exit immediately: the DB pool would otherwise keep a process alive that
    // never listens (clients only see "connection refused").
    assertProductionSecrets();
  } catch (error) {
    console.error(`FATAL: ${error.message}`);
    process.exit(1);
  }

  try {
    await ensureChequeReleaseSchema();
    app.listen(PORT, () => {
      startChequeReleaseProcessor();
      // POS / Restaurant sessions are per user (their own logins) and are loaded
      // on that user's first request; no credentials exist on the server.
      require('./services/integrationAuthService').warmUp();
      console.log(`Server running on port ${PORT}`);
      console.log(`Uploads directory: ${path.join(__dirname, 'uploads')}`);
    });
  } catch (error) {
    console.error('Unable to start cheque release processing:', error);
    process.exitCode = 1;
  }
};

startServer();