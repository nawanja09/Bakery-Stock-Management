-- 024_card_ledger.sql
-- Finance -> Card Ledger (Pending / Completed).
-- Additive only. config/db.js (ensureCardLedgerSchema) applies the same DDL at
-- startup, following this project's convention (no separate migration runner).
--
-- Design notes
--   * A card transaction is a RECEIVABLE until the bank settles it. While
--     status = 'Pending' it has NO row in finance_transactions, so it cannot
--     touch any Bank Balance or Bank Ledger.
--   * "Realise" takes one OR MORE Pending rows (same company + bank account) and
--     ONE Realise Amount for the whole selection:
--         Total Transaction Amount = SUM(selected amounts)      (read from the DB)
--         Remaining Balance        = Total - Realise Amount     (always > 0)
--     It creates ONE card_realisations record, ONE Bank Ledger debit (Realise
--     Amount, on the Realise Date, via recordBankTransaction()) and ONE
--     "Visa Card Payment" Hidden Expense (Remaining Balance), and marks every
--     selected card row Completed (card_transactions.realisation_id). All in one
--     DB transaction.
--   * card_realisations.finance_transaction_id / hidden_expense_id are UNIQUE and
--     the card status UPDATE is guarded with `AND status = 'Pending'`, so the same
--     card transaction can never reach the Bank Balance or Hidden Expenses twice.

