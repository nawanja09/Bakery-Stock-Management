// server/services/auditLog.js
//
// Audit Trail (audit finding H6): an append-only record of what every user did,
// from the moment they sign in.
//   * sign-in: success, wrong password / unknown user, inactive account, too many attempts
//   * sign-out and password change
//   * every data-changing API request (POST / PUT / PATCH / DELETE) - create, edit,
//     delete, approve, pay, settle ... - whether it succeeded or failed
//   * every request refused for lack of permission (403)
// Viewing data (GET) is NOT recorded (business decision, 2026-10-16).
//
// Rows are written after the response has been sent, so recording never slows
// down or breaks a request (a failed write is reported on the console only).
// The table refuses UPDATE and DELETE (triggers below), so a row cannot be
// changed or removed through the application.
//
// Read by controllers/auditLogController.js (Admin / Super Admin only).

const jwt = require('jsonwebtoken');
const { getJwtSecret, JWT_VERIFY_OPTIONS } = require('../config/secrets');
const { snapshotTargetOf, takeSnapshot } = require('./auditSnapshots');
const { describeRecord } = require('./auditPresenter');

// Required lazily so unit tests can use the helpers without a database.
const db = () => require('../config/db');

// AUDIT_DB (.env, optional): the separate schema that holds audit_log, set up by
// scripts/createAppDbUser.js. There the application's database user may only
// SELECT and INSERT - it cannot change, delete or drop audit rows, nor drop the
// append-only triggers. Unset = audit_log in the application's own database.
const auditSchema = () => {
  const name = String(process.env.AUDIT_DB || '').trim();
  if (!name) return null;
  if (!/^[A-Za-z0-9_]{1,64}$/.test(name)) throw new Error('AUDIT_DB may only contain letters, digits and _');
  return name;
};
const auditTable = () => (auditSchema() ? `\`${auditSchema()}\`.audit_log` : 'audit_log');

const MAX_JSON_CHARS = 16 * 1024;
const MAX_STRING_CHARS = 2000;

// Request / response fields that are never stored.
const SECRET_KEY = /pass(word)?|pwd|secret|token|authorization|api[-_]?key|private[-_]?key|otp|cvv|card[-_]?number/i;

const redact = (value, depth = 0) => {
  if (depth > 6) return '[...]';
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => redact(item, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SECRET_KEY.test(key) ? '[REDACTED]' : redact(item, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > MAX_STRING_CHARS) return `${value.slice(0, MAX_STRING_CHARS)}...`;
  return value;
};

// JSON text for a LONGTEXT column, secrets removed, at most MAX_JSON_CHARS.
const toStoredJson = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return null;
  const text = JSON.stringify(redact(value));
  if (text.length <= MAX_JSON_CHARS) return text;
  // The preview is re-escaped inside the wrapper (quotes double up), so shrink until it fits.
  let keep = MAX_JSON_CHARS - 200;
  let wrapped = JSON.stringify({ truncated: true, preview: text.slice(0, keep) });
  while (wrapped.length > MAX_JSON_CHARS && keep > 0) {
    keep = Math.floor(keep * 0.8);
    wrapped = JSON.stringify({ truncated: true, preview: text.slice(0, keep) });
  }
  return wrapped;
};

const cut = (value, max) => (value === undefined || value === null ? null : String(value).slice(0, max));

// ---------------------------------------------------------------------------
// What happened, read from the request path.
// ---------------------------------------------------------------------------

// '/api/purchases/12/pay?x=1' -> ['purchases', '12', 'pay']
const segmentsOf = (url = '') => String(url).split('?')[0].replace(/^\/api\/?/i, '').split('/').filter(Boolean);
const isIdSegment = (segment) => /^\d+(-\d+)?$/.test(segment) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment);

const VERB_ACTIONS = {
  approve: 'APPROVE',
  reject: 'REJECT',
  restore: 'RESTORE',
  cancel: 'CANCEL',
  submit: 'SUBMIT',
  pay: 'PAY',
  'pay-multiple': 'PAY',
  'pay-now': 'PAY',
  repayments: 'PAY',
  settle: 'SETTLE',
  'settle-credit': 'SETTLE',
  adjust: 'ADJUST',
  release: 'RELEASE',
  realise: 'RELEASE',
  status: 'STATUS_CHANGE',
  connect: 'CONNECT',
  'sync-stock': 'SYNC',
  'update-statuses': 'SYNC'
};

