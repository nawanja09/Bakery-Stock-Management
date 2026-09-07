const pool = require('../config/db');

const VALID_METHODS = new Set(['all', 'petty_cash', 'bank_charges', 'purchasing', 'other_expenses']);
const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const dateFilters = (fromDate, toDate) => {
  if (fromDate && !isValidDate(fromDate)) throw new Error('Invalid from date');
  if (toDate && !isValidDate(toDate)) throw new Error('Invalid to date');
  if (fromDate && toDate && fromDate > toDate) throw new Error('From date cannot be after to date');
};
const number = (value) => Number.parseFloat(value || 0) || 0;

const getIncomes = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    dateFilters(fromDate, toDate);
    const clauses = [
      "ft.status = 1", "ft.debit > 0",
      "COALESCE(ft.reference_type, '') NOT IN ('PETTY_CASH_VOUCHER', 'BANK_CHARGE', 'EXPENSE_PAYMENT', 'PURCHASE_PAYMENT', 'CASH_BANK_TRANSFER', 'BANK_TRANSFER')",
      "COALESCE(ft.transaction_type, '') NOT IN ('RM Purchase Payment', 'Supplier Advance Payment', 'Bank Deposit', 'Bank Withdrawal', 'Bank Transfer')"
    ];
    const params = [];
    if (fromDate) { clauses.push('ft.transaction_date >= ?'); params.push(fromDate); }
    if (toDate) { clauses.push('ft.transaction_date <= ?'); params.push(toDate); }
    const [rows] = await pool.query(`
      SELECT ft.id, DATE_FORMAT(ft.transaction_date, '%Y-%m-%d') AS date,
             COALESCE(ft.reference_number, ft.invoice_number, CONCAT('TXN-', ft.id)) AS reference,
             COALESCE(ft.transaction_type, 'Income') AS income_type,
             COALESCE(ft.remark, ft.party_name, '') AS description,
             COALESCE(ft.party_name, CASE WHEN ft.account_type = 'BANK' THEN 'Bank Account' ELSE 'Cash Book' END) AS payment_method,
             CAST(ft.debit AS DECIMAL(14,2)) AS amount
      FROM finance_transactions ft
      WHERE ${clauses.join(' AND ')}
      ORDER BY ft.transaction_date DESC, ft.id DESC`, params);
    res.json({ records: rows, totalIncome: rows.reduce((sum, row) => sum + number(row.amount), 0), transactionCount: rows.length });
  } catch (error) {
    const status = error.message.startsWith('Invalid') || error.message.includes('cannot be') ? 400 : 500;
    console.error('Analyst income report error:', error);
    res.status(status).json({ error: status === 400 ? error.message : 'Failed to load income report' });
  }
};

