const pool = require('../config/db');

const VALID_METHODS = new Set(['all', 'petty_cash', 'bank_charges', 'cash_expenses', 'hidden_expenses', 'purchasing', 'other_expenses']);
const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const dateFilters = (fromDate, toDate) => {
  if (fromDate && !isValidDate(fromDate)) throw new Error('Invalid from date');
  if (toDate && !isValidDate(toDate)) throw new Error('Invalid to date');
  if (fromDate && toDate && fromDate > toDate) throw new Error('From date cannot be after to date');
};
const number = (value) => Number.parseFloat(value || 0) || 0;

const getIncomes = async (req, res) => {
  try {
    const { fromDate, toDate, company, department } = req.query;
    dateFilters(fromDate, toDate);
    const clauses = ['i.status = 1'];
    const params = [];
    if (fromDate) {
      clauses.push('i.income_date >= ?');
      params.push(fromDate);
    }
    if (toDate) {
      clauses.push('i.income_date <= ?');
      params.push(toDate);
    }
    if (company && company !== 'all') {
      clauses.push('(c.name = ? OR i.company_id = ?)');
      params.push(company, company);
    }
    if (department && department !== 'all') {
      clauses.push('(d.name = ? OR i.department_id = ?)');
      params.push(department, department);
    }
    const [rows] = await pool.query(`
      SELECT i.id,
             DATE_FORMAT(i.income_date, '%Y-%m-%d') AS date,
             DATE_FORMAT(i.income_date, '%Y-%m-%d') AS income_date,
             CONCAT('INC-', i.id) AS reference,
             'Income' AS income_type,
             i.company_id,
             c.name AS company_name,
             i.department_id,
             d.name AS department_name,
             CONCAT(c.name, ' - ', d.name) AS description,
             c.name AS payment_method,
             i.amount,
             i.created_at
      FROM incomes i
      JOIN company c ON c.id = i.company_id
      JOIN departments d ON d.id = i.department_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY i.income_date ASC, i.id ASC
    `, params);
    const records = rows.map(row => ({ ...row, amount: number(row.amount) }));
    res.json({
      records,
      totalIncome: records.reduce((sum, row) => sum + row.amount, 0),
      transactionCount: records.length,
      company: company || 'all',
      department: department || 'all'
    });
  } catch (error) {
    const status = error.message.startsWith('Invalid') || error.message.includes('cannot be') ? 400 : 500;
    console.error('Analyst income report error:', error);
    res.status(status).json({ error: status === 400 ? error.message : 'Failed to load income report' });
  }
};

