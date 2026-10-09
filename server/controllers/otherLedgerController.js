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
  withRunningBalance,
  BALANCE_EFFECT_SQL,
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
  SELECT ol.id, ol.name, ol.status, ol.is_system, ol.normal_balance,
         COALESCE(SUM(CASE WHEN olt.status = 1 THEN ${BALANCE_EFFECT_SQL} ELSE 0 END), 0) AS balance
    FROM other_ledgers ol
    LEFT JOIN other_ledger_transactions olt ON olt.other_ledger_id = ol.id
`;

const toLedgerRow = (row) => ({
  id: row.id,
  name: row.name,
  status: Number(row.status),
  is_system: Number(row.is_system) === 1,
  normal_balance: row.normal_balance || 'DEBIT',
  balance: round2(row.balance)
});

// The Collection module's system accounts (AR Account, Short/Excess Account)
// are posted to by name, so they cannot be renamed or made inactive.
const assertNotSystem = (row, action) => {
  if (Number(row.is_system) === 1) {
    throw new OtherLedgerError(`"${row.name}" is a system account used by Collection and cannot be ${action}`);
  }
};

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

// Optional positive integer id from a query/body value (null when absent).
const optionalId = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new OtherLedgerError('Invalid company');
  return id;
};

// Validates company_ids for create/edit: a non-empty list of existing companies.
const validateCompanyIds = async (queryable, raw) => {
  const ids = [...new Set((Array.isArray(raw) ? raw : []).map((v) => Number(v)))];
  if (!ids.length || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new OtherLedgerError('Select at least one company for this Other Ledger');
  }
  const [rows] = await queryable.query('SELECT id FROM company WHERE id IN (?)', [ids]);
  if (rows.length !== ids.length) throw new OtherLedgerError('One or more selected companies were not found');
  return ids;
};

// { ledgerId: [{ id, name }] } for every ledger's linked companies.
const loadLinkedCompanies = async (queryable) => {
  const [rows] = await queryable.query(
    `SELECT m.other_ledger_id, c.id, c.name
       FROM other_ledger_company_map m
       JOIN company c ON c.id = m.company_id
      ORDER BY c.name ASC`
  );
  return rows.reduce((acc, r) => {
    (acc[r.other_ledger_id] = acc[r.other_ledger_id] || []).push({ id: r.id, name: r.name });
    return acc;
  }, {});
};

// { ledgerId: { companyId: balance } } over active entries, kept per company.
const loadCompanyBalances = async (queryable) => {
  const [rows] = await queryable.query(
    `SELECT olt.other_ledger_id, olt.company_id, COALESCE(SUM(${BALANCE_EFFECT_SQL}), 0) AS balance
       FROM other_ledger_transactions olt
       JOIN other_ledgers ol ON ol.id = olt.other_ledger_id
      WHERE olt.status = 1 AND olt.company_id IS NOT NULL
      GROUP BY olt.other_ledger_id, olt.company_id`
  );
  return rows.reduce((acc, r) => {
    (acc[r.other_ledger_id] = acc[r.other_ledger_id] || {})[r.company_id] = round2(r.balance);
    return acc;
  }, {});
};

// GET /api/other-ledgers?companyId=  -> every ledger (Active first) with its
// linked companies and per-company balances. With companyId: only ledgers
// linked to that company, and `balance` is that company's balance.
const getOtherLedgers = async (req, res) => {
  try {
    const companyId = optionalId(req.query.companyId);
    const [rows] = await pool.query(
      `${LEDGER_WITH_BALANCE} GROUP BY ol.id, ol.name, ol.status, ol.is_system, ol.normal_balance ORDER BY ol.status DESC, ol.name ASC`
    );
    const companies = await loadLinkedCompanies(pool);
    const balances = await loadCompanyBalances(pool);
    const result = rows
      .map((row) => {
        const linked = companies[row.id] || [];
        const perCompany = balances[row.id] || {};
        return {
          ...toLedgerRow(row),
          companies: linked,
          company_balances: linked.map((c) => ({ company_id: c.id, company_name: c.name, balance: perCompany[c.id] || 0 })),
          ...(companyId ? { balance: perCompany[companyId] || 0 } : {})
        };
      })
      .filter((row) => !companyId || row.companies.some((c) => Number(c.id) === companyId));
    res.json(result);
  } catch (error) {
    sendError(res, error, 'Failed to fetch Other Ledgers');
  }
};

// GET /api/other-ledgers/active?companyId= -> for new-transaction dropdowns.
// With companyId (every transaction form sends it) only that company's ledgers.
const getActiveOtherLedgers = async (req, res) => {
  try {
    const companyId = optionalId(req.query.companyId);
    const [rows] = companyId
      ? await pool.query(
        `SELECT ol.id, ol.name, ol.status, ol.is_system
           FROM other_ledgers ol
           JOIN other_ledger_company_map m ON m.other_ledger_id = ol.id AND m.company_id = ?
          WHERE ol.status = 1 ORDER BY ol.name ASC`,
        [companyId]
      )
      : await pool.query('SELECT id, name, status, is_system FROM other_ledgers WHERE status = 1 ORDER BY name ASC');
    res.json(rows.map((r) => ({ id: r.id, name: r.name, status: Number(r.status), is_system: Number(r.is_system) === 1 })));
  } catch (error) {
    sendError(res, error, 'Failed to fetch active Other Ledgers');
  }
};

// POST /api/other-ledgers  { name, company_ids: [..] }
const createOtherLedger = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const name = validateName(req.body?.name);
    const companyIds = await validateCompanyIds(connection, req.body?.company_ids);
    if (await activeNameExists(connection, name)) {
      throw new OtherLedgerError('An active Other Ledger with this name already exists');
    }
    const [result] = await connection.query("INSERT INTO other_ledgers (name, status, normal_balance) VALUES (?, 1, 'DEBIT')", [name]);
    await connection.query(
      'INSERT INTO other_ledger_company_map (other_ledger_id, company_id) VALUES ?',
      [companyIds.map((companyId) => [result.insertId, companyId])]
    );
    await connection.commit();
    res.status(201).json({ message: 'Other Ledger created', id: result.insertId });
  } catch (error) {
    await connection.rollback();
    sendError(res, error, 'Failed to create Other Ledger');
  } finally {
    connection.release();
  }
};

// Replaces a ledger's company links. A company that already has active entries
// on this ledger cannot be unlinked - its history and balance must stay valid.
const syncCompanyLinks = async (connection, ledgerId, companyIds) => {
  const [current] = await connection.query(
    'SELECT company_id FROM other_ledger_company_map WHERE other_ledger_id = ? FOR UPDATE', [ledgerId]
  );
  const removed = current.map((r) => Number(r.company_id)).filter((id) => !companyIds.includes(id));
  if (removed.length) {
    const [used] = await connection.query(
      `SELECT DISTINCT c.name FROM other_ledger_transactions olt JOIN company c ON c.id = olt.company_id
        WHERE olt.other_ledger_id = ? AND olt.status = 1 AND olt.company_id IN (?)`,
      [ledgerId, removed]
    );
    if (used.length) {
      throw new OtherLedgerError(`Cannot unlink ${used.map((r) => r.name).join(', ')}: this ledger already has transactions for that company`);
    }
    await connection.query(
      'DELETE FROM other_ledger_company_map WHERE other_ledger_id = ? AND company_id IN (?)', [ledgerId, removed]
    );
  }
  await connection.query(
    'INSERT IGNORE INTO other_ledger_company_map (other_ledger_id, company_id) VALUES ?',
    [companyIds.map((companyId) => [ledgerId, companyId])]
  );
};

// PUT /api/other-ledgers/:id  { name, company_ids? }  (rename / change linked companies)
const updateOtherLedger = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const name = validateName(req.body?.name);
    const [rows] = await connection.query('SELECT id, name, status, is_system FROM other_ledgers WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!rows.length) throw new OtherLedgerError('Other Ledger not found', 404);
    assertNotSystem(rows[0], 'renamed');
    if (Number(rows[0].status) === 1 && await activeNameExists(connection, name, req.params.id)) {
      throw new OtherLedgerError('An active Other Ledger with this name already exists');
    }
    await connection.query('UPDATE other_ledgers SET name = ? WHERE id = ?', [name, req.params.id]);
    if (req.body?.company_ids !== undefined) {
      await syncCompanyLinks(connection, rows[0].id, await validateCompanyIds(connection, req.body.company_ids));
    }

    // Cash / Bank Ledger rows created by this feature show the ledger name as
    // Party; keep that label current. Only rows linked to this ledger are touched.
    await connection.query(
      `UPDATE finance_transactions ft
         JOIN other_ledger_transactions olt
           ON olt.source_id = ft.id AND olt.source_type IN ('CASH_RECEIVE', 'CASH_ISSUED')
          SET ft.party_name = ?
        WHERE olt.other_ledger_id = ? AND ft.account_type = 'CASH'`,
      [name, req.params.id]
    );
    await connection.query(
      `UPDATE finance_transactions ft
         JOIN other_ledger_transactions olt
           ON olt.source_id = ft.id AND olt.source_type IN ('BANK_RECEIVE', 'BANK_ISSUED')
          SET ft.party_name = ?
        WHERE olt.other_ledger_id = ? AND ft.account_type = 'BANK'`,
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

// Soft toggle only - a ledger is never hard-deleted, its history is kept.
const setOtherLedgerStatus = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const status = Number(req.body?.status);
    if (![0, 1].includes(status)) throw new OtherLedgerError('Status must be 1 (Active) or 0 (Inactive)');
    const [rows] = await connection.query('SELECT id, name, is_system FROM other_ledgers WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!rows.length) throw new OtherLedgerError('Other Ledger not found', 404);
    if (status === 0) assertNotSystem(rows[0], 'made inactive');
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

// GET /api/other-ledgers/:id/balance?companyId=
const getOtherLedgerBalance = async (req, res) => {
  try {
    const companyId = optionalId(req.query.companyId);
    const [rows] = await pool.query('SELECT id, name, status FROM other_ledgers WHERE id = ?', [req.params.id]);
    if (!rows.length) throw new OtherLedgerError('Other Ledger not found', 404);
    res.json({ id: rows[0].id, name: rows[0].name, company_id: companyId, balance: await getLedgerBalance(pool, req.params.id, companyId) });
  } catch (error) {
    sendError(res, error, 'Failed to fetch Other Ledger balance');
  }
};

// GET /api/other-ledgers/:id/transactions?companyId=&dateFrom=&dateTo=
// With companyId (the Finance page always sends it) only that company's entries,
// opening balance and balance are returned - companies are never mixed.
// Oldest first; same-date rows by created_at then id. Running balance =
// previous + debit - credit (every ledger is debit-normal: Cash/Bank Issued to
// the ledger is IN, Received from it is OUT), seeded with everything before dateFrom.
const getOtherLedgerTransactions = async (req, res) => {
  try {
    const [ledgers] = await pool.query(
      'SELECT id, name, status, is_system, normal_balance FROM other_ledgers WHERE id = ?', [req.params.id]
    );
    if (!ledgers.length) throw new OtherLedgerError('Other Ledger not found', 404);
    const normalBalance = ledgers[0].normal_balance || 'DEBIT';

    const { dateFrom, dateTo } = req.query;
    const companyId = optionalId(req.query.companyId);
    const clauses = [];
    const params = [req.params.id];
    if (companyId) { clauses.push('olt.company_id = ?'); params.push(companyId); }
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
        `SELECT COALESCE(SUM(${BALANCE_EFFECT_SQL}), 0) AS opening
           FROM other_ledger_transactions olt
           JOIN other_ledgers ol ON ol.id = olt.other_ledger_id
          WHERE olt.other_ledger_id = ? AND olt.status = 1 AND olt.transaction_date < ?${companyId ? ' AND olt.company_id = ?' : ''}`,
        companyId ? [req.params.id, dateFrom, companyId] : [req.params.id, dateFrom]
      );
      opening = round2(openRows[0]?.opening);
    }

    const transactions = withRunningBalance(rows, normalBalance, opening);

    res.json({
      ledger: {
        id: ledgers[0].id,
        name: ledgers[0].name,
        status: Number(ledgers[0].status),
        is_system: Number(ledgers[0].is_system) === 1,
        normal_balance: normalBalance
      },
      opening_balance: opening,
      company_id: companyId,
      balance: await getLedgerBalance(pool, req.params.id, companyId),
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
