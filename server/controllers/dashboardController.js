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
// Dashboard Overview Endpoint (new, consolidated)
// Used by the redesigned Dashboard page. Every metric is wrapped in its
// own try/catch so one failing query never blanks out the whole page.
// ==========================
exports.getDashboardOverview = async (req, res) => {
  try {
    // ---- Low stock (raw material items at/under their reorder level) ----
    let lowStockItems = [];
    try {
      const [rows] = await pool.query(`
        SELECT
          i.id, i.item_code, i.name, i.unit, i.reorder_level,
          COALESCE(
            (SELECT COALESCE(SUM(quantity), 0) FROM opening_balances WHERE item_id = i.id) +
            (SELECT COALESCE(SUM(pi.quantity), 0) FROM purchase_items pi JOIN purchases p ON pi.purchase_id = p.id WHERE pi.item_id = i.id) -
            (SELECT COALESCE(SUM(ii.quantity), 0) FROM issuance_items ii JOIN issuances iss ON ii.issuance_id = iss.id WHERE ii.item_id = i.id) -
            (SELECT COALESCE(SUM(wi.quantity), 0) FROM wastage_items wi JOIN wastages w ON wi.wastage_id = w.id WHERE wi.item_id = i.id) +
            (SELECT COALESCE(SUM(ri.quantity), 0) FROM return_items ri JOIN returns r ON ri.return_id = r.id WHERE ri.item_id = i.id),
          0) AS current_stock
        FROM items i
        WHERE i.deleted = FALSE AND i.is_active = TRUE
          AND i.reorder_level IS NOT NULL AND i.reorder_level > 0
        HAVING current_stock <= i.reorder_level
        ORDER BY (i.reorder_level - current_stock) DESC
      `);
      lowStockItems = rows;
    } catch (e) {
      console.warn('low-stock query failed, falling back to empty list', e.message);
    }

    // ---- Purchasing (last 7 days) ----
    let purchases7d = { count: 0, totalAmount: 0 };
    try {
      const [[row]] = await pool.query(`
        SELECT COUNT(*) AS count, COALESCE(SUM(bill_amount), 0) AS totalAmount
        FROM purchases
        WHERE purchase_date BETWEEN CURDATE() - INTERVAL 6 DAY AND CURDATE()
          AND deleted = FALSE
      `);
      purchases7d = { count: row.count, totalAmount: Number(row.totalAmount) || 0 };
    } catch (e) {
      console.warn('purchases7d query failed', e.message);
    }

    // ---- Pending purchase payments (non-paid + partially paid) ----
    let pendingPayments = { count: 0, totalAmount: 0 };
    try {
      const [[row]] = await pool.query(`
        SELECT COUNT(*) AS count, COALESCE(SUM(balance_amount), 0) AS totalAmount
        FROM purchases
        WHERE balance_amount > 0.001 AND payment_status != 'Paid' AND deleted = FALSE
      `);
      pendingPayments = { count: row.count, totalAmount: Number(row.totalAmount) || 0 };
    } catch (e) {
      console.warn('pendingPayments query failed', e.message);
    }

    // ---- Issuance to departments (last 7 days) ----
    let issues7d = 0;
    try {
      const [[row]] = await pool.query(`
        SELECT COUNT(*) AS count FROM issuances
        WHERE issuance_date BETWEEN CURDATE() - INTERVAL 6 DAY AND CURDATE()
      `);
      issues7d = row.count;
    } catch (e) {
      console.warn('issues7d query failed', e.message);
    }

    // ---- Wastage (last 7 days) — raw material + finished goods ----
    let wastage7d = { rawCount: 0, fgCount: 0 };
    try {
      const [[row]] = await pool.query(`
        SELECT COUNT(*) AS count FROM wastages
        WHERE date BETWEEN CURDATE() - INTERVAL 6 DAY AND CURDATE()
      `);
      wastage7d.rawCount = row.count;
    } catch (e) {
      console.warn('raw wastage7d query failed', e.message);
    }
    try {
      const [[row]] = await pool.query(`
        SELECT COUNT(*) AS count FROM finished_goods_wastages
        WHERE date BETWEEN CURDATE() - INTERVAL 6 DAY AND CURDATE()
      `);
      wastage7d.fgCount = row.count;
    } catch (e) {
      console.warn('fg wastage7d query failed', e.message);
    }

    // ---- Finished goods production (last 7 days) ----
    let production7d = { count: 0, totalUnits: 0 };
    try {
      const [[row]] = await pool.query(`
        SELECT COUNT(DISTINCT p.id) AS count, COALESCE(SUM(pi.quantity), 0) AS totalUnits
        FROM finished_goods_productions p
        JOIN finished_goods_production_items pi ON pi.production_id = p.id
        WHERE p.production_date BETWEEN CURDATE() - INTERVAL 6 DAY AND CURDATE()
      `);
      production7d = { count: row.count, totalUnits: Number(row.totalUnits) || 0 };
    } catch (e) {
      console.warn('production7d query failed', e.message);
    }

    res.json({
      lowStock: {
        count: lowStockItems.length,
        items: lowStockItems.slice(0, 6)
      },
      purchases7d,
      pendingPayments,
      issues7d,
      wastage7d,
      production7d
    });
  } catch (error) {
    console.error('Error in getDashboardOverview:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

// ==========================
// Top Issued / Wasted Items Endpoint
// ==========================
exports.getTopItems = async (req, res) => {
  const type = req.query.type === 'wasted' ? 'wasted' : req.query.type === 'issued' ? 'issued' : null;
  const { startDate, endDate } = req.query;
  const limit = Number.parseInt(req.query.limit, 10);
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const isValidDate = value => {
    if (!datePattern.test(value || '')) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
  };
  const validDates = isValidDate(startDate) && isValidDate(endDate);

  if (!type || !validDates || !Number.isInteger(limit) || limit < 5 || limit > 8 || startDate > endDate) {
    return res.status(400).json({ error: 'type, valid startDate/endDate, and limit between 5 and 8 are required.' });
  }

  const query = type === 'issued' ? `
    SELECT ii.item_id AS itemId, i.name AS itemName, i.unit,
           COALESCE(SUM(ii.quantity), 0) AS quantity
    FROM issuance_items ii
    JOIN issuances iss ON iss.id = ii.issuance_id
    JOIN items i ON i.id = ii.item_id
    WHERE iss.issuance_date >= ? AND iss.issuance_date < DATE_ADD(?, INTERVAL 1 DAY)
      AND i.deleted = 0 AND COALESCE(i.status, 1) = 1
    GROUP BY ii.item_id, i.name, i.unit
    ORDER BY quantity DESC
    LIMIT ?
  ` : `
    SELECT wi.item_id AS itemId, i.name AS itemName, i.unit,
           COALESCE(SUM(wi.quantity), 0) AS quantity
    FROM wastage_items wi
    JOIN wastages w ON w.id = wi.wastage_id
    JOIN items i ON i.id = wi.item_id
    WHERE w.date >= ? AND w.date < DATE_ADD(?, INTERVAL 1 DAY)
      AND w.deleted = 0 AND i.deleted = 0 AND COALESCE(i.status, 1) = 1
    GROUP BY wi.item_id, i.name, i.unit
    ORDER BY quantity DESC
    LIMIT ?
  `;

  try {
    const [rows] = await pool.query(query, [startDate, endDate, limit]);
    res.json({
      type,
      startDate,
      endDate,
      items: rows.map(row => ({
        itemId: row.itemId,
        itemName: row.itemName,
        unit: row.unit,
        quantity: Number(row.quantity) || 0
      }))
    });
  } catch (error) {
    console.error('Error in getTopItems:', error);
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
