// server/controllers/otherLedgerController.js
//
// Management -> Other Ledgers (master list) and Finance -> Other Ledgers (the
// per-ledger statement). Transactions are NOT created here: they are the linked
// impact of a Cash Receive (Other Ledger) or Cash Issued (see otherLedgerService
// and financeController / cashIssuedController). Balances are always derived.
const pool = require('../config/db');
const {
  OtherLedgerError,
  normalizeName,
  getLedgerBalance,
  round2
} = require('../services/otherLedgerService');

const NAME_MAX = 100;

const sendError = (res, error, fallback) => {
  if (error instanceof OtherLedgerError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
};

const LEDGER_WITH_BALANCE = `
  SELECT ol.id, ol.name, ol.status,
         COALESCE(SUM(CASE WHEN olt.status = 1
                           THEN CAST(olt.credit AS DECIMAL(14,2)) - CAST(olt.debit AS DECIMAL(14,2))
                           ELSE 0 END), 0) AS balance
    FROM other_ledgers ol
    LEFT JOIN other_ledger_transactions olt ON olt.other_ledger_id = ol.id
`;

const toLedgerRow = (row) => ({
  id: row.id,
  name: row.name,
  status: Number(row.status),
  balance: round2(row.balance)
});

// Case/whitespace-insensitive duplicate check among ACTIVE ledgers only.
const activeNameExists = async (queryable, name, excludeId = null) => {
  const [rows] = await queryable.query(
    `SELECT id FROM other_ledgers
      WHERE status = 1 AND LOWER(TRIM(name)) = LOWER(?)${excludeId ? ' AND id <> ?' : ''}
      LIMIT 1`,
    excludeId ? [name, excludeId] : [name]
  );
  return rows.length > 0;
};

const validateName = (raw) => {
  const name = normalizeName(raw);
  if (!name) throw new OtherLedgerError('Name is required');
  if (name.length > NAME_MAX) throw new OtherLedgerError(`Name cannot exceed ${NAME_MAX} characters`);
  return name;
};

// GET /api/other-ledgers  -> every ledger (Active first), with derived balance
const getOtherLedgers = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `${LEDGER_WITH_BALANCE} GROUP BY ol.id, ol.name, ol.status ORDER BY ol.status DESC, ol.name ASC`
    );
    res.json(rows.map(toLedgerRow));
  } catch (error) {
    sendError(res, error, 'Failed to fetch Other Ledgers');
  }
};

// GET /api/other-ledgers/active -> for new-transaction dropdowns
const getActiveOtherLedgers = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, status FROM other_ledgers WHERE status = 1 ORDER BY name ASC'
    );
    res.json(rows.map((r) => ({ id: r.id, name: r.name, status: Number(r.status) })));
  } catch (error) {
    sendError(res, error, 'Failed to fetch active Other Ledgers');
  }
};

// POST /api/other-ledgers
const createOtherLedger = async (req, res) => {
  try {
    const name = validateName(req.body?.name);
    if (await activeNameExists(pool, name)) {
      throw new OtherLedgerError('An active Other Ledger with this name already exists');
    }
    const [result] = await pool.query('INSERT INTO other_ledgers (name, status) VALUES (?, 1)', [name]);
    res.status(201).json({ message: 'Other Ledger created', id: result.insertId });
  } catch (error) {
    sendError(res, error, 'Failed to create Other Ledger');
  }
};

// PUT /api/other-ledgers/:id  (rename)
const updateOtherLedger = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const name = validateName(req.body?.name);
    const [rows] = await connection.query('SELECT id, status FROM other_ledgers WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!rows.length) throw new OtherLedgerError('Other Ledger not found', 404);
    if (Number(rows[0].status) === 1 && await activeNameExists(connection, name, req.params.id)) {
      throw new OtherLedgerError('An active Other Ledger with this name already exists');
    }
    await connection.query('UPDATE other_ledgers SET name = ? WHERE id = ?', [name, req.params.id]);

    // Cash Ledger rows created by this feature show the ledger name as Party;
    // keep that label current. Only rows linked to this ledger are touched.
    await connection.query(
      `UPDATE finance_transactions ft
         JOIN other_ledger_transactions olt
           ON olt.source_id = ft.id AND olt.source_type IN ('CASH_RECEIVE', 'CASH_ISSUED')
          SET ft.party_name = ?
        WHERE olt.other_ledger_id = ? AND ft.account_type = 'CASH'`,
      [name, req.params.id]
    );
    await connection.commit();
    res.json({ message: 'Other Ledger updated' });
  } catch (error) {
    await connection.rollback();
    sendError(res, error, 'Failed to update Other Ledger');
  } finally {
    connection.release();
  }
};

