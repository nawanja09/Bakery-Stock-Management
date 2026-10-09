// server/controllers/cardLedgerController.js
//
// Finance -> Card Ledger. Two views over one table (card_transactions):
//   Pending   - not yet realised; has NO effect on any Bank Balance.
//   Completed - realised; shows the Realise Date / Realise Amount and the
//               figures saved on the realisation record (Expected Commission
//               and Remaining Balance / Bank Charge).
// Both can be filtered by Company, Bank Account, Shift No, Branch / Department
// and date. See services/cardLedgerService.js for the realise rules.

const pool = require('../config/db');
const { realiseCardTransactions, previewCommission, displayRemark } = require('../services/cardLedgerService');
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
    ct.department_id,
    d.name AS department_name,
    ct.shift_no,
    ct.created_at
  FROM card_transactions ct
  LEFT JOIN company c ON c.id = ct.company_id
  LEFT JOIN bank_details bd ON bd.id = ct.bank_id
  LEFT JOIN departments d ON d.id = ct.department_id
`;

// Completed: one row per realisation (it may cover several card transactions).
// Every figure comes from the saved realisation record (the server calculated
// total_amount, commission_amount and remaining_balance when it was realised).
// commission_amount is NULL for realisations saved before the commission split
// (their remaining balance went to one "Visa Card Payment" hidden expense).
const COMPLETED_SELECT = `
  SELECT
    cr.id,
    DATE_FORMAT(cr.realise_date, '%Y-%m-%d') AS realise_date,
    cr.total_amount,
    cr.realise_amount,
    cr.commission_amount,
    cr.remaining_balance,
    cr.reference_number,
    cr.finance_transaction_id,
    cr.hidden_expense_id,
    cr.commission_expense_id,
    cr.bank_charge_expense_id,
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

// Filters shared by both tabs. Shift No / Branch / Department of a Completed
// realisation = those of the card transactions it covers.
//   departmentId=none -> rows without a Branch / Department.
const filterClauses = (query, completed) => {
  const alias = completed ? 'cr' : 'ct';
  const dateColumn = completed ? 'cr.realise_date' : 'ct.transaction_date';
  const clauses = [];
  const params = [];
  if (!completed) clauses.push("ct.status = 'Pending'");

  if (query.companyId) { clauses.push(`${alias}.company_id = ?`); params.push(query.companyId); }
  if (query.bankId) { clauses.push(`${alias}.bank_id = ?`); params.push(query.bankId); }
  if (query.dateFrom) { clauses.push(`${dateColumn} >= ?`); params.push(query.dateFrom); }
  if (query.dateTo) { clauses.push(`${dateColumn} <= ?`); params.push(query.dateTo); }

  // Conditions on the card rows themselves (`x` = card_transactions).
  const cardClauses = [];
  if (query.departmentId === 'none') {
    cardClauses.push(['x.department_id IS NULL']);
  } else if (query.departmentId) {
    cardClauses.push(['x.department_id = ?', query.departmentId]);
  }
  const shiftNo = String(query.shiftNo ?? '').trim();
  if (shiftNo) cardClauses.push(['x.shift_no LIKE ?', `%${shiftNo.replace(/[\\%_]/g, '\\$&')}%`]);

  if (cardClauses.length > 0) {
    const sql = cardClauses.map(([clause]) => clause).join(' AND ');
    if (completed) {
      clauses.push(`EXISTS (SELECT 1 FROM card_transactions x WHERE x.realisation_id = cr.id AND ${sql})`);
    } else {
      clauses.push(sql.replace(/\bx\./g, 'ct.'));
    }
    cardClauses.forEach(([, ...values]) => params.push(...values));
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params, dateColumn };
};

