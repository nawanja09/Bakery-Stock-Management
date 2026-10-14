// server/controllers/intercompanyController.js
//
// Finance -> Intercompany Transaction.
//
// A pure movement of funds between two companies' Cash/Bank accounts
// (e.g. "JH Bank -> RD Cash"). This is NOT an expense and must never touch
// `expenses`, `petty_cash_vouchers` or `bank_charges` - the Expense Report
// (reportController.getExpensesReport) only reads those three tables, so
// keeping this feature out of them is what keeps it out of that report.
//
// Every transaction posts exactly two ordinary finance_transactions rows
// via the existing recordCashTransaction/recordBankTransaction helpers
// (the same ones Cash Receive, Bank Receive, Cash/Bank Transfer and
// Bank-to-Bank Transfer already use):
//   - a CREDIT (money OUT) on the From account
//   - a DEBIT  (money IN)  on the To account
// both tagged reference_type = 'INTERCOMPANY_TRANSFER' and
// reference_id = the intercompany_transactions row created for this
// transaction, which is the permanent audit-trail record. All of this
// happens inside one DB transaction, so the two ledger legs and the audit
// row can never disagree.
//
// From Company and To Company must be different - moving money between
// Cash and Bank within the SAME company is the existing Cash/Bank Transfer
// feature (financeController.transferFunds), not this one.

const pool = require('../config/db');
const { actorId } = require('../utils/actor');
const { recordCashTransaction, recordBankTransaction } = require('../utils/financeLedger');

const ACCOUNT_TYPES = ['CASH', 'BANK'];

const INTERCOMPANY_TRANSACTION_TYPE = 'Intercompany Transfer';
const INTERCOMPANY_REFERENCE_TYPE = 'INTERCOMPANY_TRANSFER';

const HISTORY_SELECT = `
  SELECT
    ict.id,
    DATE_FORMAT(ict.transaction_date, '%Y-%m-%d') AS transaction_date,
    ict.from_company_id,
    fc.name AS from_company_name,
    ict.from_account_type,
    fb.bank_name AS from_bank_name,
    fb.account_number AS from_bank_account_number,
    ict.from_balance_after,
    ict.to_company_id,
    tc.name AS to_company_name,
    ict.to_account_type,
    tb.bank_name AS to_bank_name,
    tb.account_number AS to_bank_account_number,
    ict.to_balance_after,
    ict.amount,
    ict.description,
    u.name AS created_by_name,
    ict.created_at
  FROM intercompany_transactions ict
  JOIN company fc ON fc.id = ict.from_company_id
  JOIN company tc ON tc.id = ict.to_company_id
  LEFT JOIN bank_details fb ON fb.id = ict.from_bank_id
  LEFT JOIN bank_details tb ON tb.id = ict.to_bank_id
  LEFT JOIN users u ON u.id = ict.created_by
  WHERE ict.status = 1
`;

