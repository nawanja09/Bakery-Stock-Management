// controllers/finishedGoodsReportController.js
const pool = require('../config/db'); // mysql2/promise pool

const getStockReport = async (req, res) => {
  try {
    const { date, location } = req.query;
    const selectedDate = date || new Date().toISOString().split('T')[0];
    const currentDate = new Date().toISOString().split('T')[0];

    // Normalize location
    const loc = location || 'Supervisor stock';

    // --- STEP 1: check if there are any transactions for this date & location ---
    // We'll check production, transfers, wastage depending on the location.
    let hasData = false;

    if (loc === 'Supervisor stock') {
      // If Supervisor stock, production entries (on that date), transfers (any transfers with that date), wastages
      const [checkRows] = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM finished_goods_productions WHERE production_date = ?) AS prod_count,
           (SELECT COUNT(*) FROM finished_goods_transfers WHERE transfer_date = ?) AS transfer_count,
           (SELECT COUNT(*) FROM finished_goods_wastages WHERE date = ?) AS wastage_count
         `,
        [selectedDate, selectedDate, selectedDate]
      );
      const x = checkRows[0];
      hasData = (Number(x.prod_count) + Number(x.transfer_count) + Number(x.wastage_count)) > 0;
    } else if (loc === 'All locations') {
      // Any transaction anywhere on that date
      const [checkRows] = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM finished_goods_productions WHERE production_date = ?) AS prod_count,
           (SELECT COUNT(*) FROM finished_goods_transfers WHERE transfer_date = ?) AS transfer_count,
           (SELECT COUNT(*) FROM finished_goods_wastages WHERE date = ?) AS wastage_count
         `,
        [selectedDate, selectedDate, selectedDate]
      );
      const x = checkRows[0];
      hasData = (Number(x.prod_count) + Number(x.transfer_count) + Number(x.wastage_count)) > 0;
    } else {
      // Specific location (Cafe, MAS Ayathi, etc.)
      // Check transfers TO that location on that date, and wastages for that department on that date.
      const [checkRows] = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM finished_goods_transfer_items ti
              JOIN finished_goods_transfers t ON ti.transfer_id = t.id
              JOIN transfer_destinations td ON t.destination_id = td.id
              WHERE t.transfer_date = ? AND td.name = ?) AS transfer_count,
           (SELECT COUNT(*) FROM finished_goods_wastages w
              JOIN departments d ON w.department_id = d.id
              WHERE w.date = ? AND d.name = ?) AS wastage_count,
           (SELECT COUNT(*) FROM finished_goods_production_items pi
              JOIN finished_goods_productions p ON pi.production_id = p.id
              WHERE p.production_date = ?) AS prod_count
         `,
        [selectedDate, loc, selectedDate, loc, selectedDate]
      );
      const x = checkRows[0];
      hasData = (Number(x.transfer_count) + Number(x.wastage_count) + Number(x.prod_count)) > 0;
    }

    // --- STEP 2: If selected date is future and no data -> return all zeros (opening 0)
    if (selectedDate > currentDate && !hasData) {
      const [items] = await pool.query(
        `SELECT id, item_code, name AS item_name FROM finished_goods_items ORDER BY item_code`
      );

      const formatted = items.map(r => ({
        id: r.id,
        item_code: r.item_code,
        item_name: r.item_name,
        opening_balance: loc === 'All locations' ? '.' : 0,
        production: 0,
        transfer: 0,
        wastage: 0,
        closing_balance: 0
      }));

      return res.json(formatted);
    }

    // --- STEP 3: Otherwise use normal logic (existing queries), adapt by location ---
    let query = '';
    let params = [];

    if (loc === 'Supervisor stock') {
      query = `
        WITH 
        opening AS (
          SELECT 
            fgi.id AS item_id,
            -- opening is cumulative up to day BEFORE selected date
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
      params = [selectedDate, selectedDate, selectedDate, selectedDate];
    } else {
      // Other locations or All locations (same transfer/wastage logic but All locations will not hide opening)
      query = `
        WITH 
        opening AS (
          SELECT 
            fgi.id AS item_id,
            COALESCE(SUM(ti_all.quantity), 0) - COALESCE(SUM(wi_all.quantity), 0) AS opening_balance
          FROM finished_goods_items fgi
          LEFT JOIN (
            SELECT ti.item_id, SUM(ti.quantity) AS quantity, td.name
            FROM finished_goods_transfer_items ti
            JOIN finished_goods_transfers t ON ti.transfer_id = t.id
            JOIN transfer_destinations td ON t.destination_id = td.id
            WHERE t.transfer_date < ? ${loc !== 'All locations' ? 'AND td.name = ?' : ''}
            GROUP BY ti.item_id ${loc !== 'All locations' ? ', td.name' : ''}
          ) ti_all ON fgi.id = ti_all.item_id
          LEFT JOIN (
            SELECT wi.item_id, SUM(wi.quantity) AS quantity, d.name
            FROM finished_goods_wastage_items wi
            JOIN finished_goods_wastages w ON wi.wastage_id = w.id
            JOIN departments d ON w.department_id = d.id
            WHERE w.date < ? ${loc !== 'All locations' ? "AND d.name = ? AND w.wastage_type = 'General'" : "AND w.wastage_type = 'General'"}
            GROUP BY wi.item_id ${loc !== 'All locations' ? ', d.name' : ''}
          ) wi_all ON fgi.id = wi_all.item_id
          GROUP BY fgi.id
        ),
        transfer_in AS (
          SELECT 
            ti.item_id, SUM(ti.quantity) AS daily_transfer_in
          FROM finished_goods_transfer_items ti
          JOIN finished_goods_transfers t ON ti.transfer_id = t.id
          JOIN transfer_destinations td ON t.destination_id = td.id
          WHERE t.transfer_date = ? ${loc !== 'All locations' ? 'AND td.name = ?' : ''}
          GROUP BY ti.item_id
        ),
        wastage AS (
          SELECT 
            wi.item_id, SUM(wi.quantity) AS daily_wastage
          FROM finished_goods_wastage_items wi
          JOIN finished_goods_wastages w ON wi.wastage_id = w.id
          JOIN departments d ON w.department_id = d.id
          WHERE w.date = ? ${loc !== 'All locations' ? "AND d.name = ? AND w.wastage_type = 'General'" : "AND w.wastage_type = 'General'"}
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

      if (loc === 'All locations') {
        // params: transfer_date, transfer_date(for daily), wastage date(for daily)
        params = [selectedDate, selectedDate, selectedDate];
      } else {
        // params: t.transfer_date < ?, w.date < ?, t.transfer_date for daily transfer_in, w.date for daily wastage
        // ordering: opening (date, location) -> uses selectedDate, loc ; opening-wastage uses selectedDate, loc
        // Then transfer_in t.transfer_date = ?, td.name = ? ; wastage w.date = ?, d.name = ?
        params = [selectedDate, selectedDate, selectedDate, loc, selectedDate, loc, selectedDate, loc];
        // but the query expects 8 params in the exact used order above; ensure correct mapping:
        // For simplicity and correctness: we will bind them in this order:
        // [selectedDate, selectedDate, selectedDate, loc, selectedDate, loc, selectedDate, loc]
      }
    }

    // Run final rows query
    const [rows] = await pool.query(query, params);

    const formatted = rows.map(r => ({
      id: r.id,
      item_code: r.item_code,
      item_name: r.item_name,
      opening_balance: loc === 'All locations' ? '.' : (Number(r.opening_balance) || 0),
      production: Number(r.production) || 0,
      transfer: Number(r.transfer) || 0,
      wastage: Number(r.wastage) || 0,
      closing_balance: Number(r.closing_balance) || 0
    }));

    return res.json(formatted);
  } catch (err) {
    console.error('Error in getStockReport:', err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
};

module.exports = { getStockReport };