const METHOD_ACTIONS = { POST: 'CREATE', PUT: 'UPDATE', PATCH: 'UPDATE', DELETE: 'DELETE' };

// Paths with a fixed meaning (sign-in events are AUTH, not CHANGE).
const SPECIAL_PATHS = {
  login: { eventType: 'AUTH', action: 'LOGIN', module: 'Sign-in' },
  logout: { eventType: 'AUTH', action: 'LOGOUT', module: 'Sign-in' },
  'change-password': { eventType: 'AUTH', action: 'PASSWORD_CHANGE', module: 'Sign-in' }
};

const MODULE_LABELS = {
  purchases: 'Purchasing',
  orders: 'Purchase Orders',
  suppliers: 'Suppliers',
  'purchase-returns': 'Purchase Returns',
  items: 'RM Items',
  'item-types': 'RM Item Types',
  departments: 'Departments',
  'opening-balance': 'Opening Balance',
  issuances: 'Issue to Department',
  wastages: 'Wastage',
  returns: 'Department Returns',
  reports: 'Reports',
  expenses: 'Expenses',
  'new-expenses': 'Expenses',
  'cash-expenses': 'Expenses',
  'hidden-expenses': 'Expenses',
  payees: 'Expense Payees',
  'expense-types': 'Expense Types',
  'sub-expense-types': 'Expense Types',
  'bank-charges-types': 'Bank Charge Types',
  finance: 'Finance',
  'staff-loans': 'Staff Loans',
  'other-ledgers': 'Other Ledgers',
  'receive-types': 'Receive Types',
  'credit-card-rates': 'Credit Card Rates',
  collections: 'Collection',
  integrations: 'POS / Restaurant',
  incomes: 'Income',
  adjustments: 'Adjustments',
  inhand: 'Adjustments',
  companies: 'Companies',
  'payment-methods': 'Payment Methods',
  employees: 'Employees',
  'fg-production': 'FG Production',
  analyst: 'Analyst',
  dashboard: 'Dashboard',
  'audit-logs': 'Audit Trail'
};

const moduleOf = (segments) => {
  const first = segments[0] || '';
  if (first.startsWith('cutlery')) return 'Cutlery';
  if (MODULE_LABELS[first]) return MODULE_LABELS[first];
  return first ? first.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : null;
};

/**
 * { eventType, action, module, entityId } for a request.
 * eventType: AUTH (sign-in events) | CHANGE (data-changing request) | DENIED (refused, 403).
 */
const describeRequest = (method, url, statusCode) => {
  const segments = segmentsOf(url);
  const special = SPECIAL_PATHS[segments[0]];
  if (special && segments.length === 1) return { ...special, entityId: null };

  const idSegments = segments.filter(isIdSegment);
  const entityId = idSegments.length ? idSegments[idSegments.length - 1] : null;
  const verb = [...segments].reverse().find((s) => !isIdSegment(s) && VERB_ACTIONS[s.toLowerCase()]);
  const upper = String(method || '').toUpperCase();
  const base = {
    module: moduleOf(segments),
    entityId,
    action: (verb && VERB_ACTIONS[verb.toLowerCase()]) || METHOD_ACTIONS[upper] || upper || 'REQUEST'
  };
  if (Number(statusCode) === 403) return { ...base, eventType: 'DENIED', action: 'ACCESS_DENIED' };
  return { ...base, eventType: 'CHANGE' };
};

const isChangeMethod = (method) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || '').toUpperCase());

// Requests that are recorded: every data change and sign-in event, and any refusal (403).
// Token refresh is session upkeep, not a user action.
const shouldRecord = (method, url, statusCode) => {
  const segments = segmentsOf(url);
  if (segments[0] === 'refresh-token') return false;
  return isChangeMethod(method) || Number(statusCode) === 403;
};

// ---------------------------------------------------------------------------
// Who did it.
// ---------------------------------------------------------------------------

