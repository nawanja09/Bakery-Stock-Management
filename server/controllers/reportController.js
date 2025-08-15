const pool = require('../config/db');

const getStockReport = async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'Date parameter is required' });
  }

  try {
    // Calculate the previous date
    const prevDate = new Date(date);
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
        -- Get previous day's closing balance
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

    const [rows] = await pool.query(query, [
      prevDateStr, prevDateStr, prevDateStr, prevDateStr, 
      date, date, date
    ]);
    
    res.json(rows);
  } catch (error) {
    console.error('Error generating stock report:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get department issues report
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

// Add to module.exports
module.exports = {
  getStockReport,
  getDepartmentIssuesReport,
};