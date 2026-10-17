// server/controllers/chequeRegistryController.js
//
// Centralized Expenses Cheque Registry — aggregates cheque records from:
//   BANK_TO_CASH       : Finance -> Cash/Bank Transfer (Bank to Cash + cheque number)
//   PURCHASING_PAYMENT : RM Purchasing -> Recording Payment (Payment Type = Cheque)
//   EXPENSE_PAYMENT    : New Expenses -> Payment Details (Payment Type = Cheque)
//
// Cheques remain Pending / Unreleased until explicitly released.
// When released, ledger entries are posted using the release_date and account balances updated.

const pool = require('../config/db');
const { actorId } = require('../utils/actor');
const { toYmd, todayYmd } = require('../utils/dateOnly');
const {
  postChequeRelease,
  unreleaseCheque,
  rebuildAccountBalance
} = require('../services/chequeReleaseService');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/cheque-registry
// Query params: dateFrom, dateTo, name, status
// ─────────────────────────────────────────────────────────────────────────────
const getChequeRegistry = async (req, res) => {
  try {
    const { dateFrom, dateTo, name, status, type } = req.query;

    let query = `
      SELECT
        ecr.id,
        ecr.source_type,
        ecr.type,
        ecr.source_id,
        DATE_FORMAT(ecr.date, '%Y-%m-%d')         AS date,
        ecr.name,
        ecr.cheque_number,
        ecr.amount,
        DATE_FORMAT(ecr.cheque_date, '%Y-%m-%d')  AS cheque_date,
        DATE_FORMAT(ecr.deposit_date, '%Y-%m-%d') AS deposit_date,
        ecr.slip_number,
        ecr.bank,
        DATE_FORMAT(ecr.release_date, '%Y-%m-%d') AS release_date,
        ecr.returned,
        ecr.status,
        ecr.created_at,
        ecr.updated_at
      FROM expenses_cheque_registry ecr
      WHERE ecr.status != 'Deleted'
    `;
    const params = [];

    if (dateFrom) {
      query += ' AND ecr.date >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      query += ' AND ecr.date <= ?';
      params.push(dateTo);
    }
    if (name && name.trim()) {
      query += ' AND ecr.name LIKE ?';
      params.push(`%${name.trim()}%`);
    }
    if (status && status.trim()) {
      query += ' AND ecr.status = ?';
      params.push(status.trim());
    }
    if (type && type.trim() && type.trim() !== 'All') {
      query += ' AND ecr.type = ?';
      params.push(type.trim());
    }

    query += ' ORDER BY ecr.date DESC, ecr.created_at DESC';

    const [rows] = await pool.query(query, params);
    res.json(rows || []);
  } catch (err) {
    console.error('Error fetching cheque registry:', err);
    res.status(500).json({ error: 'Failed to fetch cheque registry' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/finance/cheque-registry/:id
// Allows updating editable fields: deposit_date, release_date, returned,
// slip_number, cheque_date, status.
// Synchronizes ledger deduction only when status becomes 'Released'.
// ─────────────────────────────────────────────────────────────────────────────
const updateChequeRegistryRecord = async (req, res) => {
  const { id } = req.params;
  const { deposit_date, release_date, returned, slip_number, cheque_date, status } = req.body;
  let connection;

  // An unreadable date would otherwise be stored / posted as 0000-00-00.
  if (release_date !== undefined && release_date !== null && release_date !== '' && !toYmd(release_date)) {
    return res.status(400).json({ error: 'Release date must be a valid date (YYYY-MM-DD)' });
  }
  const releaseYmd = release_date ? toYmd(release_date) : null;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [existing] = await connection.query(
      "SELECT * FROM expenses_cheque_registry WHERE id = ? AND status != 'Deleted' FOR UPDATE",
      [id]
    );
    if (existing.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ error: 'Cheque registry record not found' });
    }

    const current = existing[0];
    const isNowReturned = returned !== undefined ? !!returned : !!current.returned;
    const requestedStatus = status !== undefined ? status : current.status;
    // Always 'YYYY-MM-DD' (current.release_date is a Date object from the DB).
    const requestedReleaseDate = release_date !== undefined ? releaseYmd : toYmd(current.release_date);

    // Handle transition to Returned
    if (isNowReturned && (!current.returned || current.status !== 'Returned')) {
      await unreleaseCheque(connection, current, 'Returned');
    }
    // Handle transition to Released (either explicit status = 'Released' or setting release_date with status = 'Released')
    else if (requestedStatus === 'Released' && !isNowReturned) {
      const effectiveDate = requestedReleaseDate || toYmd(current.release_date) || todayYmd();
      await postChequeRelease(connection, current, effectiveDate, { actorUserId: actorId(req) });
    }
    // Handle transition back to Pending/Unreleased
    else if (requestedStatus === 'Pending' && current.status === 'Released') {
      await unreleaseCheque(connection, current, 'Pending');
    }
    // If already released, but release date changed
    else if (current.status === 'Released' && requestedReleaseDate && requestedReleaseDate !== toYmd(current.release_date)) {
      await postChequeRelease(connection, current, requestedReleaseDate, { actorUserId: actorId(req) });
    }

    // Update metadata fields on expenses_cheque_registry
    const updates = [];
    const vals = [];

    if (deposit_date !== undefined) { updates.push('deposit_date = ?'); vals.push(deposit_date || null); }
    if (slip_number !== undefined)  { updates.push('slip_number = ?');  vals.push(slip_number ? slip_number.trim() : null); }
    if (cheque_date !== undefined)  { updates.push('cheque_date = ?');  vals.push(cheque_date || null); }
    if (returned !== undefined)     { updates.push('returned = ?');     vals.push(returned ? 1 : 0); }

    // If status or release_date were updated but not already handled by postChequeRelease/unreleaseCheque
    if (status !== undefined && status !== 'Released' && status !== 'Returned' && status !== 'Pending') {
      updates.push('status = ?');
      vals.push(status);
    }
    if (release_date !== undefined && requestedStatus !== 'Released') {
      updates.push('release_date = ?');
      vals.push(releaseYmd);
    }

    if (updates.length > 0) {
      vals.push(id);
      await connection.query(
        `UPDATE expenses_cheque_registry SET ${updates.join(', ')} WHERE id = ?`,
        vals
      );
    }

    await connection.commit();
    connection.release();

    res.json({ message: 'Cheque registry record updated successfully' });
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      connection.release();
    }
    console.error('Error updating cheque registry record:', err);
    res.status(500).json({ error: err.message || 'Failed to update cheque registry record' });
  }
};

module.exports = { getChequeRegistry, updateChequeRegistryRecord };