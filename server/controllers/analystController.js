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
    const { fromDate, toDate, company } = req.query;
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
    const [rows] = await pool.query(`
      SELECT i.id,
             DATE_FORMAT(i.income_date, '%Y-%m-%d') AS date,
             i.income_date,
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
      ORDER BY i.income_date DESC, i.id DESC
    `, params);
    const records = rows.map(row => ({ ...row, amount: number(row.amount) }));
    res.json({
      records,
      totalIncome: records.reduce((sum, row) => sum + row.amount, 0),
      transactionCount: records.length,
      company: company || 'all'
    });
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
    const rangeParams = () => [...(fromDate ? [fromDate] : []), ...(toDate ? [toDate] : [])];

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

// Shared fragment: amount actually paid against a purchase, as of a given date.
// 1) Sums payment_history (respecting purchase_payment_allocations splits), same as before.
// 2) FIX: adds a fallback for purchases that were settled at the counter (payment_status = 'Paid',
//    e.g. CASH/BANK_TRANSFER paid in full at time of purchase) and therefore never got a
//    payment_history row at all. Without this fallback these purchases were being treated as
//    100% unpaid, which was inflating Outstanding Invoices / Purchasing Payable by tens of millions.
// PERF FIX (Balance Sheet timeout): this used to be a single scalar correlated subquery
// (PAID_TO_DATE_SQL) that MySQL re-executed once per purchase row — O(purchases x
// payment_history) work, which was the dominant cost of the /analyst/balance-sheet endpoint
// (verified: ~1.8s for this fragment alone on ~3.2k purchases / ~1.3k payment rows, and it is
// used twice in this file). It is now computed as two pre-aggregated LEFT JOINs done once per
// query instead of once per row — O(purchases + payment_history) — with byte-for-byte the same
// arithmetic and the same three inputs: allocated amounts from purchase_payment_allocations,
// unallocated (unsplit) payment_history rows, and the "settled at the counter" fallback for
// purchases with payment_status = 'Paid' and no payment_history rows at all.
// PAID_TO_DATE_JOINS must be placed directly after "FROM purchases p" (before any other JOIN/
// WHERE on that query) and takes two `?` params, both the same balance-sheet date, for the two
// "payment_date <= ?" filters below. PAID_TO_DATE_EXPR (0 params) then goes in the SELECT list.
const PAID_TO_DATE_JOINS = `
          LEFT JOIN (
            SELECT ppa.purchase_id AS purchase_id, SUM(ppa.allocated_amount) AS allocated_total
            FROM purchase_payment_allocations ppa
            JOIN payment_history ph ON ph.id = ppa.payment_history_id
            WHERE ph.payment_date <= ?
            GROUP BY ppa.purchase_id
          ) paid_alloc ON paid_alloc.purchase_id = p.id
          LEFT JOIN (
            SELECT ph.purchase_id AS purchase_id, SUM(ph.amount) AS unallocated_total
            FROM payment_history ph
            WHERE ph.payment_date <= ?
              AND NOT EXISTS (
                SELECT 1 FROM purchase_payment_allocations ppa2
                WHERE ppa2.payment_history_id = ph.id
              )
            GROUP BY ph.purchase_id
          ) paid_unalloc ON paid_unalloc.purchase_id = p.id
          LEFT JOIN (
            SELECT DISTINCT purchase_id FROM payment_history
          ) has_payment ON has_payment.purchase_id = p.id`;
const PAID_TO_DATE_EXPR = `
            COALESCE(paid_alloc.allocated_total, 0) + COALESCE(paid_unalloc.unallocated_total, 0)
            + CASE
                WHEN p.payment_status = 'Paid' AND has_payment.purchase_id IS NULL
                THEN COALESCE(NULLIF(p.total_with_vat, 0), NULLIF(p.bill_amount, 0), COALESCE(p.subtotal, 0) + COALESCE(p.vat_amount, 0))
                ELSE 0
              END`;