// The signed-in user of this request. Set by middleware/authenticate.js; for
// requests refused before it ran (e.g. the View Only gate) the token is verified
// here instead. Never trusted when the signature does not verify.
const actorOf = (req) => {
  if (req.user && req.user.userId) {
    return { userId: Number(req.user.userId), username: req.user.username, role: req.user.role, sessionId: req.user.sid };
  }
  const header = req.headers?.authorization || '';
  if (!header.startsWith('Bearer ')) return {};
  try {
    const decoded = jwt.verify(header.slice(7), getJwtSecret(), JWT_VERIFY_OPTIONS);
    return { userId: Number(decoded.userId) || null, username: decoded.username, role: decoded.role, sessionId: decoded.sid };
  } catch (error) {
    return {};
  }
};

// { name, username, role } of a user, looked up once per user id (cached briefly).
const userCache = new Map();
const USER_CACHE_MS = 60 * 1000;
const userInfoOf = async (userId) => {
  if (!userId) return {};
  const hit = userCache.get(userId);
  if (hit && Date.now() - hit.at < USER_CACHE_MS) return hit.info;
  const [rows] = await db().query('SELECT name, username, role FROM users WHERE id = ? LIMIT 1', [userId]);
  const info = rows[0] ? { name: rows[0].name || rows[0].username, username: rows[0].username, role: rows[0].role } : {};
  if (userCache.size > 1000) userCache.clear();
  userCache.set(userId, { at: Date.now(), info });
  return info;
};

const filesOf = (req) => {
  const files = [].concat(req.file || [], Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat());
  return files.map((f) => ({ field: f.fieldname, name: f.originalname, size: f.size, type: f.mimetype }));
};

// ---------------------------------------------------------------------------
// Writing.
// ---------------------------------------------------------------------------

const COLUMNS = [
  'user_id', 'username', 'user_name', 'user_role', 'session_id', 'event_type', 'action', 'module', 'entity_id',
  'record_type', 'record_label',
  'method', 'path', 'query_string', 'status_code', 'outcome', 'message', 'request_body', 'response_body',
  'old_values', 'new_values', 'ip_address', 'forwarded_for', 'user_agent', 'duration_ms'
];

/**
 * Inserts one audit row. Never throws (an audit failure must not fail the user's work).
 * eventType: AUTH | CHANGE | DENIED (requests) or SYNC (POS / Restaurant imports).
 */
const record = async (entry) => {
  try {
    const known = entry.userId && (!entry.userName || !entry.role || !entry.username) ? await userInfoOf(entry.userId) : {};
    const values = {
      user_id: entry.userId || null,
      username: cut(entry.username || known.username, 100),
      user_name: cut(entry.userName || known.name, 255),
      user_role: cut(entry.role || known.role, 50),
      session_id: cut(entry.sessionId, 64),
      event_type: entry.eventType,
      action: cut(entry.action, 40),
      module: cut(entry.module, 60),
      entity_id: cut(entry.entityId, 64),
      record_type: cut(entry.recordType, 60),
      record_label: cut(entry.recordLabel, 255),
      method: cut(entry.method, 10),
      path: cut(entry.path, 500),
      query_string: cut(entry.queryString, 1000),
      status_code: entry.statusCode || null,
      outcome: entry.outcome === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
      message: cut(entry.message, 500),
      request_body: toStoredJson(entry.requestBody),
      response_body: toStoredJson(entry.responseBody),
      old_values: toStoredJson(entry.oldValues),
      new_values: toStoredJson(entry.newValues),
      ip_address: cut(entry.ip, 64),
      forwarded_for: cut(entry.forwardedFor, 255),
      user_agent: cut(entry.userAgent, 500),
      duration_ms: Number.isFinite(entry.durationMs) ? Math.round(entry.durationMs) : null
    };
    // occurred_at = when it happened, not when this (background) write ran: the
    // database clock minus the time since the event, so rows keep the real order.
    const delayMicros = Number.isFinite(entry.at) ? Math.max(0, Math.round((Date.now() - entry.at) * 1000)) : 0;
    await db().query(
      `INSERT INTO ${auditTable()} (occurred_at, ${COLUMNS.join(', ')})
       VALUES (NOW(3) - INTERVAL ? MICROSECOND, ${COLUMNS.map(() => '?').join(', ')})`,
      [delayMicros, ...COLUMNS.map((column) => values[column])]
    );
  } catch (error) {
    console.error('Audit trail: could not record', entry.action, entry.path, '-', error.message);
  }
};

