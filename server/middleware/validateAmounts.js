// server/middleware/validateAmounts.js
//
// Domain 4 M7 fix: moneyMath.isAmount() strict-mode validation was applied to
// some money inputs (Financial Adjustments, RM Stock Adjustment unit_price -
// Domain 2 M4) and not others, so a route could silently accept a malformed
// amount and rely on downstream code happening to treat it as 0 (or worse).
// This is the single reusable gate: mount it on any route whose body carries
// a money amount, naming the field(s) to check, so a new route only has to
// remember to add one line instead of re-inventing the check.
//
// Usage: router.post('/receive', ...financeOnly, validateAmounts('amount'), financeController.receiveCash);
const moneyMath = require('../utils/money');

/**
 * @param {string|string[]} fields - body field name(s) that must be a valid amount when present.
 * @param {{ allowNegative?: boolean, required?: boolean }} [options]
 *   allowNegative: false (default) also rejects a valid-but-negative amount.
 *   required: false (default) - a missing/empty field is left for the controller's own checks to reject.
 */
const validateAmounts = (fields, { allowNegative = false, required = false } = {}) => {
  const names = Array.isArray(fields) ? fields : [fields];
  return (req, res, next) => {
    const body = req.body || {};
    for (const name of names) {
      const value = body[name];
      if (value === undefined || value === null || value === '') {
        if (required) return res.status(400).json({ error: `${name} is required` });
        continue;
      }
      if (!moneyMath.isAmount(value)) {
        return res.status(400).json({ error: `${name} must be a valid amount` });
      }
      if (!allowNegative && Number(moneyMath.round(value)) < 0) {
        return res.status(400).json({ error: `${name} must not be negative` });
      }
    }
    return next();
  };
};

module.exports = validateAmounts;
