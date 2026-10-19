// server/controllers/inhandController.js
//
// CRUD + workflow controller for Inhand Adjustments.
// Integrates with the Finance Module via inhandPostingService.

const pool = require('../config/db');
const { sendServerError } = require('../utils/safeError');
const {
  generateReferenceNo,
  postInhand,
  reverseInhand,
  writeAuditLog
} = require('../services/inhandPostingService');

// ─────────────────────────────────────────────────────────────────────────────
// Full SELECT used in list / detail queries
// ─────────────────────────────────────────────────────────────────────────────
const INHAND_SELECT = `
  SELECT
    ih.id,
    ih.reference_no,
    DATE_FORMAT(ih.transaction_date, '%Y-%m-%d') AS transaction_date,
    ih.payment_type,
    ih.company_id,
    c.name                        AS company_name,
    ih.bank_id,
    bd.bank_name                  AS bank_account_name,
    bd.account_number             AS bank_account_number,
    ih.cheque_number,
    ih.bank_name                  AS cheque_bank_name,
    ih.cheque_date,
    ih.amount,
    ih.party_name,
    ih.remark,
    ih.status,
    ih.finance_txn_id,
    ih.posted_at,
    ih.reversal_txn_id,
    ih.created_by,
    cu.name                       AS created_by_name,
    ih.approved_by,
    au.name                       AS approved_by_name,
    DATE_FORMAT(ih.approved_at, '%Y-%m-%d %H:%i') AS approved_at,
    ih.cancelled_by,
    xu.name                       AS cancelled_by_name,
    DATE_FORMAT(ih.cancelled_at, '%Y-%m-%d %H:%i') AS cancelled_at,
    DATE_FORMAT(ih.created_at, '%Y-%m-%d %H:%i')   AS created_at
  FROM inhand_adjustments ih
  LEFT JOIN company       c   ON ih.company_id  = c.id
  LEFT JOIN bank_details  bd  ON ih.bank_id     = bd.id
  LEFT JOIN users         cu  ON ih.created_by  = cu.id
  LEFT JOIN users         au  ON ih.approved_by = au.id
  LEFT JOIN users         xu  ON ih.cancelled_by = xu.id
`;

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/inhand  →  Create Draft entry
// ─────────────────────────────────────────────────────────────────────────────
const createInhand = async (req, res) => {
  const {
    transaction_date, payment_type,
    company_id, bank_id,
    cheque_number, bank_name, cheque_date,
    amount, party_name, remark
  } = req.body;

  const createdBy = req.user?.userId;

  // ── Validation ────────────────────────────────────────────────────────────
  if (!transaction_date) return res.status(400).json({ error: 'Transaction date is required.' });
  if (!payment_type || !['Cash In','Cheque In'].includes(payment_type))
    return res.status(400).json({ error: 'Payment type must be Cash In or Cheque In.' });
  if (!amount || parseFloat(amount) <= 0)
    return res.status(400).json({ error: 'Amount must be greater than zero.' });
  if (!createdBy) return res.status(401).json({ error: 'Authentication required.' });

  if (payment_type === 'Cash In' && !company_id)
    return res.status(400).json({ error: 'Company (Cash Account) is required for Cash In.' });

  if (payment_type === 'Cheque In') {
    if (!bank_id)        return res.status(400).json({ error: 'Bank Account is required for Cheque In.' });
    if (!cheque_number)  return res.status(400).json({ error: 'Cheque number is required.' });
    if (!cheque_date)    return res.status(400).json({ error: 'Cheque date is required.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const reference_no = await generateReferenceNo(connection);

    const [result] = await connection.query(
      `INSERT INTO inhand_adjustments
         (reference_no, transaction_date, payment_type,
          company_id, bank_id, cheque_number, bank_name, cheque_date,
          amount, party_name, remark, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?)`,
      [
        reference_no, transaction_date, payment_type,
        company_id || null, bank_id || null,
        cheque_number || null, bank_name || null, cheque_date || null,
        parseFloat(amount), party_name || null, remark || null,
        createdBy
      ]
    );

    const newId = result.insertId;

    await writeAuditLog(connection, {
      inhandId    : newId,
      action      : 'CREATED',
      performedBy : createdBy,
      details     : { payment_type, amount, reference_no }
    });

    await connection.commit();
    res.status(201).json({
      message      : 'Inhand entry created successfully.',
      id           : newId,
      reference_no
    });
  } catch (error) {
    await connection.rollback();
    console.error('createInhand error:', error);
    sendServerError(res, error);
  } finally {
    connection.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/inhand  →  Paginated list with optional filters
// ─────────────────────────────────────────────────────────────────────────────
const getInhandList = async (req, res) => {
  try {
    const {
      startDate, endDate, payment_type, status, search,
      page = 1, limit = 20
    } = req.query;

    let query  = `${INHAND_SELECT} WHERE 1=1`;
    const params = [];

    if (startDate && endDate) {
      query += ' AND DATE(ih.transaction_date) BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }
    if (payment_type && payment_type !== 'all') {
      query += ' AND ih.payment_type = ?';
      params.push(payment_type);
    }
    if (status && status !== 'all') {
      query += ' AND ih.status = ?';
      params.push(status);
    }
    if (search?.trim()) {
      const s = `%${search.trim()}%`;
      query += ` AND (ih.reference_no LIKE ? OR ih.party_name LIKE ?
                       OR ih.cheque_number LIKE ? OR c.name LIKE ?)`;
      params.push(s, s, s, s);
    }

    // Count for pagination
    const countQuery = query.replace(INHAND_SELECT, 'SELECT COUNT(*) AS total FROM inhand_adjustments ih LEFT JOIN company c ON ih.company_id = c.id LEFT JOIN bank_details bd ON ih.bank_id = bd.id LEFT JOIN users cu ON ih.created_by = cu.id LEFT JOIN users au ON ih.approved_by = au.id LEFT JOIN users xu ON ih.cancelled_by = xu.id');
    const [countRows] = await pool.query(countQuery, params);
    const total = countRows[0]?.total || 0;

    // Paginated data
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY ih.id DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const [rows] = await pool.query(query, params);
    res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error('getInhandList error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/inhand/:id  →  Single entry
// ─────────────────────────────────────────────────────────────────────────────
const getInhandById = async (req, res) => {
  try {
    const [rows] = await pool.query(`${INHAND_SELECT} WHERE ih.id = ?`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Inhand entry not found.' });
    res.json(rows[0]);
  } catch (error) {
    console.error('getInhandById error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/inhand/:id  →  Edit Draft or Pending entry only
// ─────────────────────────────────────────────────────────────────────────────
const updateInhand = async (req, res) => {
  const { id } = req.params;
  const {
    transaction_date, payment_type,
    company_id, bank_id,
    cheque_number, bank_name, cheque_date,
    amount, party_name, remark
  } = req.body;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existing] = await connection.query(
      'SELECT status FROM inhand_adjustments WHERE id = ? FOR UPDATE', [id]
    );
    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Inhand entry not found.' });
    }
    if (!['Draft','Pending'].includes(existing[0].status)) {
      await connection.rollback();
      return res.status(403).json({ error: 'Only Draft or Pending entries can be edited.' });
    }

    await connection.query(
      `UPDATE inhand_adjustments
       SET transaction_date = ?, payment_type = ?,
           company_id = ?, bank_id = ?,
           cheque_number = ?, bank_name = ?, cheque_date = ?,
           amount = ?, party_name = ?, remark = ?
       WHERE id = ?`,
      [
        transaction_date, payment_type,
        company_id || null, bank_id || null,
        cheque_number || null, bank_name || null, cheque_date || null,
        parseFloat(amount), party_name || null, remark || null,
        id
      ]
    );

    await connection.commit();
    res.json({ message: 'Inhand entry updated successfully.' });
  } catch (error) {
    await connection.rollback();
    console.error('updateInhand error:', error);
    sendServerError(res, error);
  } finally {
    connection.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/inhand/:id/submit  →  Draft → Pending
// ─────────────────────────────────────────────────────────────────────────────
const submitInhand = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.userId;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      'SELECT status FROM inhand_adjustments WHERE id = ? FOR UPDATE', [id]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Inhand entry not found.' });
    }
    if (rows[0].status !== 'Draft') {
      await connection.rollback();
      return res.status(400).json({ error: 'Only Draft entries can be submitted.' });
    }

    await connection.query(
      "UPDATE inhand_adjustments SET status = 'Pending' WHERE id = ?", [id]
    );

    await writeAuditLog(connection, {
      inhandId: id, action: 'SUBMITTED', performedBy: userId
    });

    await connection.commit();
    res.json({ message: 'Inhand entry submitted for approval.' });
  } catch (error) {
    await connection.rollback();
    console.error('submitInhand error:', error);
    sendServerError(res, error);
  } finally {
    connection.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/inhand/:id/approve  →  Pending → Approved + Finance posting
// ─────────────────────────────────────────────────────────────────────────────
const approveInhand = async (req, res) => {
  const { id } = req.params;
  const approvedBy = req.user?.userId;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Fetch full row
    const [rows] = await connection.query(
      'SELECT * FROM inhand_adjustments WHERE id = ? FOR UPDATE', [id]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Inhand entry not found.' });
    }

    const inhand = rows[0];

    if (inhand.status !== 'Pending') {
      await connection.rollback();
      return res.status(400).json({
        error: `Only Pending entries can be approved. Current status: ${inhand.status}`
      });
    }

    // Call the posting engine
    const finTxnId = await postInhand(connection, inhand, approvedBy);

    await connection.commit();
    res.json({
      message        : 'Inhand entry approved and posted to Finance ledger.',
      finance_txn_id : finTxnId
    });
  } catch (error) {
    await connection.rollback();
    console.error('approveInhand error:', error);
    const status = error.statusCode || 500;
    res.status(status).json({ error: error.message });
  } finally {
    connection.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/inhand/:id/cancel  →  Cancel (with reversal if Approved)
// ─────────────────────────────────────────────────────────────────────────────
const cancelInhand = async (req, res) => {
  const { id } = req.params;
  const cancelledBy = req.user?.userId;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      'SELECT * FROM inhand_adjustments WHERE id = ? FOR UPDATE', [id]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Inhand entry not found.' });
    }

    const inhand = rows[0];

    if (inhand.status === 'Cancelled') {
      await connection.rollback();
      return res.status(400).json({ error: 'This entry is already cancelled.' });
    }

    if (inhand.status === 'Approved') {
      // Requires reversal posting to restore the ledger balance
      await reverseInhand(connection, inhand, cancelledBy);
    } else {
      // Draft or Pending – just mark cancelled, no finance impact
      await connection.query(
        "UPDATE inhand_adjustments SET status = 'Cancelled', cancelled_by = ?, cancelled_at = ? WHERE id = ?",
        [cancelledBy, new Date(), id]
      );
      await writeAuditLog(connection, {
        inhandId: id, action: 'CANCELLED', performedBy: cancelledBy,
        details: { previous_status: inhand.status }
      });
    }

    await connection.commit();
    res.json({ message: 'Inhand entry cancelled successfully.' });
  } catch (error) {
    await connection.rollback();
    console.error('cancelInhand error:', error);
    const status = error.statusCode || 500;
    res.status(status).json({ error: error.message });
  } finally {
    connection.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/inhand/:id/audit  →  Audit log for one entry
// ─────────────────────────────────────────────────────────────────────────────
const getAuditLog = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ial.id, ial.action,
              DATE_FORMAT(ial.performed_at, '%Y-%m-%d %H:%i:%s') AS performed_at,
              ial.details,
              u.name AS performed_by_name
       FROM inhand_audit_log ial
       LEFT JOIN users u ON ial.performed_by = u.id
       WHERE ial.inhand_id = ?
       ORDER BY ial.id ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (error) {
    console.error('getAuditLog error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = {
  createInhand,
  getInhandList,
  getInhandById,
  updateInhand,
  submitInhand,
  approveInhand,
  cancelInhand,
  getAuditLog
};
