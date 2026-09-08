require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path'); 
const fs = require('fs'); 

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
const userRoutes = require('./routes/userRoutes');
const adjustmentRoutes = require('./routes/adjustmentRoutes');

const finishedGoodsItemsRouter = require('./routes/finishedGoodsItems');
const finishedGoodsOpeningBalanceRouter = require('./routes/finishedGoodsOpeningBalance');
const productionsRouter = require('./routes/productions');
const finishedGoodsTransfersRouter = require('./routes/finishedGoodsTransfers');
const finishedGoodsWastageRouter = require('./routes/finishedGoodsWastage');
//const finishedGoodsStockReportRouter = require('./routes/finishedGoodsStockReport');
const finishedGoodsReportRoutes = require('./routes/finishedGoodsReports');
const finishedGoodsStockReportRouter = require('./routes/finishedGoodsStockReport');

const costCalculatorRoutes = require('./routes/costCalculator');
const finishedGoodsIngredientsRouter = require('./routes/finishedGoodsIngredients');
const departmentUsageReportRoutes = require('./routes/departmentUsageReport');
const finishedGoodsSalesRouter = require('./routes/finishedGoodsSalesRoutes');

const returnRoutes = require('./routes/returnRoutes');
const bakeryStockReportRoutes = require('./routes/bakeryStockReportRoutes');

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
const payeeRoutes = require('./routes/payeeRoutes');
const supplierCreditRoutes = require('./routes/supplierCreditRoutes');
const itemTypeRoutes = require('./routes/itemTypeRoutes');
const companyRoutes = require('./routes/companyRoutes');
const PaymentMethodManagement = require('./routes/paymentMethodRoutes');

const financeRoutes = require('./routes/financeRoutes');
const inhandRoutes  = require('./routes/inhandRoutes');
const orderRoutes = require('./routes/orderRoutes');
const receiveTypeRoutes = require('./routes/receiveTypeRoutes');
const analystRoutes = require('./routes/analystRoutes');
const incomeRoutes = require('./routes/incomeRoutes');
const readOnly = require('./middleware/readOnly');

// NEW, independent module - FG (Finished Goods) Production.
// Kept completely separate from the existing finished-goods-* routes above.
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

app.use(cors({
  //origin: 'https://stock.ravonbakers.lk',
  //origin: 'https://cjtradingcompany.lk',
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api', authRoutes);
app.use('/api', readOnly);
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
app.use('/api/users', userRoutes);
app.use('/api/adjustments', adjustmentRoutes);
app.use('/api/orders', orderRoutes);

app.use('/api/finished-goods-items', finishedGoodsItemsRouter);
app.use('/api/finished-goods-opening-balance', finishedGoodsOpeningBalanceRouter);
app.use('/api/productions', productionsRouter);
app.use('/api/finished-goods-transfers', finishedGoodsTransfersRouter);
app.use('/api/finished-goods-wastages', finishedGoodsWastageRouter);
//app.use('/api/finished-goods-reports', finishedGoodsStockReportRouter);
app.use('/api/finished-goods-reports', finishedGoodsReportRoutes);
app.use('/api/finished-goods-reports', finishedGoodsStockReportRouter);

app.use('/api/cost-calculations', costCalculatorRoutes);
app.use('/api/finished-goods-ingredients', finishedGoodsIngredientsRouter);
app.use('/api/department-usage-report', departmentUsageReportRoutes);
app.use('/api/finished-goods-sales', finishedGoodsSalesRouter);

app.use('/api/returns', returnRoutes);
app.use('/api/reports', bakeryStockReportRoutes);

app.use('/api/cutlery-locations', cutleryLocationsRoutes);
app.use('/api/cutlery-assets', cutleryAssetsRoutes);
app.use('/api/cutlery-transfers', cutleryTransfersRoutes);
app.use('/api/cutlery-purchases', cutleryPurchasesRoutes);
app.use('/api/cutlery-damages', cutleryDamagesRoutes);
app.use('/api/cutlery-reports', cutleryStockReportRoutes);

const bankChargesTypeRoutes = require('./routes/bankChargesTypeRoutes');

app.use('/api/purchase-returns', purchaseReturnRoutes);
app.use('/api/purchases', paymentRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/new-expenses', newExpenseRoutes);
app.use('/api/expense-types', expenseTypeRoutes);
app.use('/api/bank-charges-types', bankChargesTypeRoutes);
app.use('/api/suppliers', supplierCreditRoutes);
app.use('/api/item-types', itemTypeRoutes);
app.use('/api/companies', companyRoutes);

// NEW, independent module - FG (Finished Goods) Production.
// Does not reuse or alter any existing Finished Goods routes/tables.
app.use('/api/fg-production', fgProductionRoutes);
app.use('/api/payment-methods', PaymentMethodManagement);
app.use('/api/finance', financeRoutes);
app.use('/api/inhand', inhandRoutes);
app.use('/api/receive-types', receiveTypeRoutes);
app.use('/api/analyst', analystRoutes);
app.use('/api/incomes', incomeRoutes);

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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Uploads directory: ${path.join(__dirname, 'uploads')}`);
});