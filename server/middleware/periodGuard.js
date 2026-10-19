// server/middleware/periodGuard.js
//
// Period close (audit finding H7, services/periodLock.js): refuses a data-changing
// request that touches a CLOSED month, before the controller runs.
//
// A request is checked on two things:
//   1. every posting date in its body (date, payment_date, purchase_date, ...):
//      a new or edited record cannot be dated in a closed month;
//   2. the date of the record it edits or voids (RECORD_DATES below): a record
//      that sits in a closed month cannot be changed, moved out of it or voided.
// Reads (GET) are never blocked. The Cash / Bank ledger helpers
// (utils/financeLedger.js) check again for every posting, whatever route made it.
//
// Re-opened months: see periodLock.assertOpen - Admin / Super Admin only.
//
// Adding a module: put its path prefix in GUARDED_PREFIXES and, if its records
// can be edited or voided, its table + date column in RECORD_DATES.

const periodLock = require('../services/periodLock');
const requestContext = require('../services/requestContext');
const { toYmd } = require('../utils/dateOnly');
const { toApiPath } = require('../config/rolePermissions');

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

// Money and stock modules. Not listed: master data (items, suppliers, payees ...),
// orders (no money or stock moves), reports, Cutlery, Employees.
const GUARDED_PREFIXES = [
  '/purchases', '/purchase-returns', '/returns', '/issuances', '/wastages', '/opening-balance', '/adjustments',
  '/suppliers/pay-now', '/suppliers/settle-credit',
  '/expenses', '/new-expenses', '/cash-expenses', '/hidden-expenses',
  '/finance', '/staff-loans', '/incomes', '/inhand', '/collections/approve'
];

// Body fields that are the date a record is booked on. (invoice_date is the
// supplier's own invoice date and cheque_date a future cheque - neither books anything.)
const BODY_DATE_FIELDS = [
  'date', 'payment_date', 'purchase_date', 'issuance_date', 'return_date', 'expense_date', 'bill_date',
  'voucher_date', 'settlement_date', 'reimbursement_date', 'realise_date', 'release_date', 'income_date',
  'credit_note_date', 'applied_date', 'issued_date', 'received_date', 'transaction_date'
];

// The record a PUT / PATCH / DELETE route edits, and the column that dates it.
// `id` is the capture group of `path` that holds the record id.
const RECORD_DATES = [
  { path: /^\/purchases\/(\d+)$/, table: 'purchases', column: 'purchase_date' },
  { path: /^\/purchases\/payments\/(\d+)-\d+\/adjust$/, table: 'payment_history', column: 'payment_date' },
  { path: /^\/issuances\/(\d+)$/, table: 'issuances', column: 'issuance_date' },
  { path: /^\/wastages\/(\d+)$/, table: 'wastages', column: 'date' },
  { path: /^\/opening-balance\/(\d+)$/, table: 'opening_balances', column: 'date' },
  { path: /^\/adjustments\/(\d+)$/, table: 'stock_adjustments', column: 'date' },
  { path: /^\/adjustments\/(\d+)\/approve$/, table: 'stock_adjustments', column: 'date' },
  { path: /^\/adjustments\/records\/[^/]+\/finance\/(\d+)$/, table: 'finance_transactions', column: 'transaction_date' },
  { path: /^\/adjustments\/records\/[^/]+\/card\/(\d+)$/, table: 'card_transactions', column: 'transaction_date' },
  { path: /^\/new-expenses\/(\d+)$/, table: 'expenses', column: 'bill_date' },
  { path: /^\/expenses\/petty-cash\/voucher\/(\d+)$/, table: 'petty_cash_vouchers', column: 'voucher_date' },
  { path: /^\/expenses\/petty-cash\/reimbursement\/(\d+)$/, table: 'petty_cash_reimbursements', column: 'reimbursement_date' },
  { path: /^\/expenses\/cheque\/voucher\/(\d+)$/, table: 'cheque_expenses', column: 'bill_date' },
  { path: /^\/expenses\/bank-charges\/(\d+)$/, table: 'bank_charges', column: 'charge_date' },
  { path: /^\/expenses\/online\/(\d+)$/, table: 'online_expenses', column: 'bill_date' },
  { path: /^\/cash-expenses\/(\d+)$/, table: 'cash_expenses', column: 'expense_date' },
  { path: /^\/hidden-expenses\/(\d+)$/, table: 'hidden_expenses', column: 'expense_date' },
  { path: /^\/finance\/cash\/(?:issued|receive)\/(\d+)$/, table: 'finance_transactions', column: 'transaction_date' },
  { path: /^\/(?:finance|new-expenses)\/cheque-registry\/(\d+)$/, table: 'expenses_cheque_registry', column: 'release_date' },
  { path: /^\/incomes\/(\d+)$/, table: 'incomes', column: 'income_date' },
  { path: /^\/inhand\/(\d+)\/(?:approve|cancel)$/, table: 'inhand_adjustments', column: 'transaction_date' }
];

