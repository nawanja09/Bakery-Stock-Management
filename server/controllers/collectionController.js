// server/controllers/collectionController.js
//
// Collection module API (mounted at /api/collections; `collection` module access).
//
// Two source systems, one flow: RAVON POS and RAVON Restaurant records are
// staged into the same `collections` table (source_system 'POS' | 'RESTAURANT')
// and go through the identical approve / reject / restore and ledger posting.
//
// Authentication (integrationAuthService): there are no POS / Restaurant
// credentials on the server. Every call uses the REQUESTING user's own session
// of that system (obtained when they logged in to BSMS, or through "Connect"
// below). With no valid session nothing new can be read - there is no
// background sync.
// Authorization - BOTH must allow it:
//   * the user's BSMS role (rolePermissions.js: Accountant / Admin / Super
//     Admin, QB view only; APPROVE is Accountant only, Finance has no access), and
//   * the user's OWN privileges in POS / Restaurant (integrationAccess.js):
//     every list, filter option, record, sync and approve / reject / restore is
//     limited to the systems and sources (shifts, credit payments, employee
//     deductions) - and POS branches - that account may see there. No access
//     at all -> 403 INTEGRATION_ACCESS_DENIED.
// The BSMS user's own department is not used as a filter.
//
//   GET  /pending?refresh=1   pulls the 3 endpoints of BOTH systems (ALL
//                             departments, each system independently) into
//                             Pending for the requested from_date..to_date (or
//                             the default recent window) - never posts to a
//                             ledger - then lists Pending with all filters
//   GET  /completed           approved collections, from the BSMS database only
//   GET  /rejected            rejected collections, from the BSMS database only
//   GET  /?status=...         same lists, one endpoint (status=pending&refresh=1 pulls too)
//   GET  /departments         Department filter options (from the Collection data)
//   All lists take search, source, source_system (POS | RESTAURANT), department_id,
//   from_date, to_date, page, limit (combined with AND, filtered in SQL; the
//   date range is inclusive).
//   GET  /integrations/status per system { configured, connected, state, username,
//                             expiresAt, scope { branchIds, allBranches, warning } }
//   POST /integrations/:provider/connect { username, password } - one-time
//                             "Connect <POS | Restaurant>" (Accountant /
//                             Admin / Super Admin, rate limited): logs in,
//                             keeps ONLY the encrypted token, returns
//                             { connected: true, username } - never the token or password
//   GET  /:id                 one collection with its posted lines + ledger ids
//   POST /approve             approve selected (ONE DB transaction, idempotent)
//   POST /reject              reject selected (reason required)
//   POST /restore             rejected -> pending
// No token, password or Authorization header ever appears in a response.
const pool = require('../config/db');
const { HttpError } = require('../utils/staffLoanUtils');
const { OtherLedgerError } = require('../services/otherLedgerService');
const integrationAuth = require('../services/integrationAuthService');
const { canWrite, canApproveCollections, hasModule, MODULES } = require('../config/rolePermissions');
const { syncCollections, MAX_RANGE_DAYS } = require('../services/collectionSyncService');
const { SYSTEMS, SOURCES, cardPaymentsOf, reconcileCard } = require('../services/collectionMapper');
const { posCardKey, cardPaymentReference, ledgerReference } = require('../services/collectionService');
const { approveCollections, rejectCollections, restoreCollections } = require('../services/collectionService');
const integrationAccess = require('../services/integrationAccess');

const SOURCE_VALUES = Object.values(SOURCES);

const sendError = (res, error, fallback) => {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error instanceof OtherLedgerError) return res.status(error.statusCode).json({ error: error.message });
  if (error instanceof integrationAccess.IntegrationAccessError) {
    return res.status(403).json({
      error: error.message,
      code: error.code,
      ...(error.access ? { access: integrationAccess.getAccessSummary(error.access) } : {})
    });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
};

