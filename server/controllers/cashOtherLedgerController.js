// server/controllers/cashOtherLedgerController.js
//
// Cash Issued (Cash Out to an Other Ledger) plus edit/void for Cash Receives
// that were classified as an Other Ledger.
//
// The finance_transactions (Cash Ledger) row is always the PRIMARY transaction;
// the Other Ledger entry is its linked impact (see services/otherLedgerService).
//   Cash Issued  -> Cash CREDIT, Other Ledger DEBIT
//   Cash Receive -> Cash DEBIT,  Other Ledger CREDIT   (created in financeController.receiveCash)
//
// Existing Cash Receives (Receive Type) have no linked impact and are NOT
// handled here: they keep their existing edit path (Adjustments) untouched.
const pool = require('../config/db');
const { actorId } = require('../utils/actor');
const { recordCashTransaction } = require('../utils/financeLedger');
const { checkDuplicateReference } = require('../services/referenceValidationService');
const ol = require('../services/otherLedgerService');

const REFERENCE_MAX = 100;
const REMARK_MAX = 255;

const sendError = (res, error, fallback) => {
  if (error instanceof ol.OtherLedgerError) return res.status(error.statusCode).json({ error: error.message });
  if (error.name === 'DuplicateReferenceError') return res.status(400).json({ error: error.message });
  console.error(fallback, error);
  return res.status(500).json({ error: error.message || fallback });
};

const isValidDate = (date) => {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === String(date);
};

// Validates the shared fields; throws OtherLedgerError (400) with a clear message.
const readCommonFields = (body) => {
  if (!isValidDate(body.date)) throw new ol.OtherLedgerError('A valid date is required');
  const amount = ol.round2(body.amount);
  if (!(amount > 0) || amount > 999999999999.99) {
    throw new ol.OtherLedgerError('Amount must be greater than 0');
  }
  const reference = body.reference_number == null || String(body.reference_number).trim() === ''
    ? null : String(body.reference_number).trim();
  const remark = body.remark == null || String(body.remark).trim() === '' ? null : String(body.remark).trim();
  if (reference && reference.length > REFERENCE_MAX) {
    throw new ol.OtherLedgerError(`Reference number cannot exceed ${REFERENCE_MAX} characters`);
  }
  if (remark && remark.length > REMARK_MAX) {
    throw new ol.OtherLedgerError(`Remark cannot exceed ${REMARK_MAX} characters`);
  }
  return { date: String(body.date), amount, reference, remark };
};

const ISSUED_SELECT = `
  SELECT ft.id, DATE_FORMAT(ft.transaction_date, '%Y-%m-%d') AS date, ft.company_id,
         c.name AS company_name, ft.credit AS amount, ft.reference_number, ft.remark,
         olt.other_ledger_id, ol.name AS other_ledger_name, ol.status AS other_ledger_status,
         u.name AS created_by_name, ft.created_at
    FROM finance_transactions ft
    JOIN other_ledger_transactions olt
      ON olt.source_type = 'CASH_ISSUED' AND olt.source_id = ft.id AND olt.status = 1
    JOIN other_ledgers ol ON ol.id = olt.other_ledger_id
    LEFT JOIN company c ON c.id = ft.company_id
    LEFT JOIN users u ON u.id = ft.created_by
   WHERE ft.account_type = 'CASH' AND ft.reference_type = 'CASH_ISSUED' AND ft.status = 1
`;