const messageOf = (body, statusCode) => {
  if (body && typeof body === 'object') {
    if (typeof body.error === 'string') return body.error;
    if (typeof body.message === 'string') return body.message;
  }
  return statusCode >= 400 ? `HTTP ${statusCode}` : null;
};

/**
 * Express middleware for /api: records each qualifying request once its
 * response has been sent. Controllers may add details in res.locals.audit
 * ({ action, userId, username, userName, role, sessionId, message }) - used by
 * sign-in, where the user is only known inside the controller.
 *
 * A data change to one record (services/auditSnapshots.js) also gets that
 * record's values before the request is handled and after it finished.
 */
const auditTrail = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    res.locals.auditResponse = body;
    return originalJson(body);
  };
  // Snapshots only for a signed-in user (verified token): an anonymous request
  // never makes the server read records.
  const target = isChangeMethod(req.method) && actorOf(req).userId ? snapshotTargetOf(req.originalUrl || req.url) : null;

  res.on('finish', async () => {
    const at = Date.now(); // the moment the response was sent
    const url = req.originalUrl || req.url;
    if (!shouldRecord(req.method, url, res.statusCode)) return;

    let newValues;
    if (target && res.locals.auditBefore !== undefined) {
      try {
        newValues = await takeSnapshot(db(), target);
      } catch (error) {
        newValues = undefined;
      }
    }

    const described = describeRequest(req.method, url, res.statusCode);
    const extra = res.locals.audit || {};
    const actor = actorOf(req);
    const body = req.body && typeof req.body === 'object' ? { ...req.body } : undefined;
    const files = filesOf(req);
    if (files.length) Object.assign(body || {}, { _files: files });
    const responseBody = res.locals.auditResponse;
    const queryIndex = url.indexOf('?');
    // "Purchase invoice INV-1024" for the Record column (sign-in events have none).
    const recordOf = (d) => {
      if (d.eventType === 'AUTH') return {};
      const { type, label } = describeRecord({
        table: target?.table, before: res.locals.auditBefore, after: newValues, method: req.method, url,
        requestBody: body, responseBody, entityId: d.entityId
      });
      return { recordType: type, recordLabel: label };
    };

    record({
      at,
      userId: extra.userId ?? actor.userId,
      username: extra.username ?? actor.username ?? (described.action === 'LOGIN' ? body?.username : undefined),
      userName: extra.userName,
      role: extra.role ?? actor.role,
      sessionId: extra.sessionId ?? actor.sessionId,
      eventType: described.eventType,
      action: extra.action || described.action,
      module: described.module,
      entityId: described.entityId,
      ...recordOf(described),
      method: req.method,
      path: queryIndex >= 0 ? url.slice(0, queryIndex) : url,
      queryString: queryIndex >= 0 ? url.slice(queryIndex + 1) : null,
      statusCode: res.statusCode,
      outcome: res.statusCode < 400 ? 'SUCCESS' : 'FAILED',
      message: extra.message || messageOf(responseBody, res.statusCode),
      requestBody: files.length && !body ? { _files: files } : body,
      responseBody,
      oldValues: res.locals.auditBefore,
      // null after a record existed = it was deleted
      newValues: newValues || (newValues === null && res.locals.auditBefore ? { deleted: true } : undefined),
      ip: req.ip || req.socket?.remoteAddress,
      forwardedFor: req.headers['x-forwarded-for'],
      userAgent: req.headers['user-agent'],
      durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6
    });
  });

  if (!target) return next();
  // The record as it is BEFORE the handler runs (one indexed lookup).
  return takeSnapshot(db(), target)
    .then((snapshot) => { res.locals.auditBefore = snapshot; })
    .catch(() => { /* the request goes ahead without "before" values */ })
    .finally(() => next());
};

// ---------------------------------------------------------------------------
// Schema (config/db.js runs this at start-up; migrations/037_audit_log.sql by hand).
// ---------------------------------------------------------------------------
// Creates audit_log (+ missing columns, + the append-only triggers) in `schema`
// (null = the connection's own database). Needs CREATE / ALTER / TRIGGER: run by
// the application at start-up when audit_log lives in its own database, or by an
// administrator through scripts/createAppDbUser.js for a separate AUDIT_DB.
// Columns added after the first version of the table: [name, definition, after column].
const ADDED_COLUMNS = [
  ['record_type', 'VARCHAR(60) NULL', 'entity_id'],
  ['record_label', 'VARCHAR(255) NULL', 'record_type'],
  ['old_values', 'LONGTEXT NULL', 'response_body'],
  ['new_values', 'LONGTEXT NULL', 'old_values']
];

