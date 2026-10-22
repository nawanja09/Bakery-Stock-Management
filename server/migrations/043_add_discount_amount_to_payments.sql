-- Record Payment form: optional "Discount Amount" alongside Payment Amount.
-- A discount reduces an invoice's outstanding balance exactly like cash paid
-- toward it, but no money actually moves - so it is folded into
-- payment_history.amount / purchase_payment_allocations.allocated_amount
-- (the same totals every paid/due aggregation already reads), and the
-- discount-only portion is kept here purely for audit/display.
ALTER TABLE payment_history
  ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(16,4) NOT NULL DEFAULT 0.0000 AFTER amount;

ALTER TABLE purchase_payment_allocations
  ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(16,4) NOT NULL DEFAULT 0.0000 AFTER allocated_amount;
