const pool = require('../config/db');

const getDateRange = (start, end) => {
  const dates = [];
  let current = new Date(start);
  const last = new Date(end);

  while (current <= last) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

const getFinishedGoodsStockReport = async (req, res) => {
  try {
    const { startDate, endDate, itemId } = req.query;

    if (!startDate || !endDate || !itemId) {
      return res.status(400).json({ 
        error: 'startDate, endDate, and itemId are required (format: YYYY-MM-DD)' 
      });
    }

    const dateRange = getDateRange(startDate, endDate);
    const report = [];

    // Get initial opening balance before start date
    const [[openingRow]] = await pool.query(
      `SELECT date, quantity FROM finished_goods_opening_balances 
       WHERE item_id = ? AND date < ? 
       ORDER BY date DESC LIMIT 1`,
      [itemId, startDate]
    );

    let runningBalance = 0;
    if (openingRow) {
      runningBalance = parseInt(openingRow.quantity);
    }

    // Calculate initial balance from transactions before start date
    const [[{ production: preProduction = 0 }]] = await pool.query(
      `SELECT SUM(pi.quantity) AS production
       FROM finished_goods_production_items pi
       JOIN finished_goods_productions p ON pi.production_id = p.id
       WHERE pi.item_id = ? AND DATE(p.production_date) < ?`,
      [itemId, startDate]
    );

    const [[{ production_wastage: preProductionWastage = 0 }]] = await pool.query(
      `SELECT SUM(wi.quantity) AS production_wastage
       FROM finished_goods_wastage_items wi
       JOIN finished_goods_wastages w ON wi.wastage_id = w.id
       WHERE wi.item_id = ? AND w.wastage_type = 'Production' AND DATE(w.date) < ?`,
      [itemId, startDate]
    );

    const [[{ transfer: preTransfer = 0 }]] = await pool.query(
      `SELECT SUM(ti.quantity) AS transfer
       FROM finished_goods_transfer_items ti
       JOIN finished_goods_transfers t ON ti.transfer_id = t.id
       WHERE ti.item_id = ? AND DATE(t.transfer_date) < ?`,
      [itemId, startDate]
    );

    const [[{ wastage: preWastage = 0 }]] = await pool.query(
      `SELECT SUM(wi.quantity) AS wastage
       FROM finished_goods_wastage_items wi
       JOIN finished_goods_wastages w ON wi.wastage_id = w.id
       WHERE wi.item_id = ? AND w.wastage_type = 'General' AND DATE(w.date) < ?`,
      [itemId, startDate]
    );

    // Calculate initial running balance
    runningBalance = runningBalance + 
                    parseInt(preProduction || 0) - 
                    parseInt(preProductionWastage || 0) - 
                    parseInt(preTransfer || 0) - 
                    parseInt(preWastage || 0);

    for (const date of dateRange) {
      let opening = runningBalance;
      let production = 0;
      let production_wastage = 0;
      let transfer = 0;
      let wastage = 0;

      // Check for specific opening balance on this date
      const [[specificOpening]] = await pool.query(
        `SELECT quantity FROM finished_goods_opening_balances 
         WHERE item_id = ? AND DATE(date) = ?`,
        [itemId, date]
      );

      if (specificOpening) {
        opening = parseInt(specificOpening.quantity);
        runningBalance = opening;
      }

      // Get production for the date
      const [[{ production: dbProduction = 0 }]] = await pool.query(
        `SELECT SUM(pi.quantity) AS production
         FROM finished_goods_production_items pi
         JOIN finished_goods_productions p ON pi.production_id = p.id
         WHERE pi.item_id = ? AND DATE(p.production_date) = ?`,
        [itemId, date]
      );

      // Get production wastage for the date
      const [[{ production_wastage: dbProductionWastage = 0 }]] = await pool.query(
        `SELECT SUM(wi.quantity) AS production_wastage
         FROM finished_goods_wastage_items wi
         JOIN finished_goods_wastages w ON wi.wastage_id = w.id
         WHERE wi.item_id = ? AND w.wastage_type = 'Production' AND DATE(w.date) = ?`,
        [itemId, date]
      );

      // Get transfers for the date
      const [[{ transfer: dbTransfer = 0 }]] = await pool.query(
        `SELECT SUM(ti.quantity) AS transfer
         FROM finished_goods_transfer_items ti
         JOIN finished_goods_transfers t ON ti.transfer_id = t.id
         WHERE ti.item_id = ? AND DATE(t.transfer_date) = ?`,
        [itemId, date]
      );

      // Get general wastage for the date
      const [[{ wastage: dbWastage = 0 }]] = await pool.query(
        `SELECT SUM(wi.quantity) AS wastage
         FROM finished_goods_wastage_items wi
         JOIN finished_goods_wastages w ON wi.wastage_id = w.id
         WHERE wi.item_id = ? AND w.wastage_type = 'General' AND DATE(w.date) = ?`,
        [itemId, date]
      );

      production = parseInt(dbProduction || 0);
      production_wastage = parseInt(dbProductionWastage || 0);
      transfer = parseInt(dbTransfer || 0);
      wastage = parseInt(dbWastage || 0);

      const closing = opening + production - production_wastage - transfer - wastage;
      runningBalance = closing;

      report.push({
        date,
        opening_balance: opening,
        total_production: production,
        total_production_wastage: production_wastage,
        total_transfer: transfer,
        total_wastage: wastage,
        closing_balance: closing
      });
    }

    res.json(report);
  } catch (err) {
    console.error('Error generating finished goods stock report:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
};

module.exports = {
  getFinishedGoodsStockReport
};