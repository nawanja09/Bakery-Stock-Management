// server/controllers/collectionController.js
//
// Collection module API (mounted at /api/collections; `collection` module access).
//
// POS authentication is a backend integration: the server logs in to the POS
// with its POS "finance" account (posAuthService - RAVON_POS_USERNAME /
// RAVON_POS_PASSWORD), shares that token between all Stock Management users and
// renews it by itself. Users only log in to Stock Management; their role decides
// what they may do here (rolePermissions.js: Accountant / Admin / Super Admin
// full, QB view only). Neither the user's department nor any POS branch is used
// as a filter - every POS department is imported.
//
//   GET  /pending?refresh=1   pulls the 3 POS endpoints (ALL departments) into
//                             Pending for the requested from_date..to_date (or
//                             the default recent window) - never posts to a
//                             ledger - then lists Pending with all filters
//   GET  /completed           approved collections, from the BSMS database only
//   GET  /rejected            rejected collections, from the BSMS database only
//   GET  /?status=...         same lists, one endpoint (status=pending&refresh=1 pulls too)
//   GET  /departments         Department filter options (from the Collection data)
//   All lists take search, source, department_id, from_date, to_date, page, limit
//   (combined with AND, filtered in SQL; the date range is inclusive).
//   GET  /:id                 one collection with its posted lines + ledger ids
//   POST /approve             approve selected (ONE DB transaction, idempotent)
//   POST /reject              reject selected (reason required)
//   POST /restore             rejected -> pending
// The POS token / credentials never appear in any response.
const pool = require('../config/db');
const { HttpError } = require('../utils/staffLoanUtils');
const { OtherLedgerError } = require('../services/otherLedgerService');
const { getAuthStatus, getIntegrationScope } = require('../services/posAuthService');
const { canWrite } = require('../config/rolePermissions');
const { syncCollections, MAX_RANGE_DAYS } = require('../services/collectionSyncService');
const { SOURCES, cardPaymentsOf, reconcileCard } = require('../services/collectionMapper');
const { posCardKey, cardPaymentReference, ledgerReference } = require('../services/collectionService');
const { approveCollections, rejectCollections, restoreCollections } = require('../services/collectionService');

const SOURCE_VALUES = Object.values(SOURCES);

const sendError = (res, error, fallback) => {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error instanceof OtherLedgerError) return res.status(error.statusCode).json({ error: error.message });
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
};

const HEADER_SELECT = `
  SELECT c.id, c.source_type, c.source_id, c.reference_no,
         DATE_FORMAT(c.collection_date, '%Y-%m-%d') AS collection_date,
         c.shift_id, c.shift_no, c.shift_reference, c.cashier_name, c.employee_id, c.employee_name,
         c.pos_company, c.company_id, co.name AS company_name,
         c.pos_branch_id, c.pos_branch_name, c.department_id, dep.name AS department_name,
         (SELECT p.company_id FROM collections p
           WHERE p.status = 'completed' AND p.department_id = c.department_id AND c.department_id IS NOT NULL
           ORDER BY p.approved_at DESC LIMIT 1) AS suggested_company_id,
         c.pos_payment_method, c.pos_bank_account,
         c.cash_amount, c.card_amount, c.card_txn_count, c.card_txn_total, c.bank_amount, c.ar_amount, c.short_excess_amount,
         c.deduction_amount, c.total_amount, c.pos_total_amount,
         c.linked_collection_id, lc.source_type AS linked_source_type, lc.source_id AS linked_source_id,
         lc.reference_no AS linked_reference_no,
         c.status,
         DATE_FORMAT(c.approved_at, '%Y-%m-%d %H:%i') AS approved_at, au.name AS approved_by_name,
         DATE_FORMAT(c.rejected_at, '%Y-%m-%d %H:%i') AS rejected_at, ru.name AS rejected_by_name,
         c.rejection_reason,
         DATE_FORMAT(c.last_synced_at, '%Y-%m-%d %H:%i') AS last_synced_at
    FROM collections c
    LEFT JOIN company co ON co.id = c.company_id
    LEFT JOIN departments dep ON dep.id = c.department_id
    LEFT JOIN collections lc ON lc.id = c.linked_collection_id
    LEFT JOIN users au ON au.id = c.approved_by
    LEFT JOIN users ru ON ru.id = c.rejected_by
`;

