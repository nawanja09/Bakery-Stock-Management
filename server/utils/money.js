// server/utils/money.js
//
// Exact decimal arithmetic for money (audit finding M5).
//
// JavaScript numbers are binary floats: 0.1 + 0.2 = 0.30000000000000004 and
// (1.005).toFixed(2) = "1.00". Over thousands of ledger rows that drift reaches
// real cents. Everything here parses values as DECIMAL TEXT into scaled BigInts,
// does the arithmetic on integers, and rounds half away from zero (the same rule
// MySQL applies when it stores a value into a DECIMAL column).
//
//   * Calculations carry 4 decimal places (SCALE).
//   * A value is rounded to the scale of the column it is stored in at the moment
//     it is stored: most money columns are DECIMAL(n,2) (use round2), a few are
//     DECIMAL(n,4). The database would round on store anyway - doing it here first
//     keeps a posted balance_after equal to the sum of the stored rows.
//
// Results are returned as plain JS numbers with at most 4 decimals, so existing
// callers (res.json, mysql2 parameters) need no change.

const SCALE = 4;
const STORAGE_SCALE = 2;

const pow10 = (n) => 10n ** BigInt(n);

// "12.345" / 12.345 / "1,234.50" / "1e-7" -> { negative, digits (BigInt), scale }
// Anything that is not a finite number -> null.
const parseDecimal = (value) => {
  let text;
  if (typeof value === 'bigint') return { negative: value < 0n, digits: value < 0n ? -value : value, scale: 0 };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    // 6 decimals is far below float noise (~1e-16 relative) and above SCALE.
    text = Math.abs(value) >= 1e15 ? value.toFixed(0) : value.toFixed(6);
  } else if (typeof value === 'string') {
    text = value.trim().replace(/,/g, '');
  } else if (value === null || value === undefined) {
    return null;
  } else {
    text = String(value);
  }
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match || (match[2] === '' && (match[3] === undefined || match[3] === ''))) return null;
  const [, sign, whole, fraction = '', exponent = '0'] = match;
  let scale = fraction.length - Number(exponent);
  let digits = BigInt((whole + fraction) || '0');
  if (scale < 0) { digits *= pow10(-scale); scale = 0; }
  return { negative: sign === '-', digits, scale };
};

// Rescale to `to` decimal places, rounding half away from zero.
const rescale = ({ negative, digits, scale }, to) => {
  let result;
  if (scale <= to) {
    result = digits * pow10(to - scale);
  } else {
    const divisor = pow10(scale - to);
    result = digits / divisor;
    if ((digits % divisor) * 2n >= divisor) result += 1n;
  }
  return negative ? -result : result;
};

const unitsToText = (units, scale) => {
  const negative = units < 0n;
  const abs = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const whole = abs.slice(0, abs.length - scale);
  const fraction = scale > 0 ? `.${abs.slice(abs.length - scale)}` : '';
  return `${negative ? '-' : ''}${whole}${fraction}`;
};

/** value -> BigInt in units of 10^-scale (default 4). Not a number -> 0n (or throws with { strict: true }). */
const toUnits = (value, scale = SCALE, { strict = false } = {}) => {
  const parsed = parseDecimal(value);
  if (!parsed) {
    if (strict) throw new TypeError(`Not a valid amount: ${String(value)}`);
    return 0n;
  }
  return rescale(parsed, scale);
};

/** BigInt units -> JS number. */
const fromUnits = (units, scale = SCALE) => Number(unitsToText(units, scale));

/** Round to `places` decimals (default 4), half away from zero. */
const round = (value, places = SCALE) => fromUnits(toUnits(value, places), places);

/** Round to the 2 decimals most money columns store. */
const round2 = (value) => round(value, STORAGE_SCALE);

/** Exact sum, 4 decimals. */
const add = (...values) => fromUnits(values.reduce((total, v) => total + toUnits(v), 0n));

/** a - b, exact, 4 decimals. */
const sub = (a, b) => fromUnits(toUnits(a) - toUnits(b));

/** a * b (price x quantity, amount x factor), exact, rounded to 4 decimals. */
const mul = (a, b) => {
  const left = parseDecimal(a);
  const right = parseDecimal(b);
  if (!left || !right) return 0;
  const product = {
    negative: left.negative !== right.negative,
    digits: left.digits * right.digits,
    scale: left.scale + right.scale
  };
  return fromUnits(rescale(product, SCALE));
};

/** amount x percent / 100, e.g. VAT: percent(100.25, 18). Exact, 4 decimals. */
const percent = (amount, rate) => {
  const left = parseDecimal(amount);
  const right = parseDecimal(rate);
  if (!left || !right) return 0;
  const product = {
    negative: left.negative !== right.negative,
    digits: left.digits * right.digits,
    scale: left.scale + right.scale + 2
  };
  return fromUnits(rescale(product, SCALE));
};

/** Compare after rounding both to `places` (default 2): -1, 0, 1. */
const compare = (a, b, places = STORAGE_SCALE) => {
  const x = toUnits(a, places);
  const y = toUnits(b, places);
  return x < y ? -1 : x > y ? 1 : 0;
};

/** The smaller / larger of two amounts, compared exactly (4 decimals) - a float-safe Math.min / Math.max. */
const min = (a, b) => (toUnits(a) <= toUnits(b) ? fromUnits(toUnits(a)) : fromUnits(toUnits(b)));
const max = (a, b) => (toUnits(a) >= toUnits(b) ? fromUnits(toUnits(a)) : fromUnits(toUnits(b)));

/** Exact sum of an array's amounts, optionally read through `pick` (e.g. (row) => row.balance). */
const sum = (rows, pick = (v) => v) => add(...rows.map(pick));

/** True when the value is a finite amount. */
const isAmount = (value) => parseDecimal(value) !== null;

/** Fixed-decimal text, e.g. fixed(1234.5, 2) = "1234.50" (a correct toFixed). */
const fixed = (value, places = STORAGE_SCALE) => unitsToText(toUnits(value, places), places);

module.exports = {
  SCALE, STORAGE_SCALE,
  toUnits, fromUnits, round, round2, add, sub, mul, percent, compare, min, max, sum, isAmount, fixed
};
