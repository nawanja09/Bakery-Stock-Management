// server/services/periodLock.js
//
// Period close (audit finding H7).
//
// Only the current month and the month before it are open. Every older month is
// CLOSED: nothing dated in it can be created, edited or voided - not even by an
// Admin - so a finished month never changes behind a report that was already issued.
//
// A closed month is corrected like this:
//   1. an Admin (or Super Admin) asks to re-open it: months + a reason
//      (period_reopen_requests, status Pending);
//   2. the Super Admin approves, for a number of hours (status Approved);
//   3. until it expires - or an Admin / Super Admin closes it again - the months
//      are open, but ONLY an Admin or Super Admin can post or edit in them.
//
// How many months stay open: PERIOD_OPEN_MONTHS in .env (default 2 = this month
// and last month).
//
// Enforcement, in two layers:
//   * middleware/periodGuard.js refuses a data-changing request that names a
//     closed date, or edits / voids a record that is dated in a closed month;
//   * assertOpen() is called by the Cash / Bank ledger helpers
//     (utils/financeLedger.js) for every posting, whatever route made it.
//
// Test hook: PERIOD_LOCK_TODAY=YYYY-MM-DD pins "today" (ignored in production).

const { toYmd, todayYmd } = require('../utils/dateOnly');
const requestContext = require('./requestContext');

const DEFAULT_OPEN_MONTHS = 2;
const MAX_OPEN_MONTHS = 24;
const MAX_GRANT_HOURS = 168; // one week
const DEFAULT_GRANT_HOURS = 24;

class PeriodClosedError extends Error {
  constructor(message, { dates = [], closedBefore = null } = {}) {
    super(message);
    this.name = 'PeriodClosedError';
    this.status = 409;
    this.code = 'PERIOD_CLOSED';
    this.dates = dates;
    this.closedBefore = closedBefore;
  }
}

const pad = (n) => String(n).padStart(2, '0');

const openMonths = () => {
  const n = Number.parseInt(process.env.PERIOD_OPEN_MONTHS, 10);
  return Number.isInteger(n) && n >= 1 && n <= MAX_OPEN_MONTHS ? n : DEFAULT_OPEN_MONTHS;
};

const today = () => {
  const pinned = process.env.NODE_ENV === 'production' ? null : toYmd(process.env.PERIOD_LOCK_TODAY || '');
  return pinned || todayYmd();
};

/** First day of the oldest OPEN month. Dates before it are closed. */
const firstOpenDate = (now = today(), months = openMonths()) => {
  const [year, month] = now.split('-').map(Number);
  const index = year * 12 + (month - 1) - (months - 1);
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}-01`;
};

/** 'YYYY-MM-DD' of the given date when it is in a closed month, else null. */
const closedDateOf = (value, opts = {}) => {
  const date = toYmd(value);
  return date && date < firstOpenDate(opts.today, opts.months) ? date : null;
};

const isClosedDate = (value, opts) => closedDateOf(value, opts) !== null;

// 'YYYY-MM' -> first / last day of that month
const monthStart = (ym) => `${ym}-01`;
const monthEnd = (ym) => {
  const [year, month] = ym.split('-').map(Number);
  return `${ym}-${pad(new Date(year, month, 0).getDate())}`;
};
const isMonthKey = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));

const monthLabel = (date) => {
  const [year, month] = date.split('-').map(Number);
  return `${new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long' })} ${year}`;
};

// Only these roles may post or edit inside a re-opened period.
const canEditReopenedPeriod = (role) => {
  const { normalizeRole, ROLES } = require('../config/rolePermissions');
  const canonical = normalizeRole(role);
  return canonical === ROLES.ADMIN || canonical === ROLES.SUPER_ADMIN;
};

const closedMessage = (date) =>
  `${monthLabel(date)} is closed (only the last ${openMonths()} months are open). `
  + 'An Admin must request a re-open, and the Super Admin must approve it, before this can be changed.';