// The Analyst -> Expenses transaction scope, shared with the Expense Report
// Summary (reportController) so both always read exactly the same records.
// `methods` is the list of expense methods to load ('all' is expanded by the
// caller). Records come back unsorted, in source order.
const loadExpenseRecords = async ({ methods, fromDate, toDate }) => {
  const include = (key) => methods.includes(key);
  const sources = [];
  // Use a half-open range for the end date so DATETIME values anywhere on
  // the selected day are included, not only values at midnight.
  const range = (column) => `${fromDate ? ` AND ${column} >= ?` : ''}${toDate ? ` AND ${column} < DATE_ADD(?, INTERVAL 1 DAY)` : ''}`;
  const rangeParams = () => [...(fromDate ? [fromDate] : []), ...(toDate ? [toDate] : [])];
  // Return every date as a plain 'YYYY-MM-DD' string. A raw DATE/DATETIME is
  // turned into a JS Date by the driver and serialised as UTC, which shifts
  // it back a day in timezones ahead of UTC (e.g. Sri Lanka: the 20th is sent
  // as 2026-09-19T18:30:00Z and shown as the 19th).
  const day = (column) => `DATE_FORMAT(${column}, '%Y-%m-%d')`;

  // Every source below is a distinct "id" namespace (each table restarts at
  // 1), so the frontend key and the sort tiebreak both use a per-method
  // composite id ("petty_cash-14"), not the raw row id.
  if (include('petty_cash')) {
    // Match the Petty Cash voucher source: include every stored voucher and
    // report its status as data instead of filtering it out here.
    sources.push({ sql: `SELECT pv.id, ${day('pv.voucher_date')} AS date, pv.voucher_number AS reference, 'Petty Cash' AS expense_method, pv.expense_type, pv.sub_expense_type, COALESCE(pv.description, '') AS description, 'Petty Cash' AS payment_source, pv.amount, COALESCE(pv.status, 'Pending') AS status, pv.company_id, comp.name AS company_name FROM petty_cash_vouchers pv LEFT JOIN company comp ON comp.id = pv.company_id WHERE pv.is_deleted = 0 AND 1 = 1${range('pv.voucher_date')}`, params: rangeParams() });
  }
  if (include('bank_charges')) {
    sources.push({ sql: `SELECT bc.id, ${day('bc.charge_date')} AS date, bc.reference_number AS reference, 'Bank Charges' AS expense_method, bc.charges_type AS expense_type, NULL AS sub_expense_type, COALESCE(bc.description, '') AS description, COALESCE(bc.bank_name, 'Bank Account') AS payment_source, bc.amount, 'Recorded' AS status, bc.company_id, comp.name AS company_name FROM bank_charges bc LEFT JOIN company comp ON comp.id = bc.company_id WHERE bc.is_deleted = 0 AND 1 = 1${range('bc.charge_date')}`, params: rangeParams() });
  }
  if (include('cash_expenses')) {
    sources.push({ sql: `SELECT ce.id, ${day('ce.expense_date')} AS date, ce.voucher_number AS reference, 'Cash Expenses' AS expense_method, ce.expense_type, ce.sub_expense_type, COALESCE(ce.description, '') AS description, 'Cash Expense' AS payment_source, ce.amount, 'Recorded' AS status, ce.company_id, comp.name AS company_name FROM cash_expenses ce LEFT JOIN company comp ON comp.id = ce.company_id WHERE ce.status = 1${range('ce.expense_date')}`, params: rangeParams() });
  }
  if (include('other_expenses')) {
    sources.push({ sql: `SELECT e.id, ${day('e.bill_date')} AS date, COALESCE(e.bill_number, CONCAT('EXP-', e.id)) AS reference, 'Other Expenses' AS expense_method, e.expense_type, e.sub_expense_type, COALESCE(e.description, '') AS description, COALESCE(e.payee_name, 'Other Expense') AS payment_source, e.total_bill_amount AS amount, COALESCE(e.payment_status, 'Recorded') AS status, e.company_id, comp.name AS company_name FROM expenses e LEFT JOIN company comp ON comp.id = e.company_id WHERE e.is_deleted = 0${range('e.bill_date')}`, params: rangeParams() });
  }
  // Hidden Expenses are report-only (PickMe / Credit Card Charge): they
  // never post to a ledger, but they are still real expenses and must be
  // included here, not just in the dedicated Expenses Report.
  if (include('hidden_expenses')) {
    sources.push({ sql: `SELECT he.id, ${day('he.expense_date')} AS date, COALESCE(he.reference_number, '') AS reference, 'Hidden Expenses' AS expense_method, he.type AS expense_type, NULL AS sub_expense_type, COALESCE(he.description, '') AS description, 'Hidden Expense' AS payment_source, he.amount, 'Hidden' AS status, he.company_id, comp.name AS company_name FROM hidden_expenses he LEFT JOIN company comp ON comp.id = he.company_id WHERE he.is_deleted = 0${range('he.expense_date')}`, params: rangeParams() });
  }
  if (include('purchasing')) {
    sources.push({ sql: `SELECT p.id, ${day('p.purchase_date')} AS date, COALESCE(p.invoice_no, CONCAT('PUR-', p.id)) AS reference, 'Purchasing' AS expense_method, 'Purchasing' AS expense_type, NULL AS sub_expense_type, COALESCE(s.name, 'Purchase') AS description, COALESCE(p.payment_method, 'Purchasing') AS payment_source, COALESCE(NULLIF(p.total_with_vat, 0), p.bill_amount, 0) AS amount, COALESCE(p.payment_status, 'Recorded') AS status, p.company_id, comp.name AS company_name FROM purchases p LEFT JOIN supplier s ON s.id = p.supplier_id LEFT JOIN company comp ON comp.id = p.company_id WHERE COALESCE(p.deleted, 0) = 0 AND COALESCE(p.status, 1) = 1${range('p.purchase_date')}`, params: rangeParams() });
  }

  const records = [];
  for (const source of sources) {
    const [rows] = await pool.query(source.sql, source.params);
    records.push(...rows);
  }
  return records;
};