// Posted amounts per method + where they went (completed records only).
const POSTED_SELECT = `
  SELECT ct.collection_id,
         SUM(CASE WHEN ct.payment_method = 'CASH' THEN ct.amount ELSE 0 END) AS posted_cash,
         SUM(CASE WHEN ct.payment_method = 'CARD' THEN ct.amount ELSE 0 END) AS posted_card,
         SUM(CASE WHEN ct.payment_method = 'BANK' THEN ct.amount ELSE 0 END) AS posted_bank,
         SUM(CASE WHEN ct.payment_method = 'AR' THEN ct.amount ELSE 0 END) AS posted_ar,
         SUM(CASE WHEN ct.payment_method = 'SHORT_EXCESS' THEN ct.amount ELSE 0 END) AS posted_short_excess,
         MAX(CASE WHEN ct.payment_method = 'BANK' THEN CONCAT_WS(' - ', bd.bank_name, bd.account_number) END) AS bank_account_name,
         MAX(CASE WHEN ct.payment_method = 'CARD' THEN CONCAT_WS(' - ', bd.bank_name, bd.account_number) END) AS card_bank_account_name,
         MAX(CASE WHEN ct.payment_method = 'CARD' THEN cdt.status END) AS card_ledger_status,
         GROUP_CONCAT(ct.payment_method ORDER BY ct.id SEPARATOR ',') AS payment_methods
    FROM collection_transactions ct
    LEFT JOIN bank_details bd ON bd.id = ct.bank_account_id
    LEFT JOIN card_transactions cdt ON cdt.id = ct.card_transaction_id
   WHERE ct.collection_id IN (?)
   GROUP BY ct.collection_id
`;

