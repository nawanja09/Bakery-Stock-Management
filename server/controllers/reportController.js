const pool = require('../config/db');

const getStockReport = async (req, res) => {
    try {
    const { date } = req.query;

    // Validate date parameter presence
    if (!date) {
      return res.status(400).json({ error: 'Date parameter is required' });
    }

    // Validate date format
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    // Calculate previous date string in 'YYYY-MM-DD' format
    const prevDate = new Date(parsedDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().split('T')[0];

    const query = `
      SELECT 
        i.id,
        i.item_code,
        i.name AS item_name,
        i.unit,
        COALESCE(prev.closing_balance, 0) AS opening_balance,
        COALESCE(purchases.total_purchased, 0) AS total_purchased,
        COALESCE(issues.total_issued, 0) AS total_issued,
        COALESCE(wastage.total_wasted, 0) AS total_wasted,
        (
          COALESCE(prev.closing_balance, 0) + 
          COALESCE(purchases.total_purchased, 0) - 
          COALESCE(issues.total_issued, 0) - 
          COALESCE(wastage.total_wasted, 0)
        ) AS closing_balance
      FROM items i
      LEFT JOIN (
        -- Previous day's closing balance calculation
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
        -- Today's purchases
        SELECT i.id AS item_id, SUM(pi.quantity) AS total_purchased
        FROM purchase_items pi
        JOIN purchases p ON pi.purchase_id = p.id
        JOIN items i ON pi.item_name = i.name
        WHERE DATE(p.purchase_date) = ?
        GROUP BY i.id
      ) purchases ON i.id = purchases.item_id
      LEFT JOIN (
        -- Today's issues
        SELECT ii.item_id, SUM(ii.quantity) AS total_issued
        FROM issuance_items ii
        JOIN issuances iss ON ii.issuance_id = iss.id
        WHERE DATE(iss.issuance_date) = ?
        GROUP BY ii.item_id
      ) issues ON i.id = issues.item_id
      LEFT JOIN (
        -- Today's wastage
        SELECT wi.item_id, SUM(wi.quantity) AS total_wasted
        FROM wastage_items wi
        JOIN wastages w ON wi.wastage_id = w.id
        WHERE w.date = ?
        GROUP BY wi.item_id
      ) wastage ON i.id = wastage.item_id
    `;

    // Parameters for the query: prevDateStr repeated 4 times, date repeated 3 times
    const params = [
      prevDateStr, prevDateStr, prevDateStr, prevDateStr,
      date, date, date
    ];

    const [rows] = await pool.query(query, params);

    res.json(rows);
  } catch (error) {
    console.error('Error generating stock report:', error.message, error.stack);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

//stock report formula
// opening_balance = previous day's closing balance + today's purchases - today's issues - today's wastage

// Get department issues report
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

const getPurchasingReport = async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Start date and end date are required' });
  }

  try {
    const [rows] = await pool.query(`
      SELECT 
        p.id,
        p.invoice_no,
        p.purchase_date,
        s.name AS supplier_name,
        p.payment_method,
        p.bill_amount,
        p.paid_amount
      FROM purchases p
      JOIN supplier s ON p.supplier_id = s.id
      WHERE DATE(p.purchase_date) BETWEEN ? AND ?
      ORDER BY p.purchase_date DESC
    `, [startDate, endDate]);
    
    res.json(rows);
  } catch (error) {
    console.error('Error generating purchasing report:', error);
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

// Add to module.exports
module.exports = {
  getStockReport,
  getDepartmentIssuesReport,
  getPurchasingReport,
  getWastageReport
};