// Every Analyst expense method except 'all' (in display order).
const EXPENSE_METHODS = ['petty_cash', 'bank_charges', 'cash_expenses', 'other_expenses', 'hidden_expenses', 'purchasing'];

const getExpenses = async (req, res) => {
  try {
    const { method = 'all', fromDate, toDate } = req.query;
    dateFilters(fromDate, toDate);
    if (!VALID_METHODS.has(method)) return res.status(400).json({ error: 'Invalid expense method' });
    const records = await loadExpenseRecords({ methods: method === 'all' ? EXPENSE_METHODS : [method], fromDate, toDate });
    // Each source restarts its own id sequence at 1, so the tiebreak for
    // same-day rows is scoped by expense_method + id, not the raw id alone.
    records.sort((a, b) =>
      String(a.date).localeCompare(String(b.date)) ||
      `${a.expense_method}-${a.id}`.localeCompare(`${b.expense_method}-${b.id}`)
    );
    res.json({ records, totalExpenses: records.reduce((sum, row) => sum + number(row.amount), 0), transactionCount: records.length, method });
  } catch (error) {
    const status = error.message.startsWith('Invalid') || error.message.includes('cannot be') ? 400 : 500;
    console.error('Analyst expense report error:', error);
    res.status(status).json({ error: status === 400 ? error.message : 'Failed to load expense report' });
  }
};

