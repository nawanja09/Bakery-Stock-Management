const number = (value) => Number.parseFloat(value || 0) || 0;

// Shared current purchasing position used by the Supplier Ledger and Balance Sheet.
const getPurchasingPosition = async (pool, { asOfDate } = {}) => {
  const dateClause = asOfDate ? 'AND DATE(p.purchase_date) <= ?' : '';
  const dateParams = asOfDate ? [asOfDate] : [];

  const [[purchaseRows], [advanceRows], [unallocatedRows], [returnRows]] = await Promise.all([
    pool.query(`
      SELECT
        COALESCE(SUM(CASE
          WHEN p.balance_amount > 0.001 AND p.payment_status != 'Paid'
          THEN GREATEST(p.balance_amount, 0) ELSE 0 END), 0) AS total_pending,
        COUNT(CASE WHEN p.balance_amount > 0.001 AND p.payment_status != 'Paid' THEN 1 END) AS pending_count,
        COALESCE(SUM(CASE WHEN p.payment_status = 'Paid'
          THEN COALESCE(NULLIF(p.total_with_vat, 0), NULLIF(p.bill_amount, 0), COALESCE(p.subtotal, 0) + COALESCE(p.vat_amount, 0))
          ELSE 0 END), 0) AS total_completed,
        COUNT(CASE WHEN p.payment_status = 'Paid' THEN 1 END) AS completed_count
      FROM purchases p
      WHERE (p.deleted = FALSE OR p.deleted IS NULL)
        ${dateClause}
    `, dateParams),
    pool.query(`
      SELECT COALESCE(SUM(remaining_credit), 0) AS advance_credit
      FROM supplier_overpayments
      WHERE status != 'Fully Used' AND remaining_credit > 0
        AND (is_deleted = 0 OR is_deleted IS NULL)
    `),
    pool.query(`
      SELECT COALESCE(SUM(GREATEST(ph.amount - alloc.total_allocated, 0)), 0) AS unallocated_credit
      FROM payment_history ph
      JOIN purchases p ON p.id = ph.purchase_id
      JOIN (
        SELECT payment_history_id, SUM(allocated_amount) AS total_allocated
        FROM purchase_payment_allocations
        GROUP BY payment_history_id
      ) alloc ON alloc.payment_history_id = ph.id
      WHERE COALESCE(p.deleted, 0) = 0
        AND (ph.amount - alloc.total_allocated) >= 0.01
    `),
    pool.query(`
      SELECT COALESCE(SUM(remaining_credit), 0) AS return_credit
      FROM purchase_return_credits
      WHERE status != 'Fully Used' AND remaining_credit > 0
    `)
  ]);

  const advanceCreditAvailable = number(advanceRows[0]?.advance_credit);
  const unallocatedPaymentCredit = number(unallocatedRows[0]?.unallocated_credit);
  const returnCreditAvailable = number(returnRows[0]?.return_credit);

  return {
    totalPending: number(purchaseRows[0]?.total_pending),
    pendingCount: Number(purchaseRows[0]?.pending_count || 0),
    totalCompleted: number(purchaseRows[0]?.total_completed),
    completedCount: Number(purchaseRows[0]?.completed_count || 0),
    advanceCreditAvailable,
    unallocatedPaymentCredit,
    returnCreditAvailable,
    totalAvailablePendingCredits: advanceCreditAvailable + unallocatedPaymentCredit + returnCreditAvailable
  };
};

module.exports = { getPurchasingPosition };