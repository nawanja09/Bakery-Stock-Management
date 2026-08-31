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
          AND i2.is_active = TRUE
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
        AND i.is_active = TRUE
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
       WHERE pi.item_id = ? AND DATE(p.purchase_date) < ? AND (p.deleted = FALSE OR p.deleted IS NULL)`,
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
         WHERE pi.item_id = ? AND DATE(p.purchase_date) = ? AND (p.deleted = FALSE OR p.deleted IS NULL)`,
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
        p.id, p.invoice_no, p.purchase_date, s.name, s.vat_number, 
        s.vat_registered, p.payment_method, p.total_with_vat, p.bill_amount,
        p.check_number, c.name, p.company_id, p.vat_rate, 
        p.vat_amount, p.subtotal
    `;
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

      expenseQuery += ' ORDER BY e.bill_date DESC, e.id DESC';

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

      return res.json([...purchasesWithItems, ...expenseEntries]);
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
    const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${sortColumn} ${sortDirection}, r.return_date DESC`;

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

// =============================================
// Purchase Report (invoice-level listing)
// =============================================
// Returns one row per purchase invoice with Invoice Number, Invoice Date,
// Company, Supplier and Total Amount, plus a serverGrandTotal so the
// frontend/export always match. Supports optional date range, company and
// supplier filters, all of which can be combined.
const getPurchaseReport = async (req, res) => {
  const { startDate, endDate, companyId, supplierId } = req.query;

  try {
    let query = `
      SELECT
        p.id,
        p.invoice_no,
        p.purchase_date,
        p.company_id,
        COALESCE(c.name, 'N/A') AS company_name,
        p.supplier_id,
        s.name AS supplier_name,
        CASE
          WHEN p.total_with_vat IS NOT NULL AND p.total_with_vat > 0 THEN p.total_with_vat
          WHEN p.bill_amount IS NOT NULL AND p.bill_amount > 0 THEN p.bill_amount
          ELSE 0
        END AS total_amount
      FROM purchases p
      JOIN supplier s ON p.supplier_id = s.id
      LEFT JOIN company c ON p.company_id = c.id
      WHERE (p.deleted = FALSE OR p.deleted IS NULL)
    `;

    const params = [];

    if (startDate) {
      query += ' AND p.purchase_date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      // Include the whole end date (purchase_date is a datetime column)
      query += ' AND p.purchase_date < DATE_ADD(?, INTERVAL 1 DAY)';
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

    query += ' ORDER BY p.purchase_date DESC, p.id DESC';

    const [rows] = await pool.query(query, params);

    const invoices = rows.map(row => ({
      id: row.id,
      invoice_no: row.invoice_no,
      purchase_date: row.purchase_date,
      company_id: row.company_id,
      company_name: row.company_name,
      supplier_id: row.supplier_id,
      supplier_name: row.supplier_name,
      total_amount: parseFloat(row.total_amount) || 0
    }));

    const grandTotal = invoices.reduce((sum, inv) => sum + inv.total_amount, 0);

    res.json({ invoices, grandTotal });
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

    results.sort((a, b) => new Date(b.date) - new Date(a.date));

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

    res.json({ expenses, grandTotal, pettyCashTotal, otherTotal, bankChargesTotal });
  } catch (error) {
    console.error('Error generating expenses report:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
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
  getExpensesReport
};