// Per-purchase money position as of a given date, for every live purchase
// on or before that date. One row per purchase:
//   invoice_total = invoice value net of purchase returns up to the date
//   paid_to_date  = amount actually paid against it up to the date
//
// paid_to_date is the sum of
//   1) payment_history rows dated on/before the date: split payments count
//      their purchase_payment_allocations share, unsplit payments (no
//      allocation rows at all) count in full for their own purchase_id;
//   2) a fallback for purchases settled at the counter (payment_status =
//      'Paid', e.g. CASH/BANK_TRANSFER paid in full at time of purchase) that
//      never got a payment_history row. Without it these were treated as 100%
//      unpaid, inflating Outstanding Invoices / Purchasing Payable.
//
// Each source is aggregated once and joined by purchase_id. (It used to be a
// correlated subquery per purchase that rescanned payment_history every time,
// which took ~60s on 3.5k purchases and made the Balance Sheet time out.)
// Parameters, in order: date x4.
const PURCHASE_POSITIONS_SQL = `
  SELECT p.id,
    GREATEST(
      COALESCE(NULLIF(p.total_with_vat, 0), NULLIF(p.bill_amount, 0), COALESCE(p.subtotal, 0) + COALESCE(p.vat_amount, 0))
      - COALESCE(ret.amount, 0),
      0
    ) AS invoice_total,
    COALESCE(alloc.amount, 0)
    + COALESCE(direct.amount, 0)
    + CASE
        WHEN p.payment_status = 'Paid' AND any_ph.purchase_id IS NULL
        THEN COALESCE(NULLIF(p.total_with_vat, 0), NULLIF(p.bill_amount, 0), COALESCE(p.subtotal, 0) + COALESCE(p.vat_amount, 0))
        ELSE 0
      END AS paid_to_date
  FROM purchases p
  LEFT JOIN (
    SELECT pr.purchase_id, SUM(pr.total_amount) AS amount
    FROM purchase_returns pr
    WHERE DATE(pr.return_date) <= ?
    GROUP BY pr.purchase_id
  ) ret ON ret.purchase_id = p.id
  LEFT JOIN (
    SELECT ppa.purchase_id, SUM(ppa.allocated_amount) AS amount
    FROM purchase_payment_allocations ppa
    JOIN payment_history ph ON ph.id = ppa.payment_history_id
    WHERE ph.payment_date <= ?
    GROUP BY ppa.purchase_id
  ) alloc ON alloc.purchase_id = p.id
  LEFT JOIN (
    SELECT ph.purchase_id, SUM(ph.amount) AS amount
    FROM payment_history ph
    LEFT JOIN (SELECT DISTINCT payment_history_id FROM purchase_payment_allocations) split
      ON split.payment_history_id = ph.id
    WHERE ph.payment_date <= ? AND split.payment_history_id IS NULL
    GROUP BY ph.purchase_id
  ) direct ON direct.purchase_id = p.id
  LEFT JOIN (
    SELECT DISTINCT purchase_id FROM payment_history WHERE purchase_id IS NOT NULL
  ) any_ph ON any_ph.purchase_id = p.id
  WHERE DATE(p.purchase_date) <= ?
    AND COALESCE(p.deleted, 0) = 0
`;

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
          JOIN wastages w ON wi.wastage_id = w.id AND COALESCE(w.status, 1) = 1
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
          WHERE is_deleted = 0 AND status = 'Approved' AND DATE(date) <= ?
          GROUP BY item_id
        ) adjustments ON adjustments.item_id = i.id
        WHERE i.auto_add_to_stock = 1
          AND i.deleted = FALSE
          AND i.is_active = TRUE
      ) stock_values`, [date, date, date, date, date, date, date, date]);
    const [purchasingRows] = await pool.query(`
      SELECT
        COALESCE(SUM(invoice_total), 0) AS total_purchasing_value,
        COALESCE(SUM(CASE WHEN outstanding <= 0 THEN invoice_total ELSE 0 END), 0) AS total_purchasing_completed,
        COALESCE(SUM(CASE WHEN outstanding > 0 THEN outstanding ELSE 0 END), 0) AS total_purchasing_pending,
        COUNT(CASE WHEN outstanding <= 0 THEN 1 END) AS completed_purchasing_count,
        COUNT(CASE WHEN outstanding > 0 THEN 1 END) AS pending_purchasing_count,
        COALESCE(SUM(GREATEST(paid_to_date - invoice_total, 0)), 0) AS return_overpayment
      FROM (
        SELECT invoice_total, paid_to_date,
          GREATEST(invoice_total - paid_to_date, 0) AS outstanding
        FROM (${PURCHASE_POSITIONS_SQL}) invoice_positions
      ) invoice_balances`, [date, date, date, date]);
    const [advanceRows] = await pool.query(`
      SELECT COALESCE(SUM(GREATEST(so.original_amount - COALESCE(used.amount, 0), 0)), 0) AS advance_payment_balance
      FROM supplier_overpayments so
      LEFT JOIN (
        SELECT overpayment_id, SUM(allocated_amount) AS amount
        FROM credit_allocations
        WHERE credit_type = 'overpayment' AND settlement_date <= ?
        GROUP BY overpayment_id
      ) used ON used.overpayment_id = so.id
      WHERE so.payment_date <= ?`, [date, date]);
    const [excessPaymentRows] = await pool.query(`
      SELECT COALESCE(SUM(GREATEST(ph.amount - COALESCE(allocations.allocated_amount, 0), 0)), 0) AS payment_overpayment
      FROM payment_history ph
      INNER JOIN (
        SELECT payment_history_id, SUM(allocated_amount) AS allocated_amount
        FROM purchase_payment_allocations
        GROUP BY payment_history_id
      ) allocations ON allocations.payment_history_id = ph.id
      WHERE ph.payment_date <= ?
        AND EXISTS (
          SELECT 1
          FROM purchase_payment_allocations ppa
          INNER JOIN purchases p ON p.id = ppa.purchase_id
          WHERE ppa.payment_history_id = ph.id
            AND DATE(p.purchase_date) <= ?
            AND COALESCE(p.deleted, 0) = 0
        )`, [date, date]);
    const cashBooks = cashRows.map(row => ({ companyId: row.company_id, name: row.name, balance: number(row.balance) }));
    const cashBookJH = cashBooks.find(row => /jh/i.test(row.name))?.balance || 0;
    const cashBookRD = cashBooks.find(row => /rd/i.test(row.name))?.balance || 0;
    const cashBookTotal = cashBookJH + cashBookRD;
    const totalBankValues = bankRows.reduce((sum, row) => sum + number(row.balance), 0);
    const storesValue = number(storesRows[0]?.stores_value);
    const totalAssets = cashBookTotal + storesValue + totalBankValues;
    const totalPurchasingValue = number(purchasingRows[0]?.total_purchasing_value);
    const totalPurchasingCompleted = number(purchasingRows[0]?.total_purchasing_completed);
    const totalPurchasingPending = number(purchasingRows[0]?.total_purchasing_pending);
    const completedPurchasingCount = Number(purchasingRows[0]?.completed_purchasing_count || 0);
    const pendingPurchasingCount = Number(purchasingRows[0]?.pending_purchasing_count || 0);
    // Reconciliation check: total purchasing value should equal completed value plus pending value.
    const purchasingReconciliationDifference = totalPurchasingValue
      - (totalPurchasingCompleted + totalPurchasingPending);
    if (Math.abs(purchasingReconciliationDifference) > 0.01) {
      console.warn('Balance sheet purchasing totals do not reconcile:', {
        totalPurchasingValue,
        totalPurchasingCompleted,
        totalPurchasingPending,
        difference: purchasingReconciliationDifference
      });
    }
    // The legacy outstandingInvoices field intentionally uses this same pending aggregate
    // so it remains a direct cross-check for existing consumers and the Supplier Ledger.
    const outstandingInvoices = totalPurchasingPending;
    const purchasingPayable = outstandingInvoices;
    const purchasingAdvancePaymentBalance = number(advanceRows[0]?.advance_payment_balance);
    const purchasingOverpayment = number(excessPaymentRows[0]?.payment_overpayment)
      + number(purchasingRows[0]?.return_overpayment);
    const totalPayables = purchasingPayable + purchasingOverpayment;
    const netBalance = totalAssets - totalPayables;
    res.json({
      date, cashBookJH, cashBookRD, cashBookTotal, cashBooks,
      storesValue, banks: bankRows.map(row => ({ ...row, balance: number(row.balance) })),
      totalBankValues,
      totalAssets, outstandingInvoices, purchasingPayable,
      totalPurchasingValue, totalPurchasingCompleted, totalPurchasingPending,
      completedPurchasingCount, pendingPurchasingCount,
      purchasing: {
        totalValue: totalPurchasingValue,
        completedValue: totalPurchasingCompleted,
        pendingValue: totalPurchasingPending,
        completedCount: completedPurchasingCount,
        pendingCount: pendingPurchasingCount
      },
      purchasingAdvancePaymentBalance, purchasingOverpayment, totalPayables, netBalance,
      // kept for backward compatibility with any other consumer of this endpoint
      totalFinancialPosition: totalAssets
    });
  } catch (error) {
    console.error('Analyst balance sheet error:', error);
    res.status(500).json({ error: 'Failed to calculate balance sheet' });
  }
};

module.exports = { getIncomes, getExpenses, getBalanceSheet, loadExpenseRecords, dateFilters };
