const pool = require('../config/db');

// Helper function to get date range
const getDateRange = (days = 7) => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);
  return { startDate, endDate };
};

// Format chart data
const formatChartData = (data, labelKey, valueKey) => ({
  labels: data.map(item => new Date(item[labelKey]).toLocaleDateString()),
  data: data.map(item => item[valueKey]),
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

// ==========================
// Dashboard Stats Endpoint
// ==========================
exports.getDashboardStats = async (req, res) => {
  try {
    console.log("Fetching dashboard stats...");

    // Opening Balance
    let openingBalance = 0;
    try {
      const [openingResult] = await pool.query(`
        SELECT SUM(quantity) AS openingBalance
        FROM opening_balances
        WHERE date = (SELECT MAX(date) FROM opening_balances)
      `);
      openingBalance = openingResult?.[0]?.openingBalance ?? 0;
    } catch (e) {
      // If the query fails, fall back to a safe default
      console.warn('opening_balances query failed, falling back to 0', e.message);
      openingBalance = 0;
    }

    // Purchasing (last 7 days)
    const [purchasingResult] = await pool.query(`
      SELECT COUNT(*) AS purchasing
      FROM purchases
      WHERE purchase_date BETWEEN CURDATE() - INTERVAL 7 DAY AND CURDATE()
    `);
    const purchasing = purchasingResult?.[0]?.purchasing ?? 0;

    // Issues (last 7 days)
    const [issuesResult] = await pool.query(`
      SELECT COUNT(*) AS issues
      FROM issuances
      WHERE issuance_date BETWEEN CURDATE() - INTERVAL 7 DAY AND CURDATE()
    `);
    const issues = issuesResult?.[0]?.issues ?? 0;

    // Wastage (last 7 days)
    const [wastageResult] = await pool.query(`
      SELECT COUNT(*) AS wastage
      FROM wastages
      WHERE date BETWEEN CURDATE() - INTERVAL 7 DAY AND CURDATE()
    `);
    const wastage = wastageResult?.[0]?.wastage ?? 0;

    // Response
    res.json({
      openingBalance,
      purchasing,
      issues,
      wastage,
    });

  } catch (error) {
    console.error("Error in getDashboardStats:", error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

// ==========================
// General Stats Endpoint
// ==========================
exports.getGeneralStats = async (req, res) => {
  try {
    console.log("Fetching general stats...");

    // Get counts from various tables
    // Using try-catch for each to handle cases where tables might not exist or be empty
    
    let users = 0;
    try {
      const [rows] = await pool.query('SELECT COUNT(*) AS count FROM users');
      users = rows[0].count;
    } catch (e) { console.warn('Users query failed'); }

    let orders = 0;
    try {
      const [rows] = await pool.query('SELECT COUNT(*) AS count FROM finished_goods_sales');
      orders = rows[0].count;
    } catch (e) { console.warn('Sales query failed'); }

    let revenue = 0;
    try {
      const [rows] = await pool.query('SELECT SUM(total_value) AS total FROM finished_goods_sale_items');
      revenue = rows[0].total || 0;
    } catch (e) { console.warn('Revenue query failed'); }

    let products = 0;
    try {
      const [rows] = await pool.query('SELECT COUNT(*) AS count FROM finished_goods_items');
      products = rows[0].count;
    } catch (e) { console.warn('Products query failed'); }

    res.json({
      users,
      orders,
      revenue,
      products
    });

  } catch (error) {
    console.error("Error in getGeneralStats:", error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

// ==========================
// Chart Data Endpoint
// ==========================
exports.getChartData = async (req, res) => {
  try {
    console.log("Fetching chart data...");
    const { startDate, endDate } = getDateRange(7);

    // Format dates for MySQL
    const start = startDate.toISOString().split('T')[0];
    const end = endDate.toISOString().split('T')[0];

    // Total Sales
    const [salesData] = await pool.query(`
      SELECT DATE(purchase_date) AS date, SUM(bill_amount) AS amount
      FROM purchases
      WHERE purchase_date BETWEEN ? AND ?
      GROUP BY DATE(purchase_date)
      ORDER BY DATE(purchase_date)
    `, [start, end]);

    // Opening Balance
    const [openingData] = await pool.query(`
      SELECT date, SUM(quantity) AS amount
      FROM opening_balances
      WHERE date BETWEEN ? AND ?
      GROUP BY date
      ORDER BY date
    `, [start, end]);

    // Purchasing
    const [purchasingData] = await pool.query(`
      SELECT DATE(purchase_date) AS date, COUNT(*) AS count
      FROM purchases
      WHERE purchase_date BETWEEN ? AND ?
      GROUP BY DATE(purchase_date)
      ORDER BY DATE(purchase_date)
    `, [start, end]);

    // Issues
    const [issuesData] = await pool.query(`
      SELECT DATE(issuance_date) AS date, COUNT(*) AS count
      FROM issuances
      WHERE issuance_date BETWEEN ? AND ?
      GROUP BY DATE(issuance_date)
      ORDER BY DATE(issuance_date)
    `, [start, end]);

    // Wastage
    const [wastageData] = await pool.query(`
      SELECT DATE(date) AS date, COUNT(*) AS count
      FROM wastages
      WHERE date BETWEEN ? AND ?
      GROUP BY DATE(date)
      ORDER BY DATE(date)
    `, [start, end]);

    // Response
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
    console.error("Error in getChartData:", error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};
