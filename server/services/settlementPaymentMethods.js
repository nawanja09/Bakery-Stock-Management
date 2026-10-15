// server/services/settlementPaymentMethods.js
//
// payment_history rows that are SETTLEMENTS: an invoice paid from supplier
// credit, not money leaving Cash / Bank now.
//   ADVANCE_PAYMENT  an advance / overpayment (supplier_overpayments) applied - Settle Now
//   PURCHASE_RETURN  a purchase return applied - Settle Now (return credit) or the return pages
//   SUPPLIER_CREDIT  an older combined settlement whose source cannot be told apart
// The money moved when the advance was paid (or never moved, for a return), so
// these rows never post to the Cash / Bank ledger and must not be changed through
// Purchasing Payment adjustments (which re-post the ledger).
//
// ensureSettlementPaymentMethods() runs at start-up (config/db.js); hand-run
// installs: migrations/035_payment_history_settlement_methods.sql.

const SETTLEMENT_PAYMENT_METHODS = Object.freeze(['ADVANCE_PAYMENT', 'PURCHASE_RETURN', 'SUPPLIER_CREDIT']);

// '' = a settlement saved with the old 'CREDIT' value, which the column refused.
const isSettlementPaymentMethod = (method) => {
  const value = String(method || '').trim().toUpperCase();
  return value === '' || SETTLEMENT_PAYMENT_METHODS.includes(value);
};

// The notes every return-settlement path has written by default.
const RETURN_SETTLEMENT_NOTES = [
  'Return settlement from return #%',
  'Additional settlement for return #%',
  'Settlement added to return #%'
];

const METHOD_OF_CREDIT_TYPE = { overpayment: 'ADVANCE_PAYMENT', return_credit: 'PURCHASE_RETURN' };

const ensureSettlementPaymentMethods = async (db) => {
  // 1. Allowed values. APPENDED to the column's current list: rewriting the list
  //    without a value that rows still use would blank those rows, silently.
  const [columns] = await db.query("SHOW COLUMNS FROM payment_history LIKE 'payment_method'");
  const type = String(columns[0]?.Type || '');
  if (/^enum\(/i.test(type)) {
    const missing = SETTLEMENT_PAYMENT_METHODS.filter((value) => !type.includes(`'${value}'`));
    if (missing.length) {
      await db.query(
        `ALTER TABLE payment_history MODIFY COLUMN payment_method ENUM(${type.slice(5, -1)},${missing.map((v) => `'${v}'`).join(',')}) NOT NULL`
      );
    }
  }

  // 2. Settle Now rows saved with the refused 'CREDIT' value ('').
  await db.query(
    "UPDATE payment_history SET payment_method = 'SUPPLIER_CREDIT' WHERE payment_method = '' AND notes LIKE 'Credit settlement%'"
  );

  // 3. Name the source of earlier Settle Now rows from their credit allocations:
  //    only when every allocation of that invoice on that day is one type and
  //    they add up to the row (otherwise it stays SUPPLIER_CREDIT).
  const [combined] = await db.query(
    `SELECT id, purchase_id, DATE_FORMAT(payment_date, '%Y-%m-%d') AS payment_date, amount, check_number
       FROM payment_history
      WHERE payment_method = 'SUPPLIER_CREDIT' AND notes LIKE 'Credit settlement%'`
  );
  for (const row of combined) {
    const [allocations] = await db.query(
      `SELECT ca.credit_type, ca.allocated_amount, COALESCE(so.overpayment_number, prc.credit_number) AS credit_number
         FROM credit_allocations ca
         LEFT JOIN supplier_overpayments so ON so.id = ca.overpayment_id
         LEFT JOIN purchase_return_credits prc ON prc.id = ca.return_credit_id
        WHERE ca.purchase_id = ? AND ca.settlement_date = ?`,
      [row.purchase_id, row.payment_date]
    );
    const types = [...new Set(allocations.map((a) => a.credit_type))];
    const total = allocations.reduce((sum, a) => sum + Number(a.allocated_amount), 0);
    if (types.length !== 1 || !METHOD_OF_CREDIT_TYPE[types[0]] || Math.abs(total - Number(row.amount)) > 0.009) continue;
    const reference = allocations.length === 1 && allocations[0].credit_number ? allocations[0].credit_number : null;
    await db.query(
      'UPDATE payment_history SET payment_method = ?, check_number = COALESCE(check_number, ?) WHERE id = ?',
      [METHOD_OF_CREDIT_TYPE[types[0]], reference, row.id]
    );
  }

  // 4. Return settlements saved as CASH although no cash moved - only rows with
  //    the default return note and no Cash / Bank ledger line behind them.
  await db.query(
    `UPDATE payment_history ph
        SET ph.payment_method = 'PURCHASE_RETURN'
      WHERE ph.payment_method = 'CASH'
        AND (${RETURN_SETTLEMENT_NOTES.map(() => 'ph.notes LIKE ?').join(' OR ')})
        AND NOT EXISTS (
          SELECT 1 FROM finance_transactions ft
           WHERE ft.reference_type IN ('PURCHASE_PAYMENT', 'PURCHASING_PAYMENT') AND ft.reference_id = ph.id
        )`,
    RETURN_SETTLEMENT_NOTES
  );
};

module.exports = {
  SETTLEMENT_PAYMENT_METHODS,
  isSettlementPaymentMethod,
  ensureSettlementPaymentMethods
};
