// server/routes/creditCardRateRoutes.js
//
// Management -> Credit Card Rate. Mounted at /api/credit-card-rates (see
// server.js). The card commission rate (%) of each Branch / Department; the
// Card Ledger reads the ACTIVE rate when card transactions are realised.
//
// Access (config/rolePermissions.js, prefix '/credit-card-rates'): Finance
// module roles (Accountant, Admin, Super Admin) manage rates; QB is read-only
// (the global readOnly middleware and financeWriteAccess refuse its writes).
//
// Records are never hard-deleted: status 1 = Active, 0 = Inactive (same
// convention as Receive Types). Only ONE Active rate per department.
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { financeReadAccess, financeWriteAccess } = require('../middleware/moduleAccess');
const { HttpError, parseId } = require('../utils/staffLoanUtils');
const {
  parseRatePercent, basisPointsToRate, assertNoOtherActiveRate
} = require('../services/creditCardRateService');

const RATE_SELECT = `
  SELECT r.id, r.department_id, d.name AS department_name, r.rate, r.status,
         DATE_FORMAT(r.updated_at, '%Y-%m-%d %H:%i') AS updated_at
    FROM credit_card_rates r
    LEFT JOIN departments d ON d.id = r.department_id
`;

const sendError = (res, error, fallback) => {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'This Branch / Department already has an active Credit Card Rate' });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
};

const parseBody = (body = {}) => {
  const departmentId = parseId(body.department_id);
  if (!departmentId) throw new HttpError(400, 'Branch / Department is required');
  const rate = parseRatePercent(body.rate);
  if (rate.error) throw new HttpError(400, rate.error);
  return { departmentId, rate: basisPointsToRate(rate.basisPoints) };
};

const requireDepartment = async (connection, departmentId) => {
  const [rows] = await connection.query('SELECT id FROM departments WHERE id = ?', [departmentId]);
  if (rows.length === 0) throw new HttpError(400, 'The selected Branch / Department does not exist');
};

const lockRate = async (connection, id) => {
  const rateId = parseId(id);
  if (!rateId) throw new HttpError(400, 'Invalid Credit Card Rate');
  const [rows] = await connection.query('SELECT id, department_id, status FROM credit_card_rates WHERE id = ? FOR UPDATE', [rateId]);
  if (rows.length === 0) throw new HttpError(404, 'Credit Card Rate not found');
  return rows[0];
};

// Runs `work(connection)` in ONE database transaction.
const inTransaction = async (work) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
};

// GET / - every rate (active and inactive) for the management page.
router.get('/', ...financeReadAccess, async (req, res) => {
  try {
    const [rows] = await pool.query(`${RATE_SELECT} ORDER BY d.name ASC, r.status DESC, r.id DESC`);
    res.json(rows);
  } catch (error) {
    sendError(res, error, 'Failed to fetch credit card rates');
  }
});

// POST / { department_id, rate } - a new ACTIVE rate.
router.post('/', ...financeWriteAccess, async (req, res) => {
  try {
    const { departmentId, rate } = parseBody(req.body);
    const id = await inTransaction(async (connection) => {
      await requireDepartment(connection, departmentId);
      await assertNoOtherActiveRate(connection, departmentId);
      const [result] = await connection.query(
        'INSERT INTO credit_card_rates (department_id, rate, status, created_by, updated_by) VALUES (?, ?, 1, ?, ?)',
        [departmentId, rate, req.user?.userId ?? null, req.user?.userId ?? null]
      );
      return result.insertId;
    });
    res.status(201).json({ message: 'Credit Card Rate added', id });
  } catch (error) {
    sendError(res, error, 'Failed to add credit card rate');
  }
});

// PUT /:id { department_id, rate } - edit. Realisations already saved keep
// the rate they used (stored on their card transactions).
router.put('/:id', ...financeWriteAccess, async (req, res) => {
  try {
    const { departmentId, rate } = parseBody(req.body);
    await inTransaction(async (connection) => {
      const current = await lockRate(connection, req.params.id);
      await requireDepartment(connection, departmentId);
      if (Number(current.status) === 1) await assertNoOtherActiveRate(connection, departmentId, current.id);
      await connection.query(
        'UPDATE credit_card_rates SET department_id = ?, rate = ?, updated_by = ? WHERE id = ?',
        [departmentId, rate, req.user?.userId ?? null, current.id]
      );
    });
    res.json({ message: 'Credit Card Rate updated' });
  } catch (error) {
    sendError(res, error, 'Failed to update credit card rate');
  }
});

// PATCH /:id/activate - refused while the department has another active rate.
router.patch('/:id/activate', ...financeWriteAccess, async (req, res) => {
  try {
    await inTransaction(async (connection) => {
      const current = await lockRate(connection, req.params.id);
      if (Number(current.status) === 1) return;
      await assertNoOtherActiveRate(connection, current.department_id, current.id);
      await connection.query(
        'UPDATE credit_card_rates SET status = 1, updated_by = ? WHERE id = ?',
        [req.user?.userId ?? null, current.id]
      );
    });
    res.json({ message: 'Credit Card Rate activated' });
  } catch (error) {
    sendError(res, error, 'Failed to activate credit card rate');
  }
});

// PATCH /:id/deactivate - the department then has no active rate, so its card
// transactions cannot be realised until a rate is activated again.
router.patch('/:id/deactivate', ...financeWriteAccess, async (req, res) => {
  try {
    await inTransaction(async (connection) => {
      const current = await lockRate(connection, req.params.id);
      if (Number(current.status) === 0) return;
      await connection.query(
        'UPDATE credit_card_rates SET status = 0, updated_by = ? WHERE id = ?',
        [req.user?.userId ?? null, current.id]
      );
    });
    res.json({ message: 'Credit Card Rate deactivated' });
  } catch (error) {
    sendError(res, error, 'Failed to deactivate credit card rate');
  }
});

module.exports = router;