const createAuditLogTable = async (conn, schema = null) => {
  const table = schema ? `\`${schema}\`.audit_log` : 'audit_log';
  const inSchema = (column) => (schema ? `${column} = ?` : `${column} = DATABASE()`);
  const schemaParams = schema ? [schema] : [];
  await conn.query(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      user_id INT NULL,
      username VARCHAR(100) NULL,
      user_name VARCHAR(255) NULL,
      user_role VARCHAR(50) NULL,
      session_id VARCHAR(64) NULL,
      event_type VARCHAR(20) NOT NULL,
      action VARCHAR(40) NOT NULL,
      module VARCHAR(60) NULL,
      entity_id VARCHAR(64) NULL,
      record_type VARCHAR(60) NULL,
      record_label VARCHAR(255) NULL,
      method VARCHAR(10) NULL,
      path VARCHAR(500) NULL,
      query_string VARCHAR(1000) NULL,
      status_code SMALLINT NULL,
      outcome ENUM('SUCCESS','FAILED') NOT NULL,
      message VARCHAR(500) NULL,
      request_body LONGTEXT NULL,
      response_body LONGTEXT NULL,
      old_values LONGTEXT NULL,
      new_values LONGTEXT NULL,
      ip_address VARCHAR(64) NULL,
      forwarded_for VARCHAR(255) NULL,
      user_agent VARCHAR(500) NULL,
      duration_ms INT NULL,
      PRIMARY KEY (id),
      KEY idx_audit_time (occurred_at),
      KEY idx_audit_user_time (user_id, occurred_at),
      KEY idx_audit_session (session_id),
      KEY idx_audit_event_time (event_type, occurred_at),
      KEY idx_audit_module_time (module, occurred_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Tables created before the columns in ADDED_COLUMNS existed.
  const [columns] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE ${inSchema('TABLE_SCHEMA')} AND TABLE_NAME = 'audit_log' AND COLUMN_NAME IN (${ADDED_COLUMNS.map(([c]) => `'${c}'`).join(', ')})`,
    schemaParams
  );
  const have = new Set(columns.map((c) => c.COLUMN_NAME));
  for (const [column, definition, after] of ADDED_COLUMNS) {
    if (!have.has(column)) await conn.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition} AFTER ${after}`);
  }

  // Append-only: nobody using the application can change or remove a row.
  const [triggers] = await conn.query(
    `SELECT TRIGGER_NAME FROM information_schema.TRIGGERS
      WHERE ${inSchema('TRIGGER_SCHEMA')} AND EVENT_OBJECT_TABLE = 'audit_log'`,
    schemaParams
  );
  const existing = new Set(triggers.map((t) => t.TRIGGER_NAME));
  const prefix = schema ? `\`${schema}\`.` : '';
  for (const [name, timing] of [['audit_log_no_update', 'UPDATE'], ['audit_log_no_delete', 'DELETE']]) {
    if (existing.has(name)) continue;
    try {
      await conn.query(
        `CREATE TRIGGER ${prefix}${name} BEFORE ${timing} ON ${table} FOR EACH ROW
           SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_log is append-only'`
      );
    } catch (error) {
      console.warn(`Audit trail: could not create trigger ${name} (needs the TRIGGER privilege):`, error.message);
    }
  }
};

// Start-up check (config/db.js). With AUDIT_DB the restricted application user
// may only read and add rows there, so it only checks that the table is reachable.
const ensureAuditLogSchema = async (pool) => {
  if (auditSchema()) {
    try {
      await pool.query(`SELECT id FROM ${auditTable()} LIMIT 0`);
    } catch (error) {
      console.warn(`Audit trail: ${auditTable()} is not reachable (${error.message}) - run scripts/createAppDbUser.js`);
    }
    return;
  }
  await createAuditLogTable(pool, null);
};

module.exports = {
  auditTrail,
  record,
  ensureAuditLogSchema,
  createAuditLogTable,
  auditTable,
  // exported for tests
  redact,
  toStoredJson,
  describeRequest,
  shouldRecord
};
