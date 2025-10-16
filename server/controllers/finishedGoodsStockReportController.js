const pool = require('../config/db');

const getStockReport = async (req, res) => {
  const { date, location } = req.query;

  try {
    // Check if date is in the future
    const currentDate = new Date().toISOString().split('T')[0];
    const isFutureDate = date > currentDate;

    if (isFutureDate) {
      // For future dates, return all items with zeros
      let query = `SELECT id, item_code, name AS item_name FROM finished_goods_items ORDER BY item_code`;
      const [rows] = await pool.query(query);
      
      const formattedRows = rows.map(row => ({
        ...row,
        opening_balance: 0,
        production: 0,
        transfer: 0,
        wastage: 0,
        closing_balance: 0,
      }));

      return res.json(formattedRows);
    }

    let query = '';
    let params = [];

    if (location === 'Supervisor stock') {
      // Supervisor Stock Query - Calculate opening balance from previous day
      query = `
        WITH 
        previous_day_data AS (
          -- Get closing balance from previous day as opening balance
          SELECT 
            fgi.id AS item_id,
            COALESCE(pd.total_production, 0) - COALESCE(td.total_transfer_out, 0) - COALESCE(wd.total_wastage, 0) AS previous_closing_balance
          FROM finished_goods_items fgi
          LEFT JOIN (
            SELECT pi.item_id, SUM(pi.quantity) AS total_production
            FROM finished_goods_production_items pi
            JOIN finished_goods_productions p ON pi.production_id = p.id
            WHERE p.production_date < ?
            GROUP BY pi.item_id
          ) pd ON fgi.id = pd.item_id
          LEFT JOIN (
            SELECT ti.item_id, SUM(ti.quantity) AS total_transfer_out
            FROM finished_goods_transfer_items ti
            JOIN finished_goods_transfers t ON ti.transfer_id = t.id
            WHERE t.transfer_date < ? 
            GROUP BY ti.item_id
          ) td ON fgi.id = td.item_id
          LEFT JOIN (
            SELECT wi.item_id, SUM(wi.quantity) AS total_wastage
            FROM finished_goods_wastage_items wi
            JOIN finished_goods_wastages w ON wi.wastage_id = w.id
            WHERE w.date < ? AND w.wastage_type = 'General'
            GROUP BY wi.item_id
          ) wd ON fgi.id = wd.item_id
        ),
        production_data AS (
          SELECT pi.item_id, SUM(pi.quantity) AS total_production
          FROM finished_goods_production_items pi
          JOIN finished_goods_productions p ON pi.production_id = p.id
          WHERE p.production_date = ?
          GROUP BY pi.item_id
        ),
        transfer_data AS (
          SELECT ti.item_id, SUM(ti.quantity) AS total_transfer_out
          FROM finished_goods_transfer_items ti
          JOIN finished_goods_transfers t ON ti.transfer_id = t.id
          WHERE t.transfer_date = ? 
          GROUP BY ti.item_id
        ),
        wastage_data AS (
          SELECT wi.item_id, SUM(wi.quantity) AS total_wastage
          FROM finished_goods_wastage_items wi
          JOIN finished_goods_wastages w ON wi.wastage_id = w.id
          WHERE w.date = ? AND w.wastage_type = 'General'
          GROUP BY wi.item_id
        )

        SELECT 
          fgi.id,
          fgi.item_code,
          fgi.name AS item_name,
          COALESCE(pdd.previous_closing_balance, 0) AS opening_balance,
          COALESCE(pd.total_production, 0) AS production,
          COALESCE(td.total_transfer_out, 0) AS transfer_out,
          COALESCE(wd.total_wastage, 0) AS wastage,
          (COALESCE(pdd.previous_closing_balance, 0) + COALESCE(pd.total_production, 0)
             - COALESCE(td.total_transfer_out, 0)
             - COALESCE(wd.total_wastage, 0)) AS closing_balance
        FROM finished_goods_items fgi
        LEFT JOIN previous_day_data pdd ON fgi.id = pdd.item_id
        LEFT JOIN production_data pd ON fgi.id = pd.item_id
        LEFT JOIN transfer_data td ON fgi.id = td.item_id
        LEFT JOIN wastage_data wd ON fgi.id = wd.item_id
        ORDER BY fgi.item_code;
      `;
      params = [date, date, date, date, date, date];
    } else {
      // Specific Location Query - Calculate opening balance from previous day
      query = `
        WITH 
        previous_day_data AS (
          -- Get closing balance from previous day as opening balance for specific location
          SELECT 
            fgi.id AS item_id,
            COALESCE(ti_data.total_transfer_in, 0) - COALESCE(wd.total_wastage, 0) AS previous_closing_balance
          FROM finished_goods_items fgi
          LEFT JOIN (
            SELECT ti.item_id, SUM(ti.quantity) AS total_transfer_in
            FROM finished_goods_transfer_items ti
            JOIN finished_goods_transfers t ON ti.transfer_id = t.id
            JOIN transfer_destinations td ON t.destination_id = td.id
            WHERE t.transfer_date < ? AND td.name = ? 
            GROUP BY ti.item_id
          ) ti_data ON fgi.id = ti_data.item_id
          LEFT JOIN (
            SELECT wi.item_id, SUM(wi.quantity) AS total_wastage
            FROM finished_goods_wastage_items wi
            JOIN finished_goods_wastages w ON wi.wastage_id = w.id
            JOIN departments d ON w.department_id = d.id
            WHERE w.date < ? AND d.name = ? AND w.wastage_type = 'General'
            GROUP BY wi.item_id
          ) wd ON fgi.id = wd.item_id
        ),
        transfer_in_data AS (
          SELECT ti.item_id, SUM(ti.quantity) AS total_transfer_in
          FROM finished_goods_transfer_items ti
          JOIN finished_goods_transfers t ON ti.transfer_id = t.id
          JOIN transfer_destinations td ON t.destination_id = td.id
          WHERE t.transfer_date = ? AND td.name = ? 
          GROUP BY ti.item_id
        ),
        wastage_data AS (
          SELECT wi.item_id, SUM(wi.quantity) AS total_wastage
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
          COALESCE(pdd.previous_closing_balance, 0) AS opening_balance,
          0 AS production,
          COALESCE(ti_data.total_transfer_in, 0) AS transfer_in,
          COALESCE(wd.total_wastage, 0) AS wastage,
          (COALESCE(pdd.previous_closing_balance, 0) + COALESCE(ti_data.total_transfer_in, 0)
             - COALESCE(wd.total_wastage, 0)) AS closing_balance
        FROM finished_goods_items fgi
        LEFT JOIN previous_day_data pdd ON fgi.id = pdd.item_id
        LEFT JOIN transfer_in_data ti_data ON fgi.id = ti_data.item_id
        LEFT JOIN wastage_data wd ON fgi.id = wd.item_id
        WHERE COALESCE(pdd.previous_closing_balance, 0) > 0
           OR COALESCE(ti_data.total_transfer_in, 0) > 0
           OR COALESCE(wd.total_wastage, 0) > 0
        ORDER BY fgi.item_code;
      `;
      params = [date, location, date, location, date, location, date, location];
    }

    const [rows] = await pool.query(query, params);

    // Format Data
    const formattedRows = rows.map(row => {
      if (location === 'Supervisor stock') {
        return {
          ...row,
          opening_balance: Number(row.opening_balance),
          production: Number(row.production),
          transfer: Number(row.transfer_out),
          wastage: Number(row.wastage),
          closing_balance: Number(row.closing_balance),
        };
      } else {
        return {
          ...row,
          opening_balance: Number(row.opening_balance),
          production: 0,
          transfer: Number(row.transfer_in),
          wastage: Number(row.wastage),
          closing_balance: Number(row.closing_balance),
        };
      }
    });

    res.json(formattedRows);
  } catch (error) {
    console.error('Error fetching stock report:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

module.exports = { getStockReport };