const noRightsMessage = (date) =>
  `${monthLabel(date)} has been re-opened for corrections, but only an Admin can post or edit in it.`;

// Remembers the refusal for the current request (see middleware/periodGuard.js), then throws it.
const refuse = (message, details) => {
  const error = new PeriodClosedError(message, details);
  const store = requestContext.currentStore();
  if (store) store.periodError = error;
  throw error;
};

const isMissingTable = (error) => error && (error.code === 'ER_NO_SUCH_TABLE' || error.errno === 1146);

/** Approved, unexpired re-open requests: [{ id, from, to, expires_at }]. */
const activeGrants = async (db) => {
  try {
    const [rows] = await db.query(
      `SELECT id, DATE_FORMAT(period_from, '%Y-%m-%d') AS \`from\`, DATE_FORMAT(period_to, '%Y-%m-%d') AS \`to\`, expires_at
         FROM period_reopen_requests
        WHERE status = 'Approved' AND expires_at > NOW()`
    );
    return rows;
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
};

const roleOfUser = async (db, userId) => {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const [rows] = await db.query('SELECT role FROM users WHERE id = ? LIMIT 1', [id]);
  return rows[0]?.role || null;
};

/**
 * Throws PeriodClosedError when any of the dates is in a closed month that is not
 * currently re-opened, or is re-opened but `userId` is not an Admin / Super Admin.
 * Open dates cost nothing (no query). `db` is a pool or a transaction connection.
 */
const assertOpen = async (db, userId, dates, { system = false } = {}) => {
  const list = Array.isArray(dates) ? dates : [dates];
  const closed = [...new Set(list.map((value) => closedDateOf(value)).filter(Boolean))].sort();
  if (closed.length === 0) return;

  const closedBefore = firstOpenDate();
  const grants = await activeGrants(db);
  const uncovered = closed.find((date) => !grants.some((grant) => grant.from <= date && date <= grant.to));
  if (uncovered) refuse(closedMessage(uncovered), { dates: closed, closedBefore });

  if (system) return;
  if (!canEditReopenedPeriod(await roleOfUser(db, userId))) {
    refuse(noRightsMessage(closed[0]), { dates: closed, closedBefore });
  }
};

// Domain 4 L5 fix: `is_active` is already computed correctly at read time
// (status = 'Approved' AND expires_at > NOW()), so this changes nothing about
// enforcement - it only flips the stored row itself to 'Expired' once its
// grant has actually run out, so an operator looking at raw
// period_reopen_requests rows (not the computed view) is not misled into
// thinking a long-forgotten grant is still active.
const expireOverdueGrants = async (db) => {
  try {
    const [result] = await db.query(
      "UPDATE period_reopen_requests SET status = 'Expired' WHERE status = 'Approved' AND expires_at <= NOW()"
    );
    return result.affectedRows;
  } catch (error) {
    if (isMissingTable(error)) return 0;
    throw error;
  }
};

const EXPIRY_SWEEP_INTERVAL_MS = 15 * 60 * 1000;

/** Starts the periodic sweep (server.js at boot). Returns the interval handle. */
const startExpirySweep = (db) => {
  const run = () => expireOverdueGrants(db).catch((error) => {
    console.error('Period re-open expiry sweep failed:', error.message);
  });
  run();
  return setInterval(run, EXPIRY_SWEEP_INTERVAL_MS);
};

module.exports = {
  DEFAULT_OPEN_MONTHS,
  DEFAULT_GRANT_HOURS,
  MAX_GRANT_HOURS,
  MAX_OPEN_MONTHS,
  PeriodClosedError,
  openMonths,
  today,
  firstOpenDate,
  closedDateOf,
  isClosedDate,
  monthStart,
  monthEnd,
  isMonthKey,
  monthLabel,
  canEditReopenedPeriod,
  activeGrants,
  assertOpen,
  expireOverdueGrants,
  startExpirySweep
};