// POST /api/finance/cash/issued
const createCashIssued = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { company_id: companyId, other_ledger_id: otherLedgerId } = req.body;
    const createdBy = actorId(req); // never the client's created_by
    if (!companyId) throw new ol.OtherLedgerError('Company is required');
    if (!createdBy) throw new ol.OtherLedgerError('Created by is required');
    const { date, amount, reference, remark } = readCommonFields(req.body);

    await connection.beginTransaction();
    const [companies] = await connection.query('SELECT id FROM company WHERE id = ?', [companyId]);
    if (!companies.length) throw new ol.OtherLedgerError('Company not found', 404);
    await checkDuplicateReference(connection, reference, { includeLedger: true });
    const ledger = await ol.requireActiveLedger(connection, otherLedgerId, { companyId });

    // Cash Ledger CREDIT - money leaves the company (the primary transaction).
    const balance = await recordCashTransaction(connection, {
      companyId, date, remark, credit: amount,
      transactionType: ol.CASH_ISSUED_TYPE,
      referenceNumber: reference,
      partyName: ledger.name,
      referenceType: 'CASH_ISSUED',
      createdBy
    });
    const sourceId = await ol.lastInsertId(connection);
    const [check] = await connection.query(
      `SELECT id FROM finance_transactions
        WHERE id = ? AND account_type = 'CASH' AND reference_type = 'CASH_ISSUED' AND credit = ?`,
      [sourceId, amount]
    );
    if (!check.length) throw new Error('Cash Ledger entry was not created for the Cash Issued transaction');

    // Linked Other Ledger DEBIT - the amount owed to the party is reduced.
    await ol.createImpact(connection, {
      otherLedgerId: ledger.id, sourceType: ol.SOURCE_CASH_ISSUED, sourceId,
      date, amount, companyId, referenceNo: reference, remark, createdBy
    });

    await connection.commit();
    res.status(201).json({ message: 'Cash issued recorded successfully!', id: sourceId, balance });
  } catch (error) {
    await connection.rollback();
    sendError(res, error, 'Failed to record cash issued');
  } finally {
    connection.release();
  }
};

// GET /api/finance/cash/issued?companyId=&otherLedgerId=&dateFrom=&dateTo=
const getCashIssuedList = async (req, res) => {
  try {
    const clauses = [];
    const params = [];
    if (req.query.companyId) { clauses.push('ft.company_id = ?'); params.push(req.query.companyId); }
    if (req.query.otherLedgerId) { clauses.push('olt.other_ledger_id = ?'); params.push(req.query.otherLedgerId); }
    if (req.query.dateFrom) { clauses.push('ft.transaction_date >= ?'); params.push(req.query.dateFrom); }
    if (req.query.dateTo) { clauses.push('ft.transaction_date <= ?'); params.push(req.query.dateTo); }
    const [rows] = await pool.query(
      `${ISSUED_SELECT}${clauses.length ? ` AND ${clauses.join(' AND ')}` : ''}
       ORDER BY ft.transaction_date ASC, ft.created_at ASC, ft.id ASC`,
      params
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error, 'Failed to fetch cash issued');
  }
};

// GET /api/finance/cash/issued/:id
const getCashIssuedById = async (req, res) => {
  try {
    const [rows] = await pool.query(`${ISSUED_SELECT} AND ft.id = ?`, [req.params.id]);
    if (!rows.length) throw new ol.OtherLedgerError('Cash Issued record not found', 404);
    res.json(rows[0]);
  } catch (error) {
    sendError(res, error, 'Failed to fetch cash issued');
  }
};

// Loads + locks the source finance row and its linked impact for edit/void.
const loadLinked = async (connection, { id, sourceType, referenceType }) => {
  const [rows] = await connection.query(
    `SELECT id, company_id, status FROM finance_transactions
      WHERE id = ? AND account_type = 'CASH' AND reference_type = ? AND status = 1 FOR UPDATE`,
    [id, referenceType]
  );
  if (!rows.length) return null;
  const impact = await ol.getImpactBySource(connection, sourceType, id, { forUpdate: true });
  if (!impact || Number(impact.status) !== 1) return null;
  return { source: rows[0], impact };
};

// PUT /api/finance/cash/issued/:id  - updates the SAME source row and its linked impact.
const updateCashIssued = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { date, amount, reference, remark } = readCommonFields(req.body);
    await connection.beginTransaction();
    const linked = await loadLinked(connection, {
      id: req.params.id, sourceType: ol.SOURCE_CASH_ISSUED, referenceType: 'CASH_ISSUED'
    });
    if (!linked) throw new ol.OtherLedgerError('Cash Issued record not found', 404);

    await checkDuplicateReference(connection, reference, {
      includeLedger: true, table: 'finance_transactions', id: req.params.id
    });

    // Changing the ledger is allowed only to an ACTIVE one; keeping the current
    // ledger is always allowed (even if it has since been made inactive).
    let ledger = await ol.getLedgerById(connection, linked.impact.other_ledger_id);
    const requested = req.body.other_ledger_id;
    if (requested !== undefined && requested !== null && requested !== '' &&
        Number(requested) !== Number(linked.impact.other_ledger_id)) {
      ledger = await ol.requireActiveLedger(connection, requested, { companyId: linked.source.company_id });
      await connection.query('UPDATE other_ledger_transactions SET other_ledger_id = ? WHERE id = ?', [ledger.id, linked.impact.id]);
    }

    await connection.query(
      `UPDATE finance_transactions
          SET transaction_date = ?, credit = ?, debit = 0, reference_number = ?, remark = ?,
              party_name = ?, transaction_direction = 'OUT'
        WHERE id = ?`,
      [date, amount, reference, remark, ledger.name, req.params.id]
    );
    await ol.syncImpactFromSource(connection, ol.SOURCE_CASH_ISSUED, req.params.id, {
      date, amount, referenceNo: reference, remark
    });
    const balance = await ol.recalculateCashBalance(connection, linked.source.company_id);

    await connection.commit();
    res.json({ message: 'Cash issued updated successfully', balance });
  } catch (error) {
    await connection.rollback();
    sendError(res, error, 'Failed to update cash issued');
  } finally {
    connection.release();
  }
};