const getExpenses = async (req, res) => {
  try {
    const { method = 'all', fromDate, toDate } = req.query;
    dateFilters(fromDate, toDate);
    if (!VALID_METHODS.has(method)) return res.status(400).json({ error: 'Invalid expense method' });
    const sources = [];
    const range = (column) => `${fromDate ? ` AND ${column} >= ?` : ''}${toDate ? ` AND ${column} <= ?` : ''}`;
    const rangeParams = () => [ ...(fromDate ? [fromDate] : []), ...(toDate ? [toDate] : []) ];

    if (method === 'all' || method === 'petty_cash') {
      sources.push({ sql: `SELECT pv.id, pv.voucher_date AS date, pv.voucher_number AS reference, 'Petty Cash' AS expense_method, COALESCE(pv.description, pv.expense_type, '') AS description, 'Petty Cash' AS payment_source, pv.amount FROM petty_cash_vouchers pv WHERE COALESCE(pv.status, '') NOT IN ('Cancelled', 'Deleted', 'Voided')${range('pv.voucher_date')}`, params: rangeParams() });
    }
    if (method === 'all' || method === 'bank_charges') {
      sources.push({ sql: `SELECT bc.id, bc.charge_date AS date, bc.reference_number AS reference, 'Bank Charges' AS expense_method, COALESCE(bc.charges_type, '') AS description, COALESCE(bc.bank_name, 'Bank Account') AS payment_source, bc.amount FROM bank_charges bc WHERE 1 = 1${range('bc.charge_date')}`, params: rangeParams() });
    }
    if (method === 'all' || method === 'other_expenses') {
      sources.push({ sql: `SELECT e.id, e.bill_date AS date, COALESCE(e.bill_number, CONCAT('EXP-', e.id)) AS reference, 'Other Expenses' AS expense_method, COALESCE(e.description, e.expense_type, '') AS description, COALESCE(e.payee_name, 'Other Expense') AS payment_source, e.total_bill_amount AS amount FROM expenses e WHERE e.is_deleted = 0${range('e.bill_date')}`, params: rangeParams() });
    }
    if (method === 'all' || method === 'purchasing') {
      sources.push({ sql: `SELECT p.id, DATE(p.purchase_date) AS date, COALESCE(p.invoice_no, CONCAT('PUR-', p.id)) AS reference, 'Purchasing' AS expense_method, COALESCE(s.name, 'Purchase') AS description, COALESCE(p.payment_method, 'Purchasing') AS payment_source, COALESCE(NULLIF(p.total_with_vat, 0), p.bill_amount, 0) AS amount FROM purchases p LEFT JOIN supplier s ON s.id = p.supplier_id WHERE COALESCE(p.deleted, 0) = 0 AND COALESCE(p.status, 1) = 1${range('p.purchase_date')}`, params: rangeParams() });
    }

    const records = [];
    for (const source of sources) {
      const [rows] = await pool.query(source.sql, source.params);
      records.push(...rows);
    }
    records.sort((a, b) => new Date(b.date) - new Date(a.date) || Number(b.id) - Number(a.id));
    res.json({ records, totalExpenses: records.reduce((sum, row) => sum + number(row.amount), 0), transactionCount: records.length, method });
  } catch (error) {
    const status = error.message.startsWith('Invalid') || error.message.includes('cannot be') ? 400 : 500;
    console.error('Analyst expense report error:', error);
    res.status(status).json({ error: status === 400 ? error.message : 'Failed to load expense report' });
  }
};

