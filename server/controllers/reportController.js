const pool = require('../config/db');

const getStockReport = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Date parameter is required' });
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    // yesterday
    const prevDate = new Date(parsedDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().split('T')[0];

    const query = `
      SELECT 
        i.id,
        i.item_code,
        i.name AS item_name,
        i.unit,
        -- opening balance for today = yesterday closing + today's manual opening
        COALESCE(prev.closing_balance, 0) + COALESCE(ob_today.opening_balance_today, 0) AS opening_balance,
        COALESCE(purchases.total_purchased, 0) AS total_purchased,
        COALESCE(issues.total_issued, 0) AS total_issued,
        COALESCE(wastage.total_wasted, 0) AS total_wasted,
        (
          COALESCE(prev.closing_balance, 0) +
          COALESCE(ob_today.opening_balance_today, 0) +
          COALESCE(purchases.total_purchased, 0) -
          COALESCE(issues.total_issued, 0) -
          COALESCE(wastage.total_wasted, 0)
        ) AS closing_balance
      FROM items i
      LEFT JOIN (
        -- previous day's closing balance
        SELECT 
          i2.id AS item_id,
          (
            COALESCE(ob.opening_balance, 0) +
            COALESCE(purchases.total_purchased, 0) -
            COALESCE(issues.total_issued, 0) -
            COALESCE(wastage.total_wasted, 0)
          ) AS closing_balance
        FROM items i2
        LEFT JOIN (
          SELECT item_id, SUM(quantity) AS opening_balance
          FROM opening_balances
          WHERE date <= ?
          GROUP BY item_id
        ) ob ON i2.id = ob.item_id
        LEFT JOIN (
          SELECT i.id AS item_id, SUM(pi.quantity) AS total_purchased
          FROM purchase_items pi
          JOIN purchases p ON pi.purchase_id = p.id
          JOIN items i ON pi.item_name = i.name
          WHERE p.purchase_date <= ?
          GROUP BY i.id
        ) purchases ON i2.id = purchases.item_id
        LEFT JOIN (
          SELECT ii.item_id, SUM(ii.quantity) AS total_issued
          FROM issuance_items ii
          JOIN issuances iss ON ii.issuance_id = iss.id
          WHERE iss.issuance_date <= ?
          GROUP BY ii.item_id
        ) issues ON i2.id = issues.item_id
        LEFT JOIN (
          SELECT wi.item_id, SUM(wi.quantity) AS total_wasted
          FROM wastage_items wi
          JOIN wastages w ON wi.wastage_id = w.id
          WHERE w.date <= ?
          GROUP BY wi.item_id
        ) wastage ON i2.id = wastage.item_id
      ) prev ON i.id = prev.item_id
      LEFT JOIN (
        -- today's manual opening balance
        SELECT item_id, SUM(quantity) AS opening_balance_today
        FROM opening_balances
        WHERE date = ?
        GROUP BY item_id
      ) ob_today ON i.id = ob_today.item_id
      LEFT JOIN (
        -- today's purchases
        SELECT i.id AS item_id, SUM(pi.quantity) AS total_purchased
        FROM purchase_items pi
        JOIN purchases p ON pi.purchase_id = p.id
        JOIN items i ON pi.item_name = i.name
        WHERE DATE(p.purchase_date) = ?
        GROUP BY i.id
      ) purchases ON i.id = purchases.item_id
      LEFT JOIN (
        -- today's issues
        SELECT ii.item_id, SUM(ii.quantity) AS total_issued
        FROM issuance_items ii
        JOIN issuances iss ON ii.issuance_id = iss.id
        WHERE DATE(iss.issuance_date) = ?
        GROUP BY ii.item_id
      ) issues ON i.id = issues.item_id
      LEFT JOIN (
        -- today's wastage
        SELECT wi.item_id, SUM(wi.quantity) AS total_wasted
        FROM wastage_items wi
        JOIN wastages w ON wi.wastage_id = w.id
        WHERE w.date = ?
        GROUP BY wi.item_id
      ) wastage ON i.id = wastage.item_id
      ORDER BY i.item_code
    `;

    const params = [
      prevDateStr, prevDateStr, prevDateStr, prevDateStr, // yesterday x4
      date,                                              // today opening
      date, date, date                                   // today purchases/issues/wastage
    ];

    const [rows] = await pool.query(query, params);
    res.json(rows);

  } catch (error) {
    console.error('Error generating stock report:', error.message, error.stack);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

//stock report formula
// Today's opening balance = closing balance at the end of yesterday + today's opening balance
// Closing balance at the end of today = Today's opening balance + purchased - Issued - wastage

/* Get department issues report
const getDepartmentIssuesReport = async (req, res) => {
    const { startDate, endDate, departmentId } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    try {
        let query = `
            SELECT 
                i.id AS issuance_id,
                i.issuance_date,
                d.name AS department_name,
                i.received_by,
                it.item_code,
                it.name AS item_name,
                ii.quantity,
                it.unit,
                i.remarks
            FROM issuances i
            JOIN issuance_items ii ON i.id = ii.issuance_id
            JOIN items it ON ii.item_id = it.id
            JOIN departments d ON i.department_id = d.id
            WHERE DATE(i.issuance_date) BETWEEN ? AND ?
        `;
        
        const params = [startDate, endDate];
        
        // Add department filter if provided
        if (departmentId) {
            query += ' AND i.department_id = ?';
            params.push(departmentId);
        }
        
        query += ' ORDER BY i.issuance_date DESC, i.id';
        
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching department issues report:', error);
        res.status(500).json({ error: 'Server error' });
    }
};
*/

const getDepartmentIssuesReport = async (req, res) => {
    const { startDate, endDate, departmentId, itemId } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    try {
        let query = `
            SELECT 
                i.id AS issuance_id,
                i.issuance_date,
                d.name AS department_name,
                i.received_by,
                it.item_code,
                it.name AS item_name,
                ii.quantity,
                it.unit,
                i.remarks,
                -- Get the latest purchase price before issuance date
                (
                    SELECT pi.unit_price 
                    FROM purchase_items pi
                    JOIN purchases p ON pi.purchase_id = p.id
                    WHERE pi.item_id = it.id 
                    AND p.purchase_date <= i.issuance_date
                    ORDER BY p.purchase_date DESC 
                    LIMIT 1
                ) AS unit_price,
                -- Calculate total price
                ii.quantity * (
                    SELECT pi.unit_price 
                    FROM purchase_items pi
                    JOIN purchases p ON pi.purchase_id = p.id
                    WHERE pi.item_id = it.id 
                    AND p.purchase_date <= i.issuance_date
                    ORDER BY p.purchase_date DESC 
                    LIMIT 1
                ) AS total_price
            FROM issuances i
            JOIN issuance_items ii ON i.id = ii.issuance_id
            JOIN items it ON ii.item_id = it.id
            JOIN departments d ON i.department_id = d.id
            WHERE DATE(i.issuance_date) BETWEEN ? AND ?
        `;
        
        const params = [startDate, endDate];
        
        // Add department filter if provided
        if (departmentId && departmentId !== 'all') {
            query += ' AND i.department_id = ?';
            params.push(departmentId);
        }
        
        // Add item filter if provided
        if (itemId && itemId !== 'all') {
            query += ' AND it.id = ?';
            params.push(itemId);
        }
        
        query += ' ORDER BY i.issuance_date DESC, i.id';
        
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching department issues report:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

const getPurchasingReport = async (req, res) => {
  const { startDate, endDate, companyId } = req.query;

  try {
    let query = `
      SELECT 
        p.id,
        p.invoice_no,
        p.purchase_date,
        s.name AS supplier_name,
        p.payment_method,
        p.bill_amount,
        p.paid_amount,
        p.check_number,
        c.name AS company_name,
        p.company_id
      FROM purchases p
      JOIN supplier s ON p.supplier_id = s.id
      LEFT JOIN company c ON p.company_id = c.id
      WHERE p.purchase_date BETWEEN ? AND ?
    `;

    const params = [startDate, endDate];

    if (companyId) {
      query += ' AND p.company_id = ?';
      params.push(companyId);
    }

    query += ' ORDER BY p.purchase_date DESC';

    const [purchases] = await pool.query(query, params);

    // Fetch items for each purchase
    const purchasesWithItems = await Promise.all(
      purchases.map(async (purchase) => {
        const [items] = await pool.query(`
          SELECT 
            pi.*,
            i.item_code,
            i.name as item_name,
            i.unit
          FROM purchase_items pi
          LEFT JOIN items i ON pi.item_id = i.id
          WHERE pi.purchase_id = ?
        `, [purchase.id]);
        
        return {
          ...purchase,
          items
        };
      })
    );

    res.json(purchasesWithItems);
  } catch (error) {
    console.error('Error fetching purchasing report:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getWastageReport = async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Start date and end date are required' });
  }

  try {
    const [wastages] = await pool.query(`
      SELECT 
        w.id,
        w.wastage_note_number,
        w.date,
        w.approved_by,
        w.reason,
        w.remarks,
        u.email AS entered_by
      FROM wastages w
      JOIN users u ON w.entered_by = u.id
      WHERE w.date BETWEEN ? AND ?
      ORDER BY w.date DESC
    `, [startDate, endDate]);

    if (wastages.length === 0) {
      return res.json([]);
    }

    // Fetch items for each wastage
    const wastageIds = wastages.map(w => w.id);
    const [items] = await pool.query(`
      SELECT 
        wi.wastage_id,
        i.item_code,
        i.name AS item_name,
        wi.quantity,
        i.unit,
        wi.estimated_loss
      FROM wastage_items wi
      JOIN items i ON wi.item_id = i.id
      WHERE wi.wastage_id IN (?)
    `, [wastageIds]);

    // Attach items to their wastages
    const result = wastages.map(wastage => ({
      ...wastage,
      items: items.filter(item => item.wastage_id === wastage.id)
    }));

    res.json(result);
  } catch (error) {
    console.error('Error generating wastage report:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Item-wise summary report
const getDepartmentItemsSummary = async (req, res) => {
  const { startDate, endDate, departmentId } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    let query = `
      SELECT 
        i.id AS issuance_id,
        d.name AS department_name,
        it.item_code,
        it.name AS item_name,
        SUM(ii.quantity) AS total_issued,
        it.unit
      FROM issuances i
      JOIN issuance_items ii ON i.id = ii.issuance_id
      JOIN items it ON ii.item_id = it.id
      JOIN departments d ON i.department_id = d.id
      WHERE DATE(i.issuance_date) BETWEEN ? AND ?
    `;
    const params = [startDate, endDate];

    if (departmentId) {
      query += " AND i.department_id = ?";
      params.push(departmentId);
    }

    query += " GROUP BY d.name, it.item_code, it.name, it.unit ORDER BY d.name, it.item_code";

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching department item summary:", error);
    res.status(500).json({ error: "Server error" });
  }
};

const getDateRange = (start, end) => {
  const dates = [];
  let current = new Date(start);
  const last = new Date(end);

  while (current <= last) {
    dates.push(current.toISOString().slice(0, 10)); // format YYYY-MM-DD
    current.setDate(current.getDate() + 1);
  }

  return dates;
};

/*
const getStockReportByRangeAndItem = async (req, res) => {
  try {
    const { startDate, endDate, itemId } = req.query;

    if (!startDate || !endDate || !itemId) {
      return res.status(400).json({ error: 'startDate, endDate, and itemId are required (format: YYYY-MM-DD)' });
    }

    const dateRange = getDateRange(startDate, endDate);
    const report = [];

    // Step 1: Get opening balance info
    const [[openingRow]] = await pool.query(
      `SELECT date, quantity FROM opening_balances WHERE item_id = ?`,
      [itemId]
    );

    let openingBalanceDate = null;
    let openingBalanceQty = 0;

    if (openingRow) {
      openingBalanceDate = openingRow.date.toISOString().slice(0, 10);
      openingBalanceQty = parseFloat(openingRow.quantity);
    }

    let closingBalance = 0; // very first day opening is 0

    for (let i = 0; i < dateRange.length; i++) {
      const date = dateRange[i];

      let opening = (i === 0) ? 0 : closingBalance;
      let purchased = 0;
      let issued = 0;
      let wasted = 0;

      // If opening balance date matches current date, add to purchased
      if (date === openingBalanceDate) {
        purchased += openingBalanceQty;
      }

      const [[{ purchased: dbPurchased = 0 }]] = await pool.query(
        `SELECT SUM(pi.quantity) AS purchased
         FROM purchase_items pi
         JOIN purchases p ON pi.purchase_id = p.id
         WHERE pi.item_id = ? AND DATE(p.purchase_date) = ?`,
        [itemId, date]
      );

      const [[{ issued: dbIssued = 0 }]] = await pool.query(
        `SELECT SUM(ii.quantity) AS issued
         FROM issuance_items ii
         JOIN issuances i ON ii.issuance_id = i.id
         WHERE ii.item_id = ? AND DATE(i.issuance_date) = ?`,
        [itemId, date]
      );

      const [[{ wasted: dbWasted = 0 }]] = await pool.query(
        `SELECT SUM(wi.quantity) AS wasted
         FROM wastage_items wi
         JOIN wastages w ON wi.wastage_id = w.id
         WHERE wi.item_id = ? AND DATE(w.date) = ?`,
        [itemId, date]
      );

      purchased += parseFloat(dbPurchased || 0);
      issued = parseFloat(dbIssued || 0);
      wasted = parseFloat(dbWasted || 0);

      closingBalance = opening + purchased - issued - wasted;

      report.push({
        date,
        opening,
        purchased,
        issued,
        wasted,
        closing: closingBalance
      });
    }

    res.json(report);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
};
*/

const getStockReportByRangeAndItem = async (req, res) => {
  try {
    const { startDate, endDate, itemId } = req.query;

    if (!startDate || !endDate || !itemId) {
      return res.status(400).json({ error: 'startDate, endDate, and itemId are required (format: YYYY-MM-DD)' });
    }

    const dateRange = getDateRange(startDate, endDate);
    const report = [];

    // Get the opening balance from before the start date
    const [[openingRow]] = await pool.query(
      `SELECT date, quantity FROM opening_balances 
       WHERE item_id = ? AND date < ? 
       ORDER BY date DESC LIMIT 1`,
      [itemId, startDate]
    );

    let openingBalance = 0;
    if (openingRow) {
      openingBalance = parseFloat(openingRow.quantity);
    }

    // Get all transactions before the start date to calculate the initial opening
    const [[{ purchased: prePurchased = 0 }]] = await pool.query(
      `SELECT SUM(pi.quantity) AS purchased
       FROM purchase_items pi
       JOIN purchases p ON pi.purchase_id = p.id
       WHERE pi.item_id = ? AND DATE(p.purchase_date) < ?`,
      [itemId, startDate]
    );

    const [[{ issued: preIssued = 0 }]] = await pool.query(
      `SELECT SUM(ii.quantity) AS issued
       FROM issuance_items ii
       JOIN issuances i ON ii.issuance_id = i.id
       WHERE ii.item_id = ? AND DATE(i.issuance_date) < ?`,
      [itemId, startDate]
    );

    const [[{ wasted: preWasted = 0 }]] = await pool.query(
      `SELECT SUM(wi.quantity) AS wasted
       FROM wastage_items wi
       JOIN wastages w ON wi.wastage_id = w.id
       WHERE wi.item_id = ? AND DATE(w.date) < ?`,
      [itemId, startDate]
    );

    // Calculate initial opening balance
    let runningBalance = openingBalance + parseFloat(prePurchased || 0) - 
                         parseFloat(preIssued || 0) - parseFloat(preWasted || 0);

    for (const date of dateRange) {
      let opening = runningBalance;
      let purchased = 0;
      let issued = 0;
      let wasted = 0;

      // Check if there's an opening balance specifically for this date
      const [[specificOpening]] = await pool.query(
        `SELECT quantity FROM opening_balances 
         WHERE item_id = ? AND DATE(date) = ?`,
        [itemId, date]
      );

      if (specificOpening) {
        opening = parseFloat(specificOpening.quantity);
        runningBalance = opening; // Reset running balance to the opening balance
      }

      const [[{ purchased: dbPurchased = 0 }]] = await pool.query(
        `SELECT SUM(pi.quantity) AS purchased
         FROM purchase_items pi
         JOIN purchases p ON pi.purchase_id = p.id
         WHERE pi.item_id = ? AND DATE(p.purchase_date) = ?`,
        [itemId, date]
      );

      const [[{ issued: dbIssued = 0 }]] = await pool.query(
        `SELECT SUM(ii.quantity) AS issued
         FROM issuance_items ii
         JOIN issuances i ON ii.issuance_id = i.id
         WHERE ii.item_id = ? AND DATE(i.issuance_date) = ?`,
        [itemId, date]
      );

      const [[{ wasted: dbWasted = 0 }]] = await pool.query(
        `SELECT SUM(wi.quantity) AS wasted
         FROM wastage_items wi
         JOIN wastages w ON wi.wastage_id = w.id
         WHERE wi.item_id = ? AND DATE(w.date) = ?`,
        [itemId, date]
      );

      // Add database values
      purchased = parseFloat(dbPurchased || 0);
      issued = parseFloat(dbIssued || 0);
      wasted = parseFloat(dbWasted || 0);

      const closing = opening + purchased - issued - wasted;
      runningBalance = closing;

      report.push({
        date,
        opening,
        purchased,
        issued,
        wasted,
        closing
      });
    }

    res.json(report);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
};

// Get daily purchase transactions
const getDailyPurchaseTransactions = async (req, res) => {
  try {
    const { date, itemId } = req.query;

    if (!date || !itemId) {
      return res.status(400).json({ error: 'Date and itemId are required' });
    }

    const [rows] = await pool.query(`
      SELECT 
        p.id,
        p.invoice_no,
        s.name AS supplier_name,
        pi.quantity,
        pi.unit_price,
        (pi.quantity * pi.unit_price) AS total_price
      FROM purchases p
      JOIN purchase_items pi ON p.id = pi.purchase_id
      JOIN supplier s ON p.supplier_id = s.id
      WHERE DATE(p.purchase_date) = ? 
        AND pi.item_id = ?
      ORDER BY p.invoice_no
    `, [date, itemId]);

    res.json(rows);
  } catch (error) {
    console.error('Error fetching daily purchase transactions:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get daily issuance transactions
const getDailyIssuanceTransactions = async (req, res) => {
  try {
    const { date, itemId } = req.query;

    if (!date || !itemId) {
      return res.status(400).json({ error: 'Date and itemId are required' });
    }

    const [rows] = await pool.query(`
      SELECT 
        i.id AS issuance_id,
        d.name AS department_name,
        i.received_by,
        ii.quantity,
        i.remarks
      FROM issuances i
      JOIN issuance_items ii ON i.id = ii.issuance_id
      JOIN departments d ON i.department_id = d.id
      WHERE DATE(i.issuance_date) = ? 
        AND ii.item_id = ?
      ORDER BY i.id
    `, [date, itemId]);

    res.json(rows);
  } catch (error) {
    console.error('Error fetching daily issuance transactions:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get daily wastage transactions
const getDailyWastageTransactions = async (req, res) => {
  try {
    const { date, itemId } = req.query;

    if (!date || !itemId) {
      return res.status(400).json({ error: 'Date and itemId are required' });
    }

    const [rows] = await pool.query(`
      SELECT 
        w.id AS wastage_id,
        w.wastage_note_number,
        w.approved_by,
        w.reason,
        wi.quantity,
        wi.estimated_loss
      FROM wastages w
      JOIN wastage_items wi ON w.id = wi.wastage_id
      WHERE DATE(w.date) = ? 
        AND wi.item_id = ?
      ORDER BY w.wastage_note_number
    `, [date, itemId]);

    res.json(rows);
  } catch (error) {
    console.error('Error fetching daily wastage transactions:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get purchasing item-wise report
const getPurchasingItemWiseReport = async (req, res) => {
  const { startDate, endDate, companyId } = req.query;

  try {
    let query = `
      SELECT 
        p.id AS purchase_id,
        p.invoice_no,
        p.purchase_date,
        s.name AS supplier_name,
        p.payment_method,
        c.name AS company_name,
        i.item_code,
        i.name AS item_name,
        pi.quantity,
        i.unit,
        pi.unit_price,
        (pi.quantity * pi.unit_price) AS total_price
      FROM purchases p
      JOIN purchase_items pi ON p.id = pi.purchase_id
      JOIN items i ON pi.item_id = i.id
      JOIN supplier s ON p.supplier_id = s.id
      LEFT JOIN company c ON p.company_id = c.id
      WHERE p.purchase_date BETWEEN ? AND ?
    `;

    const params = [startDate, endDate];

    if (companyId) {
      query += ' AND p.company_id = ?';
      params.push(companyId);
    }

    query += ' ORDER BY p.purchase_date DESC, p.invoice_no, i.item_code';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching purchasing item-wise report:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Add to module.exports
module.exports = {
  getStockReport,
  getDepartmentIssuesReport,
  getPurchasingReport,
  getWastageReport,
  getDepartmentItemsSummary,
  getStockReportByRangeAndItem,
  getDailyIssuanceTransactions,
  getDailyPurchaseTransactions,
  getDailyWastageTransactions,
  getPurchasingItemWiseReport
};