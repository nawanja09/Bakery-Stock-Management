// server/utils/staffLoanUtils.js
//
// Pure helpers for the Staff Loans module (no database access, so they can
// be unit tested on their own).
//
// Money is handled as integer CENTS (Rs. 1.00 = 100) for every comparison
// and subtraction, so results such as 0.1 + 0.2 never leak floating-point
// error into a balance check. The database column is DECIMAL(14,2).

const moneyMath = require('./money');

// DECIMAL(14,2) holds at most 12 integer digits.
const MAX_INTEGER_DIGITS = 12;

/**
 * Parses a user-supplied money value into integer cents.
 * Accepts "50000", "50000.5", "50000.55", ".5" and the equivalent numbers.
 * Rejects empty, non-numeric, exponent notation, negatives, zero, more than
 * two decimal places and values too large for DECIMAL(14,2).
 *
 * @returns {{ cents: number } | { error: string }}
 */
const parsePositiveMoney = (value, label = 'Amount') => {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { error: `${label} is required` };
  }

  let text;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { error: `${label} must be a valid number` };
    text = String(value);
  } else if (typeof value === 'string') {
    text = value.trim();
  } else {
    return { error: `${label} must be a valid number` };
  }

  if (/^-/.test(text)) return { error: `${label} must be greater than zero` };

  const match = /^(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[1] === '' && (match[2] === undefined || match[2] === ''))) {
    return { error: `${label} must be a valid number` };
  }

  const integerPart = match[1] || '0';
  const fractionPart = match[2] || '';

  if (fractionPart.length > 2) {
    return { error: `${label} can have at most 2 decimal places` };
  }
  if (integerPart.replace(/^0+(?=\d)/, '').length > MAX_INTEGER_DIGITS) {
    return { error: `${label} is too large` };
  }

  const cents = Number(integerPart) * 100 + Number(fractionPart.padEnd(2, '0'));
  if (cents <= 0) return { error: `${label} must be greater than zero` };

  return { cents };
};

/** Converts a value read from the database (DECIMAL string/number) to cents. */
const dbToCents = (value) => Number(moneyMath.toUnits(value ?? 0, 2));

/** Cents -> a plain number with 2 decimal places of precision (e.g. 5000050 -> 50000.5). */
const centsToNumber = (cents) => moneyMath.fromUnits(BigInt(Math.round(cents)), 2);

/** Cents -> "50,000.00" (used only in human-readable error messages). */
const formatCents = (cents) =>
  (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Validates a YYYY-MM-DD date string as a real calendar date.
 * Returns the normalised string, or null when it is not a valid date.
 */
const parseDateOnly = (value) => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2100) return null;

  const probe = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day;

  return isRealDate ? text : null;
};

/** Positive integer id (rejects "abc", "1.5", "-2", "0", ""). Returns null when invalid. */
const parseId = (value) => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
};

/** Error that carries the HTTP status the controller should answer with. */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

module.exports = {
  parsePositiveMoney,
  dbToCents,
  centsToNumber,
  formatCents,
  parseDateOnly,
  parseId,
  HttpError
};
