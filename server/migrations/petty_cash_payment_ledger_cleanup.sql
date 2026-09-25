-- Petty Cash Payment / Cash Ledger cleanup migration
-- MySQL 8+
-- Run after backing up the database.
--
-- Context: an older version of the app posted Petty Cash Vouchers
-- ("Petty Cash Payment") straight to the Company Cash Ledger
-- (finance_transactions, reference_type = 'PETTY_CASH_VOUCHER').
-- The current code no longer does this - Petty Cash Expenses/Payments
-- must only ever live in the Petty Cash Expenses -> Recent Vouchers
-- table, never in the Cash Ledger. This migration voids the leftover
-- rows from the old behaviour.
--
-- Only Petty Cash Reimbursements (reference_type = 'PETTY_CASH_REIMBURSEMENT')
-- are meant to be in the Cash Ledger, and are left untouched.

-- 1) Preview what will be voided (run this first to confirm).
SELECT id, company_id, transaction_date, reference_number, remark, credit, status
FROM finance_transactions
WHERE reference_type = 'PETTY_CASH_VOUCHER'
  AND status = 1;

-- 2) Soft-void the legacy Petty Cash Payment ledger rows.
--    Matches the existing soft-void convention used elsewhere in this
--    codebase (financeController.js, purchaseController.js) - the row
--    stays for audit purposes but is excluded from every balance/ledger
--    query, since those all filter on status = 1.
UPDATE finance_transactions
SET status = 0
WHERE reference_type = 'PETTY_CASH_VOUCHER'
  AND status = 1;

-- 3) Resync the cached cash_accounts.current_balance for every affected
--    company so it matches the live SUM(debit - credit) over the
--    remaining status = 1 rows (the same figure getCashBalance() computes
--    on every read - this just keeps the cache column consistent).
UPDATE cash_accounts ca
JOIN (
  SELECT company_id,
         COALESCE(SUM(CAST(debit AS DECIMAL(14,2)) - CAST(credit AS DECIMAL(14,2))), 0) AS balance
  FROM finance_transactions
  WHERE account_type = 'CASH' AND status = 1
  GROUP BY company_id
) t ON t.company_id = ca.company_id
SET ca.current_balance = t.balance;

-- 4) Verify: no live Petty Cash Payment rows should remain in the ledger.
SELECT COUNT(*) AS remaining_petty_cash_payment_rows
FROM finance_transactions
WHERE reference_type = 'PETTY_CASH_VOUCHER'
  AND status = 1;
