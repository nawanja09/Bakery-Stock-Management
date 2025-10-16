const pool = require('../config/db');

const getStockReport = async (req, res) => {
  const { date, location } = req.query;

  try {
    const currentDate = new Date().toISOString().split('T')[0];
    const isFutureDate = date > currentDate;

    // If future date -> return all zeros
    if (isFutureDate) {
      const [rows] = await pool.query(
        `SELECT id, item_code, name AS item_name FROM finished_goods_items ORDER BY item_code`
      );
      const formatted = rows.map(r => ({
        ...r,
        opening_balance: 0,
        production: 0,
        transfer: 0,
        wastage: 0,
        closing_balance: 0
      }));
      return res.json(formatted);
    }

    let query = '';
    let params = [];

    if (location === 'Supervisor stock') {
      // Supervisor stock logic
      query = `
        WITH 
        opening AS (
          SELECT 
            fgi.id AS item_id,
            -- opening should be the cumulative quantities up to the day BEFORE the selected date
            COALESCE(SUM(fgo.quantity), 0) AS opening_balance
          FROM finished_goods_items fgi
          LEFT JOIN finished_goods_opening_balances fgo 
            ON fgi.id = fgo.item_id AND fgo.date < ?
          GROUP BY fgi.id
        ),
        production AS (
          SELECT 
            pi.item_id, SUM(pi.quantity) AS daily_production
          FROM finished_goods_production_items pi
          JOIN finished_goods_productions p ON pi.production_id = p.id
          WHERE p.production_date = ?
          GROUP BY pi.item_id
        ),
        transfer_out AS (
          SELECT 
            ti.item_id, SUM(ti.quantity) AS daily_transfer_out
          FROM finished_goods_transfer_items ti
          JOIN finished_goods_transfers t ON ti.transfer_id = t.id
          WHERE t.transfer_date = ?
          GROUP BY ti.item_id
        ),
        wastage AS (
          SELECT 
            wi.item_id, SUM(wi.quantity) AS daily_wastage
          FROM finished_goods_wastage_items wi
          JOIN finished_goods_wastages w ON wi.wastage_id = w.id
          WHERE w.date = ? AND (w.department_id IS NULL OR w.department_id = 1)
          GROUP BY wi.item_id
        )

        SELECT 
          fgi.id,
          fgi.item_code,
          fgi.name AS item_name,
          COALESCE(o.opening_balance, 0) AS opening_balance,
          COALESCE(p.daily_production, 0) AS production,
          COALESCE(toi.daily_transfer_out, 0) AS transfer,
          COALESCE(w.daily_wastage, 0) AS wastage,
          (COALESCE(o.opening_balance, 0)
           + COALESCE(p.daily_production, 0)
           - COALESCE(toi.daily_transfer_out, 0)
           - COALESCE(w.daily_wastage, 0)) AS closing_balance
        FROM finished_goods_items fgi
        LEFT JOIN opening o ON fgi.id = o.item_id
        LEFT JOIN production p ON fgi.id = p.item_id
        LEFT JOIN transfer_out toi ON fgi.id = toi.item_id
        LEFT JOIN wastage w ON fgi.id = w.item_id
        ORDER BY fgi.item_code;
      `;
      // params: opening cutoff (< date), production on date, transfer_out on date, wastage on date
      params = [date, date, date, date];
    } else {
      // For all other locations (Cafe, Ayathi, etc.)
      query = `
        WITH 
        opening AS (
          SELECT 
            fgi.id AS item_id,
            COALESCE(SUM(ti.quantity), 0) - COALESCE(SUM(wi.quantity), 0) AS opening_balance
          FROM finished_goods_items fgi
          LEFT JOIN (
            SELECT ti.item_id, SUM(ti.quantity) AS quantity
            FROM finished_goods_transfer_items ti
            JOIN finished_goods_transfers t ON ti.transfer_id = t.id
            JOIN transfer_destinations td ON t.destination_id = td.id
            WHERE t.transfer_date < ? AND td.name = ?
            GROUP BY ti.item_id
          ) ti ON fgi.id = ti.item_id
          LEFT JOIN (
            SELECT wi.item_id, SUM(wi.quantity) AS quantity
            FROM finished_goods_wastage_items wi
            JOIN finished_goods_wastages w ON wi.wastage_id = w.id
            JOIN departments d ON w.department_id = d.id
            WHERE w.date < ? AND d.name = ? AND w.wastage_type = 'General'
            GROUP BY wi.item_id
          ) wi ON fgi.id = wi.item_id
          GROUP BY fgi.id
        ),
        transfer_in AS (
          SELECT 
            ti.item_id, SUM(ti.quantity) AS daily_transfer_in
          FROM finished_goods_transfer_items ti
          JOIN finished_goods_transfers t ON ti.transfer_id = t.id
          JOIN transfer_destinations td ON t.destination_id = td.id
          WHERE t.transfer_date = ? AND td.name = ?
          GROUP BY ti.item_id
        ),
        wastage AS (
          SELECT 
            wi.item_id, SUM(wi.quantity) AS daily_wastage
          FROM finished_goods_wastage_items wi
          JOIN finished_goods_wastages w ON wi.wastage_id = w.id
          JOIN departments d ON w.department_id = d.id
          WHERE w.date = ? AND d.name = ? AND w.wastage_type = 'General'
          GROUP BY wi.item_id
        )

        SELECT 
          fgi.id,
          fgi.item_code,
          fgi.name AS item_name,
          COALESCE(o.opening_balance, 0) AS opening_balance,
          0 AS production,
          COALESCE(ti.daily_transfer_in, 0) AS transfer,
          COALESCE(w.daily_wastage, 0) AS wastage,
          (COALESCE(o.opening_balance, 0)
           + COALESCE(ti.daily_transfer_in, 0)
           - COALESCE(w.daily_wastage, 0)) AS closing_balance
        FROM finished_goods_items fgi
        LEFT JOIN opening o ON fgi.id = o.item_id
        LEFT JOIN transfer_in ti ON fgi.id = ti.item_id
        LEFT JOIN wastage w ON fgi.id = w.item_id
        ORDER BY fgi.item_code;
      `;
      params = [date, location, date, location, date, location, date, location];
    }

    const [rows] = await pool.query(query, params);

    // If caller requested "All locations", we'll leave opening_balance as a dot (string '.')
    const formatted = rows.map(r => ({
      ...r,
      opening_balance: location === 'All locations' ? '.' : (Number(r.opening_balance) || 0),
      production: Number(r.production) || 0,
      transfer: Number(r.transfer) || 0,
      wastage: Number(r.wastage) || 0,
      closing_balance: Number(r.closing_balance) || 0,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching stock report:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

module.exports = { getStockReport };