// ---------------------------------------------------------------------------
// Filters (applied together, on the server) - same for all three tabs:
//   search        free text: shift id / no / reference, POS reference / id,
//                 cashier, employee, department, POS branch, company, POS
//                 payment type, source name; an amount (exact); a payment
//                 method word (cash, card, bank/online, ar, short, excess)
//   source        SHIFT | CREDIT_PAYMENT | EMPLOYEE_DEDUCTION
//                 (also shift_collection / credit_payment / employee_deduction)
//   department_id a department id, or "unmapped" (POS branch with no department)
//   branch        POS branch name (narrows "unmapped" to one branch)
//   from_date / to_date (YYYY-MM-DD) on the collection date (shift closing date /
//                 payment date / deduction date) - the business date of the record
//   page, limit   paging (limit max 500)
// camelCase aliases (dateFrom, dateTo, departmentId) are accepted too.
// ---------------------------------------------------------------------------
// Source values are compared normalized (case, spaces and dashes ignored), so
// "SHIFT", "Shift Collection", "shift-collection", "credit_payment",
// "Credit Payment", "credit-payment", "credit_payment_collection",
// "EMPLOYEE_DEDUCTION", "Employee Deductions" ... all resolve to the stored value.
const SOURCE_ALIASES = {
  shift: SOURCES.SHIFT, shift_collection: SOURCES.SHIFT, shifts: SOURCES.SHIFT, completed_shift: SOURCES.SHIFT,
  completed_shifts: SOURCES.SHIFT, completed_shift_collection: SOURCES.SHIFT, completed_shifts_collection: SOURCES.SHIFT,
  credit_payment: SOURCES.CREDIT_PAYMENT, credit_payments: SOURCES.CREDIT_PAYMENT, credit: SOURCES.CREDIT_PAYMENT, cp: SOURCES.CREDIT_PAYMENT,
  credit_payment_collection: SOURCES.CREDIT_PAYMENT, credit_payments_collection: SOURCES.CREDIT_PAYMENT,
  employee_deduction: SOURCES.EMPLOYEE_DEDUCTION, employee_deductions: SOURCES.EMPLOYEE_DEDUCTION,
  deduction: SOURCES.EMPLOYEE_DEDUCTION, deductions: SOURCES.EMPLOYEE_DEDUCTION, ded: SOURCES.EMPLOYEE_DEDUCTION
};
const normalizeSource = (value) => {
  const key = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z_]/g, '');
  if (!key) return null;
  return SOURCE_VALUES.find((v) => v.toLowerCase() === key) || SOURCE_ALIASES[key] || null;
};
const SEARCH_WORDS = [
  [/^cash$/i, 'c.cash_amount <> 0'],
  [/^card$/i, 'c.card_amount <> 0'],
  [/^(bank|online|bank\s*\/\s*online|bank transfer)$/i, 'c.bank_amount <> 0'],
  [/^(ar|credit)$/i, 'c.ar_amount <> 0'],
  [/^short$/i, 'c.short_excess_amount > 0'],
  [/^excess$/i, 'c.short_excess_amount < 0'],
  [/^(short\s*\/?\s*excess|short-excess)$/i, 'c.short_excess_amount <> 0'],
  [/^(shift|shift collection)$/i, "c.source_type = 'SHIFT'"],
  [/^credit payments?$/i, "c.source_type = 'CREDIT_PAYMENT'"],
  [/^(deduction|employee deductions?)$/i, "c.source_type = 'EMPLOYEE_DEDUCTION'"]
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const first = (...values) => values.find((v) => v !== undefined && v !== null && String(v).trim() !== '');

const parseFilters = (query) => {
  const f = {
    search: first(query.search) ? String(query.search).trim().slice(0, 100) : null,
    source: null,
    departmentId: null,
    unmapped: false,
    branch: first(query.branch) ? String(query.branch).trim().slice(0, 255) : null,
    fromDate: first(query.from_date, query.dateFrom) || null,
    toDate: first(query.to_date, query.dateTo) || null,
    page: Math.max(1, Number.parseInt(query.page, 10) || 1),
    limit: Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(query.limit, 10) || DEFAULT_LIMIT))
  };
  const source = first(query.source);
  if (source) {
    f.source = normalizeSource(source);
    if (!f.source) throw new HttpError(400, `Unknown source "${String(source).trim().slice(0, 50)}"`);
  }
  const dept = first(query.department_id, query.departmentId);
  if (dept) {
    if (String(dept).toLowerCase() === 'unmapped') f.unmapped = true;
    else if (/^\d+$/.test(String(dept))) f.departmentId = Number(dept);
    else throw new HttpError(400, 'department_id must be a department id or "unmapped"');
  }
  for (const [name, value] of [['from_date', f.fromDate], ['to_date', f.toDate]]) {
    if (value && !DATE_RE.test(String(value))) throw new HttpError(400, `${name} must be a date (YYYY-MM-DD)`);
  }
  if (f.fromDate && f.toDate && f.fromDate > f.toDate) throw new HttpError(400, 'From date cannot be after To date');
  return f;
};