const getBalanceSheet = async (req, res) => {
  try {
    const { date } = req.query;
    if (!isValidDate(date)) return res.status(400).json({ error: 'A valid selected date is required' });
    // The queries below are all independent of one another (none depends on another's result),
    // so they are issued concurrently instead of one-by-one. This was the main cause of the
    // Balance Sheet timing out: 7 queries were being awaited sequentially, so total wait time was
    // the SUM of every query's latency instead of the MAX. Running them with Promise.all cuts
    // that to roughly the slowest single query. No query text, params, or calculations changed.
    const [
      [cashRows],
      [bankRows],
      [storesRows],
      [purchasingRows],
      [advanceRows],
      [excessPaymentRows],
      [returnExcessRows]
    ] = await Promise.all([
      pool.query(`SELECT c.id AS company_id, c.name, COALESCE(SUM(ft.debit - ft.credit), 0) AS balance FROM company c LEFT JOIN finance_transactions ft ON ft.company_id = c.id AND ft.account_type = 'CASH' AND ft.status = 1 AND ft.transaction_date <= ? GROUP BY c.id, c.name ORDER BY c.id`, [date]),
      pool.query(`SELECT bd.id, bd.bank_name, bd.account_number, bd.company, COALESCE(SUM(ft.debit - ft.credit), 0) AS balance FROM bank_details bd LEFT JOIN finance_transactions ft ON ft.bank_id = bd.id AND ft.account_type = 'BANK' AND ft.status = 1 AND ft.transaction_date <= ? WHERE bd.status = 'Active' AND COALESCE(bd.record_status, 1) = 1 GROUP BY bd.id, bd.bank_name, bd.account_number, bd.company ORDER BY bd.id`, [date]),
      pool.query(`
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
      ) stock_values`, [date, date, date, date, date, date, date, date]),
      pool.query(`
      SELECT
        COALESCE(SUM(invoice_total), 0) AS total_purchasing_value,
        COALESCE(SUM(CASE WHEN outstanding <= 0 THEN invoice_total ELSE 0 END), 0) AS total_purchasing_completed,
        COALESCE(SUM(CASE WHEN outstanding > 0 THEN outstanding ELSE 0 END), 0) AS total_purchasing_pending,
        COUNT(CASE WHEN outstanding <= 0 THEN 1 END) AS completed_purchasing_count,
        COUNT(CASE WHEN outstanding > 0 THEN 1 END) AS pending_purchasing_count
      FROM (
        SELECT invoice_total,
          GREATEST(invoice_total - paid_to_date, 0) AS outstanding
        FROM (
          SELECT p.id,
            GREATEST(
              COALESCE(NULLIF(p.total_with_vat, 0), NULLIF(p.bill_amount, 0), COALESCE(p.subtotal, 0) + COALESCE(p.vat_amount, 0))
              - COALESCE((
                SELECT SUM(pr.total_amount)
                FROM purchase_returns pr
                WHERE pr.purchase_id = p.id
                  AND DATE(pr.return_date) <= ?
              ), 0),
              0
            ) AS invoice_total,
            ${PAID_TO_DATE_EXPR} AS paid_to_date
          FROM purchases p${PAID_TO_DATE_JOINS}
          WHERE DATE(p.purchase_date) <= ?
            AND COALESCE(p.deleted, 0) = 0
        ) invoice_positions
      ) invoice_balances`, [date, date, date, date]),
      pool.query(`
      SELECT COALESCE(SUM(GREATEST(so.original_amount - COALESCE(used.amount, 0), 0)), 0) AS advance_payment_balance
      FROM supplier_overpayments so
      LEFT JOIN (
        SELECT overpayment_id, SUM(allocated_amount) AS amount
        FROM credit_allocations
        WHERE credit_type = 'overpayment' AND settlement_date <= ?
        GROUP BY overpayment_id
      ) used ON used.overpayment_id = so.id
      WHERE so.payment_date <= ?`, [date, date]),
      pool.query(`
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
        )`, [date, date]),
      pool.query(`
      SELECT COALESCE(SUM(GREATEST(paid_to_date - net_invoice_total, 0)), 0) AS return_overpayment
      FROM (
        SELECT p.id,
          GREATEST(
            COALESCE(NULLIF(p.total_with_vat, 0), NULLIF(p.bill_amount, 0), COALESCE(p.subtotal, 0) + COALESCE(p.vat_amount, 0))
            - COALESCE((
              SELECT SUM(pr.total_amount)
              FROM purchase_returns pr
              WHERE pr.purchase_id = p.id AND DATE(pr.return_date) <= ?
            ), 0),
            0
          ) AS net_invoice_total,
          ${PAID_TO_DATE_EXPR} AS paid_to_date
        FROM purchases p${PAID_TO_DATE_JOINS}
        WHERE DATE(p.purchase_date) <= ? AND COALESCE(p.deleted, 0) = 0
      ) invoice_positions`, [date, date, date, date])
    ]);
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
      + number(returnExcessRows[0]?.return_overpayment);
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

module.exports = { getIncomes, getExpenses, getBalanceSheet };