-- Add existing-company and reference details to report-only Hidden Expenses.
-- Nullable columns preserve existing records; the UI/API require a company
-- for newly created or updated records.
ALTER TABLE `hidden_expenses`
  ADD COLUMN IF NOT EXISTS `company_id` INT NULL AFTER `description`,
  ADD COLUMN IF NOT EXISTS `reference_number` VARCHAR(100) NULL AFTER `company_id`,
  ADD INDEX IF NOT EXISTS `idx_hidden_expenses_company` (`company_id`);

ALTER TABLE `hidden_expenses`
  ADD CONSTRAINT `fk_hidden_expenses_company`
  FOREIGN KEY (`company_id`) REFERENCES `company` (`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