const buildWhere = (status, f) => {
  const clauses = ['c.status = ?'];
  const params = [status];
  if (f.source) { clauses.push('c.source_type = ?'); params.push(f.source); }
  if (f.departmentId) { clauses.push('c.department_id = ?'); params.push(f.departmentId); }
  if (f.unmapped) clauses.push('c.department_id IS NULL');
  if (f.branch) { clauses.push('c.pos_branch_name = ?'); params.push(f.branch); }
  if (f.fromDate) { clauses.push('c.collection_date >= ?'); params.push(f.fromDate); }
  if (f.toDate) { clauses.push('c.collection_date <= ?'); params.push(f.toDate); }
  if (f.search) {
    const like = `%${f.search.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    // The columns come from tables with different collations: convert the
    // combined text to one (case-insensitive) collation before LIKE.
    const any = [
      `CONVERT(CONCAT_WS(' ', c.reference_no, c.source_id, c.shift_id, c.shift_no, c.shift_reference, c.cashier_name,
                 c.employee_id, c.employee_name, c.pos_branch_name, dep.name, co.name, c.pos_company,
                 c.pos_payment_method,
                 CASE c.source_type WHEN 'SHIFT' THEN 'Shift Collection' WHEN 'CREDIT_PAYMENT' THEN 'Credit Payment'
                                    ELSE 'Employee Deduction' END) USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE ?`
    ];
    params.push(like);
    const amount = Number(f.search.replace(/,/g, ''));
    if (/^-?[\d,]+(\.\d+)?$/.test(f.search) && Number.isFinite(amount)) {
      any.push(`? IN (c.total_amount, c.cash_amount, c.card_amount, c.bank_amount, c.ar_amount,
                     ABS(c.short_excess_amount), c.deduction_amount)`);
      params.push(amount);
    }
    for (const [pattern, condition] of SEARCH_WORDS) if (pattern.test(f.search)) any.push(condition);
    clauses.push(`(${any.join(' OR ')})`);
  }
  return { where: clauses.join(' AND '), params };
};

const FROM_JOINS = `
    FROM collections c
    LEFT JOIN company co ON co.id = c.company_id
    LEFT JOIN departments dep ON dep.id = c.department_id`;

// Individual Card Ledger entries of collections (shift card payments):
// collection id -> { entries, status: Pending | Completed | "Partly realised" }.
const cardPostingSummary = async (ids) => {
  if (!ids.length) return new Map();
  const [rows] = await pool.query(
    `SELECT ccp.collection_id, COUNT(*) AS entries,
            SUM(cdt.status = 'Completed') AS completed
       FROM collection_card_payments ccp
       JOIN card_transactions cdt ON cdt.id = ccp.card_transaction_id
      WHERE ccp.collection_id IN (?)
      GROUP BY ccp.collection_id`,
    [ids]
  );
  return new Map(rows.map((r) => {
    const entries = Number(r.entries) || 0;
    const completed = Number(r.completed) || 0;
    const status = completed === 0 ? 'Pending' : completed === entries ? 'Completed' : 'Partly realised';
    return [r.collection_id, { entries, status }];
  }));
};

const listByStatus = async (status, query) => {
  const f = parseFilters(query);
  const { where, params } = buildWhere(status, f);
  const order = status === 'pending'
    ? 'c.collection_date ASC, c.id ASC'
    : `${status === 'completed' ? 'c.approved_at' : 'c.rejected_at'} DESC, c.id DESC`;

  const [[summary]] = await pool.query(
    `SELECT COUNT(*) AS count,
            COALESCE(SUM(c.cash_amount), 0) AS cash, COALESCE(SUM(c.card_amount), 0) AS card,
            COALESCE(SUM(c.bank_amount), 0) AS bank, COALESCE(SUM(c.ar_amount), 0) AS ar,
            COALESCE(SUM(CASE WHEN c.source_type <> 'EMPLOYEE_DEDUCTION' THEN c.short_excess_amount ELSE 0 END), 0) AS short_excess,
            COALESCE(SUM(c.deduction_amount), 0) AS deduction,
            COALESCE(SUM(c.total_amount), 0) AS total,
            SUM(c.department_id IS NULL AND c.pos_branch_name IS NOT NULL) AS unmapped
       ${FROM_JOINS} WHERE ${where}`,
    params
  );
  const [rows] = await pool.query(
    `${HEADER_SELECT} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...params, f.limit, (f.page - 1) * f.limit]
  );
  let records = rows;
  if (status === 'completed' && rows.length > 0) {
    const [posted] = await pool.query(POSTED_SELECT, [rows.map((r) => r.id)]);
    const byId = new Map(posted.map((p) => [p.collection_id, p]));
    const cards = await cardPostingSummary(rows.map((r) => r.id));
    records = rows.map((row) => {
      const merged = { ...row, ...(byId.get(row.id) || {}) };
      const card = cards.get(row.id);
      if (card) {
        // Shift card posted as individual Card Ledger entries.
        merged.card_ledger_entries = card.entries;
        merged.card_ledger_status = card.status;
      }
      return merged;
    });
  }
  const total = Number(summary.count) || 0;
  return {
    records,
    page: f.page,
    limit: f.limit,
    total,
    pages: Math.max(1, Math.ceil(total / f.limit)),
    summary: { ...summary, count: total, unmapped: Number(summary.unmapped) || 0 }
  };
};

