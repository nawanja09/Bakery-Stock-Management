-- 034_payment_history_request_id.sql
--
-- Supplier invoice payments (audit R1): the client sends an Idempotency-Key per
-- payment form, stored here. The UNIQUE key makes a double-click or a retried
-- request record the payment once (purchaseController.makePayment returns the
-- first payment instead). NULL for every older payment (UNIQUE allows many NULLs).
--
-- config/db.js applies the same change at start-up; this file is for installs
-- where migrations are run by hand.
ALTER TABLE payment_history
  ADD COLUMN IF NOT EXISTS request_id VARCHAR(64) NULL,
  ADD UNIQUE KEY IF NOT EXISTS uq_payment_history_request (request_id);
