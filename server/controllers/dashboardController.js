const pool = require('../config/db');
const { currentStockSql } = require('../services/stockRules');
const { sendServerError } = require('../utils/safeError');

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
    sendServerError(res, error);
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

    // orders / revenue / products came from the removed Finished Goods module
    // (finished_goods_sales / _sale_items / _items). Kept as 0 so the response
    // shape stays the same for any existing consumer.
    const orders = 0;
    const revenue = 0;
    const products = 0;

    res.json({
      users,
      orders,
      revenue,
      products
    });

  } catch (error) {
    console.error("Error in getGeneralStats:", error);
    sendServerError(res, error);
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
      // The one stock formula (services/stockRules.js) - this list used to leave out purchase
      // returns and adjustments, so an item could look fine here while the Stock report said it was low.
      const { joins, expr, params } = currentStockSql();
      const [rows] = await pool.query(`
        SELECT i.id, i.item_code, i.name, i.unit, i.reorder_level, ${expr} AS current_stock
        FROM items i
        ${joins}
        WHERE i.deleted = FALSE AND i.is_active = TRUE
          AND i.reorder_level IS NOT NULL AND i.reorder_level > 0
        HAVING current_stock <= i.reorder_level
        ORDER BY (i.reorder_level - current_stock) DESC
      `, params);
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

    // ---- Wastage (last 7 days) — raw material ----
    let wastage7d = { rawCount: 0 };
    try {
      const [[row]] = await pool.query(`
        SELECT COUNT(*) AS count FROM wastages
        WHERE date BETWEEN CURDATE() - INTERVAL 6 DAY AND CURDATE()
      `);
      wastage7d.rawCount = row.count;
    } catch (e) {
      console.warn('raw wastage7d query failed', e.message);
    }

    res.json({
      lowStock: {
        count: lowStockItems.length,
        items: lowStockItems.slice(0, 6)
      },
      purchases7d,
      pendingPayments,
      issues7d,
      wastage7d
    });
  } catch (error) {
    console.error('Error in getDashboardOverview:', error);
    sendServerError(res, error);
  }
};

