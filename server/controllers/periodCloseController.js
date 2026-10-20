// server/controllers/periodCloseController.js
//
// Period close (audit finding H7, services/periodLock.js): requests to re-open a
// closed month.
//   POST /api/period-close/requests   Admin / Super Admin ask, with a reason
//   POST /api/period-close/approve    Super Admin only: open it for N hours
//   POST /api/period-close/reject     Super Admin only
//   POST /api/period-close/close      Admin / Super Admin: close it again before it expires
//   GET  /api/period-close/status     the open window + months open right now
//   GET  /api/period-close/requests   recent requests
// Role access is set in config/rolePermissions.js (module periodClose; approve and
// reject are Super Admin only) and re-checked here. Every call is also recorded by
// the Audit Trail (services/auditLog.js).

const pool = require('../config/db');
const { actorId } = require('../utils/actor');
const { normalizeRole, ROLES } = require('../config/rolePermissions');
const lock = require('../services/periodLock');

const MAX_MONTHS_PER_REQUEST = 12;
const REASON_MIN = 10;
const REASON_MAX = 500;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const send = (res, error, fallback) => {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  console.error(`${fallback}:`, error);
  return res.status(500).json({ error: fallback });
};

const idOf = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'A valid request is required');
  return id;
};

const monthKey = (date) => String(date).slice(0, 7);

const REQUEST_SELECT = `
  SELECT r.id,
         DATE_FORMAT(r.period_from, '%Y-%m-%d') AS period_from,
         DATE_FORMAT(r.period_to, '%Y-%m-%d') AS period_to,
         r.reason, r.status, r.requested_by, r.requested_at,
         r.decided_by, r.decided_at, r.decision_note, r.expires_at, r.closed_by, r.closed_at,
         (r.status = 'Approved' AND r.expires_at > NOW()) AS is_active,
         COALESCE(ru.name, ru.username) AS requested_by_name,
         COALESCE(du.name, du.username) AS decided_by_name,
         COALESCE(cu.name, cu.username) AS closed_by_name
    FROM period_reopen_requests r
    LEFT JOIN users ru ON ru.id = r.requested_by
    LEFT JOIN users du ON du.id = r.decided_by
    LEFT JOIN users cu ON cu.id = r.closed_by`;

const present = (row) => ({
  id: row.id,
  from_month: monthKey(row.period_from),
  to_month: monthKey(row.period_to),
  reason: row.reason,
  // An approval that ran out is shown as Expired.
  status: row.status === 'Approved' && !row.is_active ? 'Expired' : row.status,
  is_active: Boolean(Number(row.is_active)),
  requested_by: row.requested_by,
  requested_by_name: row.requested_by_name,
  requested_at: row.requested_at,
  decided_by_name: row.decided_by_name,
  decided_at: row.decided_at,
  decision_note: row.decision_note,
  expires_at: row.expires_at,
  closed_by_name: row.closed_by_name,
  closed_at: row.closed_at
});

const roleOf = async (db, userId) => {
  const [rows] = await db.query('SELECT role FROM users WHERE id = ? LIMIT 1', [userId]);
  return normalizeRole(rows[0]?.role);
};

const requireUser = (req) => {
  const userId = actorId(req);
  if (!userId) throw new HttpError(401, 'Please log in again');
  return userId;
};

const requireSuperAdmin = async (db, userId) => {
  if ((await roleOf(db, userId)) !== ROLES.SUPER_ADMIN) {
    throw new HttpError(403, 'Only the Super Admin can approve or reject a re-open request');
  }
};

// Domain 3 L4 fix: approveRequest/rejectRequest both re-check their role
// inside the controller, in addition to the route-level RBAC gate;
// closeRequest did not, relying entirely on /period-close/close resolving to
// the generic PERIOD_CLOSE rule (Admin/Super Admin). This closes that gap the
// same way, so a routing-table change can't silently widen who may close a
// re-opened month early.
const requireAdminOrSuperAdmin = async (db, userId) => {
  const role = await roleOf(db, userId);
  if (role !== ROLES.ADMIN && role !== ROLES.SUPER_ADMIN) {
    throw new HttpError(403, 'Only an Admin or Super Admin can close a re-opened period early');
  }
};

// GET /api/period-close/status
const getStatus = async (req, res) => {
  try {
    const grants = await lock.activeGrants(pool);
    res.json({
      open_months: lock.openMonths(),
      today: lock.today(),
      closed_before: lock.firstOpenDate(),
      reopened: grants.map((grant) => ({
        id: grant.id, from_month: monthKey(grant.from), to_month: monthKey(grant.to), expires_at: grant.expires_at
      }))
    });
  } catch (error) {
    send(res, error, 'Failed to load the period status');
  }
};

// GET /api/period-close/requests
const listRequests = async (req, res) => {
  try {
    const [rows] = await pool.query(`${REQUEST_SELECT} ORDER BY r.id DESC LIMIT 200`);
    res.json(rows.map(present));
  } catch (error) {
    send(res, error, 'Failed to load re-open requests');
  }
};

