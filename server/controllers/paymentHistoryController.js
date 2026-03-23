// controllers/paymentHistoryController.js
const pool = require('../config/db');

// Get payment summary statistics
const getPaymentSummary = async (req, res) => {
  try {
    const [summary] = await pool.query(`
      SELECT 
        COUNT(CASE WHEN payment_status = 'Non-Paid' THEN 1 END) as non_paid_count,
        COUNT(CASE WHEN payment_status = 'Partially Paid' THEN 1 END) as partially_paid_count,
        COUNT(CASE WHEN payment_status = 'Paid' THEN 1 END) as paid_count,
        SUM(CASE WHEN payment_status IN ('Non-Paid', 'Partially Paid') THEN balance_amount ELSE 0 END) as total_outstanding,
        SUM(total_with_vat) as total_purchases,
        SUM(paid_amount) as total_paid
      FROM purchases
    `);

    res.json({
      non_paid_count: summary[0].non_paid_count || 0,
      partially_paid_count: summary[0].partially_paid_count || 0,
      paid_count: summary[0].paid_count || 0,
      total_outstanding: parseFloat(summary[0].total_outstanding || 0),
      total_purchases: parseFloat(summary[0].total_purchases || 0),
      total_paid: parseFloat(summary[0].total_paid || 0)
    });
  } catch (error) {
    console.error('Error fetching payment summary:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get recent payments
const getRecentPayments = async (req, res) => {
  try {
    const [payments] = await pool.query(`
      SELECT 
        ph.*,
        p.invoice_no,
        s.name AS supplier_name,
        u.name AS created_by_name
      FROM payment_history ph
      JOIN purchases p ON ph.purchase_id = p.id
      JOIN supplier s ON p.supplier_id = s.id
      JOIN users u ON ph.created_by = u.id
      ORDER BY ph.created_at DESC
      LIMIT 20
    `);

    res.json(payments);
  } catch (error) {
    console.error('Error fetching recent payments:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getPaymentSummary,
  getRecentPayments
};