// GET /api/collections/pending?refresh=1&search=&source=&department_id=&from_date=&to_date=&page=&limit=
// refresh=1 (opening the tab / Search) first pulls ALL POS departments into
// Pending for the requested date range (from_date..to_date, inclusive), or the
// recent default window when no range is given - so a range is never answered
// from whatever happened to be loaded before. Then the list is filtered in SQL.
// Staging only mirrors the POS (nothing is posted), so view-only roles may pull
// too. Paging (page > 1) never pulls again.
const getPending = async (req, res) => {
  try {
    await pool.collectionsSchemaReady;
    const filters = parseFilters(req.query); // validates the dates before any POS call
    if (filters.fromDate && filters.toDate
      && (Date.parse(filters.toDate) - Date.parse(filters.fromDate)) / 86400000 > MAX_RANGE_DAYS) {
      throw new HttpError(400, `The date range cannot be longer than ${MAX_RANGE_DAYS} days`);
    }
    let sync = null;
    if (String(req.query.refresh ?? '0') === '1') {
      const startedAt = new Date().toISOString();
      const { window, sources } = await syncCollections({ fromDate: filters.fromDate, toDate: filters.toDate });
      sync = { startedAt, window, sources, ok: sources.every((s) => !s.error) };
    }
    const list = await listByStatus('pending', req.query);
    const pos = getAuthStatus();
    if (sync) pos.scope = await getIntegrationScope(); // which POS branches the integration account sees
    res.json({ ...list, sync, viewOnly: !canWrite(req.user?.role), pos });
  } catch (error) {
    sendError(res, error, 'Failed to load pending collections');
  }
};

const listHandler = (status) => async (req, res) => {
  try {
    await pool.collectionsSchemaReady;
    res.json(await listByStatus(status, req.query));
  } catch (error) {
    sendError(res, error, `Failed to load ${status} collections`);
  }
};

// GET /api/collections?status=pending|completed|rejected&... (same filters, never pulls from the POS)
const STATUSES = ['pending', 'completed', 'rejected'];
const listCollections = async (req, res) => {
  const status = String(req.query.status || 'pending').toLowerCase();
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'status must be pending, completed or rejected' });
  if (status === 'pending') return getPending(req, res);
  return listHandler(status)(req, res);
};

// GET /api/collections/departments - Department filter options, built from the
// Collection data itself (every department / POS branch that has records).
const getDepartmentOptions = async (req, res) => {
  try {
    await pool.collectionsSchemaReady;
    const [mapped] = await pool.query(
      `SELECT c.department_id AS id, dep.name, COUNT(*) AS records,
              GROUP_CONCAT(DISTINCT c.pos_branch_name ORDER BY c.pos_branch_name SEPARATOR ', ') AS pos_branches
         FROM collections c JOIN departments dep ON dep.id = c.department_id
        GROUP BY c.department_id, dep.name ORDER BY dep.name`
    );
    const [unmapped] = await pool.query(
      `SELECT c.pos_branch_name AS branch, COUNT(*) AS records
         FROM collections c
        WHERE c.department_id IS NULL AND c.pos_branch_name IS NOT NULL
        GROUP BY c.pos_branch_name ORDER BY c.pos_branch_name`
    );
    res.json({ departments: mapped, unmapped });
  } catch (error) {
    sendError(res, error, 'Failed to load department filter');
  }
};

