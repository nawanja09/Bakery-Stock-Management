// server/controllers/cardLedgerController.js
//
// Finance -> Card Ledger. Two views over one table (card_transactions):
//   Pending   - not yet realised; has NO effect on any Bank Balance.
//   Completed - realised; carries its Realise Date and is reflected in the
//               Bank Ledger through the finance_transactions row it created.
// See services/cardLedgerService.js for the realise rules.

const pool = require('../config/db');
const { realiseCardTransaction } = require('../services/cardLedgerService');
const { HttpError, parseId } = require('../utils/staffLoanUtils');

const SELECT = `
  SELECT
    ct.id,
    DATE_FORMAT(ct.transaction_date, '%Y-%m-%d') AS transaction_date,
    ct.amount,
    ct.reference_number,
    ct.remark,
    ct.status,
    DATE_FORMAT(ct.realise_date, '%Y-%m-%d') AS realise_date,
    ct.finance_transaction_id,
    ct.company_id,
    c.name AS company_name,
    ct.bank_id,
    bd.bank_name,
    bd.account_number,
    ct.created_at
  FROM card_transactions ct
  LEFT JOIN company c ON c.id = ct.company_id
  LEFT JOIN bank_details bd ON bd.id = ct.bank_id
`;

const sendError = (res, error, fallback) => {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
};

// GET /api/finance/card-ledger?status=Pending|Completed&companyId=&bankId=&dateFrom=&dateTo=
// Pending is filtered on transaction date; Completed on realise date.
const getCardTransactions = async (req, res) => {
  try {
    const status = req.query.status === 'Completed' ? 'Completed' : 'Pending';
    const clauses = ['ct.status = ?'];
    const params = [status];
    const dateColumn = status === 'Completed' ? 'ct.realise_date' : 'ct.transaction_date';

    if (req.query.companyId) { clauses.push('ct.company_id = ?'); params.push(req.query.companyId); }
    if (req.query.bankId) { clauses.push('ct.bank_id = ?'); params.push(req.query.bankId); }
    if (req.query.dateFrom) { clauses.push(`${dateColumn} >= ?`); params.push(req.query.dateFrom); }
    if (req.query.dateTo) { clauses.push(`${dateColumn} <= ?`); params.push(req.query.dateTo); }

    const [rows] = await pool.query(
      `${SELECT} WHERE ${clauses.join(' AND ')} ORDER BY ${dateColumn} ASC, ct.id ASC`,
      params
    );

    const total = rows.reduce((sum, row) => sum + Math.round((Number.parseFloat(row.amount) || 0) * 100), 0) / 100;
    res.json({ status, total, transactions: rows });
  } catch (error) {
    sendError(res, error, 'Failed to fetch card transactions');
  }
};

// POST /api/finance/card-ledger/:id/realise   { realise_date: 'YYYY-MM-DD' }
const realiseTransaction = async (req, res) => {
  let connection;
  try {
    const id = parseId(req.params.id);
    if (!id) throw new HttpError(400, 'Invalid card transaction ID');

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const { bankBalance } = await realiseCardTransaction(connection, {
      id,
      realiseDate: (req.body || {}).realise_date,
      userId: req.user?.userId ?? null
    });

    await connection.commit();

    const [rows] = await pool.query(`${SELECT} WHERE ct.id = ?`, [id]);
    res.json({ message: 'Card transaction realised', transaction: rows[0], bankBalance });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    sendError(res, error, 'Failed to realise card transaction');
  } finally {
    if (connection) connection.release();
  }
};

module.exports = { getCardTransactions, realiseTransaction };
