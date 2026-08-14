-- Petty Cash / Cash Book consistency migration
-- MySQL 8+
-- Run after backing up the database.

-- 1) Link every Petty Cash voucher to the Company and its Cash Book.
ALTER TABLE petty_cash_vouchers
  ADD COLUMN IF NOT EXISTS company_id INT NULL AFTER voucher_date,
  ADD COLUMN IF NOT EXISTS cash_book_id INT NULL AFTER company_id;

-- 2) Link every reimbursement to the exact Cash Book used.
ALTER TABLE petty_cash_reimbursements
  ADD COLUMN IF NOT EXISTS cash_book_id INT NULL AFTER company_id;

-- 3) Existing cash reimbursements can be backfilled to the first Cash Book
--    belonging to the recorded Company. Existing BANK reimbursements are not
--    valid for Petty Cash under the new rules and must be reviewed.
UPDATE petty_cash_reimbursements r
JOIN (
  SELECT company_id, MIN(id) AS cash_book_id
  FROM cash_accounts
  GROUP BY company_id
) cb ON cb.company_id = r.company_id
SET r.cash_book_id = cb.cash_book_id
WHERE UPPER(COALESCE(r.funding_source, 'CASH')) = 'CASH'
  AND r.cash_book_id IS NULL;

-- 4) Legacy vouchers had no Company/Cash Book linkage. If JH is the
--    historical/default Cash Book, this safely backfills those records.
UPDATE petty_cash_vouchers pv
JOIN company c ON UPPER(c.name) = 'JH'
JOIN (
  SELECT company_id, MIN(id) AS cash_book_id
  FROM cash_accounts
  GROUP BY company_id
) cb ON cb.company_id = c.id
SET pv.company_id = c.id,
    pv.cash_book_id = cb.cash_book_id
WHERE pv.company_id IS NULL OR pv.cash_book_id IS NULL;

-- 5) Recommended integrity constraints.
--    Enable these after reviewing/backfilling any legacy orphan records.
-- ALTER TABLE petty_cash_vouchers
--   ADD CONSTRAINT fk_petty_cash_voucher_company
--     FOREIGN KEY (company_id) REFERENCES company(id),
--   ADD CONSTRAINT fk_petty_cash_voucher_cash_book
--     FOREIGN KEY (cash_book_id) REFERENCES cash_accounts(id);
--
-- ALTER TABLE petty_cash_reimbursements
--   ADD CONSTRAINT fk_petty_cash_reimbursement_company
--     FOREIGN KEY (company_id) REFERENCES company(id),
--   ADD CONSTRAINT fk_petty_cash_reimbursement_cash_book
--     FOREIGN KEY (cash_book_id) REFERENCES cash_accounts(id);

-- 6) Verify legacy bank reimbursements before removing legacy columns.
SELECT id, reference_number, funding_source, company_id, bank_id, cash_book_id
FROM petty_cash_reimbursements
WHERE UPPER(COALESCE(funding_source, 'CASH')) <> 'CASH'
   OR cash_book_id IS NULL;
