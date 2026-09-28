-- New Expenses: partial payments & overpayment settlement
-- MariaDB 10.3+ / MySQL 8+. Safe to run more than once (also applied
-- automatically at server start by config/db.js).
--
-- Payment rules this supports (POST /api/new-expenses/pay):
--   Remaining   = Outstanding - Payment      (> 0  -> bill stays in Pending Payment)
--   Overpayment = Payment - Outstanding      (> 0  -> kept as payee credit)
-- Payment = cash/bank/cheque amount + any existing payee overpayment used.

-- How much existing overpayment credit a payment consumed (no cash movement).
ALTER TABLE expense_payments
  ADD COLUMN IF NOT EXISTS overpayment_used_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00
  AFTER overpayment_amount;

-- Which overpayment credit paid for which payment (audit trail; the
-- overpayment row itself keeps remaining_credit / status).
CREATE TABLE IF NOT EXISTS payee_overpayment_settlements (
  id               INT NOT NULL AUTO_INCREMENT,
  overpayment_id   INT NOT NULL,
  payment_id       INT NOT NULL,
  amount           DECIMAL(15,2) NOT NULL,
  created_at       TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pos_overpayment (overpayment_id),
  KEY idx_pos_payment (payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Consistency check: the credit still available on each overpayment must equal
-- what was created minus what was settled. Should return no rows.
SELECT po.id, po.payee_name, po.amount, po.remaining_credit,
       COALESCE(SUM(s.amount), 0) AS settled
FROM payee_overpayments po
LEFT JOIN payee_overpayment_settlements s ON s.overpayment_id = po.id
GROUP BY po.id, po.payee_name, po.amount, po.remaining_credit
HAVING ROUND(po.amount - COALESCE(SUM(s.amount), 0), 2) <> ROUND(po.remaining_credit, 2);
