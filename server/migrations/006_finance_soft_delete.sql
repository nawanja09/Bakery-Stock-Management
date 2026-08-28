-- Finance soft-delete support. Status 1 means active; 0 means deleted.
ALTER TABLE `cash_accounts`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1;

ALTER TABLE `finance_transactions`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1;

ALTER TABLE `bank_details`
  ADD COLUMN IF NOT EXISTS `record_status` TINYINT(1) NOT NULL DEFAULT 1;