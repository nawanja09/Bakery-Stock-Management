-- 035_payment_history_settlement_methods.sql
--
-- Invoice settlements that move no money now get their own payment methods in
-- payment_history, so the invoice's Payment History shows where the money came
-- from and Purchasing Payment adjustments never re-post them to Cash / Bank:
--   ADVANCE_PAYMENT  an advance / overpayment applied (Settle Now)
--   PURCHASE_RETURN  a purchase return applied (Settle Now or the return pages)
--   SUPPLIER_CREDIT  an older combined settlement whose source cannot be told apart
--
-- config/db.js applies all of this at start-up
-- (services/settlementPaymentMethods.js), including step 3, which needs code.
-- This file is for installs where migrations are run by hand.
--
-- 1) Check the current list first. If it is NOT exactly the values below,
--    keep every value it has and only append the new ones: dropping a value
--    that rows still use blanks those rows without an error.
SHOW COLUMNS FROM payment_history LIKE 'payment_method';

ALTER TABLE payment_history
  MODIFY COLUMN payment_method
    ENUM('CASH','BANK_TRANSFER','CHEQUE','CREDIT_CARD','ADVANCE_PAYMENT','PURCHASE_RETURN','SUPPLIER_CREDIT') NOT NULL;

-- 2) Settle Now rows saved with the refused 'CREDIT' value (stored as '').
UPDATE payment_history
   SET payment_method = 'SUPPLIER_CREDIT'
 WHERE payment_method = '' AND notes LIKE 'Credit settlement%';

-- 3) (start-up code only) SUPPLIER_CREDIT rows become ADVANCE_PAYMENT or
--    PURCHASE_RETURN when their credit_allocations show a single source.

-- 4) Return settlements saved as CASH although no cash moved.
UPDATE payment_history ph
   SET ph.payment_method = 'PURCHASE_RETURN'
 WHERE ph.payment_method = 'CASH'
   AND (ph.notes LIKE 'Return settlement from return #%'
     OR ph.notes LIKE 'Additional settlement for return #%'
     OR ph.notes LIKE 'Settlement added to return #%')
   AND NOT EXISTS (
     SELECT 1 FROM finance_transactions ft
      WHERE ft.reference_type IN ('PURCHASE_PAYMENT', 'PURCHASING_PAYMENT') AND ft.reference_id = ph.id
   );
