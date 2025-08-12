const pool = require('../config/db');

const getStockReport = async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'Date parameter is required' });
  }

  try {
    const query = `
      SELECT 
        i.id,
        i.item_code,
        i.name AS item_name,
        i.unit,
        COALESCE(ob.opening_balance, 0) AS opening_balance,
        COALESCE(purchases.total_purchased, 0) AS total_purchased,
        COALESCE(issues.total_issued, 0) AS total_issued,
        COALESCE(wastage.total_wasted, 0) AS total_wasted,
        (COALESCE(ob.opening_balance, 0) - 
         (COALESCE(purchases.total_purchased, 0) + 
          COALESCE(issues.total_issued, 0) + 
          COALESCE(wastage.total_wasted, 0))) AS closing_balance
      FROM items i
      LEFT JOIN (
        SELECT item_id, SUM(quantity) AS opening_balance
        FROM opening_balances
        WHERE date <= ?
        GROUP BY item_id
      ) ob ON i.id = ob.item_id
      LEFT JOIN (
        SELECT i.id AS item_id, SUM(pi.quantity) AS total_purchased
        FROM purchase_items pi
        JOIN purchases p ON pi.purchase_id = p.id
        JOIN items i ON pi.item_name = i.name
        WHERE p.purchase_date <= ?
        GROUP BY i.id
      ) purchases ON i.id = purchases.item_id
      LEFT JOIN (
        SELECT ii.item_id, SUM(ii.quantity) AS total_issued
        FROM issuance_items ii
        JOIN issuances iss ON ii.issuance_id = iss.id
        WHERE iss.issuance_date <= ?
        GROUP BY ii.item_id
      ) issues ON i.id = issues.item_id
      LEFT JOIN (
        SELECT wi.item_id, SUM(wi.quantity) AS total_wasted
        FROM wastage_items wi
        JOIN wastages w ON wi.wastage_id = w.id
        WHERE w.date <= ?
        GROUP BY wi.item_id
      ) wastage ON i.id = wastage.item_id
    `;

    const [rows] = await pool.query(query, [date, date, date, date]);
    res.json(rows);
  } catch (error) {
    console.error('Error generating stock report:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getStockReport };


//fomula for closing balance
// Closing Balance = Opening Balance - (Total Purchased + Total Issued + Total Wasted)