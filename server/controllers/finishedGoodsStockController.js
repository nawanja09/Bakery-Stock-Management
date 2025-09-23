const pool = require('../config/db');

const getFinishedGoodsStockReport = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Date parameter is required' });
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    // Calculate previous date
    const prevDate = new Date(parsedDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().split('T')[0];

    const query = `
      SELECT 
        fgi.id,
        fgi.item_code,
        fgi.name AS item_name,
        fgi.category,
        fgi.unit_price,
        
        -- Today's opening balance = yesterday's closing balance + today's manual opening balance
        COALESCE(prev.closing_balance, 0) + COALESCE(ob_today.opening_balance_today, 0) AS opening_balance,
        
        -- Today's production
        COALESCE(production.total_produced, 0) AS total_produced,
        
        -- Today's production wastage
        COALESCE(production_wastage.total_production_wasted, 0) AS total_production_wasted,
        
        -- Today's transfers
        COALESCE(transfers.total_transferred, 0) AS total_transferred,
        
        -- Today's general wastage
        COALESCE(wastage.total_wasted, 0) AS total_wasted,
        
        -- Closing balance calculation
        (
          COALESCE(prev.closing_balance, 0) + 
          COALESCE(ob_today.opening_balance_today, 0) +
          COALESCE(production.total_produced, 0) -
          COALESCE(production_wastage.total_production_wasted, 0) -
          COALESCE(transfers.total_transferred, 0) -
          COALESCE(wastage.total_wasted, 0)
        ) AS closing_balance
        
      FROM finished_goods_items fgi

      -- Previous day's closing balance
      LEFT JOIN (
        SELECT 
          fgi2.id AS item_id,
          (
            COALESCE(ob.opening_balance, 0) +
            COALESCE(production.total_produced, 0) -
            COALESCE(production_wastage.total_production_wasted, 0) -
            COALESCE(transfers.total_transferred, 0) -
            COALESCE(wastage.total_wasted, 0)
          ) AS closing_balance
        FROM finished_goods_items fgi2
        LEFT JOIN (
          SELECT item_id, SUM(quantity) AS opening_balance
          FROM finished_goods_opening_balances
          WHERE date <= ?
          GROUP BY item_id
        ) ob ON fgi2.id = ob.item_id
        LEFT JOIN (
          SELECT item_id, SUM(quantity) AS total_produced
          FROM finished_goods_production_items pi
          JOIN finished_goods_productions p ON pi.production_id = p.id
          WHERE p.production_date <= ? AND p.status = 'Completed'
          GROUP BY item_id
        ) production ON fgi2.id = production.item_id
        LEFT JOIN (
          SELECT item_id, SUM(quantity) AS total_production_wasted
          FROM finished_goods_wastage_items wi
          JOIN finished_goods_wastages w ON wi.wastage_id = w.id
          WHERE w.date <= ? AND w.wastage_type = 'Production'
          GROUP BY item_id
        ) production_wastage ON fgi2.id = production_wastage.item_id
        LEFT JOIN (
          SELECT item_id, SUM(quantity) AS total_transferred
          FROM finished_goods_transfer_items ti
          JOIN finished_goods_transfers t ON ti.transfer_id = t.id
          WHERE t.transfer_date <= ? AND t.status = 'Completed'
          GROUP BY item_id
        ) transfers ON fgi2.id = transfers.item_id
        LEFT JOIN (
          SELECT item_id, SUM(quantity) AS total_wasted
          FROM finished_goods_wastage_items wi
          JOIN finished_goods_wastages w ON wi.wastage_id = w.id
          WHERE w.date <= ? AND w.wastage_type = 'General'
          GROUP BY item_id
        ) wastage ON fgi2.id = wastage.item_id
      ) prev ON fgi.id = prev.item_id

      -- Today's manual opening balance
      LEFT JOIN (
        SELECT item_id, SUM(quantity) AS opening_balance_today
        FROM finished_goods_opening_balances
        WHERE date = ?
        GROUP BY item_id
      ) ob_today ON fgi.id = ob_today.item_id

      -- Today's production
      LEFT JOIN (
        SELECT item_id, SUM(quantity) AS total_produced
        FROM finished_goods_production_items pi
        JOIN finished_goods_productions p ON pi.production_id = p.id
        WHERE p.production_date = ? AND p.status = 'Completed'
        GROUP BY item_id
      ) production ON fgi.id = production.item_id

      -- Today's production wastage
      LEFT JOIN (
        SELECT item_id, SUM(quantity) AS total_production_wasted
        FROM finished_goods_wastage_items wi
        JOIN finished_goods_wastages w ON wi.wastage_id = w.id
        WHERE w.date = ? AND w.wastage_type = 'Production'
        GROUP BY item_id
      ) production_wastage ON fgi.id = production_wastage.item_id

      -- Today's transfers
      LEFT JOIN (
        SELECT item_id, SUM(quantity) AS total_transferred
        FROM finished_goods_transfer_items ti
        JOIN finished_goods_transfers t ON ti.transfer_id = t.id
        WHERE t.transfer_date = ? AND t.status = 'Completed'
        GROUP BY item_id
      ) transfers ON fgi.id = transfers.item_id

      -- Today's general wastage
      LEFT JOIN (
        SELECT item_id, SUM(quantity) AS total_wasted
        FROM finished_goods_wastage_items wi
        JOIN finished_goods_wastages w ON wi.wastage_id = w.id
        WHERE w.date = ? AND w.wastage_type = 'General'
        GROUP BY item_id
      ) wastage ON fgi.id = wastage.item_id

      ORDER BY fgi.item_code
    `;

    const params = [
      prevDateStr, // yesterday for opening balance
      prevDateStr, // yesterday for production
      prevDateStr, // yesterday for production wastage
      prevDateStr, // yesterday for transfers
      prevDateStr, // yesterday for general wastage
      date,        // today's manual opening balance
      date,        // today's production
      date,        // today's production wastage
      date,        // today's transfers
      date         // today's general wastage
    ];

    const [rows] = await pool.query(query, params);
    
    // Format numbers properly
    const formattedRows = rows.map(row => ({
      ...row,
      opening_balance: Number(row.opening_balance || 0),
      total_produced: Number(row.total_produced || 0),
      total_production_wasted: Number(row.total_production_wasted || 0),
      total_transferred: Number(row.total_transferred || 0),
      total_wasted: Number(row.total_wasted || 0),
      closing_balance: Number(row.closing_balance || 0)
    }));

    res.json(formattedRows);

  } catch (error) {
    console.error('Error generating finished goods stock report:', error.message, error.stack);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

module.exports = {
  getFinishedGoodsStockReport
};

//stock report formula
// Closing Balance = (Yesterday's Closing Balance + Today's Manual Opening Balance + Today's Production) - (Today's Production Wastage + Today's Transfers + Today's General Wastage)

//Closing balan