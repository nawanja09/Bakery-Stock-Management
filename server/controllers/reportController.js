const pool = require('../config/db');

// Get stock report for a specific date (auto-add items only)
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
        LEFT JOIN (
          SELECT ri.item_id, SUM(ri.quantity) AS total_returned
          FROM return_items ri
          JOIN returns r ON ri.return_id = r.id
          WHERE r.return_date <= ?
          GROUP BY ri.item_id
        ) returns ON i2.id = returns.item_id
        LEFT JOIN (
          SELECT pri.item_id, SUM(pri.quantity) AS total_purchase_returned
          FROM purchase_return_items pri
          JOIN purchase_returns pr ON pri.return_id = pr.id
          WHERE pr.return_date <= ?
          GROUP BY pri.item_id
        ) purchase_returns ON i2.id = purchase_returns.item_id
        LEFT JOIN (
          SELECT item_id, SUM(variance) AS total_adjusted
          FROM stock_adjustments
          WHERE DATE(date) <= ?
          GROUP BY item_id
        ) adjustments ON i2.id = adjustments.item_id
      ) prev ON i.id = prev.item_id
      LEFT JOIN (
        SELECT item_id, SUM(quantity) AS opening_balance_today
        FROM opening_balances
        WHERE date = ?
        GROUP BY item_id
      ) ob_today ON i.id = ob_today.item_id
      LEFT JOIN (
        SELECT i.id AS item_id, SUM(pi.quantity) AS total_purchased
        FROM purchase_items pi
        JOIN purchases p ON pi.purchase_id = p.id
        JOIN items i ON pi.item_id = i.id
        WHERE DATE(p.purchase_date) = ?
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
        WHERE w.date = ?
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
      WHERE i.auto_add_to_stock = 1  -- 🔥 AUTO-ADD ITEMS ONLY
        AND i.deleted = FALSE
      ORDER BY i.item_code
    `;

    const params = [
      date, // For unit price subquery
      prevDateStr, prevDateStr, prevDateStr, prevDateStr, prevDateStr, prevDateStr, prevDateStr, // yesterday x7
      date,                                              // today opening
      date, date, date, date, date, date                 // today purchases/issues/wastage/returns/purchase_returns/adjustments
    ];

    const [rows] = await pool.query(query, params);

    // Calculate value for each item
    const stockDataWithValue = rows.map(item => {
      const closingBalance = Number(item.closing_balance) || 0;
      const unitPrice = Number(item.unit_price) || 0;
      const value = (closingBalance * unitPrice).toFixed(2);
      
      return {
        ...item,
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

    if (!startDate || !endDate || !itemId) {
      return res.status(400).json({ error: 'startDate, endDate, and itemId are required (format: YYYY-MM-DD)' });
    }

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

    // Get all transactions before the start date
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

    const [[{ returned: preReturned = 0 }]] = await pool.query(
      `SELECT SUM(ri.quantity) AS returned
       FROM return_items ri
       JOIN returns r ON ri.return_id = r.id
       WHERE ri.item_id = ? AND DATE(r.return_date) < ?`,
      [itemId, startDate]
    );

    const [[{ purchaseReturned: prePurchaseReturned = 0 }]] = await pool.query(
      `SELECT SUM(pri.quantity) AS purchaseReturned
       FROM purchase_return_items pri
       JOIN purchase_returns pr ON pri.return_id = pr.id
       WHERE pri.item_id = ? AND DATE(pr.return_date) < ?`,
      [itemId, startDate]
    );

    const [[{ adjusted: preAdjusted = 0 }]] = await pool.query(
      `SELECT SUM(variance) AS adjusted
       FROM stock_adjustments
       WHERE item_id = ? AND DATE(date) < ?`,
      [itemId, startDate]
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
      const [[specificOpening]] = await pool.query(
        `SELECT quantity FROM opening_balances 
         WHERE item_id = ? AND DATE(date) = ?`,
        [itemId, date]
      );

      if (specificOpening) {
        opening = parseFloat(specificOpening.quantity);
        runningBalance = opening;
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

      const [[{ returned: dbReturned = 0 }]] = await pool.query(
        `SELECT SUM(ri.quantity) AS returned
         FROM return_items ri
         JOIN returns r ON ri.return_id = r.id
         WHERE ri.item_id = ? AND DATE(r.return_date) = ?`,
        [itemId, date]
      );

      const [[{ purchaseReturned: dbPurchaseReturned = 0 }]] = await pool.query(
        `SELECT SUM(pri.quantity) AS purchaseReturned
         FROM purchase_return_items pri
         JOIN purchase_returns pr ON pri.return_id = pr.id
         WHERE pri.item_id = ? AND DATE(pr.return_date) = ?`,
        [itemId, date]
      );

      const [[{ adjusted: dbAdjusted = 0 }]] = await pool.query(
        `SELECT SUM(variance) AS adjusted
         FROM stock_adjustments
         WHERE item_id = ? AND DATE(date) = ?`,
        [itemId, date]
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
      WHERE p.purchase_date BETWEEN ? AND ?
        AND (p.deleted = FALSE OR p.deleted IS NULL)
      GROUP BY 
        p.id, p.invoice_no, p.purchase_date, s.name, s.vat_number, 
        s.vat_registered, p.payment_method, p.total_with_vat, p.bill_amount,
        p.check_number, c.name, p.company_id, p.vat_rate, 
        p.vat_amount, p.subtotal
    `;

    const params = [startDate, endDate];
    if (companyId) {
      query += ' AND p.company_id = ?';
      params.push(companyId);
    }
    query += ' ORDER BY p.purchase_date DESC';

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
        
        return { ...purchase, items };
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


module.exports = {
  getStockReport,
  getLatestUnitPrice,
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
  getDailyPurchaseReturnTransactions
};