// PATCH /api/other-ledgers/:id/status  { status: 0 | 1 }
// Soft toggle only - a ledger is never hard-deleted, its history is kept.
const setOtherLedgerStatus = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const status = Number(req.body?.status);
    if (![0, 1].includes(status)) throw new OtherLedgerError('Status must be 1 (Active) or 0 (Inactive)');
    const [rows] = await connection.query('SELECT id, name FROM other_ledgers WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!rows.length) throw new OtherLedgerError('Other Ledger not found', 404);
    if (status === 1 && await activeNameExists(connection, rows[0].name, req.params.id)) {
      throw new OtherLedgerError('Another active Other Ledger already uses this name');
    }
    await connection.query('UPDATE other_ledgers SET status = ? WHERE id = ?', [status, req.params.id]);
    await connection.commit();
    res.json({ message: status === 1 ? 'Other Ledger activated' : 'Other Ledger made inactive' });
  } catch (error) {
    await connection.rollback();
    sendError(res, error, 'Failed to change Other Ledger status');
  } finally {
    connection.release();
  }
};

// GET /api/other-ledgers/:id/balance
const getOtherLedgerBalance = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, status FROM other_ledgers WHERE id = ?', [req.params.id]);
    if (!rows.length) throw new OtherLedgerError('Other Ledger not found', 404);
    res.json({ id: rows[0].id, name: rows[0].name, balance: await getLedgerBalance(pool, req.params.id) });
  } catch (error) {
    sendError(res, error, 'Failed to fetch Other Ledger balance');
  }
};

// GET /api/other-ledgers/:id/transactions?dateFrom=&dateTo=
// Oldest first; same-date rows by created_at then id. Running balance =
// previous + credit - debit, seeded with everything before dateFrom.
const getOtherLedgerTransactions = async (req, res) => {
  try {
    const [ledgers] = await pool.query('SELECT id, name, status FROM other_ledgers WHERE id = ?', [req.params.id]);
    if (!ledgers.length) throw new OtherLedgerError('Other Ledger not found', 404);

    const { dateFrom, dateTo } = req.query;
    const clauses = [];
    const params = [req.params.id];
    if (dateFrom) { clauses.push('olt.transaction_date >= ?'); params.push(dateFrom); }
    if (dateTo) { clauses.push('olt.transaction_date <= ?'); params.push(dateTo); }

    const [rows] = await pool.query(
      `SELECT olt.id, DATE_FORMAT(olt.transaction_date, '%Y-%m-%d') AS date,
              olt.debit, olt.credit, olt.source_type, olt.source_id,
              olt.company_id, c.name AS company_name,
              olt.reference_no, olt.remark, olt.created_at
         FROM other_ledger_transactions olt
         LEFT JOIN company c ON c.id = olt.company_id
        WHERE olt.other_ledger_id = ? AND olt.status = 1
          ${clauses.length ? `AND ${clauses.join(' AND ')}` : ''}
        ORDER BY olt.transaction_date ASC, olt.created_at ASC, olt.id ASC`,
      params
    );

    let opening = 0;
    if (dateFrom) {
      const [openRows] = await pool.query(
        `SELECT COALESCE(SUM(CAST(credit AS DECIMAL(14,2)) - CAST(debit AS DECIMAL(14,2))), 0) AS opening
           FROM other_ledger_transactions
          WHERE other_ledger_id = ? AND status = 1 AND transaction_date < ?`,
        [req.params.id, dateFrom]
      );
      opening = round2(openRows[0]?.opening);
    }

    let running = opening;
    const transactions = rows.map((row) => {
      running = round2(running + (Number(row.credit) || 0) - (Number(row.debit) || 0));
      return { ...row, balance: running };
    });

    res.json({
      ledger: { id: ledgers[0].id, name: ledgers[0].name, status: Number(ledgers[0].status) },
      opening_balance: opening,
      balance: await getLedgerBalance(pool, req.params.id),
      transactions
    });
  } catch (error) {
    sendError(res, error, 'Failed to fetch Other Ledger transactions');
  }
};

module.exports = {
  getOtherLedgers,
  getActiveOtherLedgers,
  createOtherLedger,
  updateOtherLedger,
  setOtherLedgerStatus,
  getOtherLedgerBalance,
  getOtherLedgerTransactions
};