CREATE TABLE IF NOT EXISTS `card_transactions` (
  `id`                     INT NOT NULL AUTO_INCREMENT,
  `company_id`             INT NOT NULL,
  `bank_id`                INT NOT NULL,
  `transaction_date`       DATE NOT NULL,
  `amount`                 DECIMAL(14,2) NOT NULL,
  `reference_number`       VARCHAR(100) NULL,
  `remark`                 VARCHAR(255) NULL,
  `status`                 ENUM('Pending','Completed') NOT NULL DEFAULT 'Pending',
  `realise_date`           DATE NULL,
  `realise_amount`         DECIMAL(14,2) NULL,   -- legacy (per-row realise of earlier versions)
  `remaining_balance`      DECIMAL(14,2) NULL,   -- legacy
  `finance_transaction_id` INT NULL,             -- legacy: now on card_realisations
  `hidden_expense_id`      INT NULL,             -- legacy: now on card_realisations
  `realisation_id`         INT NULL,
  `realised_by`            INT NULL,
  `realised_at`            TIMESTAMP NULL,
  `created_by`             INT NULL,
  `created_at`             TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`             TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_card_tx_status_date` (`status`, `transaction_date`),
  KEY `idx_card_tx_bank` (`bank_id`),
  KEY `idx_card_tx_company` (`company_id`),
  KEY `idx_card_tx_realisation` (`realisation_id`),
  CONSTRAINT `fk_card_tx_company` FOREIGN KEY (`company_id`) REFERENCES `company` (`id`),
  CONSTRAINT `fk_card_tx_bank` FOREIGN KEY (`bank_id`) REFERENCES `bank_details` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `card_realisations` (
  `id`                     INT NOT NULL AUTO_INCREMENT,
  `company_id`             INT NOT NULL,
  `bank_id`                INT NOT NULL,
  `realise_date`           DATE NOT NULL,
  `total_amount`           DECIMAL(14,2) NOT NULL,  -- sum of the card rows, computed by the server
  `realise_amount`         DECIMAL(14,2) NOT NULL,  -- bank debit
  `remaining_balance`      DECIMAL(14,2) NOT NULL,  -- hidden expense
  `reference_number`       VARCHAR(100) NULL,       -- original card reference(s)
  `finance_transaction_id` INT NULL,
  `hidden_expense_id`      INT NULL,
  `created_by`             INT NULL,
  `created_at`             TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_card_real_finance_tx` (`finance_transaction_id`),
  UNIQUE KEY `uq_card_real_hidden_exp` (`hidden_expense_id`),
  KEY `idx_card_real_bank_date` (`bank_id`, `realise_date`),
  KEY `idx_card_real_company` (`company_id`),
  CONSTRAINT `fk_card_real_company` FOREIGN KEY (`company_id`) REFERENCES `company` (`id`),
  CONSTRAINT `fk_card_real_bank` FOREIGN KEY (`bank_id`) REFERENCES `bank_details` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- For databases that already have `card_transactions` from an earlier version
-- (config/db.js applies this automatically; run by hand only if you apply this
-- file manually). One realisation now covers several card rows, so the old
-- per-row unique links are dropped (they live on card_realisations now).
ALTER TABLE `card_transactions`
  ADD COLUMN IF NOT EXISTS `realise_amount`    DECIMAL(14,2) NULL AFTER `realise_date`,
  ADD COLUMN IF NOT EXISTS `remaining_balance` DECIMAL(14,2) NULL AFTER `realise_amount`,
  ADD COLUMN IF NOT EXISTS `hidden_expense_id` INT NULL AFTER `finance_transaction_id`,
  ADD COLUMN IF NOT EXISTS `realisation_id`    INT NULL AFTER `hidden_expense_id`;
ALTER TABLE `card_transactions` ADD KEY `idx_card_tx_realisation` (`realisation_id`);
ALTER TABLE `card_transactions` DROP INDEX `uq_card_tx_finance_tx`;
ALTER TABLE `card_transactions` DROP INDEX `uq_card_tx_hidden_expense`;

-- Rows realised by earlier versions get their own realisation record
-- (rows from the very first version count as realised in full, remaining 0).
INSERT INTO `card_realisations`
  (company_id, bank_id, realise_date, total_amount, realise_amount, remaining_balance,
   reference_number, finance_transaction_id, hidden_expense_id, created_by, created_at)
SELECT company_id, bank_id, realise_date, amount, COALESCE(realise_amount, amount),
       COALESCE(remaining_balance, 0), reference_number, finance_transaction_id,
       hidden_expense_id, realised_by, COALESCE(realised_at, created_at)
FROM `card_transactions`
WHERE status = 'Completed' AND realisation_id IS NULL
  AND finance_transaction_id IS NOT NULL AND realise_date IS NOT NULL;
UPDATE `card_transactions` ct
  JOIN `card_realisations` cr ON cr.finance_transaction_id = ct.finance_transaction_id
   SET ct.realisation_id = cr.id
 WHERE ct.status = 'Completed' AND ct.realisation_id IS NULL;

-- Hidden Expenses gain the "Visa Card Payment" type (existing values kept).
ALTER TABLE `hidden_expenses`
  MODIFY COLUMN `type` ENUM('PickMe','Credit Card Charge','Visa Card Payment') NOT NULL;

-- OPTIONAL one-time backfill (NOT run automatically).
-- Before this module, "Visa Card Payment" receipts were posted straight to the
-- Bank Ledger. To show that history under the Completed tab (without touching
-- any balance - the ledger rows already exist), run this once, then re-start the
-- server so the realisation records are created. Idempotent.
--
-- INSERT INTO card_transactions
--   (company_id, bank_id, transaction_date, amount, reference_number, remark,
--    status, realise_date, finance_transaction_id, realised_by, realised_at, created_by, created_at)
-- SELECT ft.company_id, ft.bank_id, ft.transaction_date, ft.debit, ft.reference_number, ft.remark,
--        'Completed', ft.transaction_date, ft.id, ft.created_by, ft.created_at, ft.created_by, ft.created_at
-- FROM finance_transactions ft
-- WHERE ft.account_type = 'BANK' AND ft.status = 1
--   AND ft.transaction_type = 'Visa Card Payment' AND ft.reference_type = 'BANK_RECEIVE'
--   AND NOT EXISTS (SELECT 1 FROM card_transactions c WHERE c.finance_transaction_id = ft.id);
