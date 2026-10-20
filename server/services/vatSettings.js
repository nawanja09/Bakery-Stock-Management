// server/services/vatSettings.js
//
// The system-wide VAT rate (Purchases / Expenses), management-editable from
// 18% (config/db.js seeds the single row, id = 1). This is the one place a
// fallback VAT rate is read from - controllers must not hardcode 18 anymore.

const DEFAULT_VAT_RATE = 18;

const getCurrentVatRate = async (db) => {
  try {
    const [rows] = await db.query('SELECT vat_rate FROM vat_rate_settings WHERE id = 1');
    const rate = rows[0] ? parseFloat(rows[0].vat_rate) : NaN;
    return Number.isFinite(rate) && rate >= 0 ? rate : DEFAULT_VAT_RATE;
  } catch (error) {
    console.warn('getCurrentVatRate failed, using default:', error.message);
    return DEFAULT_VAT_RATE;
  }
};

module.exports = { getCurrentVatRate, DEFAULT_VAT_RATE };
