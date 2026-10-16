// server/controllers/auditLogController.js
//
// Audit Trail page (Admin / Super Admin - the `audit` module in
// config/rolePermissions.js). Read-only: rows are written by services/auditLog.js
// and the table refuses UPDATE / DELETE.
//
//   GET /api/audit-logs            ?from&to&userId&eventType&action&module&outcome&sessionId&search&page&limit
//   GET /api/audit-logs/summary    same filters -> counts for the summary tiles
//   GET /api/audit-logs/filters    users, actions and modules for the filter lists
//   GET /api/audit-logs/:id        one row with its request / response data

const pool = require('../config/db');
const { diffSnapshots } = require('../services/auditSnapshots');
const { auditTable } = require('../services/auditLog');
const { presentAuditRow } = require('../services/auditPresenter');

const EVENT_TYPES = ['AUTH', 'CHANGE', 'DENIED', 'SYNC'];
const OUTCOMES = ['SUCCESS', 'FAILED'];
const MAX_LIMIT = 200;

const LIST_COLUMNS = `id, DATE_FORMAT(occurred_at, '%Y-%m-%d %H:%i:%s') AS occurred_at, user_id, username, user_name,
  user_role, session_id, event_type, action, module, entity_id, record_type, record_label, method, path, status_code, outcome, message,
  ip_address, duration_ms`;

const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const escapeLike = (value) => String(value).replace(/[\\%_]/g, (c) => `\\${c}`);
const text = (value, max = 100) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);

// WHERE clause shared by the list and the summary.
const buildWhere = (query = {}) => {
  const where = [];
  const params = [];
  if (isDate(query.from)) { where.push('occurred_at >= ?'); params.push(`${query.from} 00:00:00`); }
  if (isDate(query.to)) { where.push('occurred_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(query.to); }
  const userId = Number(query.userId);
  if (Number.isInteger(userId) && userId > 0) { where.push('user_id = ?'); params.push(userId); }
  if (EVENT_TYPES.includes(query.eventType)) { where.push('event_type = ?'); params.push(query.eventType); }
  if (OUTCOMES.includes(query.outcome)) { where.push('outcome = ?'); params.push(query.outcome); }
  const action = text(query.action, 40);
  if (action) { where.push('action = ?'); params.push(action); }
  const moduleName = text(query.module, 60);
  if (moduleName) { where.push('module = ?'); params.push(moduleName); }
  const sessionId = text(query.sessionId, 64);
  if (sessionId) { where.push('session_id = ?'); params.push(sessionId); }
  const search = text(query.search, 200);
  if (search) {
    const like = `%${escapeLike(search)}%`;
    const fields = ['path', 'entity_id', 'record_label', 'message', 'username', 'user_name', 'ip_address', 'request_body'];
    where.push(`(${fields.map((f) => `${f} LIKE ?`).join(' OR ')})`);
    params.push(...fields.map(() => like));
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
};

const listAuditLogs = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const { sql, params } = buildWhere(req.query);

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM ${auditTable()} ${sql}`, params);
    const [rows] = await pool.query(
      `SELECT ${LIST_COLUMNS} FROM ${auditTable()} ${sql} ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );
    res.json({ rows, total: Number(total), page, limit });
  } catch (error) {
    console.error('Error listing audit trail:', error);
    res.status(500).json({ error: 'Could not load the audit trail' });
  }
};

const getAuditSummary = async (req, res) => {
  try {
    const { sql, params } = buildWhere(req.query);
    const [[row]] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(action = 'LOGIN') AS logins,
         SUM(action IN ('LOGIN_FAILED', 'LOGIN_BLOCKED')) AS failed_logins,
         SUM(event_type = 'CHANGE') AS changes,
         SUM(event_type = 'CHANGE' AND outcome = 'FAILED') AS failed_changes,
         SUM(event_type = 'DENIED') AS denied,
         SUM(event_type = 'SYNC' AND outcome = 'FAILED') AS failed_syncs,
         COUNT(DISTINCT user_id) AS users
       FROM ${auditTable()} ${sql}`,
      params
    );
    const n = (value) => Number(value) || 0;
    res.json({
      total: n(row.total),
      logins: n(row.logins),
      failedLogins: n(row.failed_logins),
      changes: n(row.changes),
      failedChanges: n(row.failed_changes),
      denied: n(row.denied),
      failedSyncs: n(row.failed_syncs),
      users: n(row.users)
    });
  } catch (error) {
    console.error('Error summarising audit trail:', error);
    res.status(500).json({ error: 'Could not load the audit summary' });
  }
};

const getAuditFilters = async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, name, username, role FROM users ORDER BY name, username');
    const [actions] = await pool.query(`SELECT DISTINCT action FROM ${auditTable()} ORDER BY action`);
    const [modules] = await pool.query(`SELECT DISTINCT module FROM ${auditTable()} WHERE module IS NOT NULL ORDER BY module`);
    res.json({
      users,
      actions: actions.map((r) => r.action),
      modules: modules.map((r) => r.module)
    });
  } catch (error) {
    console.error('Error loading audit filters:', error);
    res.status(500).json({ error: 'Could not load the audit filters' });
  }
};

const parseJson = (value) => {
  if (value === null || value === undefined || value === '') return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
};

const getAuditLog = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid audit record' });
  try {
    const [rows] = await pool.query(
      `SELECT ${LIST_COLUMNS}, query_string, request_body, response_body, old_values, new_values, forwarded_for, user_agent
         FROM ${auditTable()} WHERE id = ?`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Audit record not found' });
    const row = rows[0];
    const oldValues = parseJson(row.old_values);
    const newValues = parseJson(row.new_values);
    const snapshot = (value) => (value && typeof value === 'object' && value.row ? value : null);
    const detail = {
      ...row,
      request_body: parseJson(row.request_body),
      response_body: parseJson(row.response_body),
      old_values: oldValues,
      new_values: newValues,
      // Field-by-field old -> new (null when the request named no single record)
      changes: oldValues || newValues ? diffSnapshots(snapshot(oldValues), snapshot(newValues)) : null
    };
    // The same event in plain words, with names instead of ids (the page shows this first).
    detail.plain = await presentAuditRow(detail, pool);
    res.json(detail);
  } catch (error) {
    console.error('Error loading audit record:', error);
    res.status(500).json({ error: 'Could not load the audit record' });
  }
};

module.exports = { listAuditLogs, getAuditSummary, getAuditFilters, getAuditLog, buildWhere };