// GET /api/finance/card-ledger?status=Pending|Completed&companyId=&bankId=&departmentId=&shiftNo=&dateFrom=&dateTo=
// Pending is filtered on transaction date; Completed on realise date.
const getCardTransactions = async (req, res) => {
  try {
    const completed = req.query.status === 'Completed';
    const { where, params, dateColumn } = filterClauses(req.query, completed);

    if (!completed) {
      const [rows] = await pool.query(`${PENDING_SELECT} ${where} ORDER BY ${dateColumn} ASC, ct.id ASC`, params);
      // Sale ID, collection card label and Shift No are not shown in the Remark.
      const transactions = rows.map((row) => ({ ...row, remark: displayRemark(row.remark) }));
      const total = rows.reduce((t, row) => t + cents(row.amount), 0) / 100;
      return res.json({ status: 'Pending', total, totals: { amount: total }, transactions });
    }

    const [rows] = await pool.query(`${COMPLETED_SELECT} ${where} ORDER BY ${dateColumn} ASC, cr.id ASC`, params);

    // The card transactions each realisation covers (shown as stacked lines).
    const byRealisation = new Map();
    if (rows.length > 0) {
      const [cards] = await pool.query(
        `SELECT x.id, x.realisation_id, DATE_FORMAT(x.transaction_date, '%Y-%m-%d') AS transaction_date,
                x.reference_number, x.amount, x.shift_no, x.department_id, d.name AS department_name, x.commission_rate
           FROM card_transactions x
           LEFT JOIN departments d ON d.id = x.department_id
          WHERE x.realisation_id IN (?)
          ORDER BY x.transaction_date ASC, x.id ASC`,
        [rows.map((r) => r.id)]
      );
      cards.forEach((card) => {
        if (!byRealisation.has(card.realisation_id)) byRealisation.set(card.realisation_id, []);
        byRealisation.get(card.realisation_id).push(card);
      });
    }
    const transactions = rows.map((row) => {
      const covered = byRealisation.get(row.id) || [];
      const departments = [...new Set(covered.map((c) => c.department_name).filter(Boolean))];
      return { ...row, departments, cards: covered };
    });

    const sum = (pick) => rows.reduce((t, row) => t + cents(pick(row)), 0) / 100;
    const totals = {
      total_amount: sum((r) => r.total_amount),
      commission_amount: sum((r) => r.commission_amount),
      realise_amount: sum((r) => r.realise_amount),
      remaining_balance: sum((r) => r.remaining_balance)
    };
    res.json({ status: 'Completed', total: totals.total_amount, totals, transactions });
  } catch (error) {
    sendError(res, error, 'Failed to fetch card transactions');
  }
};

// GET /api/finance/card-ledger/commission?ids=1,2,3[&departmentId=]
// Realise dialog: Total, Branch / Department, Credit Card Rate and Expected
// Commission of the selection, read from the database. departmentId is the
// Branch / Department chosen for rows that have none. Read-only.
const getCommissionPreview = async (req, res) => {
  try {
    const ids = String(req.query.ids ?? '').split(',').map((v) => v.trim()).filter(Boolean);
    const preview = await previewCommission(pool, { transactionIds: ids, departmentId: req.query.departmentId });
    res.json(preview);
  } catch (error) {
    sendError(res, error, 'Failed to calculate the card commission');
  }
};

// POST /api/finance/card-ledger/realise
//   { transaction_ids: [1, 2, 3], realise_amount: '9700.00', realise_date: 'YYYY-MM-DD',
//     department_id: 4 }   <- optional: Branch / Department for rows that have none
// The browser's totals are never trusted: the server sums the selected rows,
// applies each department's active Credit Card Rate, validates the Realise
// Amount and derives the Remaining Balance (bank charge). Bank debit, hidden
// expenses and status changes are ONE database transaction: any failure rolls
// the whole realisation back.
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
      departmentId: body.department_id,
      userId: req.user?.userId ?? null
    });

    await connection.commit();

    const count = outcome.transactionIds.length;
    res.json({
      message: count === 1 ? 'Card transaction realised' : `${count} card transactions realised`,
      realisation_id: outcome.realisationId,
      transaction_ids: outcome.transactionIds,
      totals: outcome.totals,
      commission_groups: outcome.commissionGroups,
      commission_expense_id: outcome.commissionExpenseId,
      bank_charge_expense_id: outcome.bankChargeExpenseId
    });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    sendError(res, error, 'Failed to realise card transactions');
  } finally {
    if (connection) connection.release();
  }
};

module.exports = { getCardTransactions, getCommissionPreview, realiseTransactions };