// POST /api/period-close/requests  { from_month: 'YYYY-MM', to_month: 'YYYY-MM', reason }
const createRequest = async (req, res) => {
  try {
    const userId = requireUser(req);
    const from = String(req.body?.from_month || '').trim();
    const to = String(req.body?.to_month || req.body?.from_month || '').trim();
    const reason = String(req.body?.reason || '').trim();

    if (!lock.isMonthKey(from) || !lock.isMonthKey(to)) throw new HttpError(400, 'Choose the month(s) to re-open');
    if (from > to) throw new HttpError(400, 'The first month cannot be after the last month');
    if (lock.monthStart(to) >= lock.firstOpenDate()) {
      throw new HttpError(400, `${lock.monthLabel(lock.monthStart(to))} is still open - only closed months can be re-opened`);
    }
    const [fy, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    if ((ty * 12 + tm) - (fy * 12 + fm) + 1 > MAX_MONTHS_PER_REQUEST) {
      throw new HttpError(400, `At most ${MAX_MONTHS_PER_REQUEST} months can be re-opened in one request`);
    }
    if (reason.length < REASON_MIN) throw new HttpError(400, `Give the reason (at least ${REASON_MIN} characters)`);
    if (reason.length > REASON_MAX) throw new HttpError(400, `The reason is too long (at most ${REASON_MAX} characters)`);

    const [result] = await pool.query(
      `INSERT INTO period_reopen_requests (period_from, period_to, reason, requested_by)
       VALUES (?, ?, ?, ?)`,
      [lock.monthStart(from), lock.monthEnd(to), reason, userId]
    );
    const [[row]] = await pool.query(`${REQUEST_SELECT} WHERE r.id = ?`, [result.insertId]);
    res.status(201).json({ message: 'Re-open request sent to the Super Admin', request: present(row) });
  } catch (error) {
    send(res, error, 'Failed to send the re-open request');
  }
};

// Locks one request and checks its state; `allowed` = statuses the action works on.
const lockRequest = async (connection, id, allowed, action) => {
  const [rows] = await connection.query(
    `SELECT id, status, requested_by, (status = 'Approved' AND expires_at > NOW()) AS is_active
       FROM period_reopen_requests WHERE id = ? FOR UPDATE`,
    [id]
  );
  if (!rows.length) throw new HttpError(404, 'Re-open request not found');
  const row = rows[0];
  const state = row.status === 'Approved' && !Number(row.is_active) ? 'Expired' : row.status;
  if (!allowed.includes(state)) throw new HttpError(409, `This request is ${state.toLowerCase()} and cannot be ${action}`);
  return row;
};

const inTransaction = async (work) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// POST /api/period-close/approve  { id, hours?, note? }  - Super Admin only
const approveRequest = async (req, res) => {
  try {
    const userId = requireUser(req);
    const id = idOf(req.body?.id);
    const hours = req.body?.hours === undefined || req.body?.hours === '' ? lock.DEFAULT_GRANT_HOURS : Number(req.body.hours);
    if (!Number.isInteger(hours) || hours < 1 || hours > lock.MAX_GRANT_HOURS) {
      throw new HttpError(400, `Open it for 1 to ${lock.MAX_GRANT_HOURS} hours`);
    }
    const note = String(req.body?.note || '').trim().slice(0, 500) || null;

    const request = await inTransaction(async (connection) => {
      await requireSuperAdmin(connection, userId);
      await lockRequest(connection, id, ['Pending'], 'approved');
      await connection.query(
        `UPDATE period_reopen_requests
            SET status = 'Approved', decided_by = ?, decided_at = NOW(), decision_note = ?,
                expires_at = DATE_ADD(NOW(), INTERVAL ? HOUR)
          WHERE id = ?`,
        [userId, note, hours, id]
      );
      const [[row]] = await connection.query(`${REQUEST_SELECT} WHERE r.id = ?`, [id]);
      return present(row);
    });
    res.json({ message: `Approved - the month(s) are open for ${hours} hour${hours === 1 ? '' : 's'}`, request });
  } catch (error) {
    send(res, error, 'Failed to approve the request');
  }
};

// POST /api/period-close/reject  { id, note }  - Super Admin only
const rejectRequest = async (req, res) => {
  try {
    const userId = requireUser(req);
    const id = idOf(req.body?.id);
    const note = String(req.body?.note || '').trim().slice(0, 500);
    if (!note) throw new HttpError(400, 'Give a reason for rejecting the request');

    const request = await inTransaction(async (connection) => {
      await requireSuperAdmin(connection, userId);
      await lockRequest(connection, id, ['Pending'], 'rejected');
      await connection.query(
        `UPDATE period_reopen_requests
            SET status = 'Rejected', decided_by = ?, decided_at = NOW(), decision_note = ?
          WHERE id = ?`,
        [userId, note, id]
      );
      const [[row]] = await connection.query(`${REQUEST_SELECT} WHERE r.id = ?`, [id]);
      return present(row);
    });
    res.json({ message: 'Request rejected', request });
  } catch (error) {
    send(res, error, 'Failed to reject the request');
  }
};

// POST /api/period-close/close  { id }  - Admin / Super Admin: close it again early
const closeRequest = async (req, res) => {
  try {
    const userId = requireUser(req);
    const id = idOf(req.body?.id);
    const request = await inTransaction(async (connection) => {
      await requireAdminOrSuperAdmin(connection, userId);
      await lockRequest(connection, id, ['Approved'], 'closed again');
      await connection.query(
        `UPDATE period_reopen_requests SET status = 'Closed', closed_by = ?, closed_at = NOW() WHERE id = ?`,
        [userId, id]
      );
      const [[row]] = await connection.query(`${REQUEST_SELECT} WHERE r.id = ?`, [id]);
      return present(row);
    });
    res.json({ message: 'The month(s) are closed again', request });
  } catch (error) {
    send(res, error, 'Failed to close the period');
  }
};

module.exports = { getStatus, listRequests, createRequest, approveRequest, rejectRequest, closeRequest };
