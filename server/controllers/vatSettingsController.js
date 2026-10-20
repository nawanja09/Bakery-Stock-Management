// server/controllers/vatSettingsController.js
const pool = require('../config/db');
const { getCurrentVatRate } = require('../services/vatSettings');
const { actorId } = require('../utils/actor');

// Read by anyone holding the Raw Material / Expenses / VAT module (route is
// restricted in config/rolePermissions.js); updating is Admin / Super Admin only
// (writeRoles on the same prefix).
const getVatRate = async (req, res) => {
  try {
    const rate = await getCurrentVatRate(pool);
    res.json({ vat_rate: rate });
  } catch (error) {
    console.error('Error fetching VAT rate:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateVatRate = async (req, res) => {
  try {
    const rate = parseFloat(req.body?.vat_rate);

    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return res.status(400).json({ error: 'VAT rate must be a number between 0 and 100' });
    }

    const updatedBy = actorId(req);
    await pool.query(
      'INSERT INTO vat_rate_settings (id, vat_rate, updated_by) VALUES (1, ?, ?) '
      + 'ON DUPLICATE KEY UPDATE vat_rate = ?, updated_by = ?',
      [rate, updatedBy, rate, updatedBy]
    );

    res.json({ message: 'VAT rate updated successfully', vat_rate: rate });
  } catch (error) {
    console.error('Error updating VAT rate:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getVatRate, updateVatRate };
