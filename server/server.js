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

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: 'https://stock.ravonbakers.lk',
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
app.use('/api/opening-balances', openingBalanceRoutes);
app.use('/api/issuances', issuanceRoutes);
app.use('/api/wastages', wastageRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});