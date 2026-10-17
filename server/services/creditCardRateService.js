// server/services/creditCardRateService.js
//
// Management -> Credit Card Rate: the card commission rate (%) of each
// Branch / Department (departments master). Shared by the management API
// (routes/creditCardRateRoutes.js) and the Card Ledger realisation
// (services/cardLedgerService.js), so both read rates the same way.
//
// Rates are handled as integer BASIS POINTS (1% = 100 bp, 2.5% = 250 bp) so the
// commission is calculated without floating-point drift:
//   commission (cents) = round(amount (cents) x bp / 10000)
//
// status: 1 = Active, 0 = Inactive (same convention as receive_types). At most
// one Active rate per department (checked here; also a UNIQUE generated column
// where the database supports it - see config/db.js).

const { HttpError } = require('../utils/staffLoanUtils');

const MAX_BASIS_POINTS = 10000; // 100.00 %

/**
 * Validates a Credit Card Rate (%) entered by the user: numeric, 0 - 100,
 * at most 2 decimal places. Pure.
 * @returns {{ basisPoints: number } | { error: string }}
 */
const parseRatePercent = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { error: 'Credit Card Rate (%) is required' };
  }
  if (typeof value !== 'number' && typeof value !== 'string') {
    return { error: 'Credit Card Rate (%) must be a number' };
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return { error: 'Credit Card Rate (%) must be a number' };
  }
  const text = String(value).trim();
  if (text.startsWith('-')) return { error: 'Credit Card Rate (%) must be between 0 and 100' };
  const match = /^(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[1] === '' && !match[2])) return { error: 'Credit Card Rate (%) must be a number' };
  const fraction = match[2] || '';
  if (fraction.length > 2) return { error: 'Credit Card Rate (%) can have at most 2 decimal places' };
  const integer = (match[1] || '0').replace(/^0+(?=\d)/, '');
  if (integer.length > 3) return { error: 'Credit Card Rate (%) must be between 0 and 100' };
  const basisPoints = Number(integer) * 100 + Number(fraction.padEnd(2, '0'));
  if (basisPoints > MAX_BASIS_POINTS) return { error: 'Credit Card Rate (%) must be between 0 and 100' };
  return { basisPoints };
};

/** Rate (%) from the database -> basis points (rates are entered with at most 2 decimals). */
const rateToBasisPoints = (rate) => Math.round((Number.parseFloat(rate) || 0) * 100);

/** Basis points -> the rate (%) that is stored and shown (250 -> 2.5). */
const basisPointsToRate = (bp) => Number((bp / 100).toFixed(2));

/** Commission in cents of `amountCents` at `basisPoints` (half-up, to the cent). */
const commissionCents = (amountCents, basisPoints) => Math.round((amountCents * basisPoints) / 10000);

/**
 * Active rate + name of each department in `departmentIds`.
 * @returns {Promise<Map<number, { departmentId, departmentName, rateId, basisPoints }>>}
 *          departments that do not exist are missing from the map; an existing
 *          department without an Active rate has rateId / basisPoints null.
 */
const loadDepartmentRates = async (connection, departmentIds) => {
  const ids = [...new Set(departmentIds.filter((id) => id !== null && id !== undefined).map(Number))];
  const result = new Map();
  if (ids.length === 0) return result;

  const [departments] = await connection.query(
    'SELECT id, name FROM departments WHERE is_deleted = 0 AND id IN (?)',
    [ids]
  );
  departments.forEach((d) => result.set(Number(d.id), {
    departmentId: Number(d.id), departmentName: d.name, rateId: null, basisPoints: null
  }));

  const [rates] = await connection.query(
    `SELECT id, department_id, rate FROM credit_card_rates
      WHERE status = 1 AND department_id IN (?)
      ORDER BY id ASC`,
    [ids]
  );
  rates.forEach((r) => {
    const entry = result.get(Number(r.department_id));
    if (entry && entry.rateId === null) {
      entry.rateId = Number(r.id);
      entry.basisPoints = rateToBasisPoints(r.rate);
    }
  });
  return result;
};

/** Message shown when a department has no Active Credit Card Rate. */
const missingRateMessage = (departmentName) =>
  `No active Credit Card Rate is configured for Branch / Department "${departmentName}". `
  + 'Add or activate it under Management → Credit Card Rate.';

/**
 * Refuses a second ACTIVE rate for the same department (the one with id
 * `exceptId` is ignored, for edits). Locks the department's active rows so two
 * concurrent saves cannot both pass.
 */
const assertNoOtherActiveRate = async (connection, departmentId, exceptId = null) => {
  const [rows] = await connection.query(
    `SELECT id FROM credit_card_rates
      WHERE department_id = ? AND status = 1 ${exceptId ? 'AND id <> ?' : ''}
      FOR UPDATE`,
    exceptId ? [departmentId, exceptId] : [departmentId]
  );
  if (rows.length > 0) {
    throw new HttpError(409, 'This Branch / Department already has an active Credit Card Rate. Edit it, or deactivate it first.');
  }
};

module.exports = {
  MAX_BASIS_POINTS,
  parseRatePercent,
  rateToBasisPoints,
  basisPointsToRate,
  commissionCents,
  loadDepartmentRates,
  missingRateMessage,
  assertNoOtherActiveRate
};