const HEADER_SELECT = `
  SELECT c.id, c.source_system, c.source_type, c.source_id, c.reference_no,
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
         c.linked_collection_id, lc.source_system AS linked_source_system,
         lc.source_type AS linked_source_type, lc.source_id AS linked_source_id,
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
         -- AR_SETTLEMENT (Credit Payment AR Account credit) is a ledger effect, not a payment method
         GROUP_CONCAT(CASE WHEN ct.payment_method <> 'AR_SETTLEMENT' THEN ct.payment_method END ORDER BY ct.id SEPARATOR ',') AS payment_methods
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
//   source_system POS | RESTAURANT (also pos / restaurant; "" / all = both)
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
  [/^(deduction|employee deductions?)$/i, "c.source_type = 'EMPLOYEE_DEDUCTION'"],
  [/^restaurant$/i, "c.source_system = 'RESTAURANT'"]
];
const SYSTEM_ALIASES = {
  pos: SYSTEMS.POS, ravon_pos: SYSTEMS.POS,
  restaurant: SYSTEMS.RESTAURANT, rst: SYSTEMS.RESTAURANT, ravon_restaurant: SYSTEMS.RESTAURANT
};
const normalizeSystem = (value) => {
  const key = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!key || key === 'all') return null;
  return SYSTEM_ALIASES[key] || undefined;
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const first = (...values) => values.find((v) => v !== undefined && v !== null && String(v).trim() !== '');

const parseFilters = (query) => {
  const f = {
    search: first(query.search) ? String(query.search).trim().slice(0, 100) : null,
    source: null,
    system: null,
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
  const system = first(query.source_system, query.system, query.sourceSystem);
  if (system) {
    f.system = normalizeSystem(system);
    if (f.system === undefined) throw new HttpError(400, 'source_system must be POS or RESTAURANT');
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

// The requesting user's POS / Restaurant privileges (integrationAccess.js);
// throws 403 when they may see no collections at all.
const collectionAccessOf = async (req) => {
  const access = await integrationAccess.getAccess(req.user?.userId || null);
  integrationAccess.assertCollectionAccess(access);
  return access;
};

const buildWhere = (status, f, access) => {
  // Only the systems / sources (and POS branches) this user may see.
  const allowed = integrationAccess.collectionWhere(access, 'c');
  const clauses = ['c.status = ?', allowed.sql];
  const params = [status, ...allowed.params];
  if (f.source) { clauses.push('c.source_type = ?'); params.push(f.source); }
  if (f.departmentId) { clauses.push('c.department_id = ?'); params.push(f.departmentId); }
  if (f.unmapped) clauses.push('c.department_id IS NULL');
  if (f.branch) { clauses.push('c.pos_branch_name = ?'); params.push(f.branch); }
  if (f.fromDate) { clauses.push('c.collection_date >= ?'); params.push(f.fromDate); }
  if (f.toDate) { clauses.push('c.collection_date <= ?'); params.push(f.toDate); }
  if (f.system) { clauses.push('c.source_system = ?'); params.push(f.system); }
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

const listByStatus = async (status, query, access) => {
  const f = parseFilters(query);
  const { where, params } = buildWhere(status, f, access);
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

// Per-system sync result for the page: only safe fields (no tokens can reach here;
// messages are scrubbed by the sync service).
const systemResult = (s) => ({
  system: s.system, label: s.label, configured: s.configured !== false, skipped: Boolean(s.skipped),
  fetched: s.fetched, created: s.created, updated: s.updated, duplicates: s.duplicates,
  unmapped: s.unmapped, invalid: s.invalid, excluded: s.excluded,
  ...(s.message ? { message: s.message } : {}),
  ...(s.error ? { error: s.error, code: s.code || null, partial: Boolean(s.partial) } : {}),
  sources: s.sources
});

// GET /api/collections/pending?refresh=1&search=&source=&source_system=&department_id=&from_date=&to_date=&page=&limit=
// refresh=1 (opening the tab / Search) first pulls ALL departments of BOTH
// systems into Pending for the requested date range (from_date..to_date,
// inclusive), or the recent default window when no range is given - so a range
// is never answered from whatever happened to be loaded before. Then the list is
// filtered in SQL. Staging only mirrors the source systems (nothing is posted),
// so view-only roles may pull too. Paging (page > 1) never pulls again.
// Response (unchanged fields + additions):
//   sync.sources   POS sources, as before
//   sync.systems   [{ system, fetched, created, updated, duplicates, unmapped, invalid, error?, code? }]
//   pos            POS status, as before (+ connected / state / username / scope)
//   integrations   { pos, restaurant } status of each system
const getPending = async (req, res) => {
  try {
    await pool.collectionsSchemaReady;
    const filters = parseFilters(req.query); // validates the dates before any external call
    if (filters.fromDate && filters.toDate
      && (Date.parse(filters.toDate) - Date.parse(filters.fromDate)) / 86400000 > MAX_RANGE_DAYS) {
      throw new HttpError(400, `The date range cannot be longer than ${MAX_RANGE_DAYS} days`);
    }
    const userId = req.user?.userId || null;
    const access = await collectionAccessOf(req);
    let sync = null;
    if (String(req.query.refresh ?? '0') === '1') {
      const startedAt = new Date().toISOString();
      const { window, sources, systems } = await syncCollections({
        fromDate: filters.fromDate, toDate: filters.toDate, userId, allowed: integrationAccess.allowedSources(access),
        // for the Audit Trail row of this sync run
        request: {
          ip: req.ip, userAgent: req.headers?.['user-agent'], forwardedFor: req.headers?.['x-forwarded-for'], sessionId: req.user?.sid
        }
      });
      sync = {
        startedAt,
        window,
        sources,
        systems: systems.map(systemResult),
        ok: systems.every((s) => s.skipped || !s.error)
      };
    }
    const list = await listByStatus('pending', req.query, access);
    const integrations = await integrationAuth.getIntegrationStatus({ userId, withScope: Boolean(sync) });
    // Backward compatible `pos` (configured / authenticated / code / message) plus
    // authError when the POS part of this sync failed to authenticate - the
    // records already staged are still listed.
    const pos = { ...integrations.pos };
    const posSystem = (sync?.systems || []).find((s) => s.system === SYSTEMS.POS);
    if (posSystem?.code) Object.assign(pos, { authError: true, code: posSystem.code, message: posSystem.error });
    for (const s of sync?.systems || []) {
      const status = integrations[s.system.toLowerCase()];
      if (status && s.code) Object.assign(status, { authError: true, syncCode: s.code, syncError: s.error });
    }
    res.json({
      ...list, sync, viewOnly: !canWrite(req.user?.role), canApprove: canApproveCollections(req.user?.role),
      pos, integrations, backgroundSync: false,
      access: integrationAccess.getAccessSummary(access)
    });
  } catch (error) {
    sendError(res, error, 'Failed to load pending collections');
  }
};

// ---------------------------------------------------------------------------
// POS / Restaurant integration status and the one-time "Connect" action.
// ---------------------------------------------------------------------------
const BACKGROUND_SYNC_NOTE = 'Collections are read with your own POS / Restaurant account and show only what '
  + 'that account may see there. No password is stored: log in again when the session expires.';
const SERVICE_KEY_NOTE = 'Collections are read by the Stock Management server with its integration key - '
  + 'no POS / Restaurant login is needed.';
const integrationNote = () => (integrationAuth.PROVIDER_IDS.every((id) => !integrationAuth.isConfigured(id) || integrationAuth.usesServiceKey(id))
  ? SERVICE_KEY_NOTE : BACKGROUND_SYNC_NOTE);

// Who may see the status / connect: roles with a page that reads POS / Restaurant.
const canSeeIntegrations = (role) => integrationAuth.isIntegrationRole(role) || hasModule(role, MODULES.COLLECTION);

// GET /api/collections/integrations/status - this user's own connections and privileges
const getIntegrationsStatus = async (req, res) => {
  try {
    if (!canSeeIntegrations(req.user?.role)) throw new HttpError(403, 'You do not have permission to access this module');
    const userId = req.user?.userId || null;
    const integrations = await integrationAuth.getIntegrationStatus({ userId, withScope: true });
    const access = await integrationAccess.getAccess(userId);
    res.json({ integrations, access: integrationAccess.getAccessSummary(access), backgroundSync: false, message: integrationNote() });
  } catch (error) {
    sendError(res, error, 'Failed to load the POS / Restaurant connection status');
  }
};

// Connect attempts per BSMS user (in memory). The external login endpoints also
// allow only 5 logins per minute; integrationAuthService enforces that per system.
const CONNECT_MAX_ATTEMPTS = 5;
const CONNECT_WINDOW_MS = 10 * 60 * 1000;
const connectAttempts = new Map(); // userId -> [ms]
const connectRateLimited = (userId) => {
  const now = Date.now();
  const recent = (connectAttempts.get(userId) || []).filter((t) => now - t < CONNECT_WINDOW_MS);
  connectAttempts.set(userId, recent);
  if (recent.length >= CONNECT_MAX_ATTEMPTS) return true;
  recent.push(now);
  return false;
};

const CREDENTIAL_MAX = 150;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const credential = (value, name) => {
  if (typeof value !== 'string' || value.trim() === '') throw new HttpError(400, `${name} is required`);
  if (value.length > CREDENTIAL_MAX) throw new HttpError(400, `${name} is too long`);
  if (CONTROL_CHARS.test(value)) throw new HttpError(400, `${name} contains invalid characters`);
  return value;
};

// POST /api/collections/integrations/:provider/connect { username, password }
// The password is sent once to that system's /api/login and then dropped; it is
// never stored, logged or returned. Refused credentials answer 400 (not 401:
// a 401 would sign the user out of BSMS).
const connectIntegration = async (req, res) => {
  const role = req.user?.role;
  if (!integrationAuth.isIntegrationRole(role) || !canWrite(role)) {
    return res.status(403).json({ error: 'Your role cannot connect POS / Restaurant' });
  }
  let provider;
  try {
    provider = integrationAuth.providerOf(req.params.provider);
  } catch (error) {
    return res.status(404).json({ error: 'Unknown system - use pos or restaurant' });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const extra = Object.keys(body).filter((k) => !['username', 'password'].includes(k));
  if (extra.length) return res.status(400).json({ error: 'Only username and password may be sent' });
  let username;
  let password;
  try {
    username = credential(body.username, 'Username').trim();
    password = credential(body.password, 'Password');
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }
  const userId = req.user?.userId || null;
  if (connectRateLimited(userId)) {
    return res.status(429).json({ error: 'Too many connection attempts. Try again in a few minutes.', code: integrationAuth.codeOf(provider.id, 'RATE_LIMITED') });
  }
  try {
    const result = await integrationAuth.connect(provider.id, { userId, username, password, role });
    return res.json({
      connected: true, username: result.username, provider: result.provider, system: result.system,
      expiresAt: result.expiresAt, abilities: result.abilities
    });
  } catch (error) {
    const message = integrationAuth.scrub(error.message, [password]);
    if (error instanceof integrationAuth.PosConfigError) return res.status(503).json({ error: message, code: error.code });
    if (error instanceof integrationAuth.PosAuthError) {
      return res.status(400).json({ error: `${message}. Check your ${provider.label} username and password.`, code: error.code });
    }
    if (error instanceof integrationAuth.PosUnavailableError) {
      return res.status(/RATE_LIMITED$/.test(error.code || '') ? 429 : 503).json({ error: message, code: error.code || null });
    }
    console.error(`Connect ${provider.label} failed:`, integrationAuth.scrub(error.message, [password]));
    return res.status(500).json({ error: `Could not connect to ${provider.label}` });
  } finally {
    password = null;
    if (req.body && typeof req.body === 'object') delete req.body.password;
  }
};

const listHandler = (status) => async (req, res) => {
  try {
    await pool.collectionsSchemaReady;
    const access = await collectionAccessOf(req);
    res.json(await listByStatus(status, req.query, access));
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
// Collection data the user may see (every department / POS branch that has such records).
const getDepartmentOptions = async (req, res) => {
  try {
    await pool.collectionsSchemaReady;
    const allowed = integrationAccess.collectionWhere(await collectionAccessOf(req), 'c');
    const [mapped] = await pool.query(
      `SELECT c.department_id AS id, dep.name, COUNT(*) AS records,
              GROUP_CONCAT(DISTINCT c.pos_branch_name ORDER BY c.pos_branch_name SEPARATOR ', ') AS pos_branches
         FROM collections c JOIN departments dep ON dep.id = c.department_id
        WHERE ${allowed.sql}
        GROUP BY c.department_id, dep.name ORDER BY dep.name`,
      allowed.params
    );
    const [unmapped] = await pool.query(
      `SELECT c.pos_branch_name AS branch, COUNT(*) AS records
         FROM collections c
        WHERE c.department_id IS NULL AND c.pos_branch_name IS NOT NULL AND ${allowed.sql}
        GROUP BY c.pos_branch_name ORDER BY c.pos_branch_name`,
      allowed.params
    );
    res.json({ departments: mapped, unmapped });
  } catch (error) {
    sendError(res, error, 'Failed to load department filter');
  }
};

// GET /api/collections/:id
const getCollectionById = async (req, res) => {
  try {
    // A record the user may not see is reported as not found (no existence leak).
    const allowed = integrationAccess.collectionWhere(await collectionAccessOf(req), 'c');
    const [rows] = await pool.query(`${HEADER_SELECT} WHERE c.id = ? AND ${allowed.sql}`, [req.params.id, ...allowed.params]);
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

// Refuses (403) when any selected record is one the user may not see - checked
// inside the transaction, before anything is posted. Unknown ids are left to
// the service (it reports them).
const assertRecordsAllowed = async (connection, access, rawIds) => {
  const ids = (Array.isArray(rawIds) ? rawIds : []).map(Number).filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return;
  const allowed = integrationAccess.collectionWhere(access, 'c');
  const [hidden] = await connection.query(
    // COALESCE: a NULL (e.g. a row without branch) counts as not allowed.
    `SELECT c.id FROM collections c WHERE c.id IN (?) AND NOT COALESCE(${allowed.sql}, FALSE)`, [ids, ...allowed.params]
  );
  if (hidden.length) {
    throw new HttpError(403, `You do not have permission for ${plural(hidden.length, 'selected record')} `
      + '(your POS / Restaurant account cannot see them)');
  }
};

// Resolves the user's access (network) BEFORE the transaction opens, then runs it.
const withAccess = (fallback, run) => async (req, res) => {
  let access;
  try {
    access = await collectionAccessOf(req);
  } catch (error) {
    return sendError(res, error, fallback);
  }
  return run(req, res, access);
};

// Approving posts to the ledgers: Accountant only (also enforced by the
// /collections/approve rule in config/rolePermissions.js - checked here again
// so this handler can never be mounted without it).
const requireApprover = (handler) => (req, res) => (canApproveCollections(req.user?.role)
  ? handler(req, res)
  : res.status(403).json({ error: 'Only an Accountant can approve collections' }));

const approve = requireApprover(withAccess('Failed to approve collections', (req, res, access) => inTransaction(
  res, 'Failed to approve collections',
  async (connection) => {
    await assertRecordsAllowed(connection, access, (Array.isArray(req.body?.items) ? req.body.items : []).map((item) => item?.id));
    return approveCollections(connection, { items: req.body?.items, userId: req.user?.userId || null });
  },
  ({ approved, skipped }) => ({
    // Each skipped record says why (already approved, or a duplicate POS reference
    // approved by someone else) - nothing was posted for it.
    message: `${plural(approved.length, 'collection')} approved.`
      + (skipped.length ? ` Not approved: ${skipped.map((s) => `${s.reference} - ${s.reason}`).join('; ')}.` : ''),
    approved,
    skipped
  })
)));

const reject = withAccess('Failed to reject collections', (req, res, access) => inTransaction(
  res, 'Failed to reject collections',
  async (connection) => {
    await assertRecordsAllowed(connection, access, req.body?.ids);
    return rejectCollections(connection, { ids: req.body?.ids, reason: req.body?.reason, userId: req.user?.userId || null });
  },
  ({ rejected, skipped }) => ({
    message: `${plural(rejected.length, 'collection')} rejected`
      + (skipped.length ? ` (${plural(skipped.length, 'record')} already rejected)` : ''),
    rejected,
    skipped
  })
));

const restore = withAccess('Failed to move collections back to Pending', (req, res, access) => inTransaction(
  res, 'Failed to move collections back to Pending',
  async (connection) => {
    await assertRecordsAllowed(connection, access, req.body?.ids);
    return restoreCollections(connection, { ids: req.body?.ids });
  },
  (ids) => ({ message: `${plural(ids.length, 'collection')} moved back to Pending`, ids })
));

module.exports = {
  getPending,
  getIntegrationsStatus,
  connectIntegration,
  listCollections,
  getDepartmentOptions,
  getCompleted: listHandler('completed'),
  getRejected: listHandler('rejected'),
  getCollectionById,
  approve,
  reject,
  restore
};