const getBalanceSheet = async (req, res) => {
  try {
    const { date } = req.query;
    if (!isValidDate(date)) return res.status(400).json({ error: 'A valid selected date is required' });
    const [cashRows] = await pool.query(`SELECT c.id AS company_id, c.name, COALESCE(SUM(ft.debit - ft.credit), 0) AS balance FROM company c LEFT JOIN finance_transactions ft ON ft.company_id = c.id AND ft.account_type = 'CASH' AND ft.status = 1 AND ft.transaction_date <= ? GROUP BY c.id, c.name ORDER BY c.id`, [date]);
    const [bankRows] = await pool.query(`SELECT bd.id, bd.bank_name, bd.account_number, bd.company, COALESCE(SUM(ft.debit - ft.credit), 0) AS balance FROM bank_details bd LEFT JOIN finance_transactions ft ON ft.bank_id = bd.id AND ft.account_type = 'BANK' AND ft.status = 1 AND ft.transaction_date <= ? WHERE bd.status = 'Active' AND COALESCE(bd.record_status, 1) = 1 GROUP BY bd.id, bd.bank_name, bd.account_number, bd.company ORDER BY bd.id`, [date]);
    const [storesRows] = await pool.query(`
      SELECT COALESCE(SUM(closing_balance * COALESCE(unit_price, 0)), 0) AS stores_value
      FROM (
        SELECT i.id,
          COALESCE(opening_balances.total_opening, 0) +
          COALESCE(purchases.total_purchased, 0) -
          COALESCE(issues.total_issued, 0) -
          COALESCE(wastage.total_wasted, 0) +
          COALESCE(returns.total_returned, 0) -
          COALESCE(purchase_returns.total_purchase_returned, 0) +
          COALESCE(adjustments.total_adjusted, 0) AS closing_balance,
          (
            SELECT pi.unit_price
            FROM purchase_items pi
            JOIN purchases p ON pi.purchase_id = p.id
            WHERE pi.item_id = i.id AND DATE(p.purchase_date) <= ?
            ORDER BY p.purchase_date DESC, pi.id DESC
            LIMIT 1
          ) AS unit_price
        FROM items i
        LEFT JOIN (
          SELECT item_id, SUM(quantity) AS total_opening
          FROM opening_balances
          WHERE date <= ?
          GROUP BY item_id
        ) opening_balances ON opening_balances.item_id = i.id
        LEFT JOIN (
          SELECT pi.item_id, SUM(pi.quantity) AS total_purchased
          FROM purchase_items pi
          JOIN purchases p ON pi.purchase_id = p.id
          WHERE DATE(p.purchase_date) <= ? AND (p.deleted = FALSE OR p.deleted IS NULL)
          GROUP BY pi.item_id
        ) purchases ON purchases.item_id = i.id
        LEFT JOIN (
          SELECT ii.item_id, SUM(ii.quantity) AS total_issued
          FROM issuance_items ii
          JOIN issuances iss ON ii.issuance_id = iss.id
          WHERE DATE(iss.issuance_date) <= ?
          GROUP BY ii.item_id
        ) issues ON issues.item_id = i.id
        LEFT JOIN (
          SELECT wi.item_id, SUM(wi.quantity) AS total_wasted
          FROM wastage_items wi
          JOIN wastages w ON wi.wastage_id = w.id
          WHERE DATE(w.date) <= ?
          GROUP BY wi.item_id
        ) wastage ON wastage.item_id = i.id
        LEFT JOIN (
          SELECT ri.item_id, SUM(ri.quantity) AS total_returned
          FROM return_items ri
          JOIN returns r ON ri.return_id = r.id
          WHERE DATE(r.return_date) <= ?
          GROUP BY ri.item_id
        ) returns ON returns.item_id = i.id
        LEFT JOIN (
          SELECT pri.item_id, SUM(pri.quantity) AS total_purchase_returned
          FROM purchase_return_items pri
          JOIN purchase_returns pr ON pri.return_id = pr.id
          WHERE DATE(pr.return_date) <= ?
          GROUP BY pri.item_id
        ) purchase_returns ON purchase_returns.item_id = i.id
        LEFT JOIN (
          SELECT item_id, SUM(variance) AS total_adjusted
          FROM stock_adjustments
          WHERE DATE(date) <= ?
          GROUP BY item_id
        ) adjustments ON adjustments.item_id = i.id
        WHERE i.auto_add_to_stock = 1
          AND i.deleted = FALSE
          AND i.is_active = TRUE
      ) stock_values`, [date, date, date, date, date, date, date, date]);
    const cashBooks = cashRows.map(row => ({ companyId: row.company_id, name: row.name, balance: number(row.balance) }));
    const cashBookJH = cashBooks.find(row => /jh/i.test(row.name))?.balance || 0;
    const cashBookRD = cashBooks.find(row => /rd/i.test(row.name))?.balance || 0;
    const totalBankValues = bankRows.reduce((sum, row) => sum + number(row.balance), 0);
    const storesValue = number(storesRows[0]?.stores_value);
    res.json({ date, cashBookJH, cashBookRD, cashBooks, storesValue, banks: bankRows.map(row => ({ ...row, balance: number(row.balance) })), totalBankValues, totalFinancialPosition: cashBookJH + cashBookRD + storesValue + totalBankValues });
  } catch (error) {
    console.error('Analyst balance sheet error:', error);
    res.status(500).json({ error: 'Failed to calculate balance sheet' });
  }
};

module.exports = { getIncomes, getExpenses, getBalanceSheet };
