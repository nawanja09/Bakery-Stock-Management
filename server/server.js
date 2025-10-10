require('dotenv').config();
const express = require('express');
const cors = require('cors');

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
const userRoutes = require('./routes/userRoutes');

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

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  //origin: 'https://stock.ravonbakers.lk',
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

app.use('/api', authRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/items', itemRoutes);
app.use('/api', departmentRoutes);  
app.use('/api/opening-balance', openingBalanceRoutes);
app.use('/api/issuances', issuanceRoutes);
app.use('/api/wastages', wastageRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);

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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// formular for Usage report
// Due balance = opening balance - ( bakery + pastry + savory + cake)