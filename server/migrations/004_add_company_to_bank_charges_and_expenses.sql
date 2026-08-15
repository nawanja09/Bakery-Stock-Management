-- Link Bank Charges and New Expenses to the Company master table.
-- Columns remain nullable to preserve historical records created before this migration.

ALTER TABLE bank_charges
  ADD COLUMN IF NOT EXISTS company_id INT NULL AFTER amount,
  ADD INDEX IF NOT EXISTS idx_bank_charges_company (company_id);

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS company_id INT NULL AFTER expense_type_id,
  ADD INDEX IF NOT EXISTS idx_expenses_company (company_id);

ALTER TABLE bank_charges
  ADD CONSTRAINT fk_bank_charges_company
  FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE expenses
  ADD CONSTRAINT fk_expenses_company
  FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE RESTRICT ON UPDATE CASCADE;
