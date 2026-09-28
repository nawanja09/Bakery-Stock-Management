-- Expenses Type / Sub Expenses Type on Petty Cash Vouchers and Cash Expenses.
-- Uses the managed expense_types / sub_expense_types tables (migration 018).
-- config/db.js applies the same statements at startup; this file is for
-- installations that apply migrations manually. Safe to re-run.
ALTER TABLE petty_cash_vouchers ADD COLUMN IF NOT EXISTS expense_type_id INT NULL AFTER expense_type;
ALTER TABLE petty_cash_vouchers ADD COLUMN IF NOT EXISTS sub_expense_type_id INT NULL AFTER expense_type_id;
ALTER TABLE petty_cash_vouchers ADD COLUMN IF NOT EXISTS sub_expense_type VARCHAR(100) NULL AFTER sub_expense_type_id;

ALTER TABLE cash_expenses ADD COLUMN IF NOT EXISTS expense_type_id INT NULL AFTER expense_type;
ALTER TABLE cash_expenses ADD COLUMN IF NOT EXISTS sub_expense_type_id INT NULL AFTER expense_type_id;
ALTER TABLE cash_expenses ADD COLUMN IF NOT EXISTS sub_expense_type VARCHAR(100) NULL AFTER sub_expense_type_id;

-- Link existing rows to the managed Expenses Type by exact name. Sub Expenses
-- Type stays NULL for historical rows until they are edited.
UPDATE petty_cash_vouchers t
JOIN expense_types et ON et.name = t.expense_type COLLATE utf8mb4_unicode_ci
SET t.expense_type_id = et.id
WHERE t.expense_type_id IS NULL;

UPDATE cash_expenses t
JOIN expense_types et ON et.name = t.expense_type COLLATE utf8mb4_unicode_ci
SET t.expense_type_id = et.id
WHERE t.expense_type_id IS NULL;