exports.getFinanceDashboardOverview = async (req, res) => {
  try {
    const [
      managementResultSets,
      [expenseRows],
      [totalExpenseRows],
      [pettyCashRows],
      [adjustmentRows],
      [recentAdjustmentRows],
      [recentExpenseRows]
    ] = await Promise.all([
      Promise.all([
        pool.query('SELECT COUNT(*) AS count FROM company'),
        pool.query('SELECT COUNT(*) AS count FROM payees'),
        pool.query('SELECT COUNT(*) AS count FROM expense_types'),
        pool.query('SELECT COUNT(*) AS count FROM sub_expense_types')
      ]),
      pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN payment_status = 'Paid' THEN 1 ELSE 0 END), 0) AS paidCount,
          COALESCE(SUM(CASE WHEN payment_status = 'Paid' THEN total_bill_amount ELSE 0 END), 0) AS paidAmount,
          COALESCE(SUM(CASE WHEN payment_status IN ('Pending', 'Partially Paid') THEN 1 ELSE 0 END), 0) AS pendingCount,
          COALESCE(SUM(CASE WHEN payment_status IN ('Pending', 'Partially Paid') THEN balance ELSE 0 END), 0) AS pendingAmount,
          COALESCE(SUM(CASE WHEN balance > 0 THEN 1 ELSE 0 END), 0) AS outstandingCount,
          COALESCE(SUM(balance), 0) AS outstandingAmount
        FROM expenses
        WHERE is_deleted = 0
      `),
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM expenses WHERE is_deleted = 0) +
          (SELECT COUNT(*) FROM petty_cash_vouchers) +
          (SELECT COUNT(*) FROM cash_expenses WHERE status = 1) +
          (SELECT COUNT(*) FROM bank_charges) +
          (SELECT COUNT(*) FROM hidden_expenses WHERE is_deleted = 0) AS totalCount,
          (SELECT COALESCE(SUM(total_bill_amount), 0) FROM expenses WHERE is_deleted = 0) +
          (SELECT COALESCE(SUM(amount), 0) FROM petty_cash_vouchers) +
          (SELECT COALESCE(SUM(amount), 0) FROM cash_expenses WHERE status = 1) +
          (SELECT COALESCE(SUM(amount), 0) FROM bank_charges) +
          (SELECT COALESCE(SUM(amount), 0) FROM hidden_expenses WHERE is_deleted = 0) AS totalAmount
      `),
      pool.query(`
        SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount
        FROM petty_cash_vouchers
      `),
      pool.query(`
        SELECT COUNT(*) AS count
        FROM rm_adjustment_records
        WHERE category IN ('Expense Bill', 'Petty Cash Voucher')
      `),
      pool.query(`
        SELECT category, reference_id AS reference, updated_at AS date
        FROM rm_adjustment_records
        WHERE category IN ('Expense Bill', 'Petty Cash Voucher')
        ORDER BY updated_at DESC, id DESC
        LIMIT 5
      `),
      pool.query(`
        SELECT * FROM (
          SELECT e.id, 'Expense Bill' AS type, e.bill_date AS date,
                 COALESCE(p.payee_name, e.payee_name) AS payee,
                 e.bill_number AS reference, e.total_bill_amount AS amount,
                 e.payment_status AS status
          FROM expenses e
          LEFT JOIN payees p ON p.id = e.payee_id
          WHERE e.is_deleted = 0
          UNION ALL
          SELECT pv.id, 'Petty Cash' AS type, pv.voucher_date AS date,
                 pv.payee_name AS payee, pv.voucher_number AS reference,
                 pv.amount, pv.status
          FROM petty_cash_vouchers pv
          UNION ALL
          SELECT ce.id, 'Cash Expense' AS type, ce.expense_date AS date,
                 'Cash Expense' AS payee, ce.voucher_number AS reference,
                 ce.amount, 'Recorded' AS status
          FROM cash_expenses ce
          WHERE ce.status = 1
          UNION ALL
          SELECT bc.id, 'Bank Charge' AS type, bc.charge_date AS date,
                 bc.bank_name AS payee, bc.reference_number AS reference,
                 bc.amount, 'Recorded' AS status
          FROM bank_charges bc
          UNION ALL
          SELECT he.id, 'Hidden Expense' AS type, he.expense_date AS date,
                 'Hidden Expense' AS payee, he.reference_number AS reference,
                 he.amount, 'Recorded' AS status
          FROM hidden_expenses he
          WHERE he.is_deleted = 0
        ) recent_expenses
        ORDER BY date DESC, id DESC
        LIMIT 8
      `)
    ]);

    const expenseSummary = expenseRows[0] || {};
    const totalExpenseSummary = totalExpenseRows[0] || {};
    const pettyCashSummary = pettyCashRows[0] || {};
    const adjustmentSummary = adjustmentRows[0] || {};
    const managementCounts = managementResultSets.map(([rows]) => Number(rows[0].count) || 0);

    res.json({
      management: {
        companies: managementCounts[0],
        payees: managementCounts[1],
        expenseTypes: managementCounts[2],
        subExpenseTypes: managementCounts[3]
      },
      expenses: {
        total: {
          count: Number(totalExpenseSummary.totalCount) || 0,
          amount: Number(totalExpenseSummary.totalAmount) || 0
        },
        paid: {
          count: Number(expenseSummary.paidCount) || 0,
          amount: Number(expenseSummary.paidAmount) || 0
        },
        pendingPayments: {
          count: Number(expenseSummary.pendingCount) || 0,
          amount: Number(expenseSummary.pendingAmount) || 0
        },
        outstanding: {
          count: Number(expenseSummary.outstandingCount) || 0,
          amount: Number(expenseSummary.outstandingAmount) || 0
        },
        pettyCash: {
          count: Number(pettyCashSummary.count) || 0,
          amount: Number(pettyCashSummary.amount) || 0
        },
        adjustments: {
          count: Number(adjustmentSummary.count) || 0,
          recent: recentAdjustmentRows
        },
        recent: recentExpenseRows.map((row) => ({
          ...row,
          amount: Number(row.amount) || 0
        }))
      }
    });
  } catch (error) {
    console.error('Error in getFinanceDashboardOverview:', error);
    res.status(500).json({ error: 'Unable to load Finance dashboard data' });
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
    sendServerError(res, error);
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
    sendServerError(res, error);
  }
};