// DELETE /api/finance/cash/issued/:id  - void (soft), keeps history.
const voidCashIssued = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const linked = await loadLinked(connection, {
      id: req.params.id, sourceType: ol.SOURCE_CASH_ISSUED, referenceType: 'CASH_ISSUED'
    });
    if (!linked) throw new ol.OtherLedgerError('Cash Issued record not found', 404);

    await connection.query('UPDATE finance_transactions SET status = 0 WHERE id = ?', [req.params.id]);
    await ol.voidImpactForSource(connection, ol.SOURCE_CASH_ISSUED, req.params.id);
    const balance = await ol.recalculateCashBalance(connection, linked.source.company_id);

    await connection.commit();
    res.json({ message: 'Cash issued voided', balance });
  } catch (error) {
    await connection.rollback();
    sendError(res, error, 'Failed to void cash issued');
  } finally {
    connection.release();
  }
};

// PUT /api/finance/cash/receive/:id - edit a Cash Receive that was classified as an
// Other Ledger. Plain Receive-Type receipts are rejected here: they keep their
// existing behaviour (edited through Adjustments).
const updateOtherLedgerCashReceive = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { date, amount, reference, remark } = readCommonFields(req.body);
    await connection.beginTransaction();
    const linked = await loadLinked(connection, {
      id: req.params.id, sourceType: ol.SOURCE_CASH_RECEIVE, referenceType: 'CASH_RECEIVE'
    });
    if (!linked) {
      throw new ol.OtherLedgerError('Only Cash Receives classified as an Other Ledger can be edited here', 404);
    }
    await checkDuplicateReference(connection, reference, {
      includeLedger: true, table: 'finance_transactions', id: req.params.id
    });

    await connection.query(
      `UPDATE finance_transactions
          SET transaction_date = ?, debit = ?, credit = 0, reference_number = ?, remark = ?
        WHERE id = ?`,
      [date, amount, reference, remark, req.params.id]
    );
    await ol.syncImpactFromSource(connection, ol.SOURCE_CASH_RECEIVE, req.params.id, {
      date, amount, referenceNo: reference, remark
    });
    const balance = await ol.recalculateCashBalance(connection, linked.source.company_id);

    await connection.commit();
    res.json({ message: 'Cash receipt updated successfully', balance });
  } catch (error) {
    await connection.rollback();
    sendError(res, error, 'Failed to update cash receipt');
  } finally {
    connection.release();
  }
};

// DELETE /api/finance/cash/receive/:id - void an Other Ledger Cash Receive (soft).
const voidOtherLedgerCashReceive = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const linked = await loadLinked(connection, {
      id: req.params.id, sourceType: ol.SOURCE_CASH_RECEIVE, referenceType: 'CASH_RECEIVE'
    });
    if (!linked) {
      throw new ol.OtherLedgerError('Only Cash Receives classified as an Other Ledger can be voided here', 404);
    }
    await connection.query('UPDATE finance_transactions SET status = 0 WHERE id = ?', [req.params.id]);
    await ol.voidImpactForSource(connection, ol.SOURCE_CASH_RECEIVE, req.params.id);
    const balance = await ol.recalculateCashBalance(connection, linked.source.company_id);

    await connection.commit();
    res.json({ message: 'Cash receipt voided', balance });
  } catch (error) {
    await connection.rollback();
    sendError(res, error, 'Failed to void cash receipt');
  } finally {
    connection.release();
  }
};

module.exports = {
  createCashIssued,
  getCashIssuedList,
  getCashIssuedById,
  updateCashIssued,
  voidCashIssued,
  updateOtherLedgerCashReceive,
  voidOtherLedgerCashReceive
};
