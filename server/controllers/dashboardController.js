const pool = require('../config/db');

// Helper function to get date range for charts
const getDateRange = (days = 7) => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);
  return { startDate, endDate };
};

// Dashboard stats
exports.getDashboardStats = async (req, res) => {
  try {
    // Opening Balance (latest)
    const [openingResult] = await pool.query(
      `SELECT SUM(total_value) AS openingBalance
       FROM opening_balances 
       WHERE date = (SELECT MAX(date) FROM opening_balances)`
    );
    
    // Purchasing (last 7 days count)
    const [purchasingResult] = await pool.query(
      `SELECT COUNT(*) AS purchasing 
       FROM purchases 
       WHERE purchase_date BETWEEN CURDATE() - INTERVAL 7 DAY AND CURDATE()`
    );
    
    // Issues (last 7 days count)
    const [issuesResult] = await pool.query(
      `SELECT COUNT(*) AS issues 
       FROM issuances 
       WHERE issuance_date BETWEEN CURDATE() - INTERVAL 7 DAY AND CURDATE()`
    );

    // Wastage (last 7 days count)
    const [wastageResult] = await pool.query(
      `SELECT COUNT(*) AS wastage 
       FROM wastages 
       WHERE date BETWEEN CURDATE() - INTERVAL 7 DAY AND CURDATE()`
    );

    res.json({
      openingBalance: openingResult[0].openingBalance || 0,
      purchasing: purchasingResult[0].purchasing || 0,
      issues: issuesResult[0].issues || 0,
      wastage: wastageResult[0].wastage || 0
    });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Chart data
exports.getChartData = async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange();
    
    // Total Sales (last 7 days)
    const [salesData] = await pool.query(
      `SELECT DATE(purchase_date) AS date, SUM(bill_amount) AS amount
       FROM purchases
       WHERE purchase_date BETWEEN ? AND ?
       GROUP BY DATE(purchase_date)
       ORDER BY DATE(purchase_date)`,
      [startDate, endDate]
    );
    
    // Opening Balance (last 7 days)
    const [openingData] = await pool.query(
      `SELECT date, SUM(total_value) AS amount
       FROM opening_balances
       WHERE date BETWEEN ? AND ?
       GROUP BY date
       ORDER BY date`,
      [startDate, endDate]
    );
    
    // Purchasing (last 7 days)
    const [purchasingData] = await pool.query(
      `SELECT DATE(purchase_date) AS date, COUNT(*) AS count
       FROM purchases
       WHERE purchase_date BETWEEN ? AND ?
       GROUP BY DATE(purchase_date)
       ORDER BY DATE(purchase_date)`,
      [startDate, endDate]
    );
    
    // Issues vs Wastage (last 7 days)
    const [issuesData] = await pool.query(
      `SELECT DATE(issuance_date) AS date, COUNT(*) AS count
       FROM issuances
       WHERE issuance_date BETWEEN ? AND ?
       GROUP BY DATE(issuance_date)
       ORDER BY DATE(issuance_date)`,
      [startDate, endDate]
    );
    
    const [wastageData] = await pool.query(
      `SELECT DATE(date) AS date, COUNT(*) AS count
       FROM wastages
       WHERE date BETWEEN ? AND ?
       GROUP BY DATE(date)
       ORDER BY DATE(date)`,
      [startDate, endDate]
    );

    res.json({
      totalSalesData: formatChartData(salesData, 'date', 'amount'),
      openingBalanceData: formatChartData(openingData, 'date', 'amount'),
      purchasingData: formatChartData(purchasingData, 'date', 'count'),
      issuesVsWastageData: {
        labels: getDateLabels(7),
        issues: mapDataToDates(issuesData, 'date', 'count'),
        wastage: mapDataToDates(wastageData, 'date', 'count')
      }
    });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Helper functions
const formatChartData = (data, labelKey, valueKey) => ({
  labels: data.map(item => new Date(item[labelKey]).toLocaleDateString()),
  data: data.map(item => item[valueKey])
});

const getDateLabels = (days) => {
  return Array.from({ length: days }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - i));
    return date.toLocaleDateString();
  });
};

const mapDataToDates = (data, dateKey, valueKey) => {
  const dateMap = new Map(data.map(item => [
    new Date(item[dateKey]).toLocaleDateString(), 
    item[valueKey]
  ]));
  
  return getDateLabels(7).map(date => dateMap.get(date) || 0);
};