// GET /api/finance/intercompany?companyId=&dateFrom=&dateTo=
// History / audit trail listing for the Intercompany Transaction page.
const getIntercompanyTransactions = async (req, res) => {
  try {
    const { companyId, dateFrom, dateTo } = req.query;
    const clauses = [];
    const params = [];

    if (companyId) {
      clauses.push('(ict.from_company_id = ? OR ict.to_company_id = ?)');
      params.push(companyId, companyId);
    }
    if (dateFrom) {
      clauses.push('ict.transaction_date >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      clauses.push('ict.transaction_date <= ?');
      params.push(dateTo);
    }

    const query = HISTORY_SELECT
      + (clauses.length ? ' AND ' + clauses.join(' AND ') : '')
      + ' ORDER BY ict.transaction_date DESC, ict.id DESC LIMIT 500';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching intercompany transactions:', error);
    res.status(500).json({ error: 'Failed to fetch intercompany transactions' });
  }
};

// POST /api/finance/intercompany
const createIntercompanyTransaction = async (req, res) => {
  const {
    from_company_id, from_account_type, from_bank_id,
    to_company_id, to_account_type, to_bank_id,
    amount, date, description
  } = req.body;
  const created_by = actorId(req); // never the client's created_by

  if (!from_company_id) return res.status(400).json({ error: 'From Company is required' });
  if (!to_company_id) return res.status(400).json({ error: 'To Company is required' });
  if (String(from_company_id) === String(to_company_id)) {
    return res.status(400).json({
      error: 'From Company and To Company must be different for an Intercompany Transaction. '
        + 'Use Cash / Bank Transfer to move funds within the same company.'
    });
  }
  if (!ACCOUNT_TYPES.includes(from_account_type)) return res.status(400).json({ error: 'From Item must be Cash or Bank' });
  if (!ACCOUNT_TYPES.includes(to_account_type)) return res.status(400).json({ error: 'To Item must be Cash or Bank' });
  if (from_account_type === 'BANK' && !from_bank_id) return res.status(400).json({ error: 'From Bank Account is required' });
  if (to_account_type === 'BANK' && !to_bank_id) return res.status(400).json({ error: 'To Bank Account is required' });
  if (!date) return res.status(400).json({ error: 'Transaction Date is required' });
  if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });
  if (!description || !String(description).trim()) return res.status(400).json({ error: 'Description / Reference is required' });
  if (!created_by) return res.status(400).json({ error: 'Created by is required' });

  const transferAmount = parseFloat(amount);
  const note = String(description).trim();

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // A Bank leg's account must actually belong to the company selected for
    // that side - otherwise "JH Bank" could silently debit/credit RD's bank
    // account if the wrong bank_id were ever sent.
    const verifyBankBelongsToCompany = async (bankId, companyId, label) => {
      const [rows] = await connection.query(
        `SELECT bd.id FROM bank_details bd
         JOIN company c ON c.name = bd.company
         WHERE bd.id = ? AND c.id = ? AND bd.status = 'Active' AND COALESCE(bd.record_status, 1) = 1
         FOR UPDATE`,
        [bankId, companyId]
      );
      if (rows.length === 0) {
        throw new Error(`${label} Bank Account does not belong to the selected ${label} Company`);
      }
    };

    if (from_account_type === 'BANK') await verifyBankBelongsToCompany(from_bank_id, from_company_id, 'From');
    if (to_account_type === 'BANK') await verifyBankBelongsToCompany(to_bank_id, to_company_id, 'To');

    // Create the audit-trail row first so both ledger legs can reference it.
    const [insertResult] = await connection.query(
      `INSERT INTO intercompany_transactions
        (from_company_id, from_account_type, from_bank_id,
         to_company_id, to_account_type, to_bank_id,
         amount, transaction_date, description, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        from_company_id, from_account_type, from_account_type === 'BANK' ? from_bank_id : null,
        to_company_id, to_account_type, to_account_type === 'BANK' ? to_bank_id : null,
        transferAmount, date, note, created_by
      ]
    );
    const intercompanyId = insertResult.insertId;

    // Deduct from the From account (credit = money out).
    const fromBalance = from_account_type === 'CASH'
      ? await recordCashTransaction(connection, {
          companyId: from_company_id,
          date,
          remark: note,
          credit: transferAmount,
          transactionType: INTERCOMPANY_TRANSACTION_TYPE,
          referenceType: INTERCOMPANY_REFERENCE_TYPE,
          referenceId: intercompanyId,
          createdBy: created_by
        })
      : await recordBankTransaction(connection, {
          bankId: from_bank_id,
          date,
          remark: note,
          credit: transferAmount,
          transactionType: INTERCOMPANY_TRANSACTION_TYPE,
          referenceType: INTERCOMPANY_REFERENCE_TYPE,
          referenceId: intercompanyId,
          createdBy: created_by
        });

    // Add to the To account (debit = money in).
    const toBalance = to_account_type === 'CASH'
      ? await recordCashTransaction(connection, {
          companyId: to_company_id,
          date,
          remark: note,
          debit: transferAmount,
          transactionType: INTERCOMPANY_TRANSACTION_TYPE,
          referenceType: INTERCOMPANY_REFERENCE_TYPE,
          referenceId: intercompanyId,
          createdBy: created_by
        })
      : await recordBankTransaction(connection, {
          bankId: to_bank_id,
          date,
          remark: note,
          debit: transferAmount,
          transactionType: INTERCOMPANY_TRANSACTION_TYPE,
          referenceType: INTERCOMPANY_REFERENCE_TYPE,
          referenceId: intercompanyId,
          createdBy: created_by
        });

    await connection.query(
      'UPDATE intercompany_transactions SET from_balance_after = ?, to_balance_after = ? WHERE id = ?',
      [fromBalance, toBalance, intercompanyId]
    );

    await connection.commit();

    res.status(201).json({
      message: 'Intercompany transaction recorded successfully!',
      id: intercompanyId,
      from_balance: fromBalance,
      to_balance: toBalance
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error recording intercompany transaction:', error);
    res.status(error.name === 'InsufficientBalanceError' ? 400 : 500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

module.exports = {
  getIntercompanyTransactions,
  createIntercompanyTransaction
};