const pool = require('../config/db');
const { normalizePaymentMethodValue } = require('../utils/paymentMethodUtils');
const { loadExpenseRecords, dateFilters } = require('./analystController');

const getStockReport = async (req, res) => {
  try {
    const { date, status, category } = req.query;

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

    let statusCondition = '';
    if (status) {
      const s = String(status).toLowerCase();
      if (s === 'active') {
        statusCondition = ' AND i.is_active = TRUE';
      } else if (s === 'inactive') {
        statusCondition = ' AND i.is_active = FALSE';
      }
    }

    let categoryCondition = '';
    const additionalParams = [];
    if (category && category !== 'All' && category !== 'all' && category !== 'All Categories') {
      categoryCondition = ' AND (i.item_type = ? OR (? = "Other" AND i.item_type IS NULL))';
      additionalParams.push(category, category);
    }

    const query = `
      SELECT 
        i.id,
        i.item_code,
        i.name AS item_name,
        i.unit,
        i.item_type,
        i.item_type AS category,
        i.is_active,
        i.auto_add_to_stock,
        COALESCE(prev.closing_balance, 0) + COALESCE(ob_today.opening_balance_today, 0) AS opening_balance,
        COALESCE(purchases.total_purchased, 0) AS total_purchased,
        COALESCE(issues.total_issued, 0) AS total_issued,
        COALESCE(wastage.total_wasted, 0) AS total_wasted,
        COALESCE(returns.total_returned, 0) AS total_returned,
        COALESCE(purchase_returns.total_purchase_returned, 0) AS total_purchase_returned,
        COALESCE(adjustments.total_adjusted, 0) AS total_adjusted,
        (
          COALESCE(prev.closing_balance, 0) +
          COALESCE(ob_today.opening_balance_today, 0) +
          COALESCE(purchases.total_purchased, 0) -
          COALESCE(issues.total_issued, 0) -
          COALESCE(wastage.total_wasted, 0) +
          COALESCE(returns.total_returned, 0) -
          COALESCE(purchase_returns.total_purchase_returned, 0) +
          COALESCE(adjustments.total_adjusted, 0)
        ) AS closing_balance,
        (
          SELECT pi.unit_price 
          FROM purchase_items pi
          JOIN purchases p ON pi.purchase_id = p.id
          WHERE pi.item_id = i.id 
            AND DATE(p.purchase_date) <= ?
          ORDER BY p.purchase_date DESC, pi.id DESC 
          LIMIT 1
        ) AS unit_price
      FROM items i
      LEFT JOIN (
        SELECT 
          i2.id AS item_id,
          (
            COALESCE(ob.opening_balance, 0) +
            COALESCE(purchases.total_purchased, 0) -
            COALESCE(issues.total_issued, 0) -
            COALESCE(wastage.total_wasted, 0) +
            COALESCE(returns.total_returned, 0) -
            COALESCE(purchase_returns.total_purchase_returned, 0) +
            COALESCE(adjustments.total_adjusted, 0)
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
          JOIN items i ON pi.item_id = i.id
          WHERE DATE(p.purchase_date) <= ? AND (p.deleted = FALSE OR p.deleted IS NULL)
          GROUP BY i.id
        ) purchases ON i2.id = purchases.item_id
        LEFT JOIN (
          SELECT ii.item_id, SUM(ii.quantity) AS total_issued
          FROM issuance_items ii
          JOIN issuances iss ON ii.issuance_id = iss.id
          WHERE DATE(iss.issuance_date) <= ?
          GROUP BY ii.item_id
        ) issues ON i2.id = issues.item_id
        LEFT JOIN (
          SELECT wi.item_id, SUM(wi.quantity) AS total_wasted
          FROM wastage_items wi
          JOIN wastages w ON wi.wastage_id = w.id
          WHERE DATE(w.date) <= ?
          GROUP BY wi.item_id
        ) wastage ON i2.id = wastage.item_id
        LEFT JOIN (
          SELECT ri.item_id, SUM(ri.quantity) AS total_returned
          FROM return_items ri
          JOIN returns r ON ri.return_id = r.id
          WHERE DATE(r.return_date) <= ?
          GROUP BY ri.item_id
        ) returns ON i2.id = returns.item_id
        LEFT JOIN (
          SELECT pri.item_id, SUM(pri.quantity) AS total_purchase_returned
          FROM purchase_return_items pri
          JOIN purchase_returns pr ON pri.return_id = pr.id
          WHERE DATE(pr.return_date) <= ?
          GROUP BY pri.item_id
        ) purchase_returns ON i2.id = purchase_returns.item_id
        LEFT JOIN (
          SELECT item_id, SUM(variance) AS total_adjusted
          FROM stock_adjustments
          WHERE DATE(date) <= ?
          GROUP BY item_id
        ) adjustments ON i2.id = adjustments.item_id
        WHERE i2.deleted = FALSE
      ) prev ON i.id = prev.item_id
      LEFT JOIN (
        SELECT item_id, SUM(quantity) AS opening_balance_today
        FROM opening_balances
        WHERE DATE(date) = ?
        GROUP BY item_id
      ) ob_today ON i.id = ob_today.item_id
      LEFT JOIN (
        SELECT i.id AS item_id, SUM(pi.quantity) AS total_purchased
        FROM purchase_items pi
        JOIN purchases p ON pi.purchase_id = p.id
        JOIN items i ON pi.item_id = i.id
        WHERE DATE(p.purchase_date) = ? AND (p.deleted = FALSE OR p.deleted IS NULL)
        GROUP BY i.id
      ) purchases ON i.id = purchases.item_id
      LEFT JOIN (
        SELECT ii.item_id, SUM(ii.quantity) AS total_issued
        FROM issuance_items ii
        JOIN issuances iss ON ii.issuance_id = iss.id
        WHERE DATE(iss.issuance_date) = ?
        GROUP BY ii.item_id
      ) issues ON i.id = issues.item_id
      LEFT JOIN (
        SELECT wi.item_id, SUM(wi.quantity) AS total_wasted
        FROM wastage_items wi
        JOIN wastages w ON wi.wastage_id = w.id
        WHERE DATE(w.date) = ?
        GROUP BY wi.item_id
      ) wastage ON i.id = wastage.item_id
      LEFT JOIN (
        SELECT ri.item_id, SUM(ri.quantity) AS total_returned
        FROM return_items ri
        JOIN returns r ON ri.return_id = r.id
        WHERE DATE(r.return_date) = ?
        GROUP BY ri.item_id
      ) returns ON i.id = returns.item_id
      LEFT JOIN (
        SELECT pri.item_id, SUM(pri.quantity) AS total_purchase_returned
        FROM purchase_return_items pri
        JOIN purchase_returns pr ON pri.return_id = pr.id
        WHERE DATE(pr.return_date) = ?
        GROUP BY pri.item_id
      ) purchase_returns ON i.id = purchase_returns.item_id
      LEFT JOIN (
        SELECT item_id, SUM(variance) AS total_adjusted
        FROM stock_adjustments
        WHERE DATE(date) = ?
        GROUP BY item_id
      ) adjustments ON i.id = adjustments.item_id
      WHERE i.auto_add_to_stock = 1
        AND i.deleted = FALSE
        ${statusCondition}
        ${categoryCondition}
      ORDER BY i.item_code
    `;

    const params = [
      date, // For unit price subquery
      prevDateStr, prevDateStr, prevDateStr, prevDateStr, prevDateStr, prevDateStr, prevDateStr, // yesterday x7
      date,                                              // today opening
      date, date, date, date, date, date,                // today purchases/issues/wastage/returns/purchase_returns/adjustments
      ...additionalParams
    ];

    const [rows] = await pool.query(query, params);

    // Calculate value for each item
    const stockDataWithValue = rows.map(item => {
      const closingBalance = Number(item.closing_balance) || 0;
      const unitPrice = Number(item.unit_price) || 0;
      const value = (closingBalance * unitPrice).toFixed(2);
      
      return {
        ...item,
        category: item.item_type || 'Other',
        value: value,
        unit_price: unitPrice,
        stock_type: 'Auto-Managed'
      };
    });

    res.json(stockDataWithValue);

  } catch (error) {
    console.error('Error generating stock report:', error.message, error.stack);
    res.status(500).json({ error: 'Server error: ' + error.message });
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

const getStockReportByRangeAndItem = async (req, res) => {
  try {
    const { startDate, endDate, itemId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required (format: YYYY-MM-DD)' });
    }

    const isAllItems = !itemId || itemId === 'all';

    if (!isAllItems) {
      // 🔥 Check if the requested item is auto-add enabled
      const [itemCheck] = await pool.query(
        'SELECT auto_add_to_stock FROM items WHERE id = ? AND deleted = FALSE',
        [itemId]
      );

      if (itemCheck.length === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }

      if (itemCheck[0].auto_add_to_stock === 0) {
        return res.status(400).json({ 
          error: 'This report only shows Auto-Add enabled items. Selected item is manual.' 
        });
      }
    }

    const dateRange = getDateRange(startDate, endDate);
    const report = [];

    // Get the opening balance from before the start date
    let openingBalance = 0;
    if (!isAllItems) {
      const [[openingRow]] = await pool.query(
        `SELECT date, quantity FROM opening_balances 
         WHERE item_id = ? AND date < ? 
         ORDER BY date DESC LIMIT 1`,
        [itemId, startDate]
      );
      if (openingRow) {
        openingBalance = parseFloat(openingRow.quantity);
      }
    } else {
      const [[openingRow]] = await pool.query(
        `SELECT SUM(ob.quantity) AS quantity 
         FROM opening_balances ob
         JOIN items i ON ob.item_id = i.id
         WHERE i.auto_add_to_stock = 1 AND (i.deleted = FALSE OR i.deleted IS NULL) AND ob.date < ?`,
        [startDate]
      );
      if (openingRow && openingRow.quantity !== null) {
        openingBalance = parseFloat(openingRow.quantity);
      }
    }

    // Get all transactions before the start date
    const [[{ purchased: prePurchased = 0 }]] = !isAllItems
      ? await pool.query(
          `SELECT SUM(pi.quantity) AS purchased
           FROM purchase_items pi
           JOIN purchases p ON pi.purchase_id = p.id
           WHERE pi.item_id = ? AND DATE(p.purchase_date) < ? AND (p.deleted = FALSE OR p.deleted IS NULL)`,
          [itemId, startDate]
        )
      : await pool.query(
          `SELECT SUM(pi.quantity) AS purchased
           FROM purchase_items pi
           JOIN purchases p ON pi.purchase_id = p.id
           JOIN items i ON pi.item_id = i.id
           WHERE i.auto_add_to_stock = 1 AND (i.deleted = FALSE OR i.deleted IS NULL)
             AND DATE(p.purchase_date) < ? AND (p.deleted = FALSE OR p.deleted IS NULL)`,
          [startDate]
        );

    const [[{ issued: preIssued = 0 }]] = !isAllItems
      ? await pool.query(
          `SELECT SUM(ii.quantity) AS issued
           FROM issuance_items ii
           JOIN issuances i ON ii.issuance_id = i.id
           WHERE ii.item_id = ? AND DATE(i.issuance_date) < ?`,
          [itemId, startDate]
        )
      : await pool.query(
          `SELECT SUM(ii.quantity) AS issued
           FROM issuance_items ii
           JOIN issuances i ON ii.issuance_id = i.id
           JOIN items it ON ii.item_id = it.id
           WHERE it.auto_add_to_stock = 1 AND (it.deleted = FALSE OR it.deleted IS NULL)
             AND DATE(i.issuance_date) < ?`,
          [startDate]
        );

    const [[{ wasted: preWasted = 0 }]] = !isAllItems
      ? await pool.query(
          `SELECT SUM(wi.quantity) AS wasted
           FROM wastage_items wi
           JOIN wastages w ON wi.wastage_id = w.id
           WHERE wi.item_id = ? AND DATE(w.date) < ?`,
          [itemId, startDate]
        )
      : await pool.query(
          `SELECT SUM(wi.quantity) AS wasted
           FROM wastage_items wi
           JOIN wastages w ON wi.wastage_id = w.id
           JOIN items it ON wi.item_id = it.id
           WHERE it.auto_add_to_stock = 1 AND (it.deleted = FALSE OR it.deleted IS NULL)
             AND DATE(w.date) < ?`,
          [startDate]
        );

    const [[{ returned: preReturned = 0 }]] = !isAllItems
      ? await pool.query(
          `SELECT SUM(ri.quantity) AS returned
           FROM return_items ri
           JOIN returns r ON ri.return_id = r.id
           WHERE ri.item_id = ? AND DATE(r.return_date) < ?`,
          [itemId, startDate]
        )
      : await pool.query(
          `SELECT SUM(ri.quantity) AS returned
           FROM return_items ri
           JOIN returns r ON ri.return_id = r.id
           JOIN items it ON ri.item_id = it.id
           WHERE it.auto_add_to_stock = 1 AND (it.deleted = FALSE OR it.deleted IS NULL)
             AND DATE(r.return_date) < ?`,
          [startDate]
        );

    const [[{ purchaseReturned: prePurchaseReturned = 0 }]] = !isAllItems
      ? await pool.query(
          `SELECT SUM(pri.quantity) AS purchaseReturned
           FROM purchase_return_items pri
           JOIN purchase_returns pr ON pri.return_id = pr.id
           WHERE pri.item_id = ? AND DATE(pr.return_date) < ?`,
          [itemId, startDate]
        )
      : await pool.query(
          `SELECT SUM(pri.quantity) AS purchaseReturned
           FROM purchase_return_items pri
           JOIN purchase_returns pr ON pri.return_id = pr.id
           JOIN items it ON pri.item_id = it.id
           WHERE it.auto_add_to_stock = 1 AND (it.deleted = FALSE OR it.deleted IS NULL)
             AND DATE(pr.return_date) < ?`,
          [startDate]
        );

    const [[{ adjusted: preAdjusted = 0 }]] = !isAllItems
      ? await pool.query(
          `SELECT SUM(variance) AS adjusted
           FROM stock_adjustments
           WHERE item_id = ? AND DATE(date) < ?`,
          [itemId, startDate]
        )
      : await pool.query(
          `SELECT SUM(variance) AS adjusted
           FROM stock_adjustments sa
           JOIN items it ON sa.item_id = it.id
           WHERE it.auto_add_to_stock = 1 AND (it.deleted = FALSE OR it.deleted IS NULL)
             AND DATE(sa.date) < ?`,
          [startDate]
        );

    // Calculate initial opening balance
    let runningBalance = openingBalance + 
                        parseFloat(prePurchased || 0) - 
                        parseFloat(preIssued || 0) - 
                        parseFloat(preWasted || 0) +
                        parseFloat(preReturned || 0) -
                        parseFloat(prePurchaseReturned || 0) +
                        parseFloat(preAdjusted || 0);

    for (const date of dateRange) {
      let opening = runningBalance;
      let purchased = 0;
      let issued = 0;
      let wasted = 0;
      let returned = 0;
      let purchaseReturned = 0;
      let adjusted = 0;

      // Check if there's an opening balance specifically for this date
      if (!isAllItems) {
        const [[specificOpening]] = await pool.query(
          `SELECT quantity FROM opening_balances 
           WHERE item_id = ? AND DATE(date) = ?`,
          [itemId, date]
        );

        if (specificOpening) {
          opening = parseFloat(specificOpening.quantity);
          runningBalance = opening;
        }
      }

      const [[{ purchased: dbPurchased = 0 }]] = !isAllItems
        ? await pool.query(
            `SELECT SUM(pi.quantity) AS purchased
             FROM purchase_items pi
             JOIN purchases p ON pi.purchase_id = p.id
             WHERE pi.item_id = ? AND DATE(p.purchase_date) = ? AND (p.deleted = FALSE OR p.deleted IS NULL)`,
            [itemId, date]
          )
        : await pool.query(
            `SELECT SUM(pi.quantity) AS purchased
             FROM purchase_items pi
             JOIN purchases p ON pi.purchase_id = p.id
             JOIN items i ON pi.item_id = i.id
             WHERE i.auto_add_to_stock = 1 AND (i.deleted = FALSE OR i.deleted IS NULL)
               AND DATE(p.purchase_date) = ? AND (p.deleted = FALSE OR p.deleted IS NULL)`,
            [date]
          );

      const [[{ issued: dbIssued = 0 }]] = !isAllItems
        ? await pool.query(
            `SELECT SUM(ii.quantity) AS issued
             FROM issuance_items ii
             JOIN issuances i ON ii.issuance_id = i.id
             WHERE ii.item_id = ? AND DATE(i.issuance_date) = ?`,
            [itemId, date]
          )
        : await pool.query(
            `SELECT SUM(ii.quantity) AS issued
             FROM issuance_items ii
             JOIN issuances i ON ii.issuance_id = i.id
             JOIN items it ON ii.item_id = it.id
             WHERE it.auto_add_to_stock = 1 AND (it.deleted = FALSE OR it.deleted IS NULL)
               AND DATE(i.issuance_date) = ?`,
            [date]
          );

      const [[{ wasted: dbWasted = 0 }]] = !isAllItems
        ? await pool.query(
            `SELECT SUM(wi.quantity) AS wasted
             FROM wastage_items wi
             JOIN wastages w ON wi.wastage_id = w.id
             WHERE wi.item_id = ? AND DATE(w.date) = ?`,
            [itemId, date]
          )
        : await pool.query(
            `SELECT SUM(wi.quantity) AS wasted
             FROM wastage_items wi
             JOIN wastages w ON wi.wastage_id = w.id
             JOIN items it ON wi.item_id = it.id
             WHERE it.auto_add_to_stock = 1 AND (it.deleted = FALSE OR it.deleted IS NULL)
               AND DATE(w.date) = ?`,
            [date]
          );

      const [[{ returned: dbReturned = 0 }]] = !isAllItems
        ? await pool.query(
            `SELECT SUM(ri.quantity) AS returned
             FROM return_items ri
             JOIN returns r ON ri.return_id = r.id
             WHERE ri.item_id = ? AND DATE(r.return_date) = ?`,
            [itemId, date]
          )
        : await pool.query(
            `SELECT SUM(ri.quantity) AS returned
             FROM return_items ri
             JOIN returns r ON ri.return_id = r.id
             JOIN items it ON ri.item_id = it.id
             WHERE it.auto_add_to_stock = 1 AND (it.deleted = FALSE OR it.deleted IS NULL)
               AND DATE(r.return_date) = ?`,
            [date]
          );

      const [[{ purchaseReturned: dbPurchaseReturned = 0 }]] = !isAllItems
        ? await pool.query(
            `SELECT SUM(pri.quantity) AS purchaseReturned
             FROM purchase_return_items pri
             JOIN purchase_returns pr ON pri.return_id = pr.id
             WHERE pri.item_id = ? AND DATE(pr.return_date) = ?`,
            [itemId, date]
          )
        : await pool.query(
            `SELECT SUM(pri.quantity) AS purchaseReturned
             FROM purchase_return_items pri
             JOIN purchase_returns pr ON pri.return_id = pr.id
             JOIN items it ON pri.item_id = it.id
             WHERE it.auto_add_to_stock = 1 AND (it.deleted = FALSE OR it.deleted IS NULL)
               AND DATE(pr.return_date) = ?`,
            [date]
          );

      const [[{ adjusted: dbAdjusted = 0 }]] = !isAllItems
        ? await pool.query(
            `SELECT SUM(variance) AS adjusted
             FROM stock_adjustments
             WHERE item_id = ? AND DATE(date) = ?`,
            [itemId, date]
          )
        : await pool.query(
            `SELECT SUM(variance) AS adjusted
             FROM stock_adjustments sa
             JOIN items it ON sa.item_id = it.id
             WHERE it.auto_add_to_stock = 1 AND (it.deleted = FALSE OR it.deleted IS NULL)
               AND DATE(sa.date) = ?`,
            [date]
          );

      purchased = parseFloat(dbPurchased || 0);
      issued = parseFloat(dbIssued || 0);
      wasted = parseFloat(dbWasted || 0);
      returned = parseFloat(dbReturned || 0);
      purchaseReturned = parseFloat(dbPurchaseReturned || 0);
      adjusted = parseFloat(dbAdjusted || 0);

      const closing = opening + purchased - issued - wasted + returned - purchaseReturned + adjusted;
      runningBalance = closing;

      report.push({
        date,
        opening,
        purchased,
        issued,
        wasted,
        returned,
        purchaseReturned,
        adjusted,
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
        AND (p.deleted = FALSE OR p.deleted IS NULL)
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

// Get daily return transactions
const getDailyReturnTransactions = async (req, res) => {
  try {
    const { date, itemId } = req.query;

    if (!date || !itemId) {
      return res.status(400).json({ error: 'Date and itemId are required' });
    }

    const [rows] = await pool.query(`
      SELECT 
        r.id AS return_id,
        r.return_number,
        d.name AS department_name,
        r.received_by,
        ri.quantity,
        ri.reason
      FROM returns r
      JOIN return_items ri ON r.id = ri.return_id
      JOIN departments d ON r.department_id = d.id
      WHERE DATE(r.return_date) = ? 
        AND ri.item_id = ?
      ORDER BY r.return_number
    `, [date, itemId]);

    res.json(rows);
  } catch (error) {
    console.error('Error fetching daily return transactions:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

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
                it.id AS item_id,
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
        
        query += ' ORDER BY i.issuance_date ASC, i.id ASC';
        
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching department issues report:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

/*
const getPurchasingReport = async (req, res) => {
  const { startDate, endDate, companyId } = req.query;

  try {
    // ✅ FIX: Query with payment aggregation from payment_history
    let query = `
      SELECT 
        p.id,
        p.invoice_no,
        p.purchase_date,
        s.name AS supplier_name,
        s.vat_number AS supplier_vat_number,
        p.payment_method,
        -- 🔥 FIX: Handle old bills without VAT columns
        CASE 
          WHEN p.total_with_vat IS NOT NULL AND p.total_with_vat > 0 THEN p.total_with_vat
          WHEN p.bill_amount IS NOT NULL AND p.bill_amount > 0 THEN p.bill_amount
          ELSE 0
        END AS bill_amount,
        -- ✅ AGGREGATED PAID AMOUNT from payment_history table
        COALESCE(SUM(ph.amount), 0) AS paid_amount,
        p.check_number,
        c.name AS company_name,
        p.company_id,
        -- 🔥 FIX: VAT columns for old bills
        COALESCE(p.vat_rate, 0) AS vat_rate,
        COALESCE(p.vat_amount, 0) AS vat_amount,
        COALESCE(p.subtotal, p.bill_amount, 0) AS subtotal
      FROM purchases p
      JOIN supplier s ON p.supplier_id = s.id
      LEFT JOIN company c ON p.company_id = c.id
      -- ✅ LEFT JOIN to payment_history for actual payments
      LEFT JOIN payment_history ph ON p.id = ph.purchase_id
      WHERE p.purchase_date BETWEEN ? AND ?
        AND (p.deleted = FALSE OR p.deleted IS NULL)
      GROUP BY 
        p.id, p.invoice_no, p.purchase_date, s.name, s.vat_number,
        p.payment_method, p.total_with_vat, p.bill_amount, p.check_number,
        c.name, p.company_id, p.vat_rate, p.vat_amount, p.subtotal
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
            COALESCE(i.name, pi.item_name) as item_name,
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

*/

const getPurchasingReport = async (req, res) => {
  // vatOnly=true restricts results to bills from VAT-registered suppliers only.
  // Used by the VAT Purchasing Report; the general Purchasing report (same
  // endpoint) omits this flag and keeps showing every supplier as before.
  const { startDate, endDate, companyId, vatOnly } = req.query;

  try {
    // ✅ FIX: Query with payment aggregation from payment_history
    let query = `
      SELECT 
        p.id,
        p.invoice_no,
        p.purchase_date,
        p.invoice_date,
        s.name AS supplier_name,
        s.vat_number AS supplier_vat_number,
        s.vat_registered AS supplier_vat_registered,
        p.payment_method,
        CASE 
          WHEN p.total_with_vat IS NOT NULL AND p.total_with_vat > 0 THEN p.total_with_vat
          WHEN p.bill_amount IS NOT NULL AND p.bill_amount > 0 THEN p.bill_amount
          ELSE 0
        END AS bill_amount,
        -- ✅ AGGREGATED PAID AMOUNT from payment_history table
        COALESCE(SUM(ph.amount), 0) AS paid_amount,
        p.check_number,
        c.name AS company_name,
        p.company_id,
        COALESCE(p.vat_rate, 0) AS vat_rate,
        COALESCE(p.vat_amount, 0) AS vat_amount,
        COALESCE(p.subtotal, p.bill_amount, 0) AS subtotal
      FROM purchases p
      JOIN supplier s ON p.supplier_id = s.id
      LEFT JOIN company c ON p.company_id = c.id
      -- ✅ LEFT JOIN to payment_history for actual payments
      LEFT JOIN payment_history ph ON p.id = ph.purchase_id
      WHERE COALESCE(p.invoice_date, p.purchase_date) BETWEEN ? AND ?
        AND (p.deleted = FALSE OR p.deleted IS NULL)
    `;

    const params = [startDate, endDate];

    // ✅ VAT Purchasing Report: only bills from VAT-registered suppliers
    if (vatOnly === 'true' || vatOnly === '1') {
      query += ' AND s.vat_registered = 1';
    }

    if (companyId) {
      query += ' AND p.company_id = ?';
      params.push(companyId);
    }

    query += `
      GROUP BY 
        p.id, p.invoice_no, p.purchase_date, p.invoice_date, s.name, s.vat_number, 
        s.vat_registered, p.payment_method, p.total_with_vat, p.bill_amount,
        p.check_number, c.name, p.company_id, p.vat_rate, 
        p.vat_amount, p.subtotal
    `;
    query += ' ORDER BY COALESCE(p.invoice_date, p.purchase_date) ASC, p.id ASC';

    const [purchases] = await pool.query(query, params);

    const purchasesWithItems = await Promise.all(
      purchases.map(async (purchase) => {
        const [items] = await pool.query(`
          SELECT 
            pi.*,
            i.item_code,
            COALESCE(i.name, pi.item_name) as item_name,
            i.unit,
            i.vat_applicable
          FROM purchase_items pi
          LEFT JOIN items i ON pi.item_id = i.id
          WHERE pi.purchase_id = ?
        `, [purchase.id]);
        
        return {
          ...purchase,
          items,
          source: 'purchase',
          description: 'Purchases'
        };
      })
    );

    if (vatOnly === 'true' || vatOnly === '1') {
      const expenseParams = [startDate, endDate];
      let expenseQuery = `
        SELECT
          e.id,
          e.bill_date AS purchase_date,
          e.bill_number AS invoice_no,
          e.payee_name AS supplier_name,
          e.vat_reg_number AS supplier_vat_number,
          e.expense_type AS expense_type,
          e.without_vat_amount AS net_amount,
          e.vat_amount AS vat_amount,
          e.total_bill_amount AS bill_amount,
          e.company_id,
          c.name AS company_name
        FROM expenses e
        LEFT JOIN company c ON c.id = e.company_id
        WHERE e.is_deleted = 0
          AND e.vat_amount > 0
          AND e.bill_date BETWEEN ? AND ?
      `;

      if (companyId) {
        expenseQuery += ' AND e.company_id = ?';
        expenseParams.push(companyId);
      }

      expenseQuery += ' ORDER BY e.bill_date ASC, e.id ASC';

      const [expenseRows] = await pool.query(expenseQuery, expenseParams);

      const expenseEntries = expenseRows.map((expense) => ({
        ...expense,
        id: `expense-${expense.id}`,
        source: 'expense',
        description: 'Expense',
        purchase_date: expense.purchase_date,
        invoice_no: expense.invoice_no || `EXP-${expense.id}`,
        supplier_name: expense.supplier_name || 'Expense',
        supplier_vat_number: expense.supplier_vat_number || '—',
        net_amount: parseFloat(expense.net_amount) || 0,
        vat_amount: parseFloat(expense.vat_amount) || 0,
        bill_amount: parseFloat(expense.bill_amount) || 0,
        items: []
      }));

      // Merge the two sources into one ascending-by-date list (oldest first),
      // with a stable id tiebreak for same-day rows.
      const combined = [...purchasesWithItems, ...expenseEntries];
      combined.sort((a, b) => {
        const dateDiff = new Date(a.purchase_date) - new Date(b.purchase_date);
        if (dateDiff !== 0) return dateDiff;
        return String(a.id).localeCompare(String(b.id));
      });
      return res.json(combined);
    }

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
        u.username AS entered_by
      FROM wastages w
      JOIN users u ON w.entered_by = u.id
      WHERE w.date BETWEEN ? AND ?
      ORDER BY w.date ASC, w.id ASC
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

    query += ' ORDER BY p.purchase_date ASC, p.invoice_no, i.item_code';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching purchasing item-wise report:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Add this function to get latest unit price
const getLatestUnitPrice = async (req, res) => {
  try {
    const { itemId, date } = req.query;

    if (!itemId || !date) {
      return res.status(400).json({ error: 'Item ID and date are required' });
    }

    const query = `
      SELECT pi.unit_price
      FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      WHERE pi.item_id = ? 
        AND DATE(p.purchase_date) <= ?
      ORDER BY p.purchase_date DESC, pi.id DESC
      LIMIT 1
    `;

    const [rows] = await pool.query(query, [itemId, date]);
    
    if (rows.length > 0) {
      res.json({ unitPrice: parseFloat(rows[0].unit_price) });
    } else {
      res.json({ unitPrice: 0 });
    }
  } catch (error) {
    console.error('Error fetching latest unit price:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Add a new function to get purchase return transactions
const getDailyPurchaseReturnTransactions = async (req, res) => {
  try {
    const { date, itemId } = req.query;

    if (!date || !itemId) {
      return res.status(400).json({ error: 'Date and itemId are required' });
    }

    const [rows] = await pool.query(`
      SELECT 
        pr.id AS return_id,
        pr.return_number,
        s.name AS supplier_name,
        pri.quantity,
        pri.unit_price,
        pri.vat_applicable,
        pri.vat_amount,
        pri.total_amount
      FROM purchase_returns pr
      JOIN purchase_return_items pri ON pr.id = pri.return_id
      JOIN supplier s ON pr.supplier_id = s.id
      WHERE DATE(pr.return_date) = ? 
        AND pri.item_id = ?
      ORDER BY pr.return_number
    `, [date, itemId]);

    res.json(rows);
  } catch (error) {
    console.error('Error fetching daily purchase return transactions:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// =============================================
// DEPARTMENT RETURN ITEM WISE DETAIL REPORT
// =============================================
const getDepartmentReturnItemWiseReport = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      departmentId, 
      reason,
      searchTerm,
      sortBy = 'return_date',
      sortOrder = 'DESC'
    } = req.query;

    // Build the base query
    let query = `
      SELECT 
        r.id AS return_id,
        r.return_number,
        DATE(r.return_date) AS return_date,
        d.id AS department_id,
        d.name AS department_name,
        i.id AS item_id,
        i.item_code,
        i.name AS item_name,
        i.unit,
        i.item_type AS category,
        ri.quantity AS returned_quantity,
        ri.reason AS return_reason,
        r.received_by,
        r.remarks,
        u.username AS entered_by,
        r.created_at
      FROM returns r
      JOIN return_items ri ON r.id = ri.return_id
      JOIN items i ON ri.item_id = i.id
      JOIN departments d ON r.department_id = d.id
      JOIN users u ON r.entered_by = u.id
      WHERE 1=1
    `;

    const params = [];

    // Date range filter
    if (startDate && endDate) {
      query += ` AND DATE(r.return_date) BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    } else if (startDate) {
      query += ` AND DATE(r.return_date) >= ?`;
      params.push(startDate);
    } else if (endDate) {
      query += ` AND DATE(r.return_date) <= ?`;
      params.push(endDate);
    }

    // Department filter
    if (departmentId && departmentId !== 'all') {
      query += ` AND r.department_id = ?`;
      params.push(departmentId);
    }

    // Reason filter
    if (reason && reason !== 'all') {
      query += ` AND ri.reason = ?`;
      params.push(reason);
    }

    // Search term filter (item name or item code)
    if (searchTerm) {
      query += ` AND (i.name LIKE ? OR i.item_code LIKE ?)`;
      params.push(`%${searchTerm}%`, `%${searchTerm}%`);
    }

    // Sorting
    const validSortColumns = {
      'item_name': 'i.name',
      'return_date': 'r.return_date',
      'returned_quantity': 'ri.quantity',
      'department_name': 'd.name',
      'item_code': 'i.item_code',
      'return_reason': 'ri.reason'
    };

    const sortColumn = validSortColumns[sortBy] || 'r.return_date';
    // Default to ascending (oldest first); DESC is only used when the caller
    // explicitly asks for it via a column-header sort click.
    const sortDirection = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    query += ` ORDER BY ${sortColumn} ${sortDirection}, r.return_date ${sortDirection}, r.id ${sortDirection}`;

    const [rows] = await pool.query(query, params);

    // Calculate summary statistics
    const summary = {
      totalItems: rows.length,
      totalReturnQuantity: 0,
      totalTransactions: 0,
      itemSummary: {}
    };

    // Process data for summary
    const uniqueReturns = new Set();
    rows.forEach(row => {
      summary.totalReturnQuantity += parseFloat(row.returned_quantity) || 0;
      uniqueReturns.add(row.return_id);
      
      // Item-wise summary
      const itemKey = row.item_id;
      if (!summary.itemSummary[itemKey]) {
        summary.itemSummary[itemKey] = {
          item_code: row.item_code,
          item_name: row.item_name,
          total_quantity: 0,
          return_count: 0,
          unit: row.unit
        };
      }
      summary.itemSummary[itemKey].total_quantity += parseFloat(row.returned_quantity) || 0;
      summary.itemSummary[itemKey].return_count += 1;
    });
    summary.totalTransactions = uniqueReturns.size;

    // Convert item summary to array
    summary.itemSummaryList = Object.values(summary.itemSummary);

    res.json({
      data: rows,
      summary: summary
    });

  } catch (error) {
    console.error('Error generating department return item wise report:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

// =============================================
// RAW MATERIAL - LAST ISSUE DATE ANALYSIS REPORT
// =============================================
// Returns every raw material item together with the date on which it was
// most recently issued (i.e. the latest issuance_date across its
// issuance_items rows). Items that have never been issued come back with
// last_issue_date = null.
//
// Sorting:
//   sortOrder = 'ASC'  (default) -> oldest last-issued item first,
//                                    never-issued items pushed to the bottom
//   sortOrder = 'DESC'            -> most recently issued item first,
//                                    never-issued items still pushed to the
//                                    bottom (so they don't dominate the top)
const getLastIssueDateReport = async (req, res) => {
  try {
    const { sortOrder } = req.query;
    const requestedStatus = String(req.query.status || '').toLowerCase();
    const statusFilter = ['active', 'inactive'].includes(requestedStatus)
      ? requestedStatus
      : 'all';

    const direction = String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const statusCondition =
      statusFilter === 'active'
        ? ' AND i.is_active = TRUE'
        : statusFilter === 'inactive'
          ? ' AND i.is_active = FALSE'
          : '';

    const query = `
      SELECT
        i.id,
        i.item_code,
        i.name AS item_name,
        i.unit,
        i.is_active AS status,
        MAX(iss.issuance_date) AS last_issue_date,
        DATE_FORMAT(MAX(iss.issuance_date), '%Y-%m-%d') AS last_issue_date_only
      FROM items i
      LEFT JOIN issuance_items ii ON ii.item_id = i.id
      LEFT JOIN issuances iss ON ii.issuance_id = iss.id
      WHERE i.deleted = FALSE
        ${statusCondition}
      GROUP BY i.id, i.item_code, i.name, i.unit, i.is_active
      ORDER BY (MAX(iss.issuance_date) IS NULL) ASC, last_issue_date ${direction}, i.item_code ASC
    `;

    const [rows] = await pool.query(query, []);

    const data = rows.map(row => ({
      ...row,
      last_issue_date: row.last_issue_date_only || null
    }));

    res.json(data);
  } catch (error) {
    console.error('Error generating last issue date report:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

// Total is authoritative; Without VAT is derived from it so the three columns
// always add up, even for legacy rows whose subtotal was never stored.
const splitVat = (total, vat) => {
  const total_amount = roundMoney(total);
  const vat_amount = roundMoney(vat);
  return { without_vat_amount: roundMoney(total_amount - vat_amount), vat_amount, total_amount };
};

// =============================================
// Purchase Report (invoice-level listing)
// =============================================
// Returns one row per purchase invoice with Invoice Number, Invoice Date,
// Delivery Date, Paid Date, Company, Supplier, Payment Method and the
// Without VAT / VAT / Total split, plus grand totals so the frontend/export
// always match. Supports optional date range, company, supplier and payment
// method filters, all of which can be combined.
//
// `dateType` picks which date the From/To range applies to:
//   invoice (default) -> COALESCE(invoice_date, purchase_date), as before
//   delivery          -> purchase_date (labelled "Delivery Date" on the purchase forms)
//   paid              -> paid date (below); invoices not fully Paid never match
//
// Paid Date is the date of the latest payment recorded against the invoice once
// it is fully Paid. Payments resolve the same way as elsewhere in purchasing:
// purchase_payment_allocations when a payment was split across invoices,
// otherwise the legacy payment_history.purchase_id. Legacy invoices marked Paid
// with no payment record at all were paid on delivery, so they fall back to the
// delivery date.
const PURCHASE_REPORT_DATE_EXPRESSIONS = {
  invoice: 'COALESCE(p.invoice_date, p.purchase_date)',
  delivery: 'p.purchase_date',
  paid: "CASE WHEN p.payment_status = 'Paid' THEN COALESCE(pay.last_payment_date, DATE(p.purchase_date)) END"
};

const getPurchaseReport = async (req, res) => {
  const { startDate, endDate, companyId, supplierId, paymentMethod } = req.query;
  const dateType = String(req.query.dateType || 'invoice').toLowerCase();
  const filterDateExpr = PURCHASE_REPORT_DATE_EXPRESSIONS[dateType];

  if (!filterDateExpr) {
    return res.status(400).json({ error: 'Invalid dateType. Use invoice, delivery or paid.' });
  }

  try {
    let query = `
      SELECT
        p.id,
        p.invoice_no,
        p.purchase_date,
        p.invoice_date,
        ${PURCHASE_REPORT_DATE_EXPRESSIONS.paid} AS paid_date,
        p.payment_status,
        p.company_id,
        COALESCE(c.name, 'N/A') AS company_name,
        p.supplier_id,
        s.name AS supplier_name,
        p.payment_method,
        COALESCE(p.vat_amount, 0) AS vat_amount,
        CASE
          WHEN p.total_with_vat IS NOT NULL AND p.total_with_vat > 0 THEN p.total_with_vat
          WHEN p.bill_amount IS NOT NULL AND p.bill_amount > 0 THEN p.bill_amount
          ELSE 0
        END AS total_amount
      FROM purchases p
      JOIN supplier s ON p.supplier_id = s.id
      LEFT JOIN company c ON p.company_id = c.id
      LEFT JOIN (
        SELECT
          COALESCE(ppa.purchase_id, ph.purchase_id) AS purchase_id,
          MAX(ph.payment_date) AS last_payment_date
        FROM payment_history ph
        LEFT JOIN purchase_payment_allocations ppa ON ppa.payment_history_id = ph.id
        GROUP BY COALESCE(ppa.purchase_id, ph.purchase_id)
      ) pay ON pay.purchase_id = p.id
      WHERE (p.deleted = FALSE OR p.deleted IS NULL)
    `;

    const params = [];

    if (startDate) {
      query += ` AND ${filterDateExpr} >= ?`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND ${filterDateExpr} < DATE_ADD(?, INTERVAL 1 DAY)`;
      params.push(endDate);
    }

    if (companyId) {
      query += ' AND p.company_id = ?';
      params.push(companyId);
    }

    if (supplierId) {
      query += ' AND p.supplier_id = ?';
      params.push(supplierId);
    }

    if (paymentMethod && paymentMethod.trim()) {
      const trimmed = paymentMethod.trim();
      const normalized = normalizePaymentMethodValue(trimmed);

      const variations = new Set([trimmed, normalized]);

      if (normalized === 'CASH') {
        variations.add('CASH');
        variations.add('Cash');
      } else if (normalized === 'BANK_TRANSFER') {
        variations.add('BANK_TRANSFER');
        variations.add('Bank');
        variations.add('Bank Transfer');
        variations.add('BANK');
      } else if (normalized === 'CHEQUE') {
        variations.add('CHEQUE');
        variations.add('Cheque');
      } else if (normalized === 'CREDIT') {
        variations.add('CREDIT');
        variations.add('Credit');
        variations.add('Card');
        variations.add('Credit Card');
      }

      const varList = Array.from(variations).filter(Boolean);
      query += ` AND (p.payment_method IN (${varList.map(() => '?').join(', ')}) OR UPPER(p.payment_method) = ?)`;
      params.push(...varList, normalized);
    }

    query += ` ORDER BY ${filterDateExpr} ASC, p.id ASC`;

    const [rows] = await pool.query(query, params);

    const invoices = rows.map(row => ({
      id: row.id,
      invoice_no: row.invoice_no,
      purchase_date: row.purchase_date,
      invoice_date: row.invoice_date,
      delivery_date: row.purchase_date,
      paid_date: row.paid_date,
      payment_status: row.payment_status,
      company_id: row.company_id,
      company_name: row.company_name,
      supplier_id: row.supplier_id,
      supplier_name: row.supplier_name,
      payment_method: row.payment_method || 'N/A',
      ...splitVat(row.total_amount, row.vat_amount)
    }));

    const grandTotal = roundMoney(invoices.reduce((sum, inv) => sum + inv.total_amount, 0));
    const vatTotal = roundMoney(invoices.reduce((sum, inv) => sum + inv.vat_amount, 0));
    const withoutVatTotal = roundMoney(invoices.reduce((sum, inv) => sum + inv.without_vat_amount, 0));

    res.json({ invoices, grandTotal, vatTotal, withoutVatTotal, dateType });
  } catch (error) {
    console.error('Error generating purchase report:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

// =============================================
// Expenses Report: unified Petty Cash + Other (New Expenses) + Bank Charges listing
// with Company / Date Range / Payee / Type filters.
// =============================================
const getExpensesReport = async (req, res) => {
  const { startDate, endDate, companyId, payeeId, type } = req.query;

  try {
    const normalizedType = (type || 'all').toLowerCase();
    const includeOther = normalizedType === 'other' || normalizedType === 'all';
    const includePettyCash = normalizedType === 'petty_cash' || normalizedType === 'all';
    const includeBankCharges = normalizedType === 'bank_charges' || normalizedType === 'all';
    const includeCashExpenses = normalizedType === 'cash_expenses' || normalizedType === 'all';
    // RM Purchasing invoices paid by cheque are tracked in expenses_cheque_registry
    // (source_type = 'PURCHASING_PAYMENT'), not in the `expenses` table, so they
    // were never picked up by the "Other" query above. Cheque Registry rows are
    // classified Expense/Transfer via ecr.type - only 'Expense' rows (real
    // supplier payments) belong in this report; 'Transfer' rows (BANK_TO_CASH
    // Bank<->Cash movements) must never appear here, and are simply never
    // queried below.
    const includeRmPurchasing = normalizedType === 'rm_purchasing' || normalizedType === 'all';
    // Hidden Expenses (PickMe / Credit Card Charge) are report-only records —
    // they never post to hidden_expenses' own table's Cash/Bank ledger, so this
    // is purely a display join; nothing here touches cash_transactions /
    // bank_transactions / finance_transactions.
    const includeHiddenExpenses = normalizedType === 'hidden' || normalizedType === 'all';

    // Resolve the selected payee's name once, so Petty Cash (which only
    // stores a free-text payee_name) can be filtered the same way as
    // Other (which has a real payee_id FK).
    let payeeName = null;
    if (payeeId) {
      const [payeeRows] = await pool.query('SELECT payee_name FROM payees WHERE id = ?', [payeeId]);
      payeeName = payeeRows.length ? payeeRows[0].payee_name : null;
    }

    let results = [];

    if (includeOther) {
      let otherQuery = `
        SELECT o.*, comp.name AS company_name
        FROM (
          SELECT
            e.id,
            'Other' AS type,
            e.bill_date AS date,
            COALESCE(p.payee_name, e.payee_name) AS payee_name,
            e.expense_type,
            e.bill_number AS reference,
            e.total_bill_amount AS amount,
            e.payment_status AS status,
            COALESCE(e.company_id, (
              SELECT ft.company_id
              FROM expense_payment_allocations epa
              JOIN finance_transactions ft
                ON ft.reference_type = 'EXPENSE_PAYMENT' AND ft.reference_id = epa.payment_id
              WHERE epa.expense_id = e.id
              ORDER BY ft.id DESC
              LIMIT 1
            )) AS company_id
          FROM expenses e
          LEFT JOIN payees p ON e.payee_id = p.id
          WHERE e.is_deleted = 0
          ${startDate ? 'AND e.bill_date >= ?' : ''}
          ${endDate ? 'AND e.bill_date < DATE_ADD(?, INTERVAL 1 DAY)' : ''}
          ${payeeId ? 'AND e.payee_id = ?' : ''}
        ) o
        LEFT JOIN company comp ON comp.id = o.company_id
      `;
      const otherParams = [];
      if (startDate) otherParams.push(startDate);
      if (endDate) otherParams.push(endDate);
      if (payeeId) otherParams.push(payeeId);

      if (companyId) {
        otherQuery += ' WHERE o.company_id = ?';
        otherParams.push(companyId);
      }

      const [otherRows] = await pool.query(otherQuery, otherParams);
      results = results.concat(otherRows);
    }

    if (includePettyCash) {
      let pettyQuery = `
        SELECT
          pv.id,
          'Petty Cash' AS type,
          pv.voucher_date AS date,
          pv.payee_name AS payee_name,
          pv.expense_type,
          pv.voucher_number AS reference,
          pv.amount,
          pv.status,
          pv.company_id,
          comp.name AS company_name
        FROM petty_cash_vouchers pv
        LEFT JOIN company comp ON comp.id = pv.company_id
        WHERE 1 = 1
        ${startDate ? 'AND pv.voucher_date >= ?' : ''}
        ${endDate ? 'AND pv.voucher_date < DATE_ADD(?, INTERVAL 1 DAY)' : ''}
        ${payeeId ? 'AND pv.payee_name = ?' : ''}
        ${companyId ? 'AND pv.company_id = ?' : ''}
      `;
      const pettyParams = [];
      if (startDate) pettyParams.push(startDate);
      if (endDate) pettyParams.push(endDate);
      if (payeeId) pettyParams.push(payeeName || '\0__no_match__\0');
      if (companyId) pettyParams.push(companyId);

      const [pettyRows] = await pool.query(pettyQuery, pettyParams);
      results = results.concat(pettyRows);
    }

    if (includeBankCharges && !payeeId) {
      const bankChargesQuery = `
        SELECT
          bc.id,
          'Bank Charges' AS type,
          bc.charge_date AS date,
          bc.bank_name AS payee_name,
          bc.charges_type AS expense_type,
          bc.reference_number AS reference,
          bc.amount,
          'Recorded' AS status,
          bc.company_id,
          comp.name AS company_name
        FROM bank_charges bc
        LEFT JOIN company comp ON comp.id = bc.company_id
        WHERE 1 = 1
        ${startDate ? 'AND bc.charge_date >= ?' : ''}
        ${endDate ? 'AND bc.charge_date < DATE_ADD(?, INTERVAL 1 DAY)' : ''}
        ${companyId ? 'AND bc.company_id = ?' : ''}
      `;
      const bankChargesParams = [];
      if (startDate) bankChargesParams.push(startDate);
      if (endDate) bankChargesParams.push(endDate);
      if (companyId) bankChargesParams.push(companyId);

      const [bankChargeRows] = await pool.query(bankChargesQuery, bankChargesParams);
      results = results.concat(bankChargeRows);
    }

    if (includeCashExpenses && !payeeId) {
      const cashExpensesQuery = `
        SELECT
          ce.id,
          'Cash Expenses' AS type,
          ce.expense_date AS date,
          'Cash Expense' AS payee_name,
          ce.expense_type,
          ce.voucher_number AS reference,
          ce.amount,
          'Recorded' AS status,
          ce.company_id,
          comp.name AS company_name
        FROM cash_expenses ce
        LEFT JOIN company comp ON comp.id = ce.company_id
        WHERE ce.status = 1
        ${startDate ? 'AND ce.expense_date >= ?' : ''}
        ${endDate ? 'AND ce.expense_date < DATE_ADD(?, INTERVAL 1 DAY)' : ''}
        ${companyId ? 'AND ce.company_id = ?' : ''}
      `;
      const cashExpensesParams = [];
      if (startDate) cashExpensesParams.push(startDate);
      if (endDate) cashExpensesParams.push(endDate);
      if (companyId) cashExpensesParams.push(companyId);

      const [cashExpenseRows] = await pool.query(cashExpensesQuery, cashExpensesParams);
      results = results.concat(cashExpenseRows);
    }

    // RM Purchasing cheque payments (Cheque Registry, type = 'Expense' only -
    // 'Transfer' rows are deliberately excluded by this WHERE clause, since
    // they're internal Bank<->Cash movements, not expenses). No payeeId
    // filter here: payeeId refers to the New Expenses `payees` table, which
    // is a different entity from RM Purchasing suppliers.
    if (includeRmPurchasing && !payeeId) {
      const rmPurchasingQuery = `
        SELECT
          ecr.id,
          'RM Purchasing' AS type,
          ecr.date AS date,
          ecr.name AS payee_name,
          'Cheque Payment' AS expense_type,
          ecr.cheque_number AS reference,
          ecr.amount AS amount,
          ecr.status AS status,
          p.company_id AS company_id,
          comp.name AS company_name
        FROM expenses_cheque_registry ecr
        LEFT JOIN payment_history ph ON ph.id = ecr.source_id
        LEFT JOIN purchases p ON p.id = ph.purchase_id
        LEFT JOIN company comp ON comp.id = p.company_id
        WHERE ecr.source_type = 'PURCHASING_PAYMENT'
          AND ecr.type = 'Expense'
          AND ecr.status != 'Deleted'
        ${startDate ? 'AND ecr.date >= ?' : ''}
        ${endDate ? 'AND ecr.date < DATE_ADD(?, INTERVAL 1 DAY)' : ''}
        ${companyId ? 'AND p.company_id = ?' : ''}
      `;
      const rmPurchasingParams = [];
      if (startDate) rmPurchasingParams.push(startDate);
      if (endDate) rmPurchasingParams.push(endDate);
      if (companyId) rmPurchasingParams.push(companyId);

      const [rmPurchasingRows] = await pool.query(rmPurchasingQuery, rmPurchasingParams);
      results = results.concat(rmPurchasingRows);
    }

    // Hidden Expenses remain report-only, and now carry an optional company
    // and reference number. Company filtering applies to these records too.
    if (includeHiddenExpenses) {
      let hiddenQuery = `
        SELECT
          hidden_expenses.id,
          'Hidden Expense' AS type,
          hidden_expenses.expense_date AS date,
          'Hidden Expense' AS payee_name,
          hidden_expenses.type AS expense_type,
          hidden_expenses.reference_number AS reference,
          hidden_expenses.amount,
          'Hidden' AS status,
          hidden_expenses.company_id,
          c.name AS company_name
        FROM hidden_expenses
        LEFT JOIN company c ON c.id = hidden_expenses.company_id
        WHERE hidden_expenses.is_deleted = 0
        ${startDate ? 'AND hidden_expenses.expense_date >= ?' : ''}
        ${endDate ? 'AND hidden_expenses.expense_date < DATE_ADD(?, INTERVAL 1 DAY)' : ''}
        ${companyId ? 'AND hidden_expenses.company_id = ?' : ''}
      `;
      const hiddenParams = [];
      if (startDate) hiddenParams.push(startDate);
      if (endDate) hiddenParams.push(endDate);
      if (companyId) hiddenParams.push(companyId);

      const [hiddenRows] = await pool.query(hiddenQuery, hiddenParams);
      results = results.concat(hiddenRows);
    }

    // Oldest first, with a stable id tiebreak for same-day rows across sources.
    results.sort((a, b) => {
      const dateDiff = new Date(a.date) - new Date(b.date);
      if (dateDiff !== 0) return dateDiff;
      return String(a.id).localeCompare(String(b.id));
    });

    const expenses = results.map(row => ({
      id: row.id,
      type: row.type,
      date: row.date,
      payee_name: row.payee_name,
      expense_type: row.expense_type,
      reference: row.reference,
      company_name: row.company_name || null,
      amount: parseFloat(row.amount) || 0,
      status: row.status
    }));

    const grandTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
    const pettyCashTotal = expenses.filter(e => e.type === 'Petty Cash').reduce((sum, e) => sum + e.amount, 0);
    const otherTotal = expenses.filter(e => e.type === 'Other').reduce((sum, e) => sum + e.amount, 0);
    const bankChargesTotal = expenses.filter(e => e.type === 'Bank Charges').reduce((sum, e) => sum + e.amount, 0);
    const cashExpensesTotal = expenses.filter(e => e.type === 'Cash Expenses').reduce((sum, e) => sum + e.amount, 0);
    const rmPurchasingTotal = expenses.filter(e => e.type === 'RM Purchasing').reduce((sum, e) => sum + e.amount, 0);
    const hiddenExpensesTotal = expenses.filter(e => e.type === 'Hidden Expense').reduce((sum, e) => sum + e.amount, 0);

    res.json({ expenses, grandTotal, pettyCashTotal, otherTotal, bankChargesTotal, cashExpensesTotal, rmPurchasingTotal, hiddenExpensesTotal });
  } catch (error) {
    console.error('Error generating expenses report:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

// =============================================
// Expense Report Summary: an analytical summary of Analyst -> Expenses.
//
// Source of truth: analystController.loadExpenseRecords - the exact function
// Analyst -> Expenses runs - so the same transactions are included/excluded,
// with the same Expense Type / Sub Expense Type, dates, status, company and
// amount. Only the five Expenses-module methods are loaded; Analyst's
// 'purchasing' method (purchase invoices) is never requested, so Purchasing /
// RM / supplier transactions cannot appear here.
//
// This report only adds, read-only, on top of those records:
//   - VAT: Other Expenses bills store vat_amount on the expenses row (the
//     Analyst amount is that bill's total_bill_amount). The other methods carry
//     no VAT, so their whole amount is "Without VAT". No VAT is ever derived
//     from a percentage, and nothing is read from purchasing tables.
//   - Payment Method: Other Expenses bills use their actual expense_payments;
//     the other methods are paid one fixed way.
// =============================================

// Analyst -> Expenses "Expense Method" values, minus Purchasing
const EXPENSE_SUMMARY_GROUPS = {
  petty_cash: 'Petty Cash',
  cash_expenses: 'Cash Expenses',
  bank_charges: 'Bank Charges',
  hidden_expenses: 'Hidden Expenses',
  other_expenses: 'Other Expenses'
};
const EXPENSE_SUMMARY_GROUP_BY_LABEL = Object.fromEntries(
  Object.entries(EXPENSE_SUMMARY_GROUPS).map(([key, label]) => [label, key])
);

const FIXED_PAYMENT_METHODS = {
  petty_cash: 'Petty Cash',
  cash_expenses: 'Cash',
  bank_charges: 'Bank',
  hidden_expenses: null // report-only, never posts to Cash/Bank
};

const normalizeName = (name) => String(name || '').trim().toLowerCase();

// One summary row per Expense Type + Sub Expense Type exactly as Analyst shows
// them (case/whitespace-insensitive). A missing Sub Expense Type is its own
// row, never merged with a named one.
const expenseSummaryKey = (expenseType, subExpenseType) =>
  `${normalizeName(expenseType)}\u0000${normalizeName(subExpenseType)}`;

const collectExpenseSummaryTransactions = async ({ fromDate, toDate, group }) => {
  const methods = group ? [group] : Object.keys(EXPENSE_SUMMARY_GROUPS);
  const records = await loadExpenseRecords({ methods, fromDate, toDate });

  // Defensive: the scope is Expenses-module methods only.
  const transactions = records
    .filter(record => EXPENSE_SUMMARY_GROUP_BY_LABEL[record.expense_method])
    .map(record => ({
      id: record.id,
      group: EXPENSE_SUMMARY_GROUP_BY_LABEL[record.expense_method],
      group_label: record.expense_method,
      date: record.date,
      reference: record.reference || null,
      expense_type: String(record.expense_type || '').trim() || null,
      sub_expense_type: String(record.sub_expense_type || '').trim() || null,
      description: record.description || null,
      company_id: record.company_id || null,
      company_name: record.company_name || null,
      payment_source: record.payment_source || null,
      status: record.status || null,
      amount: record.amount
    }));

  // VAT + payments for Other Expenses bills
  const billIds = transactions.filter(tx => tx.group === 'other_expenses').map(tx => tx.id);
  const vatByBill = new Map();
  const paymentsByBill = new Map();
  if (billIds.length > 0) {
    const [[vatRows], [paymentRows]] = await Promise.all([
      pool.query('SELECT id, vat_amount FROM expenses WHERE id IN (?)', [billIds]),
      pool.query(`
        SELECT
          epa.expense_id,
          epa.amount,
          DATE_FORMAT(ep.payment_date, '%Y-%m-%d') AS payment_date,
          ep.payment_type,
          ep.cheque_number,
          ep.voucher_number,
          ep.reference_number
        FROM expense_payment_allocations epa
        JOIN expense_payments ep ON ep.id = epa.payment_id
        WHERE epa.expense_id IN (?)
        ORDER BY ep.payment_date ASC, ep.id ASC
      `, [billIds])
    ]);

    vatRows.forEach(row => vatByBill.set(row.id, row.vat_amount));
    paymentRows.forEach(p => {
      if (!paymentsByBill.has(p.expense_id)) paymentsByBill.set(p.expense_id, []);
      paymentsByBill.get(p.expense_id).push({
        payment_date: p.payment_date,
        payment_type: p.payment_type,
        amount: roundMoney(p.amount),
        cheque_number: p.cheque_number || null,
        voucher_number: p.voucher_number || null,
        reference_number: p.reference_number || null
      });
    });
  }

  return transactions.map(tx => {
    const isBill = tx.group === 'other_expenses';
    const payments = isBill ? (paymentsByBill.get(tx.id) || []) : undefined;
    const fixedMethod = FIXED_PAYMENT_METHODS[tx.group];
    const paymentMethods = isBill
      ? [...new Set(payments.map(p => p.payment_type).filter(Boolean))]
      : (fixedMethod ? [fixedMethod] : []);
    const { amount, ...rest } = tx;

    return {
      ...rest,
      ...(isBill && { payments }),
      payment_methods: paymentMethods,
      payment_method: paymentMethods.length ? paymentMethods.join(', ') : (isBill ? 'Unpaid' : 'N/A'),
      ...splitVat(amount, isBill ? vatByBill.get(tx.id) : 0)
    };
  });
};

// Payment Method / Expense Type / Sub Expense Type filters. Types are picked
// from Expense Type Management and matched by name, because Analyst records
// (and therefore this report's rows) carry the saved type names.
const applyExpenseSummaryFilters = async (transactions, { paymentMethod, expenseTypeId, subExpenseTypeId }) => {
  let filtered = transactions;

  if (paymentMethod) {
    const wanted = normalizeName(paymentMethod);
    filtered = filtered.filter(tx => tx.payment_methods.some(m => normalizeName(m) === wanted));
  }

  if (expenseTypeId) {
    const [[type]] = await pool.query('SELECT name FROM expense_types WHERE id = ?', [expenseTypeId]);
    const typeName = normalizeName(type?.name);
    filtered = filtered.filter(tx => Boolean(typeName) && normalizeName(tx.expense_type) === typeName);
  }

  if (subExpenseTypeId) {
    const [[subType]] = await pool.query('SELECT name FROM sub_expense_types WHERE id = ?', [subExpenseTypeId]);
    const subName = normalizeName(subType?.name);
    filtered = filtered.filter(tx => Boolean(subName) && normalizeName(tx.sub_expense_type) === subName);
  }

  return filtered;
};

const parseExpenseSummaryFilters = (query) => {
  const { fromDate, toDate, group, paymentMethod, expenseTypeId, subExpenseTypeId } = query;
  dateFilters(fromDate, toDate); // same validation as Analyst -> Expenses
  if (group && !EXPENSE_SUMMARY_GROUPS[group]) {
    throw new Error(`Invalid expense group. Use one of: ${Object.keys(EXPENSE_SUMMARY_GROUPS).join(', ')}.`);
  }
  return {
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    group: group || null,
    paymentMethod: paymentMethod ? String(paymentMethod).trim() : null,
    expenseTypeId: expenseTypeId || null,
    subExpenseTypeId: subExpenseTypeId || null
  };
};

const loadFilteredExpenseSummaryTransactions = async (query) => {
  const filters = parseExpenseSummaryFilters(query);
  const transactions = await collectExpenseSummaryTransactions(filters);
  return applyExpenseSummaryFilters(transactions, filters);
};

// Distinct non-empty values of one field across a group's transactions, in
// first-seen order (case/whitespace-insensitive, original spelling kept).
const distinctValues = (rows, field) => {
  const seen = new Map();
  rows.forEach(r => {
    const value = String(r[field] || '').trim();
    const key = normalizeName(value);
    if (value && !seen.has(key)) seen.set(key, value);
  });
  return Array.from(seen.values());
};

// Display-only details of a summary row (Date, Reference No, Expenses Method,
// Company, Payment Type, Description). Does not affect grouping or totals.
const describeExpenseGroup = (rows) => {
  const dates = rows.map(r => r.date).filter(Boolean).sort();
  return {
    date_from: dates[0] || null,
    date_to: dates[dates.length - 1] || null,
    references: distinctValues(rows, 'reference'),
    expense_methods: distinctValues(rows, 'group_label'),
    companies: distinctValues(rows, 'company_name'),
    payment_types: distinctValues(rows, 'payment_source'),
    descriptions: distinctValues(rows, 'description')
  };
};

const sumExpenseTotals = (rows) => ({
  transaction_count: rows.length,
  without_vat_amount: roundMoney(rows.reduce((sum, r) => sum + r.without_vat_amount, 0)),
  vat_amount: roundMoney(rows.reduce((sum, r) => sum + r.vat_amount, 0)),
  total_amount: roundMoney(rows.reduce((sum, r) => sum + r.total_amount, 0))
});

// Same 400/500 split as Analyst -> Expenses
const sendExpenseSummaryError = (res, error, label) => {
  const isBadRequest = error.message.startsWith('Invalid') || error.message.includes('cannot be');
  if (!isBadRequest) console.error(`Error generating ${label}:`, error);
  res.status(isBadRequest ? 400 : 500).json({ error: isBadRequest ? error.message : 'Server error: ' + error.message });
};

const getExpenseSummaryReport = async (req, res) => {
  try {
    const transactions = await loadFilteredExpenseSummaryTransactions(req.query);

    const groups = new Map();
    transactions.forEach(tx => {
      const key = expenseSummaryKey(tx.expense_type, tx.sub_expense_type);
      if (!groups.has(key)) {
        groups.set(key, { expense_type: tx.expense_type, sub_expense_type: tx.sub_expense_type, rows: [] });
      }
      groups.get(key).rows.push(tx);
    });

    // Expense Type A-Z, then Sub Expense Type A-Z; missing values last.
    const byName = (a, b) => (!a) - (!b) || String(a || '').localeCompare(String(b || ''));
    const summary = Array.from(groups.values())
      .map(g => ({
        expense_type: g.expense_type,
        sub_expense_type: g.sub_expense_type,
        ...describeExpenseGroup(g.rows),
        ...sumExpenseTotals(g.rows)
      }))
      .sort((a, b) => byName(a.expense_type, b.expense_type) || byName(a.sub_expense_type, b.sub_expense_type));

    res.json({ summary, totals: sumExpenseTotals(transactions) });
  } catch (error) {
    sendExpenseSummaryError(res, error, 'expense summary report');
  }
};

// Transactions behind one summary row: same filters + same grouping key as the
// summary, so the totals here always equal that row. expenseType /
// subExpenseType are the row's values ('' = none).
const getExpenseSummaryDetails = async (req, res) => {
  const { expenseType, subExpenseType } = req.query;

  if (expenseType === undefined) {
    return res.status(400).json({ error: 'expenseType is required' });
  }

  try {
    const key = expenseSummaryKey(expenseType, subExpenseType);
    const transactions = (await loadFilteredExpenseSummaryTransactions(req.query))
      .filter(tx => expenseSummaryKey(tx.expense_type, tx.sub_expense_type) === key)
      // Same order as Analyst -> Expenses
      .sort((a, b) =>
        String(a.date).localeCompare(String(b.date)) ||
        `${a.group_label}-${a.id}`.localeCompare(`${b.group_label}-${b.id}`));

    res.json({
      expense_type: transactions[0]?.expense_type ?? (String(expenseType).trim() || null),
      sub_expense_type: transactions[0]?.sub_expense_type ?? (String(subExpenseType || '').trim() || null),
      transactions,
      totals: sumExpenseTotals(transactions)
    });
  } catch (error) {
    sendExpenseSummaryError(res, error, 'expense summary details');
  }
};

module.exports = {
  getStockReport,
  getLatestUnitPrice,
  getLastIssueDateReport,
  getDepartmentIssuesReport,
  getPurchasingReport,
  getWastageReport,
  getDepartmentItemsSummary,
  getStockReportByRangeAndItem,
  getDailyIssuanceTransactions,
  getDailyPurchaseTransactions,
  getDailyWastageTransactions,
  getDailyReturnTransactions,
  getPurchasingItemWiseReport,
  getDailyPurchaseReturnTransactions,
  getDepartmentReturnItemWiseReport,
  getPurchaseReport,
  getExpensesReport,
  getExpenseSummaryReport,
  getExpenseSummaryDetails
};