// GET /api/collections/:id
const getCollectionById = async (req, res) => {
  try {
    const [rows] = await pool.query(`${HEADER_SELECT} WHERE c.id = ?`, [req.params.id]);
    if (!rows.length) throw new HttpError(404, 'Collection not found');
    const [lines] = await pool.query(
      `SELECT ct.id, ct.payment_method, ct.amount, DATE_FORMAT(ct.transaction_date, '%Y-%m-%d') AS transaction_date,
              ct.reference_no, ct.company_id, ct.bank_account_id,
              CONCAT_WS(' - ', bd.bank_name, bd.account_number) AS bank_account_name,
              ct.finance_transaction_id, ct.card_transaction_id, cdt.status AS card_ledger_status,
              ct.other_ledger_id, ol.name AS other_ledger_name, ct.other_ledger_transaction_id,
              ct.related_collection_id
         FROM collection_transactions ct
         LEFT JOIN bank_details bd ON bd.id = ct.bank_account_id
         LEFT JOIN card_transactions cdt ON cdt.id = ct.card_transaction_id
         LEFT JOIN other_ledgers ol ON ol.id = ct.other_ledger_id
        WHERE ct.collection_id = ? ORDER BY ct.id ASC`,
      [req.params.id]
    );
    const row = rows[0];
    let cardPayments = null;
    if (row.source_type === SOURCES.SHIFT) {
      // The individual POS card payments of the shift (what is / was posted to
      // the Card Ledger), with their Card Ledger entry once approved.
      const [[payload]] = await pool.query('SELECT raw_payload FROM collections WHERE id = ?', [row.id]);
      const details = cardPaymentsOf(payload?.raw_payload);
      const [posted] = await pool.query(
        `SELECT ccp.pos_card_key, ccp.card_transaction_id, cdt.reference_number, cdt.status
           FROM collection_card_payments ccp
           LEFT JOIN card_transactions cdt ON cdt.id = ccp.card_transaction_id
          WHERE ccp.collection_id = ?`,
        [row.id]
      );
      const byKey = new Map(posted.map((p) => [p.pos_card_key, p]));
      const ref = ledgerReference(row);
      const check = reconcileCard(row.card_amount, details);
      // Approved before individual card posting existed: its card went to the
      // Card Ledger as ONE entry (kept as it is - never re-posted).
      const legacyCardLine = posted.length === 0
        ? lines.find((l) => l.payment_method === 'CARD' && l.card_transaction_id) : null;
      cardPayments = {
        legacy_single_entry: legacyCardLine
          ? { card_transaction_id: legacyCardLine.card_transaction_id, status: legacyCardLine.card_ledger_status, amount: legacyCardLine.amount }
          : null,
        available: details.available,
        count: details.count,
        total: details.total,
        card_total: Number(row.card_amount) || 0,
        pos_count: details.posCount,
        difference: check.difference,
        reconciled: check.ok,
        problem: check.reason,
        problems: details.problems,
        payments: details.payments.map((p) => {
          const link = byKey.get(posCardKey(row, p));
          return {
            ...p,
            card_ledger_reference: link?.reference_number || cardPaymentReference(ref, p),
            card_transaction_id: link?.card_transaction_id || null,
            card_ledger_status: link?.status || null
          };
        })
      };
    }
    res.json({ ...row, transactions: lines, card_payments: cardPayments });
  } catch (error) {
    sendError(res, error, 'Failed to load collection');
  }
};

// Runs `work(connection)` in ONE database transaction; any error rolls everything back.
const inTransaction = async (res, fallback, work, toBody) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    res.json(toBody(result));
  } catch (error) {
    try { await connection.rollback(); } catch (rollbackError) { console.error('Collection rollback failed', rollbackError); }
    sendError(res, error, fallback);
  } finally {
    connection.release();
  }
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const approve = (req, res) => inTransaction(
  res, 'Failed to approve collections',
  (connection) => approveCollections(connection, { items: req.body?.items, userId: req.user?.userId || null }),
  ({ approved, skipped }) => ({
    message: `${plural(approved.length, 'collection')} approved`
      + (skipped.length ? ` (${plural(skipped.length, 'record')} already completed - nothing posted again)` : ''),
    approved,
    skipped
  })
);

const reject = (req, res) => inTransaction(
  res, 'Failed to reject collections',
  (connection) => rejectCollections(connection, { ids: req.body?.ids, reason: req.body?.reason, userId: req.user?.userId || null }),
  ({ rejected, skipped }) => ({
    message: `${plural(rejected.length, 'collection')} rejected`
      + (skipped.length ? ` (${plural(skipped.length, 'record')} already rejected)` : ''),
    rejected,
    skipped
  })
);

const restore = (req, res) => inTransaction(
  res, 'Failed to move collections back to Pending',
  (connection) => restoreCollections(connection, { ids: req.body?.ids }),
  (ids) => ({ message: `${plural(ids.length, 'collection')} moved back to Pending`, ids })
);

module.exports = {
  getPending,
  listCollections,
  getDepartmentOptions,
  getCompleted: listHandler('completed'),
  getRejected: listHandler('rejected'),
  getCollectionById,
  approve,
  reject,
  restore
};
