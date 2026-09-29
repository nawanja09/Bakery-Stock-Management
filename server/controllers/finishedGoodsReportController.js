const pool = require('../config/db');

// Production Report
const getProductionReport = async (req, res) => {
  const { startDate, endDate, category } = req.query;

  try {
    let query = `
      SELECT 
        p.id,
        p.production_date,
        p.prepared_by,
        p.remarks,
        p.status,
        p.created_at,
        COUNT(pi.id) as item_count,
        SUM(pi.quantity) as total_quantity,
        GROUP_CONCAT(DISTINCT fgi.category) as categories
      FROM finished_goods_productions p
      LEFT JOIN finished_goods_production_items pi ON p.id = pi.production_id
      LEFT JOIN finished_goods_items fgi ON pi.item_id = fgi.id
      WHERE 1=1
    `;

    const params = [];

    if (startDate) {
      query += ' AND p.production_date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND p.production_date <= ?';
      params.push(endDate);
    }

    if (category && category !== 'All') {
      query += ' AND fgi.category = ?';
      params.push(category);
    }

    query += `
      GROUP BY p.id
      ORDER BY p.production_date ASC, p.created_at ASC, p.id ASC
    `;

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching production report:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Wastage Report
const getWastageReport = async (req, res) => {
  const { startDate, endDate, reason, wastageType } = req.query;

  try {
    let query = `
      SELECT 
        w.id,
        w.wastage_number,
        w.date,
        w.approved_by,
        w.reason,
        w.remarks,
        w.wastage_type,
        w.created_at,
        COUNT(wi.id) as item_count,
        SUM(wi.quantity) as total_quantity,
        SUM(wi.estimated_loss) as total_loss
      FROM finished_goods_wastages w
      LEFT JOIN finished_goods_wastage_items wi ON w.id = wi.wastage_id
      WHERE 1=1
    `;

    const params = [];

    if (startDate) {
      query += ' AND w.date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND w.date <= ?';
      params.push(endDate);
    }

    if (reason && reason !== 'All') {
      query += ' AND w.reason = ?';
      params.push(reason);
    }

    if (wastageType && wastageType !== 'All') {
      query += ' AND w.wastage_type = ?';
      params.push(wastageType);
    }

    query += `
      GROUP BY w.id
      ORDER BY w.date ASC, w.created_at ASC, w.id ASC
    `;

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching wastage report:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Transfer Report
const getTransferReport = async (req, res) => {
  const { startDate, endDate, destinationId } = req.query;

  try {
    let query = `
      SELECT 
        t.id,
        t.transfer_date,
        t.transfer_number,
        t.transferred_by,
        t.remarks,
        t.status,
        t.created_at,
        d.name as destination_name,
        COUNT(ti.id) as item_count,
        SUM(ti.quantity) as total_quantity
      FROM finished_goods_transfers t
      JOIN transfer_destinations d ON t.destination_id = d.id
      LEFT JOIN finished_goods_transfer_items ti ON t.id = ti.transfer_id
      WHERE 1=1
    `;

    const params = [];

    if (startDate) {
      query += ' AND t.transfer_date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND t.transfer_date <= ?';
      params.push(endDate);
    }

    if (destinationId && destinationId !== 'All') {
      query += ' AND t.destination_id = ?';
      params.push(destinationId);
    }

    query += `
      GROUP BY t.id
      ORDER BY t.transfer_date ASC, t.created_at ASC, t.id ASC
    `;

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching transfer report:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getProductionReport,
  getWastageReport,
  getTransferReport,
};