const isGuarded = (path) => GUARDED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

/** Body dates that book something: [ 'YYYY-MM-DD', ... ]. */
const bodyDates = (body) => {
  if (!body || typeof body !== 'object') return [];
  return BODY_DATE_FIELDS.map((field) => toYmd(body[field])).filter(Boolean);
};

/** The rule(s) naming the record this request edits: [{ table, column, id }]. */
const recordRulesOf = (method, path) => {
  if (method === 'POST') return []; // a new record has no existing date: its body is checked instead
  const found = [];
  for (const rule of RECORD_DATES) {
    const match = rule.path.exec(path);
    if (match) found.push({ table: rule.table, column: rule.column, id: Number(match[1]) });
  }
  return found;
};

const createPeriodGuard = ({ getDb = () => require('../config/db') } = {}) => async (req, res, next) => {
  if (!WRITE_METHODS.includes(req.method)) return next();
  const path = toApiPath(req.originalUrl);
  if (!isGuarded(path)) return next();

  try {
    const db = getDb();
    const dates = bodyDates(req.body);

    for (const rule of recordRulesOf(req.method, path)) {
      if (!Number.isInteger(rule.id)) continue;
      // table / column come from the static list above, never from the request.
      const [rows] = await db.query(
        `SELECT DATE_FORMAT(\`${rule.column}\`, '%Y-%m-%d') AS d FROM \`${rule.table}\` WHERE id = ? LIMIT 1`,
        [rule.id]
      );
      if (rows[0]?.d) dates.push(rows[0].d);
    }

    if (req.method === 'POST' && path === '/collections/approve') {
      const ids = (Array.isArray(req.body?.items) ? req.body.items : [])
        .map((item) => Number(item?.id)).filter((id) => Number.isInteger(id) && id > 0);
      if (ids.length) {
        const [rows] = await db.query(
          "SELECT DATE_FORMAT(collection_date, '%Y-%m-%d') AS d FROM collections WHERE id IN (?)", [ids]);
        dates.push(...rows.map((row) => row.d).filter(Boolean));
      }
    }

    if (dates.length) await periodLock.assertOpen(db, req.user?.userId, dates);
    return next();
  } catch (error) {
    if (error instanceof periodLock.PeriodClosedError) {
      return res.status(409).json({ error: error.message, code: error.code, closed_before: error.closedBefore });
    }
    console.error('periodGuard failed:', error.message);
    // Fail closed: a data change that cannot be checked against the books is refused.
    return res.status(503).json({ error: 'The period-close check is temporarily unavailable. Try again shortly.' });
  }
};

/**
 * Runs the rest of the request with a store, and turns a generic 5xx into the real
 * 409 when the Cash / Bank ledger refused a posting in a closed month but a controller's
 * catch-all answered "Server error". Mount it before periodGuard.
 */
const periodErrorTranslator = (req, res, next) => requestContext.runWithStore(() => {
  const store = requestContext.currentStore();
  const send = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 500 && store?.periodError) {
      const error = store.periodError;
      res.status(409);
      return send({ error: error.message, code: error.code, closed_before: error.closedBefore });
    }
    // Cash in hand would go negative (utils/financeLedger.js): 400 with the real reason.
    if (res.statusCode >= 500 && store?.insufficientError) {
      const error = store.insufficientError;
      res.status(400);
      return send({ error: error.message, code: error.code });
    }
    return send(body);
  };
  next();
});

module.exports = createPeriodGuard();
module.exports.periodErrorTranslator = periodErrorTranslator;
module.exports.createPeriodGuard = createPeriodGuard;
module.exports.GUARDED_PREFIXES = GUARDED_PREFIXES;
module.exports.BODY_DATE_FIELDS = BODY_DATE_FIELDS;
module.exports.RECORD_DATES = RECORD_DATES;
module.exports.bodyDates = bodyDates;
module.exports.recordRulesOf = recordRulesOf;
module.exports.isGuarded = isGuarded;
