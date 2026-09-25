-- Extend the existing adjustment audit table for financial record edits.
ALTER TABLE rm_adjustment_records
  MODIFY COLUMN category ENUM('Department', 'Invoice', 'Issuance', 'Wastage', 'Petty Cash Voucher', 'Expense Bill') NOT NULL,
  ADD COLUMN original_values JSON NULL,
  ADD COLUMN updated_values JSON NULL,
  DROP INDEX uq_rm_adjustment_source,
  ADD KEY idx_rm_adjustment_source (category, source_record_id);
