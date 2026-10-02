// server/controllers/cardLedgerController.js
//
// Finance -> Card Ledger. Two views over one table (card_transactions):
//   Pending   - not yet realised; has NO effect on any Bank Balance.
//   Completed - realised; shows the Realise Date / Realise Amount and the
//               figures saved on the realisation record.
// See services/cardLedgerService.js for the realise rules.

const pool = require('../config/db');
const { realiseCardTransactions } = require('../services/cardLedgerService');
const { HttpError } = require('../utils/staffLoanUtils');

// Pending: one row per card transaction.
const PENDING_SELECT = `
  SELECT
    ct.id,
    DATE_FORMAT(ct.transaction_date, '%Y-%m-%d') AS transaction_date,
    ct.amount,
    ct.reference_number,
    ct.remark,
    ct.status,
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

// Completed: one row per realisation (it may cover several card transactions).
// Every figure comes from the saved realisation record (the server calculated
// total_amount and remaining_balance when it was realised).
const COMPLETED_SELECT = `
  SELECT
    cr.id,
    DATE_FORMAT(cr.realise_date, '%Y-%m-%d') AS realise_date,
    cr.total_amount,
    cr.realise_amount,
    cr.remaining_balance,
    cr.reference_number,
    cr.finance_transaction_id,
    cr.hidden_expense_id,
    cr.company_id,
    c.name AS company_name,
    cr.bank_id,
    bd.bank_name,
    bd.account_number
  FROM card_realisations cr
  LEFT JOIN company c ON c.id = cr.company_id
  LEFT JOIN bank_details bd ON bd.id = cr.bank_id
`;

const cents = (value) => Math.round((Number.parseFloat(value) || 0) * 100);

const sendError = (res, error, fallback) => {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
};

// GET /api/finance/card-ledger?status=Pending|Completed&companyId=&bankId=&dateFrom=&dateTo=
// Pending is filtered on transaction date; Completed on realise date.
const getCardTransactions = async (req, res) => {
  try {
    const completed = req.query.status === 'Completed';
    const alias = completed ? 'cr' : 'ct';
    const dateColumn = completed ? 'cr.realise_date' : 'ct.transaction_date';
    const clauses = [];
    const params = [];
    if (!completed) clauses.push("ct.status = 'Pending'");

    if (req.query.companyId) { clauses.push(`${alias}.company_id = ?`); params.push(req.query.companyId); }
    if (req.query.bankId) { clauses.push(`${alias}.bank_id = ?`); params.push(req.query.bankId); }
    if (req.query.dateFrom) { clauses.push(`${dateColumn} >= ?`); params.push(req.query.dateFrom); }
    if (req.query.dateTo) { clauses.push(`${dateColumn} <= ?`); params.push(req.query.dateTo); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    if (!completed) {
      const [rows] = await pool.query(`${PENDING_SELECT} ${where} ORDER BY ${dateColumn} ASC, ct.id ASC`, params);
      const total = rows.reduce((t, row) => t + cents(row.amount), 0) / 100;
      return res.json({ status: 'Pending', total, totals: { amount: total }, transactions: rows });
    }

    const [rows] = await pool.query(`${COMPLETED_SELECT} ${where} ORDER BY ${dateColumn} ASC, cr.id ASC`, params);

    // The card transactions each realisation covers (shown as stacked lines).
    const byRealisation = new Map();
    if (rows.length > 0) {
      const [cards] = await pool.query(
        `SELECT id, realisation_id, DATE_FORMAT(transaction_date, '%Y-%m-%d') AS transaction_date,
                reference_number, amount
           FROM card_transactions
          WHERE realisation_id IN (?)
          ORDER BY transaction_date ASC, id ASC`,
        [rows.map((r) => r.id)]
      );
      cards.forEach((card) => {
        if (!byRealisation.has(card.realisation_id)) byRealisation.set(card.realisation_id, []);
        byRealisation.get(card.realisation_id).push(card);
      });
    }
    const transactions = rows.map((row) => ({ ...row, cards: byRealisation.get(row.id) || [] }));

    const sum = (pick) => rows.reduce((t, row) => t + cents(pick(row)), 0) / 100;
    const totals = {
      total_amount: sum((r) => r.total_amount),
      realise_amount: sum((r) => r.realise_amount),
      remaining_balance: sum((r) => r.remaining_balance)
    };
    res.json({ status: 'Completed', total: totals.total_amount, totals, transactions });
  } catch (error) {
    sendError(res, error, 'Failed to fetch card transactions');
  }
};

// POST /api/finance/card-ledger/realise
//   { transaction_ids: [1, 2, 3], realise_amount: '70000.00', realise_date: 'YYYY-MM-DD' }
// The browser's totals are never trusted: the server sums the selected rows,
// validates the Realise Amount against that total and derives the Remaining
// Balance. Bank debit, hidden expense and status changes are ONE database
// transaction: any failure rolls the whole realisation back.
const realiseTransactions = async (req, res) => {
  let connection;
  try {
    const body = req.body || {};
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const outcome = await realiseCardTransactions(connection, {
      transactionIds: body.transaction_ids,
      realiseAmount: body.realise_amount,
      realiseDate: body.realise_date,
      userId: req.user?.userId ?? null
    });

    await connection.commit();

    const count = outcome.transactionIds.length;
    res.json({
      message: count === 1 ? 'Card transaction realised' : `${count} card transactions realised`,
      realisation_id: outcome.realisationId,
      transaction_ids: outcome.transactionIds,
      totals: outcome.totals
    });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    sendError(res, error, 'Failed to realise card transactions');
  } finally {
    if (connection) connection.release();
  }
};

module.exports = { getCardTransactions, realiseTransactions };
